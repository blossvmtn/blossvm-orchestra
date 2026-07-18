import { describe, expect, test } from "bun:test";
import { AgentRunSchema } from "./agentRun";

const valid = {
  id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  taskSpecId: "d290f1ee-6c54-4b01-90e6-d701748f0852",
  provider: "fixture",
  status: "queued",
  startedAt: "2026-07-18T16:00:00.000Z",
};

describe("AgentRunSchema", () => {
  test("accepts a minimal fixture run", () => {
    expect(AgentRunSchema.safeParse(valid).success).toBe(true);
  });

  test("accepts a real claude-code run with a session id and cost", () => {
    const result = AgentRunSchema.safeParse({
      ...valid,
      provider: "claude-code",
      claudeSessionId: "sess_01",
      status: "done",
      endedAt: "2026-07-18T16:05:00.000Z",
      costUsd: 0.42,
      lastHeartbeatSummary: "Fixed the auth bug, tests passing",
    });
    expect(result.success).toBe(true);
  });

  test("rejects an unknown provider", () => {
    const result = AgentRunSchema.safeParse({ ...valid, provider: "gpt-5.6" });
    expect(result.success).toBe(false);
  });

  test("rejects a negative cost", () => {
    const result = AgentRunSchema.safeParse({ ...valid, costUsd: -1 });
    expect(result.success).toBe(false);
  });

  test("rejects a heartbeat summary over 280 chars", () => {
    const result = AgentRunSchema.safeParse({
      ...valid,
      lastHeartbeatSummary: "x".repeat(281),
    });
    expect(result.success).toBe(false);
  });
});
