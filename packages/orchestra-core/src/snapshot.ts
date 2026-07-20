import { z } from "zod";
import { RepoSchema } from "./repo";
import { WorkIntentSchema } from "./workIntent";
import { TaskSpecSchema } from "./taskSpec";
import { WorktreeSchema } from "./worktree";
import { AgentRunSchema } from "./agentRun";
import { ReceiptSchema } from "./receipt";

/**
 * Phase 3A — the read-model the cockpit polls. A flat composition of the six
 * materialized tables (never the append-only `events` diary, D6): the UI joins
 * these into lanes client-side (a view model, not a new persisted entity). The
 * daemon builds and validates one of these per snapshot request; ordering
 * (newest-relevant-first) is applied by the daemon query, not enforced here.
 *
 * Lives in @orchestra/core because it's a pure contract over existing domain
 * schemas — zero I/O, same as the rest of this package.
 */
export const StateSnapshotSchema = z.object({
  generatedAt: z.string(),
  repos: z.array(RepoSchema),
  workIntents: z.array(WorkIntentSchema),
  taskSpecs: z.array(TaskSpecSchema),
  worktrees: z.array(WorktreeSchema),
  agentRuns: z.array(AgentRunSchema),
  receipts: z.array(ReceiptSchema),
});

export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;
