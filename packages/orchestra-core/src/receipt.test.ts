import { describe, expect, test } from "bun:test";
import { ReceiptSchema } from "./receipt";

const valid = {
  id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  agentRunId: "d290f1ee-6c54-4b01-90e6-d701748f0852",
  taskSpecId: "d290f1ee-6c54-4b01-90e6-d701748f0853",
  outcome: "succeeded",
  summary: "Fixture run completed with no real side effects",
  verification: "none",
  createdAt: "2026-07-18T16:00:00.000Z",
};

describe("ReceiptSchema", () => {
  test("accepts a minimal fixture receipt (verification: none)", () => {
    expect(ReceiptSchema.safeParse(valid).success).toBe(true);
  });

  test("accepts a receipt with a PR and human-walked verification", () => {
    const result = ReceiptSchema.safeParse({
      ...valid,
      prUrl: "https://github.com/blossvmtn/blossvm-orchestra/pull/1",
      prTitle: "fix: auth bug",
      filesTouched: ["src/lib/auth.py"],
      verification: "human_acceptance_walk",
      costUsd: 0.42,
    });
    expect(result.success).toBe(true);
  });

  test("rejects an unknown outcome", () => {
    const result = ReceiptSchema.safeParse({ ...valid, outcome: "partial" });
    expect(result.success).toBe(false);
  });

  test("rejects an unknown verification value", () => {
    const result = ReceiptSchema.safeParse({ ...valid, verification: "auto" });
    expect(result.success).toBe(false);
  });

  test("rejects a malformed PR URL", () => {
    const result = ReceiptSchema.safeParse({ ...valid, prUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });
});
