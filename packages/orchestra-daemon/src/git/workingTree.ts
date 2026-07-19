import { gitStdout } from "./git";

/**
 * Ported near-verbatim from apps/orchestra-web-legacy/src/server/orchestra/workingTree.ts
 * (Phase 2 spec docs/specs/2026-07-19-phase-2-stacked-pr-actions.md §2, D31/D32).
 *
 * True when there are uncommitted changes that are not Orchestra fence noise.
 * Fence files live under `.cursor/` and should not block PR / hide activity.
 */
export async function isMeaningfulDirty(cwd: string): Promise<boolean> {
  const out = await gitStdout(cwd, ["status", "--porcelain"]).catch(() => "");
  if (!out.trim()) return false;
  const lines = out.split("\n").filter((line) => {
    const file = line.slice(3).trim().replace(/^\.\//, "");
    // git status can prefix renames as "old -> new"
    const pathPart = file.includes(" -> ") ? (file.split(" -> ").pop() ?? file) : file;
    return pathPart.length > 0 && !pathPart.startsWith(".cursor/");
  });
  return lines.length > 0;
}
