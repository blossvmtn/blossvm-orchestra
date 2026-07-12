import { git, gitStdout, resolveDefaultBaseBranch } from "~/server/orchestra/git";
import {
  createPullRequest,
  viewPrForBranch,
  type GhPrView,
} from "~/server/orchestra/gh";
import { getRegistryEntry } from "~/server/orchestra/registry";
import { ensureRepoState, upsertWorktreeNode } from "~/server/orchestra/state";
import { isMeaningfulDirty } from "~/server/orchestra/workingTree";
import type {
  StackedActionInput,
  StackedActionResult,
  StackedStep,
  WorktreeNode,
} from "~/server/orchestra/schemas";

export class StackedActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StackedActionError";
  }
}

export type StackedActionDeps = {
  createPullRequest: typeof createPullRequest;
  viewPrForBranch: typeof viewPrForBranch;
};

const defaultDeps: StackedActionDeps = {
  createPullRequest,
  viewPrForBranch,
};

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
  const upstream = await hasUpstream(cwd);
  if (upstream) {
    await git(cwd, ["push"], { timeoutMs: 90_000 });
  } else {
    await git(cwd, ["push", "-u", "origin", branch], { timeoutMs: 90_000 });
  }
}

/**
 * T3-mirror stacked commit → push → gh pr create (OD3 dirty-tree semantics).
 *
 * - Dirty + steps include `commit` → commit then continue
 * - Bare `pr` (no commit) + dirty → refuse
 * - Bare `push` (no commit) + dirty → push commits only, warn
 * - Bare `pr` with unpushed commits → push then create PR (T3 create_pr mirror)
 * - `.cursor/` fence files alone do not count as dirty (Orchestra noise)
 */
export async function runStackedAction(
  input: StackedActionInput,
  deps: StackedActionDeps = defaultDeps,
): Promise<StackedActionResult> {
  const steps = normalizeSteps(input.steps);
  const wantsCommit = steps.includes("commit");
  const wantsPush = steps.includes("push");
  const wantsPr = steps.includes("pr");

  const entry = await getRegistryEntry(input.repoId);
  const state = await ensureRepoState(entry.rootPath, entry.id);
  const node = state.nodes.find((n) => n.id === input.nodeId);
  if (!node) {
    throw new StackedActionError(`Worktree node not found: ${input.nodeId}`);
  }

  const cwd = node.path;
  const dirty = await isMeaningfulDirty(cwd);
  const warnings: string[] = [];

  // OD3: bare pr + dirty → refuse
  if (dirty && wantsPr && !wantsCommit) {
    throw new StackedActionError(
      "This worker still has uncommitted file changes. Commit them in the worker chat first, then open the pull request.",
    );
  }

  // OD3: bare push + dirty → warn, push commits only
  if (dirty && wantsPush && !wantsCommit) {
    warnings.push(
      "Working tree is dirty; pushing existing commits only (uncommitted changes left local).",
    );
  }

  let committed = false;
  if (wantsCommit) {
    if (dirty) {
      const message = input.message?.trim();
      if (!message) {
        throw new StackedActionError(
          "Commit message is required when the working tree is dirty.",
        );
      }
      await commitAll(cwd, message);
      committed = true;
    } else {
      warnings.push("Working tree clean; commit step skipped.");
    }
  }

  // T3-mirror: bare create_pr auto-pushes when no upstream or ahead
  let needsImpliedPush = false;
  if (wantsPr && !wantsPush) {
    const upstream = await hasUpstream(cwd);
    const ahead = upstream ? await aheadCount(cwd) : 1;
    if (!upstream || ahead > 0) {
      needsImpliedPush = true;
      warnings.push(
        "Push implied before PR create (branch has no upstream or unpushed commits).",
      );
    }
  }

  let pushed = false;
  if (wantsPush || needsImpliedPush) {
    await pushCurrentBranch(cwd, node.branch);
    pushed = true;
  }

  let prUrl: string | null = node.prUrl ?? null;
  let nextStatus = node.status;

  if (wantsPr) {
    const existing = await deps.viewPrForBranch(cwd, node.branch);
    if (existing) {
      prUrl = existing.url;
      nextStatus = statusFromPrView(existing);
      if (existing.state.toUpperCase() === "OPEN") {
        warnings.push(`PR already open: ${existing.url}`);
      }
    } else {
      const base = await resolveDefaultBaseBranch(entry.rootPath);
      const title =
        input.prTitle?.trim() ||
        input.message?.trim() ||
        `Orchestra: ${node.slug}`;
      const body =
        input.prBody ??
        `Opened by blossvm-orchestra stacked action for worker \`${node.slug}\`.`;
      prUrl = await deps.createPullRequest(cwd, {
        title,
        body,
        base,
        head: node.branch,
      });
      nextStatus = "pr_open";
    }
  }

  const updated: WorktreeNode = {
    ...node,
    status: nextStatus,
    prUrl,
    lastSyncAt: new Date().toISOString(),
  };
  await upsertWorktreeNode(entry.rootPath, entry.id, updated);

  return {
    ok: true,
    prUrl,
    warnings,
    committed,
    pushed,
  };
}

function normalizeSteps(steps: StackedStep[]): StackedStep[] {
  const order: StackedStep[] = ["commit", "push", "pr"];
  const set = new Set(steps);
  return order.filter((s) => set.has(s));
}

function statusFromPrView(pr: GhPrView): WorktreeNode["status"] {
  const state = pr.state.toUpperCase();
  if (state === "MERGED" || pr.mergedAt) return "merged";
  if (state === "OPEN") return "pr_open";
  return "pr_open";
}
