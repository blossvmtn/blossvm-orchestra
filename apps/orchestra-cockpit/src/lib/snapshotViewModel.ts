import type {
  StateSnapshot,
  WorkIntent,
  TaskSpec,
  Worktree,
  AgentRun,
  Receipt,
} from "@orchestra/core";

/**
 * The joined "lane" the UI renders — NOT a persisted entity (per the handoff's
 * modeling rule). Composed client-side from one snapshot by joining
 * WorkIntent → TaskSpec → Worktree → AgentRun → Receipt.
 */
export type Lane = {
  workIntent: WorkIntent;
  taskSpec?: TaskSpec;
  worktree?: Worktree;
  agentRun?: AgentRun;
  receipt?: Receipt;
};

/**
 * Derived lifecycle status for a lane — every value maps to a real schema enum:
 * WorktreeStatus (`pr_open`), AgentRunStatus (`running`/`blocked`/`failed`/`done`),
 * or ReceiptOutcome (`succeeded`/`failed`/`cancelled`). No invented states.
 */
export type LaneStatus =
  | "queued"
  | "running"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "pr_open";

export function laneId(lane: Lane): string {
  return lane.taskSpec?.id ?? lane.workIntent.id;
}

/**
 * Snapshot arrays arrive newest-first (daemon ordering), so for the 1:1 and
 * latest-of relations we keep the first row seen per key.
 */
export function toLanes(snapshot: StateSnapshot): Lane[] {
  const specsByIntent = groupByKey(snapshot.taskSpecs, (t) => t.workIntentId);
  const worktreeBySpec = firstByKey(snapshot.worktrees, (w) => w.taskSpecId);
  const runBySpec = firstByKey(snapshot.agentRuns, (r) => r.taskSpecId);
  const receiptByRun = firstByKey(snapshot.receipts, (r) => r.agentRunId);

  return snapshot.workIntents.flatMap((workIntent) => {
    const taskSpecs = specsByIntent.get(workIntent.id) ?? [undefined];
    return taskSpecs.map((taskSpec) => {
      const agentRun = taskSpec ? runBySpec.get(taskSpec.id) : undefined;
      return {
        workIntent,
        taskSpec,
        worktree: taskSpec ? worktreeBySpec.get(taskSpec.id) : undefined,
        agentRun,
        receipt: agentRun ? receiptByRun.get(agentRun.id) : undefined,
      };
    });
  });
}

export function laneStatus(lane: Lane): LaneStatus {
  if (lane.worktree?.status === "pr_open") return "pr_open";
  const run = lane.agentRun?.status;
  if (run === "running") return "running";
  if (run === "blocked") return "blocked";
  if (run === "failed") return "failed";
  const outcome = lane.receipt?.outcome;
  if (outcome === "failed") return "failed";
  if (outcome === "cancelled") return "cancelled";
  if (outcome === "succeeded" || run === "done") return "succeeded";
  return "queued";
}

function firstByKey<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const k = key(row);
    if (!map.has(k)) map.set(k, row);
  }
  return map;
}

function groupByKey<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = map.get(k);
    if (group) group.push(row);
    else map.set(k, [row]);
  }
  return map;
}
