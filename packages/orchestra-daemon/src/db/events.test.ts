import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "./db";
import { events } from "./schema";
import { writeEvent } from "./events";

function freshDb() {
  return createDb(":memory:");
}

describe("writeEvent", () => {
  test("writes a row with the given entity/event type and a JSON-serialized payload", () => {
    const db = freshDb();
    const payload = { id: "wt_1", status: "active" };

    writeEvent(db, "worktree", "wt_1", "created", payload);

    const rows = db.select().from(events).where(eq(events.entityId, "wt_1")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entityType).toBe("worktree");
    expect(rows[0]?.eventType).toBe("created");
    expect(rows[0]?.payload).toEqual(payload);
  });

  test("accepts every entity type the append-only table now supports", () => {
    const db = freshDb();
    const entityTypes = ["work_intent", "task_spec", "agent_run", "receipt", "worktree", "repo"] as const;

    for (const entityType of entityTypes) {
      writeEvent(db, entityType, `id_${entityType}`, "created", { entityType });
    }

    const rows = db.select().from(events).all();
    expect(rows).toHaveLength(entityTypes.length);
  });

  test("stamps recordedAt as an ISO8601 string", () => {
    const db = freshDb();
    writeEvent(db, "repo", "repo_1", "created", { slug: "x" });

    const row = db.select().from(events).where(eq(events.entityId, "repo_1")).get();
    expect(row?.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
