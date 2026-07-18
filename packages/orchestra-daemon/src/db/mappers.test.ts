import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { WorkIntentSchema, TaskSpecSchema, AgentRunSchema, ReceiptSchema } from "@orchestra/core";
import { createDb } from "./db";
import { workIntents, taskSpecs, agentRuns, receipts } from "./schema";
import { rowToWorkIntent, rowToTaskSpec, rowToAgentRun, rowToReceipt } from "./mappers";

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

describe("row -> domain mappers (F2: Drizzle null vs. Zod undefined)", () => {
  test("rowToWorkIntent round-trips (WorkIntent has no optional fields, so this is a no-op pass-through)", () => {
    const db = freshDb();
    db.insert(workIntents)
      .values({
        id: WI_1,
        planId: "d290f1ee-6c54-4b01-90e6-d701748f0099",
        repoSlug: "blossvm-orchestra",
        intent: "Fix the auth bug",
        status: "captured",
        createdAt: "2026-07-18T16:00:00.000Z",
      })
      .run();

    const raw = db.select().from(workIntents).where(eq(workIntents.id, WI_1)).get();
    if (!raw) throw new Error("row not found");
    const workIntent = rowToWorkIntent(raw);

    expect(WorkIntentSchema.safeParse(workIntent).success).toBe(true);
    expect(workIntent.repoSlug).toBe("blossvm-orchestra");
  });

  test("a raw row with an unset optional column fails Schema.parse directly (proves the seam is real)", () => {
    const db = freshDb();
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
    db.insert(taskSpecs)
      .values({
        id: TS_1,
        workIntentId: WI_1,
        slug: "security-sanitize",
        branch: "orch/security-sanitize",
        role: "Security",
        allowedPaths: [],
        forbiddenPaths: [],
        acceptance: [],
        createdAt: "2026-07-18T16:00:00.000Z",
      })
      .run();

    const raw = db.select().from(taskSpecs).where(eq(taskSpecs.id, TS_1)).get();
    if (!raw) throw new Error("row not found");
    const taskSpec = rowToTaskSpec(raw);

    expect(taskSpec.modelHint).toBeUndefined();
    expect(taskSpec.riskTier).toBeUndefined();
    expect(TaskSpecSchema.safeParse(taskSpec).success).toBe(true);
  });

  test("rowToTaskSpec preserves a set optional field", () => {
    const db = freshDb();
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
});
