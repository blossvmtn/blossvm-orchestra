import { getRegistryEntry } from "~/server/orchestra/registry";
import { compilePrBrief } from "~/server/orchestra/packets";
import { ensureRepoState } from "~/server/orchestra/state";
import type { PrBrief } from "~/server/orchestra/schemas";

export class BriefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefError";
  }
}

/** P5 — compile [PR-BRIEF] from a worktree node that already has prUrl. */
export async function compilePrBriefForNode(input: {
  repoId: string;
  nodeId: string;
  title?: string;
  summary?: string;
}): Promise<{ markdown: string; brief: PrBrief }> {
  const entry = await getRegistryEntry(input.repoId);
  const state = await ensureRepoState(entry.rootPath, entry.id);
  const node = state.nodes.find((n) => n.id === input.nodeId);
  if (!node) {
    throw new BriefError(`Worktree node not found: ${input.nodeId}`);
  }
  if (!node.prUrl) {
    throw new BriefError(
      `Node "${node.slug}" has no prUrl — run stackedAction with pr first.`,
    );
  }

  const brief: PrBrief = {
    schema: "orchestra.pr_brief.v1",
    repoSlug: entry.slug,
    branch: node.branch,
    prUrl: node.prUrl,
    title: input.title?.trim() || `Orchestra: ${node.slug}`,
    summary:
      input.summary?.trim() ||
      `PR open for worker ${node.slug} on ${node.branch}.`,
  };

  return { markdown: compilePrBrief(brief), brief };
}
