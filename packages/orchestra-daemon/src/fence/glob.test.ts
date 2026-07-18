import { describe, expect, test } from "bun:test";
import { pathAllowed } from "./glob";

const WORKTREE_ROOT = "/repo/.orchestra/worktrees/security-sanitize";

describe("pathAllowed", () => {
  test("allows a path matching an allowedPaths glob, given an absolute file_path", () => {
    // Bun.Glob is start-anchored — this proves relativization actually
    // happens, not just that the glob syntax works (plan-critique's blocking
    // finding: the original draft compared the raw absolute path directly).
    const absolute = `${WORKTREE_ROOT}/src/lib/auth/index.ts`;
    expect(pathAllowed(absolute, WORKTREE_ROOT, ["src/lib/auth/**"], [])).toBe(true);
  });

  test("denies a path outside allowedPaths when allowedPaths is non-empty", () => {
    const absolute = `${WORKTREE_ROOT}/src/components/Foo.tsx`;
    expect(pathAllowed(absolute, WORKTREE_ROOT, ["src/lib/auth/**"], [])).toBe(false);
  });

  test("forbiddenPaths always denies, even if the path also matches allowedPaths", () => {
    const absolute = `${WORKTREE_ROOT}/src/lib/auth/secrets.ts`;
    expect(
      pathAllowed(absolute, WORKTREE_ROOT, ["src/lib/auth/**"], ["src/lib/auth/secrets.ts"]),
    ).toBe(false);
  });

  test("an empty allowedPaths means no allowlist restriction — only forbiddenPaths gates", () => {
    const absolute = `${WORKTREE_ROOT}/anything/goes.ts`;
    expect(pathAllowed(absolute, WORKTREE_ROOT, [], ["src/components/**"])).toBe(true);
  });

  test("an empty allowedPaths still respects forbiddenPaths", () => {
    const absolute = `${WORKTREE_ROOT}/src/components/Foo.tsx`;
    expect(pathAllowed(absolute, WORKTREE_ROOT, [], ["src/components/**"])).toBe(false);
  });

  test("matches the Constitution's own documented example patterns", () => {
    const allowed = `${WORKTREE_ROOT}/src/lib/auth/helpers.ts`;
    const forbidden = `${WORKTREE_ROOT}/src/components/Button.tsx`;
    const allowedPaths = ["src/lib/auth/**"];
    const forbiddenPaths = ["src/components/**"];

    expect(pathAllowed(allowed, WORKTREE_ROOT, allowedPaths, forbiddenPaths)).toBe(true);
    expect(pathAllowed(forbidden, WORKTREE_ROOT, allowedPaths, forbiddenPaths)).toBe(false);
  });
});
