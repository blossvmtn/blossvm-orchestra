import { eq } from "drizzle-orm";
import type { WorkIntent, TaskSpec, AgentRun, Receipt } from "@orchestra/core";
import type { OrchestraDb } from "./db/db";
import { workIntents, taskSpecs, agentRuns, receipts } from "./db/schema";
import { rowToReceipt } from "./db/mappers";
import { fixtureWorkIntent, fixtureTaskSpec } from "./fixtures";
import { runFixtureCapabilityProvider } from "./fixtureCapabilityProvider";

export type FixtureDispatchResult = {
  workIntent: WorkIntent;
  taskSpec: TaskSpec;
  agentRun: AgentRun;
  receipt: Receipt;
};

/**
 * The write half of spec §3.6's contract path: fixture WorkIntent -> TaskSpec
 * -> fake AgentRun -> Receipt, written to the four materialized tables.
 * Shared by the contract-path test and the daemon's POST /fixture/dispatch
 * route, so both exercise the identical write logic.
 *
 * Deliberately does not write to `events` — D6's audit trail is real business
 * logic (what actually happened, in order) and this dispatch is still a
 * fixture path with nothing to audit yet; wiring events writes is P1's job
 * once a real provider does something worth recording.
 */
export function dispatchFixtureWorkIntent(db: OrchestraDb): FixtureDispatchResult {
  const workIntent = fixtureWorkIntent();
  const taskSpec = fixtureTaskSpec(workIntent.id);
  const { agentRun, receipt } = runFixtureCapabilityProvider(taskSpec);

  // One transaction, not four independent inserts (Opus review, 2026-07-18) —
  // a failure partway through must not leave an orphan WorkIntent/TaskSpec
  // with no matching Receipt.
  db.transaction((tx) => {
    tx.insert(workIntents).values(workIntent).run();
    tx.insert(taskSpecs).values(taskSpec).run();
    tx.insert(agentRuns).values(agentRun).run();
    tx.insert(receipts).values(receipt).run();
  });

  return { workIntent, taskSpec, agentRun, receipt };
}

/**
 * The read path (spec §3.6): sources the `receipts` materialized table only
 * — never `events`. Shared by the contract-path test and the daemon's
 * GET /receipts/:id route.
 */
export function getReceiptById(db: OrchestraDb, id: string): Receipt | undefined {
  const row = db.select().from(receipts).where(eq(receipts.id, id)).get();
  return row ? rowToReceipt(row) : undefined;
}
