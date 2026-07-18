import {
  WorkIntentSchema,
  TaskSpecSchema,
  AgentRunSchema,
  ReceiptSchema,
  type WorkIntent,
  type TaskSpec,
  type AgentRun,
  type Receipt,
} from "@orchestra/core";
import { workIntents, taskSpecs, agentRuns, receipts } from "./schema";

/**
 * SQLite via Drizzle returns `null` for an absent column on select; the Zod
 * schemas in @orchestra/core use `.optional()` (`undefined`), not `.nullable()`
 * — deliberately, so @orchestra/core stays persistence-agnostic (Fable review,
 * 2026-07-18, F2). A raw row handed straight to `Schema.parse()` fails: this is
 * the one seam where that gap gets closed, on the way out of SQLite.
 */
function nullsToUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value === null ? undefined : value;
  }
  return out;
}

export function rowToWorkIntent(row: typeof workIntents.$inferSelect): WorkIntent {
  return WorkIntentSchema.parse(nullsToUndefined(row));
}

export function rowToTaskSpec(row: typeof taskSpecs.$inferSelect): TaskSpec {
  return TaskSpecSchema.parse(nullsToUndefined(row));
}

export function rowToAgentRun(row: typeof agentRuns.$inferSelect): AgentRun {
  return AgentRunSchema.parse(nullsToUndefined(row));
}

export function rowToReceipt(row: typeof receipts.$inferSelect): Receipt {
  return ReceiptSchema.parse(nullsToUndefined(row));
}
