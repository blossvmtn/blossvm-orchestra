import { describe, expect, test, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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

    // .toEndWith, not .toBe: registerRepo now canonicalizes via realpath
    // (second review round fix), and macOS resolves /tmp -> /private/tmp —
    // same pattern as git.test.ts's existing realpath-vs-symlink assertion.
    expect(repo.rootPath).toEndWith(fs.realpathSync(repoRoot));
    expect(repo.slug).toBe(path.basename(repoRoot));

    const row = db.select().from(repos).where(eq(repos.slug, repo.slug)).get();
    expect(row?.rootPath).toBe(repo.rootPath);

    const eventRows = db.select().from(events).where(eq(events.entityId, repo.id)).all();
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0]?.entityType).toBe("repo");
  });

  test("registerRepo rejects a non-git directory", async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-not-a-repo-"));
    const db = freshDb();

    await expect(registerRepo(db, repoRoot)).rejects.toThrow(/Not a git repository/);
  });

  // Second independent review round, 2026-07-19 — three MAJOR gaps.
  describe("registerRepo — canonicalization, idempotency, and slug collisions", () => {
    test("selecting a subdirectory of a repo still registers the repo's real root, not the subdirectory", async () => {
      repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-register-subdir-"));
      await git(repoRoot, ["init", "-b", "main"]);
      const subdir = path.join(repoRoot, "packages", "core");
      await mkdir(subdir, { recursive: true });

      const db = freshDb();
      const repo = await registerRepo(db, subdir);

      expect(repo.rootPath).toEndWith(fs.realpathSync(repoRoot));
      expect(repo.slug).toBe(path.basename(repoRoot));
    });

    test("re-registering the same repo is a no-op, not a unique-constraint crash", async () => {
      repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-register-idempotent-"));
      await git(repoRoot, ["init", "-b", "main"]);

      const db = freshDb();
      const first = await registerRepo(db, repoRoot);
      const second = await registerRepo(db, repoRoot);

      expect(second.id).toBe(first.id);
      const rows = db.select().from(repos).where(eq(repos.slug, first.slug)).all();
      expect(rows).toHaveLength(1);
    });

    test("re-registering overwrites a stale row whose stored rootPath is no longer a live repo (the migration-0004 backfill placeholder case)", async () => {
      repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-register-stale-"));
      await git(repoRoot, ["init", "-b", "main"]);
      const db = freshDb();
      const slug = path.basename(repoRoot);

      // Simulates migration 0004's backfill: a repos row whose slug matches
      // the real repo's basename but whose root_path is a placeholder that
      // was never (and never will be) a live repo. A real UUID id, matching
      // what the migration's SQL actually generates.
      const placeholderId = "d290f1ee-6c54-4b01-90e6-d701748f9999";
      db.insert(repos)
        .values({
          id: placeholderId,
          slug,
          rootPath: "(unknown — backfilled by migration 0004, re-register via POST /repos)",
          registeredAt: "1970-01-01T00:00:00.000Z",
        })
        .run();

      const repo = await registerRepo(db, repoRoot);

      expect(repo.id).toBe(placeholderId);
      expect(repo.rootPath).toEndWith(fs.realpathSync(repoRoot));
      const rows = db.select().from(repos).where(eq(repos.slug, slug)).all();
      expect(rows).toHaveLength(1);
    });

    test("two different, still-live repos sharing a basename get distinct slugs instead of one clobbering the other", async () => {
      const parentA = await mkdtemp(path.join(tmpdir(), "orchestra-register-collide-a-"));
      const parentB = await mkdtemp(path.join(tmpdir(), "orchestra-register-collide-b-"));
      const repoA = path.join(parentA, "shared-name");
      const repoB = path.join(parentB, "shared-name");
      await mkdir(repoA, { recursive: true });
      await mkdir(repoB, { recursive: true });
      await git(repoA, ["init", "-b", "main"]);
      await git(repoB, ["init", "-b", "main"]);

      const db = freshDb();
      try {
        const first = await registerRepo(db, repoA);
        const second = await registerRepo(db, repoB);

        expect(first.slug).toBe("shared-name");
        expect(second.slug).not.toBe("shared-name");
        expect(second.rootPath).toEndWith(fs.realpathSync(repoB));

        const rows = db.select().from(repos).all();
        expect(rows).toHaveLength(2);
      } finally {
        await rm(parentA, { recursive: true, force: true });
        await rm(parentB, { recursive: true, force: true });
      }
    });
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
