import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { git, gitStdout, isGitRepo, resolveDefaultBaseBranch, listWorktrees, GitError } from "./git";

// Real throwaway git repos, not mocked execFile — matches this repo's
// "verified empirically" convention (Phase 1 spec §3 step 5).
let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-git-test-"));
  await git(repoRoot, ["init", "-b", "main"]);
  await git(repoRoot, ["config", "user.email", "test@example.com"]);
  await git(repoRoot, ["config", "user.name", "Orchestra Test"]);
  await Bun.write(path.join(repoRoot, "README.md"), "test\n");
  await git(repoRoot, ["add", "README.md"]);
  await git(repoRoot, ["commit", "-m", "initial commit"]);
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("git/gitStdout", () => {
  test("runs a real git command and returns trimmed stdout", async () => {
    const branch = await gitStdout(repoRoot, ["branch", "--show-current"]);
    expect(branch).toBe("main");
  });

  test("throws a GitError with args/stderr/code on a real failure", async () => {
    await expect(git(repoRoot, ["not-a-real-git-command"])).rejects.toThrow(GitError);
    try {
      await git(repoRoot, ["not-a-real-git-command"]);
      throw new Error("expected git() to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(GitError);
      const gitErr = err as GitError;
      expect(gitErr.args).toEqual(["not-a-real-git-command"]);
      expect(gitErr.stderr.length).toBeGreaterThan(0);
    }
  });
});

describe("isGitRepo", () => {
  test("returns true for a real git repo", async () => {
    expect(await isGitRepo(repoRoot)).toBe(true);
  });

  test("returns false for a non-repo directory", async () => {
    const notARepo = await mkdtemp(path.join(tmpdir(), "orchestra-not-a-repo-"));
    try {
      expect(await isGitRepo(notARepo)).toBe(false);
    } finally {
      await rm(notARepo, { recursive: true, force: true });
    }
  });
});

describe("resolveDefaultBaseBranch", () => {
  test("falls back to the current branch when there is no origin/HEAD", async () => {
    const branch = await resolveDefaultBaseBranch(repoRoot);
    expect(branch).toBe("main");
  });
});

describe("listWorktrees", () => {
  test("lists the main checkout as the only worktree before any are added", async () => {
    const worktrees = await listWorktrees(repoRoot);
    expect(worktrees).toHaveLength(1);
    expect(worktrees[0]?.branch).toBe("main");
    expect(worktrees[0]?.bare).toBe(false);
  });

  test("lists a real worktree after `git worktree add`", async () => {
    const worktreePath = path.join(repoRoot, ".orchestra", "worktrees", "lane-1");
    await git(repoRoot, ["worktree", "add", "-b", "orch/lane-1", worktreePath, "main"]);

    const worktrees = await listWorktrees(repoRoot);
    expect(worktrees).toHaveLength(2);
    const lane = worktrees.find((w) => w.branch === "orch/lane-1");
    expect(lane).toBeDefined();
    // git reports the realpath — macOS resolves /tmp -> /private/tmp, so
    // compare the stable suffix rather than the raw (symlinked) tmpdir path.
    expect(lane?.path).toEndWith(path.join(".orchestra", "worktrees", "lane-1"));
  });
});
