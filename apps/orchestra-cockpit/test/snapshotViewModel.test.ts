import { describe, expect, test } from "bun:test";
import type { StateSnapshot } from "@orchestra/core";
import { laneId, toLanes } from "../src/lib/snapshotViewModel";

const WORK_INTENT_ID = "11111111-1111-4111-8111-111111111111";
const FIRST_TASK_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_TASK_ID = "33333333-3333-4333-8333-333333333333";
const NEWEST_RUN_ID = "55555555-5555-4555-8555-555555555555";
const OLDER_RUN_ID = "66666666-6666-4666-8666-666666666666";

const snapshot: StateSnapshot = {
  generatedAt: "2026-07-28T18:00:00.000Z",
  repos: [],
  workIntents: [
    {
      id: WORK_INTENT_ID,
      planId: "44444444-4444-4444-8444-444444444444",
      repoSlug: "construction-os",
      intent: "Coordinate two independent worker lanes",
      status: "planned",
      createdAt: "2026-07-28T17:00:00.000Z",
    },
  ],
  taskSpecs: [
    {
      id: FIRST_TASK_ID,
      workIntentId: WORK_INTENT_ID,
      slug: "first-lane",
      branch: "feat/first-lane",
      role: "Builder",
      allowedPaths: [],
      forbiddenPaths: [],
      acceptance: [],
      createdAt: "2026-07-28T17:02:00.000Z",
    },
    {
      id: SECOND_TASK_ID,
      workIntentId: WORK_INTENT_ID,
      slug: "second-lane",
      branch: "feat/second-lane",
      role: "Reviewer",
      allowedPaths: [],
      forbiddenPaths: [],
      acceptance: [],
      createdAt: "2026-07-28T17:01:00.000Z",
    },
  ],
  worktrees: [],
  agentRuns: [],
  receipts: [],
};

describe("Orchestra lane view model", () => {
  test("renders every task lane when one work intent fans out to multiple task specs", () => {
    const lanes = toLanes(snapshot);

    expect(lanes).toHaveLength(2);
    expect(lanes.map((lane) => lane.taskSpec?.id)).toEqual([FIRST_TASK_ID, SECOND_TASK_ID]);
    expect(lanes.map(laneId)).toEqual([FIRST_TASK_ID, SECOND_TASK_ID]);
    expect(lanes.every((lane) => lane.workIntent.id === WORK_INTENT_ID)).toBe(true);
  });

  test("does not attach an older run's receipt to the newest run for a task lane", () => {
    const [lane] = toLanes({
      ...snapshot,
      taskSpecs: [snapshot.taskSpecs[0]!],
      agentRuns: [
        {
          id: NEWEST_RUN_ID,
          taskSpecId: FIRST_TASK_ID,
          provider: "claude-code",
          status: "running",
          startedAt: "2026-07-28T17:04:00.000Z",
        },
        {
          id: OLDER_RUN_ID,
          taskSpecId: FIRST_TASK_ID,
          provider: "claude-code",
          status: "done",
          startedAt: "2026-07-28T17:02:00.000Z",
          endedAt: "2026-07-28T17:03:00.000Z",
        },
      ],
      receipts: [
        {
          id: "77777777-7777-4777-8777-777777777777",
          agentRunId: OLDER_RUN_ID,
          taskSpecId: FIRST_TASK_ID,
          outcome: "succeeded",
          summary: "Older run completed",
          verification: "none",
          createdAt: "2026-07-28T17:03:00.000Z",
        },
      ],
    });

    expect(lane?.agentRun?.id).toBe(NEWEST_RUN_ID);
    expect(lane?.receipt).toBeUndefined();
  });
});
