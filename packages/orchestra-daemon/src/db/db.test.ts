import { describe, expect, test } from "bun:test";
import { createDb } from "./db";
import { workIntents, taskSpecs, agentRuns, receipts, events } from "./schema";
import { eq } from "drizzle-orm";

// Every test opens its own in-memory database — real SQLite, real migrations
// applied, just never touching disk or ~/.orchestra.
function freshDb() {
  return createDb(":memory:");
}

describe("orchestra-daemon SQLite schema", () => {
  test("migrations create all five tables and a row round-trips per table", () => {
    const db = freshDb();

    db.insert(workIntents)
      .values({
        id: "wi_1",
        planId: "plan_1",
        repoSlug: "blossvm-orchestra",
        intent: "Fix the auth bug",
        status: "captured",
        createdAt: "2026-07-18T16:00:00.000Z",
      })
      .run();

    db.insert(taskSpecs)
      .values({
        id: "ts_1",
        workIntentId: "wi_1",
        slug: "security-sanitize",
        branch: "orch/security-sanitize",
        role: "Security",
        allowedPaths: ["src/lib/auth/**"],
        forbiddenPaths: ["src/components/**"],
        acceptance: ["no UI layout edits"],
        createdAt: "2026-07-18T16:00:00.000Z",
      })
      .run();

    db.insert(agentRuns)
      .values({
        id: "ar_1",
        taskSpecId: "ts_1",
        provider: "fixture",
        status: "done",
        startedAt: "2026-07-18T16:00:00.000Z",
        endedAt: "2026-07-18T16:00:05.000Z",
      })
      .run();

    db.insert(receipts)
      .values({
        id: "rc_1",
        agentRunId: "ar_1",
        taskSpecId: "ts_1",
        outcome: "succeeded",
        summary: "Fixture run completed",
        verification: "none",
        createdAt: "2026-07-18T16:00:05.000Z",
      })
      .run();

    const wi = db.select().from(workIntents).where(eq(workIntents.id, "wi_1")).get();
    const ts = db.select().from(taskSpecs).where(eq(taskSpecs.id, "ts_1")).get();
    const ar = db.select().from(agentRuns).where(eq(agentRuns.id, "ar_1")).get();
    const rc = db.select().from(receipts).where(eq(receipts.id, "rc_1")).get();

    expect(wi?.repoSlug).toBe("blossvm-orchestra");
    expect(ts?.workIntentId).toBe("wi_1");
    expect(ts?.allowedPaths).toEqual(["src/lib/auth/**"]);
    expect(ar?.taskSpecId).toBe("ts_1");
    expect(rc?.agentRunId).toBe("ar_1");
    expect(rc?.verification).toBe("none");
  });

  test("two task specs can share one work intent (the 1:N fan-out)", () => {
    const db = freshDb();
    db.insert(workIntents)
      .values({
        id: "wi_2",
        planId: "plan_2",
        repoSlug: "blossvm-orchestra",
        intent: "Separate security from UI work",
        status: "planned",
        createdAt: "2026-07-18T16:00:00.000Z",
      })
      .run();

    db.insert(taskSpecs)
      .values([
        {
          id: "ts_2a",
          workIntentId: "wi_2",
          slug: "security-sanitize",
          branch: "orch/security-sanitize",
          role: "Security",
          allowedPaths: [],
          forbiddenPaths: [],
          acceptance: [],
          createdAt: "2026-07-18T16:00:00.000Z",
        },
        {
          id: "ts_2b",
          workIntentId: "wi_2",
          slug: "ui-polish",
          branch: "orch/ui-polish",
          role: "UI",
          allowedPaths: [],
          forbiddenPaths: [],
          acceptance: [],
          createdAt: "2026-07-18T16:00:00.000Z",
        },
      ])
      .run();

    const rows = db.select().from(taskSpecs).where(eq(taskSpecs.workIntentId, "wi_2")).all();
    expect(rows).toHaveLength(2);
  });

  test("inserting twice for the same entity keeps both rows (no upsert-in-place)", () => {
    const db = freshDb();
    const recordedAt = "2026-07-18T16:00:00.000Z";

    db.insert(events)
      .values({
        entityType: "work_intent",
        entityId: "wi_3",
        eventType: "created",
        payload: { status: "captured" },
        recordedAt,
      })
      .run();

    db.insert(events)
      .values({
        entityType: "work_intent",
        entityId: "wi_3",
        eventType: "updated",
        payload: { status: "scoped" },
        recordedAt,
      })
      .run();

    const rows = db.select().from(events).where(eq(events.entityId, "wi_3")).all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.eventType)).toEqual(["created", "updated"]);
  });

  test("the events table rejects UPDATE and DELETE at the SQL layer (D6, migration 0001)", () => {
    const db = freshDb();
    const recordedAt = "2026-07-18T16:00:00.000Z";

    db.insert(events)
      .values({
        entityType: "work_intent",
        entityId: "wi_4",
        eventType: "created",
        payload: { status: "captured" },
        recordedAt,
      })
      .run();

    expect(() =>
      db.update(events).set({ eventType: "updated" }).where(eq(events.entityId, "wi_4")).run(),
    ).toThrow(/append-only/);

    expect(() => db.delete(events).where(eq(events.entityId, "wi_4")).run()).toThrow(
      /append-only/,
    );

    const rows = db.select().from(events).where(eq(events.entityId, "wi_4")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.eventType).toBe("created");
  });
});
