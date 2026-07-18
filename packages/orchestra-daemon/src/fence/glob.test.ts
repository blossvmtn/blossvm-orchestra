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

  // PR #2 review, 2026-07-18 — BLOCKING, confirmed by two independent
  // reviewers: a path entirely outside worktreeRoot was allowed whenever a
  // glob pattern happened to match its "../"-prefixed relative form —
  // `allowedPaths: ["**"]` (a completely natural "whole worktree" config)
  // or an empty allowedPaths ("no restriction") both defeated the fence for
  // literally any absolute path on disk. These assert the fix: escaping the
  // tree is denied outright, before any glob logic runs, regardless of what
  // allowedPaths/forbiddenPaths say.
  describe("containment — a path outside worktreeRoot is always denied", () => {
    test("denies an unrelated absolute path even with a maximally permissive allowedPaths", () => {
      expect(pathAllowed("/etc/passwd", WORKTREE_ROOT, ["**"], [])).toBe(false);
    });

    test("denies an unrelated absolute path with an empty allowedPaths (no allowlist restriction)", () => {
      expect(pathAllowed("/etc/hosts", WORKTREE_ROOT, [], ["src/components/**"])).toBe(false);
    });

    test("denies a sibling worktree whose name merely shares WORKTREE_ROOT as a text prefix", () => {
      // .../worktrees/security-sanitize-evil is NOT inside
      // .../worktrees/security-sanitize, even though the string contains it.
      const siblingWorktree = `${WORKTREE_ROOT}-evil/secret.ts`;
      expect(pathAllowed(siblingWorktree, WORKTREE_ROOT, ["**"], [])).toBe(false);
    });

    test("denies an explicit '../' traversal even when it would otherwise glob-match", () => {
      const traversal = `${WORKTREE_ROOT}/../../../etc/passwd`;
      expect(pathAllowed(traversal, WORKTREE_ROOT, ["**"], [])).toBe(false);
    });

    test("still allows a real path inside the tree under a permissive allowedPaths", () => {
      // The fix must not be so aggressive it breaks the legitimate "**" case.
      expect(pathAllowed(`${WORKTREE_ROOT}/src/anything.ts`, WORKTREE_ROOT, ["**"], [])).toBe(true);
    });
  });
});
