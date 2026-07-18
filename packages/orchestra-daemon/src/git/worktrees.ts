import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Worktree } from "@orchestra/core";
import type { OrchestraDb } from "../db/db";
import { worktrees as worktreesTable } from "../db/schema";
import { rowToWorktree } from "../db/mappers";
import { writeEvent } from "../db/events";
import { git, gitStdout, listWorktrees, resolveDefaultBaseBranch, type PorcelainWorktree } from "./git";

/**
 * create/repair/attach/reconcile/remove algorithm ported from
 * apps/orchestra-web-legacy/src/server/orchestra/worktrees.ts (Phase 1 spec,
 * D23) — the fail-soft create/repair decision tree, the branch-already-
 * exists fallback, and the remove-with-fallback-to-prune sequence all
 * survive unchanged; these are hard-won git-mechanics edge cases independent
 * of storage. What's reworked: persistence is SQLite (the `worktrees` table)
 * instead of `state.json`'s read-modify-write, and Worktree is 1:1 with
 * TaskSpec (D20) rather than N-per-repo keyed by slug — so there's no
 * "attach an unrecognized on-disk worktree as a new node" auto-discovery
 * step here (that would require synthesizing a TaskSpec with no WorkIntent
 * behind it, out of scope for a single-lane phase, D16). Also adds
 * branch-name validation the legacy code lacked (plan-critique pass, D23):
 * a branch beginning with `-` is positional in `git worktree add <path>
 * <branch>` and could be parsed as a flag.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid worker slug "${slug}" — use lowercase alphanumeric and hyphens`);
  }
}

function assertBranch(branch: string): void {
  if (branch.startsWith("-")) {
    throw new Error(`Invalid branch name "${branch}" — must not start with "-"`);
  }
}

// PATH convention (Constitution §11, unchanged): <repoRoot>/.orchestra/worktrees/<slug>/
export function worktreesRoot(repoRoot: string): string {
  return path.join(repoRoot, ".orchestra", "worktrees");
}

export function worktreePath(repoRoot: string, slug: string): string {
  return path.join(worktreesRoot(repoRoot), slug);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

async function samePathAsync(a: string, b: string): Promise<boolean> {
  try {
    const [ra, rb] = await Promise.all([
      fs.realpath(a).catch(() => path.resolve(a)),
      fs.realpath(b).catch(() => path.resolve(b)),
    ]);
    return ra === rb;
  } catch {
    return samePath(a, b);
  }
}

async function findDiskWorktree(
  disk: PorcelainWorktree[],
  targetPath: string,
): Promise<PorcelainWorktree | undefined> {
  for (const w of disk) {
    if (await samePathAsync(w.path, targetPath)) return w;
  }
  return undefined;
}

function upsertWorktreeRow(
  db: OrchestraDb,
  opts: { taskSpecId: string; branch: string; path: string; anchorSha: string },
): Worktree {
  const now = new Date().toISOString();
  const existingRow = db
    .select()
    .from(worktreesTable)
    .where(eq(worktreesTable.taskSpecId, opts.taskSpecId))
    .get();

  if (existingRow) {
    // PR #2 review, 2026-07-18 — should-fix: anchorSha is "the base branch
    // SHA at creation" (D20) — a repair (this row already exists) must not
    // overwrite it with whatever the base branch tip resolves to *today*,
    // or every daemon-restart-triggered repair silently drifts the recorded
    // creation point forward. Only branch/path/status/lastSyncAt update here.
    db.update(worktreesTable)
      .set({ branch: opts.branch, path: opts.path, status: "active", lastSyncAt: now })
      .where(eq(worktreesTable.id, existingRow.id))
      .run();
    const updated = rowToWorktree({ ...existingRow, branch: opts.branch, path: opts.path, status: "active", lastSyncAt: now });
    writeEvent(db, "worktree", updated.id, "updated", updated);
    return updated;
  }

  // PR #2 review, 2026-07-18 — should-fix: this table is 1:1 with TaskSpec
  // (D20), but the on-disk collision check above keys on filesystem path,
  // not taskSpecId. Without this guard, two different TaskSpecs computing
  // the same worktreePath (a shared slug) would silently alias to one
  // physical directory under two separate Worktree rows — undermining the
  // phase's whole point ("physical, isolated worker lanes"). Refuse instead.
  const pathCollision = db.select().from(worktreesTable).where(eq(worktreesTable.path, opts.path)).get();
  if (pathCollision && pathCollision.taskSpecId !== opts.taskSpecId) {
    throw new Error(
      `Worktree path ${opts.path} already belongs to a different TaskSpec (${pathCollision.taskSpecId}) — refusing to alias.`,
    );
  }

  const worktree: Worktree = {
    id: randomUUID(),
    taskSpecId: opts.taskSpecId,
    path: opts.path,
    branch: opts.branch,
    anchorSha: opts.anchorSha,
    status: "active",
    createdAt: now,
  };
  db.insert(worktreesTable).values(worktree).run();
  writeEvent(db, "worktree", worktree.id, "created", worktree);
  return worktree;
}

export type CreateWorktreeInput = {
  repoRoot: string;
  taskSpecId: string;
  slug: string;
  branch: string;
};

export async function createWorktree(db: OrchestraDb, input: CreateWorktreeInput): Promise<Worktree> {
  assertSlug(input.slug);
  assertBranch(input.branch);

  const wtPathRaw = worktreePath(input.repoRoot, input.slug);
  await fs.mkdir(worktreesRoot(input.repoRoot), { recursive: true });

  const baseBranch = await resolveDefaultBaseBranch(input.repoRoot);
  const anchorSha = await gitStdout(input.repoRoot, ["rev-parse", "--verify", baseBranch]);

  const disk = await listWorktrees(input.repoRoot);
  let existingOnDisk = await findDiskWorktree(disk, wtPathRaw);
  const dirExists = await pathExists(wtPathRaw);

  // Fail-soft (T3 posture): if the worktree dir already exists, attach/repair
  // rather than error — useful for daemon-restart/retry scenarios.
  if (existingOnDisk || dirExists) {
    if (!existingOnDisk && dirExists) {
      await git(input.repoRoot, ["worktree", "prune"]).catch(() => undefined);
      const refreshed = await listWorktrees(input.repoRoot);
      existingOnDisk = await findDiskWorktree(refreshed, wtPathRaw);
      if (!existingOnDisk) {
        throw new Error(
          `Path exists but is not a git worktree: ${wtPathRaw}. Remove it manually or choose another slug.`,
        );
      }
    }

    const wtPath = existingOnDisk
      ? await fs.realpath(existingOnDisk.path).catch(() => existingOnDisk?.path ?? wtPathRaw)
      : wtPathRaw;

    return upsertWorktreeRow(db, {
      taskSpecId: input.taskSpecId,
      branch: existingOnDisk?.branch ?? input.branch,
      path: wtPath,
      anchorSha,
    });
  }

  // Fresh create: branch off base. If the branch already exists, attach that
  // ref instead of crashing.
  try {
    await git(input.repoRoot, ["worktree", "add", "-b", input.branch, wtPathRaw, baseBranch]);
  } catch (err) {
    const msg = [
      err instanceof Error ? err.message : String(err),
      err && typeof err === "object" && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "",
    ].join("\n");
    if (/already (exists|checked out)/i.test(msg) || /branch.*exists/i.test(msg)) {
      await git(input.repoRoot, ["worktree", "add", wtPathRaw, input.branch]);
    } else {
      throw err;
    }
  }

  const wtPath = await fs.realpath(wtPathRaw);
  return upsertWorktreeRow(db, { taskSpecId: input.taskSpecId, branch: input.branch, path: wtPath, anchorSha });
}

/**
 * Health-check a single worktree against disk — sets status to "orphaned" if
 * it's gone, back to "active" if it's returned. No repo-wide list/scan (the
 * legacy version's job): P1 is single-lane (D16), so there is at most one
 * live Worktree row to check, not a repo's worth to reconcile.
 */
export async function reconcileWorktree(db: OrchestraDb, worktreeId: string): Promise<Worktree | undefined> {
  const row = db.select().from(worktreesTable).where(eq(worktreesTable.id, worktreeId)).get();
  if (!row) return undefined;

  // A direct filesystem check, not `git worktree list --porcelain`: git
  // keeps a worktree registered in its own metadata until `worktree
  // remove`/`prune` runs, so a directory deleted out-of-band (e.g. `rm -rf`
  // outside Orchestra) still shows up as a known worktree in git's own
  // listing — verified empirically writing this test. The filesystem is the
  // actual ground truth for "does this worktree still exist."
  const onDisk = await pathExists(row.path);
  const now = new Date().toISOString();
  const status = onDisk ? "active" : "orphaned";

  db.update(worktreesTable).set({ status, lastSyncAt: now }).where(eq(worktreesTable.id, worktreeId)).run();
  const updated = rowToWorktree({ ...row, status, lastSyncAt: now });
  writeEvent(db, "worktree", updated.id, "updated", updated);
  return updated;
}

export type RemoveMode = "keep-branch" | "delete-branch";

export async function removeWorktree(
  db: OrchestraDb,
  repoRoot: string,
  worktreeId: string,
  mode: RemoveMode,
): Promise<{ ok: true }> {
  const row = db.select().from(worktreesTable).where(eq(worktreesTable.id, worktreeId)).get();
  if (!row) {
    throw new Error(`Worktree not found: ${worktreeId}`);
  }

  const disk = await listWorktrees(repoRoot);
  const onDisk = await findDiskWorktree(disk, row.path);

  if (onDisk) {
    try {
      await git(repoRoot, ["worktree", "remove", "--force", row.path], { timeoutMs: 15_000 });
    } catch {
      // Directory may already be gone — prune and continue.
      await git(repoRoot, ["worktree", "prune"]).catch(() => undefined);
    }
  } else if (await pathExists(row.path)) {
    await fs.rm(row.path, { recursive: true, force: true });
    await git(repoRoot, ["worktree", "prune"]).catch(() => undefined);
  } else {
    await git(repoRoot, ["worktree", "prune"]).catch(() => undefined);
  }

  if (mode === "delete-branch") {
    await git(repoRoot, ["branch", "-D", row.branch]).catch(() => undefined);
  }

  db.delete(worktreesTable).where(eq(worktreesTable.id, worktreeId)).run();
  // PR #2 review, 2026-07-18 — should-fix: D17 says an event's payload is
  // "the already-Schema.parse()-validated domain object itself" — a
  // synthetic {id, removed, mode} object isn't that. Use the real row (read
  // before delete) instead, same shape every other worktree event uses.
  writeEvent(db, "worktree", worktreeId, "updated", rowToWorktree(row));
  return { ok: true };
}
