import { describe, expect, test } from "bun:test";
import { WorkIntentSchema } from "./workIntent";

const valid = {
  id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  planId: "d290f1ee-6c54-4b01-90e6-d701748f0852",
  repoSlug: "blossvm-orchestra",
  intent: "Fix the bug in auth.py",
  status: "captured",
  createdAt: "2026-07-18T16:00:00.000Z",
};

describe("WorkIntentSchema", () => {
  test("accepts a valid work intent", () => {
    expect(WorkIntentSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects an unknown status", () => {
    const result = WorkIntentSchema.safeParse({ ...valid, status: "done" });
    expect(result.success).toBe(false);
  });

  test("rejects a non-uuid id", () => {
    const result = WorkIntentSchema.safeParse({ ...valid, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  test("rejects an empty intent string", () => {
    const result = WorkIntentSchema.safeParse({ ...valid, intent: "" });
    expect(result.success).toBe(false);
  });
});
