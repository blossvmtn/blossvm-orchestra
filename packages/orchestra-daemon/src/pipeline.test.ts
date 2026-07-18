import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "./db/db";
import { events } from "./db/schema";
import { dispatchFixtureWorkIntent, getReceiptById } from "./pipeline";

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
