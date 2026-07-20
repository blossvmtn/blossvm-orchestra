import { z } from "zod";

/**
 * Phase 3A — the read-only trunk scan the Trunk-map view renders. Derived from
 * `git log` at request time (not persisted), so it's a contract over what the
 * daemon scanned, not a domain entity. A branch that couldn't be scanned comes
 * back `degraded: true` with no commits rather than failing the whole scan.
 */
export const TrunkCommitSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  subject: z.string(),
  author: z.string(),
  committedAt: z.string(),
  /** Parent SHAs (space-separated %P) — drives the lane graph layout. */
  parents: z.array(z.string()),
  /** Local branch names decorating this commit (%D) — the branch tips, so the
   *  graph can label which thread is which. Tags/remotes/HEAD are dropped. */
  refs: z.array(z.string()),
});
export type TrunkCommit = z.infer<typeof TrunkCommitSchema>;

export const TrunkBranchSchema = z.object({
  name: z.string(),
  isBase: z.boolean(),
  /** The live worktree status if this branch is an active lane; absent for plain branches. */
  status: z.string().optional(),
  /** True when this branch couldn't be fully scanned (missing on disk, etc.). */
  degraded: z.boolean(),
  commits: z.array(TrunkCommitSchema),
});
export type TrunkBranch = z.infer<typeof TrunkBranchSchema>;

export const TrunkScanSchema = z.object({
  repoSlug: z.string(),
  base: z.string(),
  scannedAt: z.string(),
  branches: z.array(TrunkBranchSchema),
  /** Flat `git log --all` list, newest-first — the input to the lane-graph layout. */
  commits: z.array(TrunkCommitSchema),
});
export type TrunkScan = z.infer<typeof TrunkScanSchema>;
