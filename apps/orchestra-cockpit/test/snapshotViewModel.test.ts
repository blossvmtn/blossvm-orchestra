import { describe, expect, test } from "bun:test";
import { laneStatus, type Lane } from "../src/lib/snapshotViewModel";

const cancelledLane = {
  workIntent: {
    id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
    planId: "d290f1ee-6c54-4b01-90e6-d701748f0854",
    repoSlug: "blossvmtn/blossvm-orchestra",
    intent: "Keep a cancelled run terminal without inventing a receipt",
    status: "planned",
    createdAt: "2026-08-09T17:00:00.000Z",
  },
  agentRun: {
    id: "d290f1ee-6c54-4b01-90e6-d701748f0852",
    taskSpecId: "d290f1ee-6c54-4b01-90e6-d701748f0853",
    provider: "fixture",
    status: "cancelled",
    startedAt: "2026-08-09T17:00:00.000Z",
    endedAt: "2026-08-09T17:01:00.000Z",
  },
} satisfies Lane;

describe("laneStatus", () => {
  test("keeps a cancelled run terminal before its receipt arrives", () => {
    expect(laneStatus(cancelledLane)).toBe("cancelled");
  });
});
