import { resolveDefaultBaseBranch } from "~/server/orchestra/git";
import { probeLaneActivity } from "~/server/orchestra/laneActivity";
import { getRegistryEntry } from "~/server/orchestra/registry";
import type { TrunkScanSnapshot, WorktreeNode } from "~/server/orchestra/schemas";
import { TrunkScanSnapshotSchema } from "~/server/orchestra/schemas";
import { listWorktreeNodes } from "~/server/orchestra/worktrees";

/**
 * Module A: landscape truth for Module B — no UI, git via services only.
 * Each poll re-reads the worker folders so commits/pushes show up.
 */
export async function scanTrunk(repoId: string): Promise<TrunkScanSnapshot> {
  const entry = await getRegistryEntry(repoId);
  const nodes = await listWorktreeNodes(repoId);
  const baseBranch = await resolveDefaultBaseBranch(entry.rootPath);

  const lanes = await Promise.all(
    nodes.map(async (node: WorktreeNode) => {
      const live = await probeLaneActivity(node, baseBranch);
      return {
        id: node.id,
        slug: node.slug,
        branch: node.branch,
        status: node.status,
        anchorSha: node.anchorSha,
        shortSha: live.shortSha,
        prUrl: node.prUrl ?? null,
        modelHint: node.modelHint,
        lastSyncAt: node.lastSyncAt,
        path: node.path,
        commitsAhead: live.commitsAhead,
        dirty: live.dirty,
        lastCommitMessage: live.lastCommitMessage,
        hasUpstream: live.hasUpstream,
        unpushedCommits: live.unpushedCommits,
        plainStatus: live.plainStatus,
        nextStep: live.nextStep,
      };
    }),
  );

  const snapshot: TrunkScanSnapshot = {
    schema: "orchestra.trunk_scan.v1",
    repoId: entry.id,
    repoSlug: entry.slug,
    displayName: entry.displayName,
    baseBranch,
    scannedAt: new Date().toISOString(),
    lanes,
  };

  return TrunkScanSnapshotSchema.parse(snapshot);
}
