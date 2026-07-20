import { eq, inArray } from "drizzle-orm";
import { TrunkScanSchema, type TrunkScan, type TrunkBranch, type TrunkCommit } from "@orchestra/core";
import type { OrchestraDb } from "../db/db";
import { repos, workIntents, taskSpecs, worktrees } from "../db/schema";
import { git, resolveDefaultBaseBranch } from "../git/git";

/** Distinct from pipeline's RepoNotRegisteredError so the trunk route maps its own 404. */
export class RepoNotFoundError extends Error {
  constructor(slug: string) {
    super(`repo not registered: ${slug}`);
    this.name = "RepoNotFoundError";
  }
}

// ASCII record/unit separators — safe delimiters that can't appear in a commit
// subject or author name, so parsing a `git log` line never splits wrong.
const RECORD_SEP = "\x1e";
const UNIT_SEP = "\x1f";
const LOG_FORMAT = ["%H", "%h", "%s", "%an", "%cI"].join(UNIT_SEP) + RECORD_SEP;
// Bounded so a long-lived branch can never make the scan slow or huge.
const MAX_COMMITS_PER_BRANCH = 50;
const LOG_TIMEOUT_MS = 10_000;

function parseLog(stdout: string): TrunkCommit[] {
  return stdout
    .split(RECORD_SEP)
    .map((record) => record.trim())
    .filter((record) => record.length > 0)
    .map((record) => {
      const [sha, shortSha, subject, author, committedAt] = record.split(UNIT_SEP);
      return {
        sha: sha ?? "",
        shortSha: shortSha ?? "",
        subject: subject ?? "",
        author: author ?? "",
        committedAt: committedAt ?? "",
      };
    })
    .filter((commit) => commit.sha.length > 0);
}

async function scanBranch(
  repoRoot: string,
  name: string,
  base: string,
  isBase: boolean,
  status: string | undefined,
): Promise<TrunkBranch> {
  try {
    // Base branch: recent history. Feature branch: only its commits ahead of
    // base (base..branch), so the graph shows what each lane actually added.
    const range = isBase ? [name] : [`${base}..${name}`];
    const { stdout } = await git(
      repoRoot,
      ["log", `--format=${LOG_FORMAT}`, "-n", String(MAX_COMMITS_PER_BRANCH), ...range],
      { timeoutMs: LOG_TIMEOUT_MS },
    );
    return { name, isBase, status, degraded: false, commits: parseLog(stdout) };
  } catch {
    // A branch git can't scan (missing on disk, detached, bad ref) must never
    // fail the whole scan — it returns empty and flagged, and the cockpit keeps
    // showing every other branch. This is the "can't fight me" property.
    return { name, isBase, status, degraded: true, commits: [] };
  }
}

/**
 * Read-only trunk scan for a registered repo: base branch + each live lane's
 * branch, with recent commits. No mutation, no git-write mutex (nothing here
 * writes), bounded per-branch. Only an unregistered repo is a hard error (404);
 * every per-branch failure degrades in place.
 */
export async function scanTrunk(db: OrchestraDb, repoSlug: string): Promise<TrunkScan> {
  const repo = db.select().from(repos).where(eq(repos.slug, repoSlug)).get();
  if (!repo) throw new RepoNotFoundError(repoSlug);

  let base = "main";
  try {
    base = await resolveDefaultBaseBranch(repo.rootPath);
  } catch {
    // Keep "main" — resolveDefaultBaseBranch already falls back internally, but
    // an unreadable repo shouldn't 500 the scan.
  }

  // Live lane branches for this repo (worktree -> taskSpec -> workIntent), with
  // each branch's worktree status so the graph can color it.
  const wis = db.select().from(workIntents).where(eq(workIntents.repoSlug, repoSlug)).all();
  const wiIds = wis.map((w) => w.id);
  const specs = wiIds.length
    ? db.select().from(taskSpecs).where(inArray(taskSpecs.workIntentId, wiIds)).all()
    : [];
  const specIds = specs.map((s) => s.id);
  const wts = specIds.length
    ? db.select().from(worktrees).where(inArray(worktrees.taskSpecId, specIds)).all()
    : [];

  const laneStatusByBranch = new Map<string, string>();
  for (const wt of wts) laneStatusByBranch.set(wt.branch, wt.status);

  const branchNames = [base, ...[...laneStatusByBranch.keys()].filter((name) => name !== base)];
  const branches = await Promise.all(
    branchNames.map((name) =>
      scanBranch(repo.rootPath, name, base, name === base, laneStatusByBranch.get(name)),
    ),
  );

  return TrunkScanSchema.parse({ repoSlug, base, scannedAt: new Date().toISOString(), branches });
}
