import { parseManifest } from "~/server/orchestra/packets";
import { loadRegistry } from "~/server/orchestra/registry";
import type {
  OrchestraManifest,
  WorktreeNode,
} from "~/server/orchestra/schemas";
import { createWorktree } from "~/server/orchestra/worktrees";

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export function parseManifestMarkdown(rawMarkdown: string): OrchestraManifest {
  return parseManifest(rawMarkdown);
}

/**
 * Dispatch manifest workers into Module A worktrees (C → A via services only).
 */
export async function dispatchManifest(manifest: OrchestraManifest): Promise<{
  nodes: WorktreeNode[];
  warnings: string[];
}> {
  const registry = await loadRegistry();
  const entry = registry.entries.find((e) => e.slug === manifest.repoSlug);
  if (!entry) {
    throw new ManifestError(
      `No registry entry with slug "${manifest.repoSlug}". Anchor the repo first (registry.add).`,
    );
  }

  const nodes: WorktreeNode[] = [];
  const warnings: string[] = [];

  for (const worker of manifest.workers) {
    try {
      const node = await createWorktree({
        repoId: entry.id,
        slug: worker.slug,
        branch: worker.branch,
        allowedPaths: worker.allowedPaths,
        forbiddenPaths: worker.forbiddenPaths,
        modelHint: worker.modelHint ?? null,
      });
      nodes.push(node);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Worker "${worker.slug}" failed: ${msg}`);
    }
  }

  if (nodes.length === 0) {
    throw new ManifestError(
      `Manifest dispatch created no worktrees. ${warnings.join("; ")}`,
    );
  }

  return { nodes, warnings };
}
