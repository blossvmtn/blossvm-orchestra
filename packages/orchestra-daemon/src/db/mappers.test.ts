import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { WorkIntentSchema, TaskSpecSchema, AgentRunSchema, ReceiptSchema, WorktreeSchema } from "@orchestra/core";
import { createDb } from "./db";
import { workIntents, taskSpecs, agentRuns, receipts, repos, worktrees } from "./schema";
import { rowToWorkIntent, rowToTaskSpec, rowToAgentRun, rowToReceipt, rowToWorktree } from "./mappers";

function freshDb() {
  return createDb(":memory:");
}

// AgentRun/Receipt/TaskSpec ids are z.string().uuid() in @orchestra/core, unlike
// db.test.ts's plain-string ids — those tests never route through Schema.parse.
const WI_1 = "d290f1ee-6c54-4b01-90e6-d701748f0001";
const TS_NULL = "d290f1ee-6c54-4b01-90e6-d701748f0002";
const TS_1 = "d290f1ee-6c54-4b01-90e6-d701748f0003";
const TS_2 = "d290f1ee-6c54-4b01-90e6-d701748f0004";
const AR_1 = "d290f1ee-6c54-4b01-90e6-d701748f0005";
const RC_1 = "d290f1ee-6c54-4b01-90e6-d701748f0006";

// PRAGMA foreign_keys = ON (schema.ts, CodeRabbit PR #1 review, 2026-07-18)
// means every taskSpec/agentRun/receipt insert below now needs its parent row
// to actually exist first — these helpers seed exactly that.
function seedRepo(db: ReturnType<typeof freshDb>, slug = "blossvm-orchestra") {
  db.insert(repos)
    .values({
      id: `repo_${slug}`,
      slug,
      rootPath: `/repos/${slug}`,
      registeredAt: "2026-07-18T16:00:00.000Z",
    })
    .run();
}

function seedWorkIntent(db: ReturnType<typeof freshDb>, id: string) {
  seedRepo(db);
  db.insert(workIntents)
    .values({
      id,
      planId: "d290f1ee-6c54-4b01-90e6-d701748f0099",
      repoSlug: "blossvm-orchestra",
      intent: "Fix the auth bug",
      status: "captured",
      createdAt: "2026-07-18T16:00:00.000Z",
    })
    .run();
}

function seedTaskSpec(db: ReturnType<typeof freshDb>, id: string, workIntentId: string) {
  db.insert(taskSpecs)
    .values({
      id,
      workIntentId,
      slug: "security-sanitize",
      branch: "orch/security-sanitize",
      role: "Security",
      allowedPaths: [],
      forbiddenPaths: [],
      acceptance: [],
      createdAt: "2026-07-18T16:00:00.000Z",
    })
    .run();
}

describe("row -> domain mappers (F2: Drizzle null vs. Zod undefined)", () => {
  test("rowToWorkIntent round-trips (WorkIntent has no optional fields, so this is a no-op pass-through)", () => {
    const db = freshDb();
    seedWorkIntent(db, WI_1);

    const raw = db.select().from(workIntents).where(eq(workIntents.id, WI_1)).get();
    if (!raw) throw new Error("row not found");
    const workIntent = rowToWorkIntent(raw);

    expect(WorkIntentSchema.safeParse(workIntent).success).toBe(true);
    expect(workIntent.repoSlug).toBe("blossvm-orchestra");
  });

  test("a raw row with an unset optional column fails Schema.parse directly (proves the seam is real)", () => {
    const db = freshDb();
    seedWorkIntent(db, WI_1);
    db.insert(taskSpecs)
      .values({
        id: TS_NULL,
        workIntentId: WI_1,
        slug: "security-sanitize",
        branch: "orch/security-sanitize",
        role: "Security",
        allowedPaths: [],
        forbiddenPaths: [],
        acceptance: [],
        // modelHint, riskTier left unset -> stored as SQL NULL
        createdAt: "2026-07-18T16:00:00.000Z",
      })
      .run();

    const raw = db.select().from(taskSpecs).where(eq(taskSpecs.id, TS_NULL)).get();
    expect(raw?.modelHint).toBeNull();
    expect(TaskSpecSchema.safeParse(raw).success).toBe(false);
  });

  test("rowToTaskSpec converts null columns to undefined and parses cleanly", () => {
    const db = freshDb();
    seedWorkIntent(db, WI_1);
    seedTaskSpec(db, TS_1, WI_1);

    const raw = db.select().from(taskSpecs).where(eq(taskSpecs.id, TS_1)).get();
    if (!raw) throw new Error("row not found");
    const taskSpec = rowToTaskSpec(raw);

    expect(taskSpec.modelHint).toBeUndefined();
    expect(taskSpec.riskTier).toBeUndefined();
    expect(TaskSpecSchema.safeParse(taskSpec).success).toBe(true);
  });

  test("rowToTaskSpec preserves a set optional field", () => {
    const db = freshDb();
    seedWorkIntent(db, WI_1);
    db.insert(taskSpecs)
      .values({
        id: TS_2,
        workIntentId: WI_1,
        slug: "security-sanitize",
        branch: "orch/security-sanitize",
        role: "Security",
        modelHint: "cursor-sonnet",
        riskTier: "R2",
        allowedPaths: [],
        forbiddenPaths: [],
        acceptance: [],
        createdAt: "2026-07-18T16:00:00.000Z",
      })
      .run();

    const raw = db.select().from(taskSpecs).where(eq(taskSpecs.id, TS_2)).get();
    if (!raw) throw new Error("row not found");
    const taskSpec = rowToTaskSpec(raw);

    expect(taskSpec.modelHint).toBe("cursor-sonnet");
    expect(taskSpec.riskTier).toBe("R2");
  });

  test("rowToAgentRun and rowToReceipt round-trip through the same seam", () => {
    const db = freshDb();
    seedWorkIntent(db, WI_1);
    seedTaskSpec(db, TS_1, WI_1);
    db.insert(agentRuns)
      .values({
        id: AR_1,
        taskSpecId: TS_1,
        provider: "fixture",
        status: "done",
        startedAt: "2026-07-18T16:00:00.000Z",
        // claudeSessionId, endedAt, costUsd, lastHeartbeatSummary left unset
      })
      .run();
    db.insert(receipts)
      .values({
        id: RC_1,
        agentRunId: AR_1,
        taskSpecId: TS_1,
        outcome: "succeeded",
        summary: "Fixture run completed",
        verification: "none",
        createdAt: "2026-07-18T16:00:05.000Z",
        // prUrl, prTitle, filesTouched, costUsd left unset
      })
      .run();

    const rawRun = db.select().from(agentRuns).where(eq(agentRuns.id, AR_1)).get();
    const rawReceipt = db.select().from(receipts).where(eq(receipts.id, RC_1)).get();
    if (!rawRun || !rawReceipt) throw new Error("row not found");

    const agentRun = rowToAgentRun(rawRun);
    const receipt = rowToReceipt(rawReceipt);

    expect(AgentRunSchema.safeParse(agentRun).success).toBe(true);
    expect(ReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(agentRun.claudeSessionId).toBeUndefined();
    expect(receipt.prUrl).toBeUndefined();
  });

  // Phase 2 (spec docs/specs/2026-07-19-phase-2-stacked-pr-actions.md §3
  // step 7, D30) — rowToWorktree had no dedicated coverage before this;
  // worktrees.test.ts exercises it only indirectly through createWorktree.
  test("rowToWorktree converts null prUrl/prNumber columns to undefined and parses cleanly", () => {
    const db = freshDb();
    seedWorkIntent(db, WI_1);
    seedTaskSpec(db, TS_1, WI_1);
    const worktreeId = randomUUID();
    db.insert(worktrees)
      .values({
        id: worktreeId,
        taskSpecId: TS_1,
        path: "/repo/.orchestra/worktrees/security-sanitize",
        branch: "orch/security-sanitize",
        anchorSha: "abcdef0123456789",
        status: "active",
        createdAt: "2026-07-18T16:00:00.000Z",
        // prUrl, prNumber left unset -> stored as SQL NULL
      })
      .run();

    const raw = db.select().from(worktrees).where(eq(worktrees.id, worktreeId)).get();
    if (!raw) throw new Error("row not found");
    const worktree = rowToWorktree(raw);

    expect(worktree.prUrl).toBeUndefined();
    expect(worktree.prNumber).toBeUndefined();
    expect(WorktreeSchema.safeParse(worktree).success).toBe(true);
  });

  test("rowToWorktree preserves populated prUrl/prNumber columns", () => {
    const db = freshDb();
    seedWorkIntent(db, WI_1);
    seedTaskSpec(db, TS_1, WI_1);
    const worktreeId = randomUUID();
    db.insert(worktrees)
      .values({
        id: worktreeId,
        taskSpecId: TS_1,
        path: "/repo/.orchestra/worktrees/security-sanitize",
        branch: "orch/security-sanitize",
        anchorSha: "abcdef0123456789",
        status: "pr_open",
        createdAt: "2026-07-18T16:00:00.000Z",
        prUrl: "https://github.com/blossvmtn/blossvm-orchestra/pull/1",
        prNumber: 1,
      })
      .run();

    const raw = db.select().from(worktrees).where(eq(worktrees.id, worktreeId)).get();
    if (!raw) throw new Error("row not found");
    const worktree = rowToWorktree(raw);

    expect(worktree.prUrl).toBe("https://github.com/blossvmtn/blossvm-orchestra/pull/1");
    expect(worktree.prNumber).toBe(1);
    expect(WorktreeSchema.safeParse(worktree).success).toBe(true);
  });
});
