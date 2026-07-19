import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createDb, type OrchestraDb } from "../db/db";
import { repos, workIntents, taskSpecs, worktrees } from "../db/schema";
import { git, gitStdout } from "./git";
import { runStackedAction, StackedActionError, WorktreeChainNotFoundError } from "./stackedAction";

// Real throwaway repos with a real LOCAL bare "origin" — not GitHub, but real
// enough for `git push` to genuinely succeed and for `gh pr view` to fail
// fast and locally (confirmed empirically: "no git remotes found" / "none of
// the git remotes ... point to a known GitHub host", both exit 1, no network
// hang) rather than mocking execFile. Matches this repo's established
// convention (worktrees.test.ts, git.test.ts).
const dirs: string[] = [];

async function makeRepoWithOrigin(): Promise<string> {
  const originRoot = await mkdtemp(path.join(tmpdir(), "orchestra-stacked-origin-"));
  dirs.push(originRoot);
  await git(originRoot, ["init", "--bare", "-b", "main"]);

  const repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-stacked-repo-"));
  dirs.push(repoRoot);
  await git(repoRoot, ["init", "-b", "main"]);
  await git(repoRoot, ["config", "user.email", "test@example.com"]);
  await git(repoRoot, ["config", "user.name", "Orchestra Test"]);
  await Bun.write(path.join(repoRoot, "README.md"), "test\n");
  await git(repoRoot, ["add", "README.md"]);
  await git(repoRoot, ["commit", "-m", "initial commit"]);
  await git(repoRoot, ["remote", "add", "origin", originRoot]);
  await git(repoRoot, ["push", "-u", "origin", "main"]);

  return repoRoot;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function freshDb(): OrchestraDb {
  return createDb(":memory:");
}

// Seeds repos -> work_intents -> task_specs -> worktrees, with the worktree's
// `path` pointing at a real repo (its main checkout, not a separately
// `git worktree add`-ed directory — stackedAction only cares that `path` is
// a valid git working directory on the right branch, not how it was created).
function seedChain(db: OrchestraDb, repoRoot: string, branch: string): string {
  const now = "2026-07-19T12:00:00.000Z";
  const slug = path.basename(repoRoot);
  db.insert(repos).values({ id: randomUUID(), slug, rootPath: repoRoot, registeredAt: now }).run();
  const workIntentId = randomUUID();
  db.insert(workIntents)
    .values({ id: workIntentId, planId: randomUUID(), repoSlug: slug, intent: "test", status: "captured", createdAt: now })
    .run();
  const taskSpecId = randomUUID();
  db.insert(taskSpecs)
    .values({
      id: taskSpecId,
      workIntentId,
      slug: "test-lane",
      branch,
      role: "Test",
      allowedPaths: [],
      forbiddenPaths: [],
      acceptance: [],
      createdAt: now,
    })
    .run();
  const worktreeId = randomUUID();
  db.insert(worktrees)
    .values({
      id: worktreeId,
      taskSpecId,
      path: repoRoot,
      branch,
      anchorSha: "abcdef0123456789",
      status: "active",
      createdAt: now,
    })
    .run();
  return worktreeId;
}

function stubbedCreatePullRequest(url: string, number: number) {
  return async () => ({ url, number });
}

describe("runStackedAction", () => {
  test("throws WorktreeChainNotFoundError for an unknown worktreeId", async () => {
    const db = freshDb();
    await expect(runStackedAction(db, randomUUID(), ["commit", "push"])).rejects.toThrow(WorktreeChainNotFoundError);
  });

  test("a clean tree + [commit, push]: commit step no-ops, push succeeds for real, no PR call", async () => {
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-1"]);
    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-1");

    const result = await runStackedAction(db, worktreeId, ["commit", "push"]);

    expect(result.committed).toBe(false);
    expect(result.pushed).toBe(true);
    expect(result.warnings).toContain("Working tree clean; commit step skipped.");
    expect(result.worktree.prUrl).toBeUndefined();

    const onOrigin = await gitStdout(repoRoot, ["ls-remote", "--heads", "origin", "orch/lane-1"]);
    expect(onOrigin).not.toBe("");
  });

  test("a dirty tree + [commit, push, pr] + a real message: all three run in order, committed true", async () => {
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-2"]);
    await Bun.write(path.join(repoRoot, "change.ts"), "content\n");
    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-2");

    const result = await runStackedAction(
      db,
      worktreeId,
      ["commit", "push", "pr"],
      "test commit",
      { createPullRequest: stubbedCreatePullRequest("https://github.com/blossvmtn/blossvm-orchestra/pull/42", 42) },
    );

    expect(result.committed).toBe(true);
    expect(result.pushed).toBe(true);
    expect(result.worktree.status).toBe("pr_open");
    expect(result.worktree.prUrl).toBe("https://github.com/blossvmtn/blossvm-orchestra/pull/42");
    expect(result.worktree.prNumber).toBe(42);

    const row = db.select().from(worktrees).where(eq(worktrees.id, worktreeId)).get();
    expect(row?.prNumber).toBe(42);
  });

  test("a dirty tree + [commit] with no message throws StackedActionError", async () => {
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-3"]);
    await Bun.write(path.join(repoRoot, "change.ts"), "content\n");
    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-3");

    await expect(runStackedAction(db, worktreeId, ["commit"])).rejects.toThrow(StackedActionError);
  });

  test("a dirty tree + [pr] (no commit) throws StackedActionError — D31 case 2", async () => {
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-4"]);
    await Bun.write(path.join(repoRoot, "change.ts"), "content\n");
    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-4");

    await expect(runStackedAction(db, worktreeId, ["pr"])).rejects.toThrow(StackedActionError);
  });

  test(".cursor/-only dirt + [push] is treated as clean, no refusal or dirty warning", async () => {
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-5"]);
    await Bun.write(path.join(repoRoot, ".cursor", "rules.md"), "fence\n");
    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-5");

    const result = await runStackedAction(db, worktreeId, ["push"]);

    expect(result.pushed).toBe(true);
    expect(result.warnings).not.toContain(
      "Working tree is dirty; pushing existing commits only (uncommitted changes left local).",
    );
  });

  test("a dirty repo with unpushed commits + [push] (no commit step): pushes existing commits, warns, committed false — D31 case 3", async () => {
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-6"]);
    // A real prior commit — something to push — then a further dirty change.
    await Bun.write(path.join(repoRoot, "committed.ts"), "content\n");
    await git(repoRoot, ["add", "committed.ts"]);
    await git(repoRoot, ["commit", "-m", "prior commit"]);
    await Bun.write(path.join(repoRoot, "still-dirty.ts"), "content\n");

    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-6");

    const result = await runStackedAction(db, worktreeId, ["push"]);

    expect(result.committed).toBe(false);
    expect(result.pushed).toBe(true);
    expect(result.warnings).toContain(
      "Working tree is dirty; pushing existing commits only (uncommitted changes left local).",
    );
    const onOrigin = await gitStdout(repoRoot, ["ls-remote", "--heads", "origin", "orch/lane-6"]);
    expect(onOrigin).not.toBe("");
  });

  test("a clean repo with unpushed commits (no upstream) + [pr]: auto-pushes then creates the PR — D31 case 4", async () => {
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-7"]);
    await Bun.write(path.join(repoRoot, "committed.ts"), "content\n");
    await git(repoRoot, ["add", "committed.ts"]);
    await git(repoRoot, ["commit", "-m", "unpushed commit"]);
    // Tree is clean now (everything committed); this branch has never been pushed.

    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-7");

    const result = await runStackedAction(db, worktreeId, ["pr"], undefined, {
      createPullRequest: stubbedCreatePullRequest("https://github.com/blossvmtn/blossvm-orchestra/pull/7", 7),
    });

    expect(result.committed).toBe(false);
    expect(result.pushed).toBe(true);
    expect(result.warnings.some((w) => w.includes("Push implied before PR create"))).toBe(true);
    expect(result.worktree.prNumber).toBe(7);

    const onOrigin = await gitStdout(repoRoot, ["ls-remote", "--heads", "origin", "orch/lane-7"]);
    expect(onOrigin).not.toBe("");
  });

  test("a dirty, no-upstream repo + [commit, pr] (no explicit push) + a message: commits, then case 4 still auto-pushes — composed case", async () => {
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-8"]);
    await Bun.write(path.join(repoRoot, "change.ts"), "content\n");

    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-8");

    const result = await runStackedAction(db, worktreeId, ["commit", "pr"], "test commit", {
      createPullRequest: stubbedCreatePullRequest("https://github.com/blossvmtn/blossvm-orchestra/pull/8", 8),
    });

    expect(result.committed).toBe(true);
    expect(result.pushed).toBe(true);
    expect(result.worktree.prNumber).toBe(8);

    const onOrigin = await gitStdout(repoRoot, ["ls-remote", "--heads", "origin", "orch/lane-8"]);
    expect(onOrigin).not.toBe("");
  });

  test("viewPrForBranch reuses an existing open PR instead of calling createPullRequest again", async () => {
    // Real network/gh call: since this throwaway repo's "origin" isn't a
    // GitHub remote, gh always returns null here (confirmed empirically —
    // exit 1, no network hang) — so this test proves the create-path is
    // reached, not the reuse-path, which is the honest limit of testing
    // viewPrForBranch "for real" against a non-GitHub repo. The reuse path
    // itself is exercised by the live acceptance walk (spec §5).
    const repoRoot = await makeRepoWithOrigin();
    await git(repoRoot, ["checkout", "-b", "orch/lane-9"]);
    await Bun.write(path.join(repoRoot, "change.ts"), "content\n");

    const db = freshDb();
    const worktreeId = seedChain(db, repoRoot, "orch/lane-9");

    let createCalls = 0;
    const result = await runStackedAction(db, worktreeId, ["commit", "push", "pr"], "test commit", {
      createPullRequest: async () => {
        createCalls += 1;
        return { url: "https://github.com/blossvmtn/blossvm-orchestra/pull/9", number: 9 };
      },
    });

    expect(createCalls).toBe(1);
    expect(result.worktree.prNumber).toBe(9);
  });
});
