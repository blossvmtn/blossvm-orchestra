import { describe, expect, test } from "bun:test";
import { AgentRunSchema, ReceiptSchema, type TaskSpec } from "@orchestra/core";
import { runFixtureCapabilityProvider } from "./fixtureCapabilityProvider";

const taskSpec: TaskSpec = {
  id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  workIntentId: "d290f1ee-6c54-4b01-90e6-d701748f0852",
  slug: "security-sanitize",
  branch: "orch/security-sanitize",
  role: "Security",
  allowedPaths: ["src/lib/auth/**"],
  forbiddenPaths: ["src/components/**"],
  acceptance: ["no UI layout edits"],
  createdAt: "2026-07-18T16:00:00.000Z",
};

describe("runFixtureCapabilityProvider", () => {
  test("produces a valid fixture AgentRun linked to the task spec", () => {
    const { agentRun } = runFixtureCapabilityProvider(taskSpec);

    expect(AgentRunSchema.safeParse(agentRun).success).toBe(true);
    expect(agentRun.taskSpecId).toBe(taskSpec.id);
    expect(agentRun.provider).toBe("fixture");
    expect(agentRun.status).toBe("done");
  });

  test("produces a valid Receipt linked to both the run and the task spec", () => {
    const { agentRun, receipt } = runFixtureCapabilityProvider(taskSpec);

    expect(ReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(receipt.agentRunId).toBe(agentRun.id);
    expect(receipt.taskSpecId).toBe(taskSpec.id);
    expect(receipt.verification).toBe("none");
    expect(receipt.outcome).toBe("succeeded");
  });

  test("no real agent or git involved: two calls for the same task spec produce distinct run/receipt ids", () => {
    const first = runFixtureCapabilityProvider(taskSpec);
    const second = runFixtureCapabilityProvider(taskSpec);

    expect(first.agentRun.id).not.toBe(second.agentRun.id);
    expect(first.receipt.id).not.toBe(second.receipt.id);
  });

  test("overrides apply on top of the fixture base, still schema-validated", () => {
    const { agentRun, receipt } = runFixtureCapabilityProvider(taskSpec, {
      agentRun: { status: "failed" },
      receipt: { outcome: "failed" },
    });

    expect(agentRun.status).toBe("failed");
    expect(receipt.outcome).toBe("failed");
  });
});
