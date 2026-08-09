import { z } from "zod";

// One per actually-dispatched process. This is an entirely new schema —
// WORKTREE-SYNC-LOG was a heartbeat *within* a run, not the run itself: no run
// identity, no start/end time, no provider. See spec §1.5.
export const AgentRunProviderSchema = z.enum([
  "claude-code",
  "codex",
  "cursor",
  "cursor-cloud",
  "devin",
  "claude-managed",
  "codex-cloud",
  "hermes",
  "goose",
  "fixture",
]);
export const AgentRunStatusSchema = z.enum([
  "queued",
  "running",
  "blocked",
  "waiting_for_input",
  "waiting_for_approval",
  "cancelling",
  "cancelled",
  "done",
  "failed",
]);

export const AgentRunSchema = z.object({
  id: z.string().uuid(),
  taskSpecId: z.string().uuid(),
  provider: AgentRunProviderSchema,
  // Populated from the real `system`/`init` event's session_id once P1 wires
  // real driving (spec §2 anchor). Null for every P0 fixture run.
  claudeSessionId: z.string().optional(),
  // Provider-owned identifier for cloud runs. It is deliberately generic so
  // capability adapters do not leak provider-specific field names downstream.
  providerRunId: z.string().min(1).optional(),
  status: AgentRunStatusSchema,
  lastHeartbeatSummary: z.string().max(280).optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  // Sourced from the real `result` event's cost field once P1 wires real driving.
  costUsd: z.number().nonnegative().optional(),
});

export type AgentRunProvider = z.infer<typeof AgentRunProviderSchema>;
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
