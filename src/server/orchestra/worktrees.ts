import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  git,
  gitStdout,
  listWorktrees,
  resolveDefaultBaseBranch,
  type PorcelainWorktree,
} from "~/server/orchestra/git";
import { writeFenceFile } from "~/server/orchestra/fence";
import { getRegistryEntry } from "~/server/orchestra/registry";
import {
  ensureRepoState,
  loadRepoState,
  removeWorktreeNode,
  saveRepoState,
  upsertWorktreeNode,
} from "~/server/orchestra/state";
import { worktreePath, worktreesRoot } from "~/server/orchestra/paths";
import type {
  FenceSpec,
  RemoveMode,
  WorktreeNode,
} from "~/server/orchestra/schemas";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid worker slug "${slug}" — use lowercase alphanumeric and hyphens`,
    );
  }
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

export async function createWorktree(input: {
  repoId: string;
  slug: string;
  branch: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  modelHint?: string | null;
}): Promise<WorktreeNode> {
  assertSlug(input.slug);
  const entry = await getRegistryEntry(input.repoId);
  const repoRoot = entry.rootPath;
  await ensureRepoState(repoRoot, entry.id);

  const fence: FenceSpec = {
    allowedPaths: input.allowedPaths,
    forbiddenPaths: input.forbiddenPaths,
  };

  const wtPathRaw = worktreePath(repoRoot, input.slug);
  await fs.mkdir(worktreesRoot(repoRoot), { recursive: true });

  const baseBranch = await resolveDefaultBaseBranch(repoRoot);
  const anchorSha = await gitStdout(repoRoot, [
    "rev-parse",
    "--verify",
    baseBranch,
  ]);

  const disk = await listWorktrees(repoRoot);
  let existingOnDisk = await findDiskWorktree(disk, wtPathRaw);
  const dirExists = await pathExists(wtPathRaw);

  // Fail-soft (T3 posture): if worktree dir already exists, attach/repair.
  if (existingOnDisk || dirExists) {
    if (!existingOnDisk && dirExists) {
      await git(repoRoot, ["worktree", "prune"]).catch(() => undefined);
      const refreshed = await listWorktrees(repoRoot);
      existingOnDisk = await findDiskWorktree(refreshed, wtPathRaw);
      if (!existingOnDisk) {
        throw new Error(
          `Path exists but is not a git worktree: ${wtPathRaw}. Remove it manually or choose another slug.`,
        );
      }
    }

    const wtPath = existingOnDisk
      ? await fs.realpath(existingOnDisk.path).catch(() => existingOnDisk!.path)
      : wtPathRaw;

    return repairExistingWorktree({
      repoRoot,
      repoId: entry.id,
      slug: input.slug,
      branch: existingOnDisk?.branch ?? input.branch,
      path: wtPath,
      anchorSha,
      fence,
      modelHint: input.modelHint ?? null,
    });
  }

  // Fresh create: branch off base (main/master/configured).
  // If the branch already exists, attach that ref instead of crashing.
  try {
    await git(repoRoot, [
      "worktree",
      "add",
      "-b",
      input.branch,
      wtPathRaw,
      baseBranch,
    ]);
  } catch (err) {
    const msg = [
      err instanceof Error ? err.message : String(err),
      err && typeof err === "object" && "stderr" in err
        ? String((err as { stderr: unknown }).stderr)
        : "",
    ].join("\n");
    if (/already (exists|checked out)/i.test(msg) || /branch.*exists/i.test(msg)) {
      await git(repoRoot, ["worktree", "add", wtPathRaw, input.branch]);
    } else {
      throw err;
    }
  }

  const wtPath = await fs.realpath(wtPathRaw);

  const node = await buildNode({
    repoRoot,
    repoId: entry.id,
    slug: input.slug,
    branch: input.branch,
    path: wtPath,
    anchorSha,
    fence,
    modelHint: input.modelHint ?? null,
    reuseId: false,
  });
  await writeFenceFile(wtPath, fence, input.slug);
  await upsertWorktreeNode(repoRoot, entry.id, node);
  return node;
}

async function repairExistingWorktree(opts: {
  repoRoot: string;
  repoId: string;
  slug: string;
  branch: string;
  path: string;
  anchorSha: string;
  fence: FenceSpec;
  modelHint: string | null;
}): Promise<WorktreeNode> {
  const node = await buildNode({ ...opts, reuseId: true });
  await writeFenceFile(opts.path, opts.fence, opts.slug);
  await upsertWorktreeNode(opts.repoRoot, opts.repoId, node);
  return node;
}

async function buildNode(opts: {
  repoRoot: string;
  repoId: string;
  slug: string;
  branch: string;
  path: string;
  anchorSha: string;
  fence: FenceSpec;
  modelHint: string | null;
  reuseId: boolean;
}): Promise<WorktreeNode> {
  const prev = await loadRepoState(opts.repoRoot);
  const existing = prev?.nodes.find((n) => n.slug === opts.slug);
  const now = new Date().toISOString();
  return {
    id: opts.reuseId && existing ? existing.id : randomUUID(),
    slug: opts.slug,
    branch: opts.branch,
    path: opts.path,
    status: "active",
    anchorSha: opts.anchorSha,
    fence: opts.fence,
    modelHint: opts.modelHint,
    prUrl: existing?.prUrl ?? null,
    createdAt: existing?.createdAt ?? now,
    lastSyncAt: now,
  };
}

export async function listWorktreeNodes(repoId: string): Promise<WorktreeNode[]> {
  const entry = await getRegistryEntry(repoId);
  const repoRoot = entry.rootPath;
  const state = await ensureRepoState(repoRoot, entry.id);
  const disk = await listWorktrees(repoRoot);
  const orchestraPrefix = path.resolve(worktreesRoot(repoRoot));

  const nextNodes: WorktreeNode[] = [];
  const seenSlugs = new Set<string>();

  for (const node of state.nodes) {
    const onDisk = await findDiskWorktree(disk, node.path);
    if (onDisk) {
      nextNodes.push({
        ...node,
        branch: onDisk.branch ?? node.branch,
        status: node.status === "orphaned" ? "active" : node.status,
        path: onDisk.path,
      });
      seenSlugs.add(node.slug);
    } else {
      nextNodes.push({ ...node, status: "orphaned" });
      seenSlugs.add(node.slug);
    }
  }

  // Attach unknown orchestra worktrees on disk (repair).
  for (const wt of disk) {
    let resolved: string;
    try {
      resolved = await fs.realpath(wt.path);
    } catch {
      resolved = path.resolve(wt.path);
    }
    let prefix: string;
    try {
      prefix = await fs.realpath(orchestraPrefix);
    } catch {
      prefix = orchestraPrefix;
    }
    if (!resolved.startsWith(prefix + path.sep) && resolved !== prefix) continue;
    const slug = path.basename(resolved);
    if (seenSlugs.has(slug)) continue;
    if (!SLUG_RE.test(slug)) continue;

    const now = new Date().toISOString();
    const anchorSha = await gitStdout(repoRoot, ["rev-parse", "HEAD"]).catch(
      () => "unknown",
    );
    nextNodes.push({
      id: randomUUID(),
      slug,
      branch: wt.branch ?? `orch/${slug}`,
      path: resolved,
      status: "active",
      anchorSha,
      fence: { allowedPaths: [], forbiddenPaths: [] },
      modelHint: null,
      prUrl: null,
      createdAt: now,
      lastSyncAt: now,
    });
  }

  await saveRepoState(repoRoot, {
    version: 1,
    repoId: entry.id,
    nodes: nextNodes,
    updatedAt: new Date().toISOString(),
  });

  return nextNodes;
}

export async function removeWorktree(input: {
  repoId: string;
  nodeId: string;
  mode: RemoveMode;
}): Promise<{ ok: true }> {
  const entry = await getRegistryEntry(input.repoId);
  const repoRoot = entry.rootPath;
  const state = await ensureRepoState(repoRoot, entry.id);
  const node = state.nodes.find((n) => n.id === input.nodeId);
  if (!node) {
    throw new Error(`Worktree node not found: ${input.nodeId}`);
  }

  const disk = await listWorktrees(repoRoot);
  const onDisk = await findDiskWorktree(disk, node.path);

  if (onDisk) {
    try {
      await git(repoRoot, ["worktree", "remove", "--force", node.path], {
        timeoutMs: 15_000,
      });
    } catch {
      // Directory may already be gone — prune and continue.
      await git(repoRoot, ["worktree", "prune"]).catch(() => undefined);
    }
  } else if (await pathExists(node.path)) {
    await fs.rm(node.path, { recursive: true, force: true });
    await git(repoRoot, ["worktree", "prune"]).catch(() => undefined);
  } else {
    await git(repoRoot, ["worktree", "prune"]).catch(() => undefined);
  }

  if (input.mode === "delete-branch") {
    try {
      await git(repoRoot, ["branch", "-D", node.branch]);
    } catch {
      // Branch may already be gone
    }
  }

  await removeWorktreeNode(repoRoot, entry.id, node.id);
  return { ok: true };
}
