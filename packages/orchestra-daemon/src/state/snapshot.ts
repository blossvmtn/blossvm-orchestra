import { desc } from "drizzle-orm";
import { StateSnapshotSchema, type StateSnapshot } from "@orchestra/core";
import type { OrchestraDb } from "../db/db";
import { repos, workIntents, taskSpecs, worktrees, agentRuns, receipts } from "../db/schema";
import {
  rowToRepo,
  rowToWorkIntent,
  rowToTaskSpec,
  rowToWorktree,
  rowToAgentRun,
  rowToReceipt,
} from "../db/mappers";

/**
 * Phase 3A — compose the cockpit's state snapshot from the materialized tables
 * (D6: the sole source of truth for "what is true now"; the `events` table is
 * never read here). Each list is ordered newest-relevant-first so the UI's
 * default view leads with the most recent work without re-sorting.
 *
 * Every row goes through its @orchestra/core mapper (which validates it), and
 * the assembled aggregate is validated once more against StateSnapshotSchema
 * before it leaves the daemon — a malformed persisted row surfaces as a thrown
 * error here (caught as a 500 at the route), never as a silently wrong snapshot.
 */
// ponytail: full-table read of all six tables per poll — fine at this phase's
// handful of lanes. If agentRuns/receipts growth ever makes the ~2s poll a hot
// path, window each list (or switch to a since-last-poll delta), preserving the
// WorkIntent→TaskSpec→Worktree→AgentRun→Receipt join the view model needs
// (CodeRabbit, PR #5).
export function buildStateSnapshot(db: OrchestraDb): StateSnapshot {
  const snapshot = {
    generatedAt: new Date().toISOString(),
    repos: db.select().from(repos).orderBy(desc(repos.registeredAt)).all().map(rowToRepo),
    workIntents: db.select().from(workIntents).orderBy(desc(workIntents.createdAt)).all().map(rowToWorkIntent),
    taskSpecs: db.select().from(taskSpecs).orderBy(desc(taskSpecs.createdAt)).all().map(rowToTaskSpec),
    worktrees: db.select().from(worktrees).orderBy(desc(worktrees.createdAt)).all().map(rowToWorktree),
    agentRuns: db.select().from(agentRuns).orderBy(desc(agentRuns.startedAt)).all().map(rowToAgentRun),
    receipts: db.select().from(receipts).orderBy(desc(receipts.createdAt)).all().map(rowToReceipt),
  };
  return StateSnapshotSchema.parse(snapshot);
}
