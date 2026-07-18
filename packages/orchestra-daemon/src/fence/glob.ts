import path from "node:path";

/**
 * Fence-path matching (Phase 1 spec §1, D22) — Bun's built-in Glob, no new
 * dependency. `allowedPaths`/`forbiddenPaths` are repo-relative patterns
 * (e.g. "src/components/**", per the Constitution's own examples and the
 * legacy fence.ts renderer), but a PreToolUse hook's `tool_input.file_path`
 * arrives absolute — this relativizes against `worktreeRoot` first.
 * `Bun.Glob` is start-anchored, so matching the raw absolute path against a
 * relative pattern always silently fails (found in this spec's plan-critique
 * pass, before any code was written).
 *
 * Semantics: a forbidden match always denies, regardless of allowedPaths.
 * An empty allowedPaths means "no allowlist restriction" (only forbiddenPaths
 * gates). A non-empty allowedPaths requires at least one match.
 *
 * PR #2 review, 2026-07-18 — BLOCKING, fixed same-day, before merge: this
 * function used to hand the relativized path straight to Bun.Glob with no
 * check that it actually stayed inside worktreeRoot. `path.relative()` for a
 * path outside the tree returns something starting with "..", and — the
 * concrete break — a plausible, natural fence config like
 * `allowedPaths: ["**"]` (or an empty allowedPaths, "no restriction")
 * matches that "../"-prefixed string too, since `**` matches anything.
 * Verified empirically: `pathAllowed("/etc/passwd", worktreeRoot, ["**"], [])`
 * returned `true` before this fix — full-disk access through the one
 * mechanism this phase exists to prove enforces isolation. Now denied
 * outright, before any glob logic runs, whenever the relativized path
 * escapes the tree.
 */
export function pathAllowed(
  filePath: string,
  worktreeRoot: string,
  allowedPaths: string[],
  forbiddenPaths: string[],
): boolean {
  const relative = path.relative(worktreeRoot, filePath);

  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return false;
  }

  if (forbiddenPaths.some((pattern) => new Bun.Glob(pattern).match(relative))) {
    return false;
  }

  if (allowedPaths.length === 0) {
    return true;
  }

  return allowedPaths.some((pattern) => new Bun.Glob(pattern).match(relative));
}
