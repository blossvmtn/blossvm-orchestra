import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDb, type OrchestraDb } from "../db/db";
import { repos, workIntents, taskSpecs } from "../db/schema";
import { git } from "./git";
import { createWorktree, reconcileWorktree, removeWorktree } from "./worktrees";

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-worktrees-test-"));
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

function freshDb() {
  return createDb(":memory:");
}

// worktrees.taskSpecId carries a real FK to task_specs.id, which itself
// chains through work_intents.repoSlug -> repos.slug — seed the whole chain
// so these tests can exercise a real taskSpecId, not just a random UUID.
function seedTaskSpec(db: OrchestraDb): string {
  const now = "2026-07-18T16:00:00.000Z";
  db.insert(repos)
    .values({ id: randomUUID(), slug: "test-repo", rootPath: "/tmp/test-repo", registeredAt: now })
    .run();
  const workIntentId = randomUUID();
  db.insert(workIntents)
    .values({
      id: workIntentId,
      planId: randomUUID(),
      repoSlug: "test-repo",
      intent: "test",
      status: "captured",
      createdAt: now,
    })
    .run();
  const taskSpecId = randomUUID();
  db.insert(taskSpecs)
    .values({
      id: taskSpecId,
      workIntentId,
      slug: "test-lane",
      branch: "orch/test-lane",
      role: "Test",
      allowedPaths: [],
      forbiddenPaths: [],
      acceptance: [],
      createdAt: now,
    })
    .run();
  return taskSpecId;
}

describe("createWorktree", () => {
  test("creates a real worktree on a fresh branch and persists a Worktree row", async () => {
    const db = freshDb();
    const taskSpecId = seedTaskSpec(db);

    const worktree = await createWorktree(db, {
      repoRoot,
      taskSpecId,
      slug: "security-sanitize",
      branch: "orch/security-sanitize",
    });

    expect(worktree.taskSpecId).toBe(taskSpecId);
    expect(worktree.status).toBe("active");
    expect(worktree.path).toEndWith(path.join(".orchestra", "worktrees", "security-sanitize"));

    const branch = await git(worktree.path, ["branch", "--show-current"]);
    expect(branch.stdout.trim()).toBe("orch/security-sanitize");
  });

  test("rejects an invalid slug", async () => {
    const db = freshDb();
    const taskSpecId = seedTaskSpec(db);
    await expect(
      createWorktree(db, { repoRoot, taskSpecId, slug: "Not_Valid!", branch: "orch/x" }),
    ).rejects.toThrow(/Invalid worker slug/);
  });

  test("rejects a branch name starting with '-' (argument-injection guard)", async () => {
    const db = freshDb();
    const taskSpecId = seedTaskSpec(db);
    await expect(
      createWorktree(db, { repoRoot, taskSpecId, slug: "lane-1", branch: "--upload-pack=evil" }),
    ).rejects.toThrow(/Invalid branch name/);
  });

  test("re-creating against an already-existing worktree dir repairs rather than errors (fail-soft)", async () => {
    const db = freshDb();
    const taskSpecId = seedTaskSpec(db);

    const first = await createWorktree(db, { repoRoot, taskSpecId, slug: "lane-2", branch: "orch/lane-2" });
    const second = await createWorktree(db, { repoRoot, taskSpecId, slug: "lane-2", branch: "orch/lane-2" });

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("active");
  });

  test("falls back to attaching an existing branch when 'worktree add -b' fails", async () => {
    const db = freshDb();
    const taskSpecId = seedTaskSpec(db);
    // Pre-create the branch (not the worktree) so `-b` collides.
    await git(repoRoot, ["branch", "orch/lane-3"]);

    const worktree = await createWorktree(db, {
      repoRoot,
      taskSpecId,
      slug: "lane-3",
      branch: "orch/lane-3",
    });

    expect(worktree.branch).toBe("orch/lane-3");
    const branch = await git(worktree.path, ["branch", "--show-current"]);
    expect(branch.stdout.trim()).toBe("orch/lane-3");
  });
});

describe("reconcileWorktree", () => {
  test("marks a worktree orphaned once its directory is gone from disk", async () => {
    const db = freshDb();
    const taskSpecId = seedTaskSpec(db);
    const worktree = await createWorktree(db, { repoRoot, taskSpecId, slug: "lane-4", branch: "orch/lane-4" });

    await rm(worktree.path, { recursive: true, force: true });

    const reconciled = await reconcileWorktree(db, worktree.id);
    expect(reconciled?.status).toBe("orphaned");
  });

  test("returns undefined for an unknown worktree id", async () => {
    const db = freshDb();
    expect(await reconcileWorktree(db, randomUUID())).toBeUndefined();
  });
});

describe("removeWorktree", () => {
  test("removes a real worktree from disk and deletes its row", async () => {
    const db = freshDb();
    const taskSpecId = seedTaskSpec(db);
    const worktree = await createWorktree(db, { repoRoot, taskSpecId, slug: "lane-5", branch: "orch/lane-5" });

    const result = await removeWorktree(db, repoRoot, worktree.id, "keep-branch");
    expect(result.ok).toBe(true);

    const disk = await git(repoRoot, ["worktree", "list", "--porcelain"]);
    expect(disk.stdout).not.toContain(worktree.path);

    expect(await reconcileWorktree(db, worktree.id)).toBeUndefined();
  });

  test("delete-branch mode also removes the branch", async () => {
    const db = freshDb();
    const taskSpecId = seedTaskSpec(db);
    const worktree = await createWorktree(db, { repoRoot, taskSpecId, slug: "lane-6", branch: "orch/lane-6" });

    await removeWorktree(db, repoRoot, worktree.id, "delete-branch");

    const branches = await git(repoRoot, ["branch", "--list", "orch/lane-6"]);
    expect(branches.stdout.trim()).toBe("");
  });
});
