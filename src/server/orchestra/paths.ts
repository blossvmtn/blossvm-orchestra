import os from "node:os";
import path from "node:path";

/** Override for tests — defaults to ~/.orchestra */
export function getOrchestraHome(): string {
  const override = process.env.ORCHESTRA_HOME;
  if (override && override.length > 0) {
    return path.resolve(override);
  }
  return path.join(os.homedir(), ".orchestra");
}

export function registryPath(): string {
  return path.join(getOrchestraHome(), "registry.json");
}

export function repoOrchestraDir(repoRoot: string): string {
  return path.join(repoRoot, ".orchestra");
}

export function repoStatePath(repoRoot: string): string {
  return path.join(repoOrchestraDir(repoRoot), "state.json");
}

export function worktreesRoot(repoRoot: string): string {
  return path.join(repoOrchestraDir(repoRoot), "worktrees");
}

export function worktreePath(repoRoot: string, workerSlug: string): string {
  return path.join(worktreesRoot(repoRoot), workerSlug);
}

export function fencePath(worktreeRoot: string): string {
  return path.join(worktreeRoot, ".cursor", "rules", "orchestra-fence.mdc");
}
