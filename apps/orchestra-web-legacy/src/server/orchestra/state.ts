import fs from "node:fs/promises";

import {
  OrchestraRepoStateSchema,
  type OrchestraRepoState,
  type WorktreeNode,
} from "~/server/orchestra/schemas";
import { repoOrchestraDir, repoStatePath } from "~/server/orchestra/paths";

export function emptyRepoState(repoId: string): OrchestraRepoState {
  return {
    version: 1,
    repoId,
    nodes: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function ensureRepoState(
  repoRoot: string,
  repoId: string,
): Promise<OrchestraRepoState> {
  await fs.mkdir(repoOrchestraDir(repoRoot), { recursive: true });
  const file = repoStatePath(repoRoot);
  try {
    const raw = await fs.readFile(file, "utf8");
    return OrchestraRepoStateSchema.parse(JSON.parse(raw) as unknown);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      const state = emptyRepoState(repoId);
      await saveRepoState(repoRoot, state);
      return state;
    }
    throw err;
  }
}

export async function loadRepoState(
  repoRoot: string,
): Promise<OrchestraRepoState | null> {
  const file = repoStatePath(repoRoot);
  try {
    const raw = await fs.readFile(file, "utf8");
    return OrchestraRepoStateSchema.parse(JSON.parse(raw) as unknown);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function saveRepoState(
  repoRoot: string,
  state: OrchestraRepoState,
): Promise<void> {
  await fs.mkdir(repoOrchestraDir(repoRoot), { recursive: true });
  const file = repoStatePath(repoRoot);
  const tmp = `${file}.tmp`;
  const next = OrchestraRepoStateSchema.parse({
    ...state,
    updatedAt: new Date().toISOString(),
  });
  await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

export async function upsertWorktreeNode(
  repoRoot: string,
  repoId: string,
  node: WorktreeNode,
): Promise<OrchestraRepoState> {
  const state =
    (await loadRepoState(repoRoot)) ?? emptyRepoState(repoId);
  const idx = state.nodes.findIndex(
    (n) => n.id === node.id || n.slug === node.slug,
  );
  if (idx >= 0) {
    state.nodes[idx] = node;
  } else {
    state.nodes.push(node);
  }
  state.repoId = repoId;
  await saveRepoState(repoRoot, state);
  return state;
}

export async function removeWorktreeNode(
  repoRoot: string,
  repoId: string,
  nodeId: string,
): Promise<OrchestraRepoState> {
  const state =
    (await loadRepoState(repoRoot)) ?? emptyRepoState(repoId);
  state.nodes = state.nodes.filter((n) => n.id !== nodeId);
  state.repoId = repoId;
  await saveRepoState(repoRoot, state);
  return state;
}
