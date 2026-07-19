import { eq } from "drizzle-orm";
import type { Worktree, WorktreeStatus } from "@orchestra/core";
import type { OrchestraDb } from "../db/db";
import { worktrees as worktreesTable, taskSpecs as taskSpecsTable, workIntents as workIntentsTable, repos as reposTable } from "../db/schema";
import { rowToWorktree } from "../db/mappers";
import { writeEvent } from "../db/events";
import { git, gitStdout, resolveDefaultBaseBranch } from "./git";
import { createPullRequest, viewPrForBranch, type GhPrView } from "./gh";
import { isMeaningfulDirty } from "./workingTree";
import { withRepoLock } from "./mutex";

/**
 * Ported from apps/orchestra-web-legacy/src/server/orchestra/stacked.ts
 * (Phase 2 spec docs/specs/2026-07-19-phase-2-stacked-pr-actions.md §2, D31/
 * D32) — OD3's dirty-tree semantics (Constitution v2 §11, locked, inherited
 * unchanged), all four cases:
 *
 * - Dirty + steps include "commit" -> commit (requires a message) then continue
 * - Bare "pr" (no commit) + dirty -> refuse
 * - Bare "push" (no commit) + dirty -> push commits only, warn
 * - "pr" present + "push" absent + tree clean by the time the pr step runs
 *   (whether originally clean or just-committed-clean) -> push then PR
 * - .cursor/ fence files alone never count as dirty (isMeaningfulDirty)
 *
 * Persistence and repo-resolution are reworked from the legacy's JSON
 * registry/state-file model onto SQLite (D30's worktrees.prUrl/prNumber
 * columns), and the whole git-write section runs inside withRepoLock (D28) —
 * the legacy code had no mutex at all.
 */
export type StackedStep = "commit" | "push" | "pr";

export class StackedActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StackedActionError";
  }
}

/** Named the same way RepoNotRegisteredError already is (pipeline.ts) — the
 * worktreeId doesn't resolve, or its TaskSpec/WorkIntent/Repo chain is broken. */
export class WorktreeChainNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorktreeChainNotFoundError";
  }
}

export type StackedActionResult = {
  worktree: Worktree;
  committed: boolean;
  pushed: boolean;
  warnings: string[];
};

/**
 * Injectable seam for createPullRequest only (spec §3 step 8: "createPullRequest
 * is stubbed/injected in these unit tests — real PR creation is real-cost;
 * viewPrForBranch runs for real"). Mirrors the legacy's StackedActionDeps
 * pattern, narrowed to the one dependency that actually needs stubbing.
 */
export type StackedActionDeps = {
  createPullRequest: typeof createPullRequest;
};

const defaultDeps: StackedActionDeps = { createPullRequest };

async function hasUpstream(cwd: string): Promise<boolean> {
  try {
    await gitStdout(cwd, ["rev-parse", "--abbrev-ref", "@{u}"]);
    return true;
  } catch {
    return false;
  }
}

async function aheadCount(cwd: string): Promise<number> {
  try {
    const out = await gitStdout(cwd, ["rev-list", "--count", "@{u}..HEAD"]);
    return Number.parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

async function commitAll(cwd: string, message: string): Promise<void> {
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["commit", "-m", message]);
}

async function pushCurrentBranch(cwd: string, branch: string): Promise<void> {
  if (await hasUpstream(cwd)) {
    await git(cwd, ["push"], { timeoutMs: 90_000 });
  } else {
    await git(cwd, ["push", "-u", "origin", branch], { timeoutMs: 90_000 });
  }
}

function normalizeSteps(steps: StackedStep[]): StackedStep[] {
  const order: StackedStep[] = ["commit", "push", "pr"];
  const set = new Set(steps);
  return order.filter((s) => set.has(s));
}

// Simplified from the legacy version, which had a redundant `if (state ===
// "OPEN") return "pr_open"` branch immediately before an unconditional
// `return "pr_open"` — same outcome for every non-merged state, one branch.
function statusFromPrView(pr: GhPrView): WorktreeStatus {
  const state = pr.state.toUpperCase();
  if (state === "MERGED" || pr.mergedAt) return "merged";
  return "pr_open";
}

function resolveChain(
  db: OrchestraDb,
  worktreeId: string,
): { worktree: typeof worktreesTable.$inferSelect; taskSpec: typeof taskSpecsTable.$inferSelect; repoRoot: string } {
  const worktree = db.select().from(worktreesTable).where(eq(worktreesTable.id, worktreeId)).get();
  if (!worktree) {
    throw new WorktreeChainNotFoundError(`Worktree not found: ${worktreeId}`);
  }
  const taskSpec = db.select().from(taskSpecsTable).where(eq(taskSpecsTable.id, worktree.taskSpecId)).get();
  if (!taskSpec) {
    throw new WorktreeChainNotFoundError(`TaskSpec not found for worktree ${worktreeId}`);
  }
  const workIntent = db.select().from(workIntentsTable).where(eq(workIntentsTable.id, taskSpec.workIntentId)).get();
  if (!workIntent) {
    throw new WorktreeChainNotFoundError(`WorkIntent not found for worktree ${worktreeId}`);
  }
  const repo = db.select().from(reposTable).where(eq(reposTable.slug, workIntent.repoSlug)).get();
  if (!repo) {
    throw new WorktreeChainNotFoundError(`Repo not found for worktree ${worktreeId}`);
  }
  return { worktree, taskSpec, repoRoot: repo.rootPath };
}

export async function runStackedAction(
  db: OrchestraDb,
  worktreeId: string,
  steps: StackedStep[],
  message?: string,
  deps: StackedActionDeps = defaultDeps,
): Promise<StackedActionResult> {
  const { worktree: worktreeRow, taskSpec, repoRoot } = resolveChain(db, worktreeId);

  const normalizedSteps = normalizeSteps(steps);
  const wantsCommit = normalizedSteps.includes("commit");
  const wantsPush = normalizedSteps.includes("push");
  const wantsPr = normalizedSteps.includes("pr");

  return withRepoLock(repoRoot, async () => {
    const cwd = worktreeRow.path;
    const dirty = await isMeaningfulDirty(cwd);
    const warnings: string[] = [];

    // D31 case 2: bare pr + dirty -> refuse.
    if (dirty && wantsPr && !wantsCommit) {
      throw new StackedActionError(
        "This worker still has uncommitted file changes. Commit them first, then open the pull request.",
      );
    }

    // D31 case 3: bare push + dirty -> warn, push commits only.
    if (dirty && wantsPush && !wantsCommit) {
      warnings.push("Working tree is dirty; pushing existing commits only (uncommitted changes left local).");
    }

    let committed = false;
    if (wantsCommit) {
      if (dirty) {
        const trimmedMessage = message?.trim();
        if (!trimmedMessage) {
          throw new StackedActionError("Commit message is required when the working tree is dirty.");
        }
        await commitAll(cwd, trimmedMessage);
        committed = true;
      } else {
        warnings.push("Working tree clean; commit step skipped.");
      }
    }

    // D31 case 4: "pr" present, "push" absent -> auto-push when the tree
    // (by now, whether originally clean or just-committed-clean) has no
    // upstream or unpushed commits. Gated on !wantsPush only — never on
    // wantsCommit, so this composes with case 1 (["commit","pr"]).
    let needsImpliedPush = false;
    if (wantsPr && !wantsPush) {
      const upstream = await hasUpstream(cwd);
      const ahead = upstream ? await aheadCount(cwd) : 1;
      if (!upstream || ahead > 0) {
        needsImpliedPush = true;
        warnings.push("Push implied before PR create (branch has no upstream or unpushed commits).");
      }
    }

    let pushed = false;
    if (wantsPush || needsImpliedPush) {
      await pushCurrentBranch(cwd, worktreeRow.branch);
      pushed = true;
    }

    let prUrl: string | null = worktreeRow.prUrl;
    let prNumber: number | null = worktreeRow.prNumber;
    let nextStatus: WorktreeStatus = worktreeRow.status;

    if (wantsPr) {
      const existing = await viewPrForBranch(cwd, worktreeRow.branch);
      if (existing) {
        prUrl = existing.url;
        prNumber = existing.number;
        nextStatus = statusFromPrView(existing);
        if (existing.state.toUpperCase() === "OPEN") {
          warnings.push(`PR already open: ${existing.url}`);
        }
      } else {
        const base = await resolveDefaultBaseBranch(repoRoot);
        // D32: prTitle/prBody caller-override fields are NOT carried
        // forward from the legacy input shape — message is the only
        // caller-supplied text in P2 — a deliberate scope cut.
        const title = message?.trim() || `Orchestra: ${taskSpec.slug}`;
        const body = `Opened by blossvm-orchestra stacked action for worker \`${taskSpec.slug}\`.`;
        const created = await deps.createPullRequest(cwd, { title, body, base, head: worktreeRow.branch });
        prUrl = created.url;
        prNumber = created.number;
        nextStatus = "pr_open";
      }
    }

    const now = new Date().toISOString();
    const updated = rowToWorktree({
      ...worktreeRow,
      status: nextStatus,
      prUrl,
      prNumber,
      lastSyncAt: now,
    });

    db.transaction((tx) => {
      tx.update(worktreesTable)
        .set({ status: nextStatus, prUrl, prNumber, lastSyncAt: now })
        .where(eq(worktreesTable.id, worktreeId))
        .run();
      writeEvent(tx, "worktree", updated.id, "updated", updated);
    });

    return { worktree: updated, committed, pushed, warnings };
  });
}
