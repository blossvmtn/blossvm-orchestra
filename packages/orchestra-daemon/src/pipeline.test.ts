import { describe, expect, test, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb } from "./db/db";
import { events, repos } from "./db/schema";
import { git } from "./git/git";
import {
  dispatchFixtureWorkIntent,
  getReceiptById,
  registerRepo,
  dispatchWorkIntent,
  RepoNotRegisteredError,
} from "./pipeline";

function freshDb() {
  return createDb(":memory:");
}

describe("the contract path (spec §3.6): fixture WorkIntent -> TaskSpec -> fake AgentRun -> Receipt", () => {
  test("a full dispatch lands correctly-linked rows in all four materialized tables", () => {
    const db = freshDb();

    const result = dispatchFixtureWorkIntent(db);

    expect(result.taskSpec.workIntentId).toBe(result.workIntent.id);
    expect(result.agentRun.taskSpecId).toBe(result.taskSpec.id);
    expect(result.agentRun.provider).toBe("fixture");
    expect(result.receipt.agentRunId).toBe(result.agentRun.id);
    expect(result.receipt.taskSpecId).toBe(result.taskSpec.id);
    expect(result.receipt.verification).toBe("none");
  });

  test("the Receipt is retrievable from the materialized tables via the read path", () => {
    const db = freshDb();
    const { receipt } = dispatchFixtureWorkIntent(db);

    const fetched = getReceiptById(db, receipt.id);

    expect(fetched).toEqual(receipt);
  });

  test("the read path sources only materialized tables — provable, not just asserted by code review", () => {
    const db = freshDb();
    const { receipt } = dispatchFixtureWorkIntent(db);

    // dispatchFixtureWorkIntent deliberately never writes to `events` (see
    // pipeline.ts) — so if the read succeeds while `events` holds zero rows
    // for anything, it cannot have sourced any part of its answer from there.
    const eventRows = db.select().from(events).where(eq(events.entityId, receipt.id)).all();
    expect(eventRows).toHaveLength(0);

    const fetched = getReceiptById(db, receipt.id);
    expect(fetched?.id).toBe(receipt.id);
    expect(fetched?.outcome).toBe("succeeded");
  });

  test("a receipt id that was never dispatched reads back as not found, not a thrown parse error", () => {
    const db = freshDb();
    expect(getReceiptById(db, "d290f1ee-6c54-4b01-90e6-d701748f9999")).toBeUndefined();
  });
});

// dispatchWorkIntent's real path spawns a real `claude` process (real API
// cost, real latency) — not exercised in this automated suite. Only the
// cheap, spawn-free parts are covered here: registerRepo (real git repo, no
// API cost) and the repoSlug-not-registered rejection, which throws before
// any spawn happens. The full chain (register -> dispatch -> real worktree
// -> real Claude Code -> real fence -> real Receipt) was verified live on
// JD's machine (spec §5's acceptance walk).
describe("registerRepo / dispatchWorkIntent (Phase 1)", () => {
  let repoRoot: string;

  afterEach(async () => {
    if (repoRoot) await rm(repoRoot, { recursive: true, force: true });
  });

  test("registerRepo validates it's a real git repo and persists a Repo row + event", async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-register-test-"));
    await git(repoRoot, ["init", "-b", "main"]);

    const db = freshDb();
    const repo = await registerRepo(db, repoRoot);

    expect(repo.rootPath).toBe(repoRoot);
    expect(repo.slug).toBe(path.basename(repoRoot));

    const row = db.select().from(repos).where(eq(repos.slug, repo.slug)).get();
    expect(row?.rootPath).toBe(repoRoot);

    const eventRows = db.select().from(events).where(eq(events.entityId, repo.id)).all();
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]?.entityType).toBe("repo");
  });

  test("registerRepo rejects a non-git directory", async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-not-a-repo-"));
    const db = freshDb();

    await expect(registerRepo(db, repoRoot)).rejects.toThrow(/Not a git repository/);
  });

  test("dispatchWorkIntent rejects an unregistered repoSlug before spawning anything", async () => {
    const db = freshDb();

    await expect(
      dispatchWorkIntent(db, {
        repoSlug: "never-registered",
        intent: "test",
        taskSpec: {
          slug: "lane-1",
          branch: "orch/lane-1",
          role: "Test",
          allowedPaths: [],
          forbiddenPaths: [],
          acceptance: [],
        },
      }),
    ).rejects.toThrow(RepoNotRegisteredError);
  });
});
