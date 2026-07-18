import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import {
  WorkIntentStatusSchema,
  RiskTierSchema,
  AgentRunProviderSchema,
  AgentRunStatusSchema,
  ReceiptOutcomeSchema,
  VerificationSchema,
} from "@orchestra/core";

// Materialized tables — one row per live entity, always overwritten in place.
// These are the sole source of truth for "what is true right now" (D6).
// Field names mirror the Zod schemas in @orchestra/core exactly, and enum
// columns are narrowed to the *same* value sets (imported, not retyped) —
// Fable review, 2026-07-18, F1: a bare `text("status")` compiles and inserts
// any string under the strict tsconfig, silently defeating the point of
// having two schema definitions agree in the first place.

export const workIntents = sqliteTable("work_intents", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  repoSlug: text("repo_slug").notNull(),
  intent: text("intent").notNull(),
  status: text("status", { enum: WorkIntentStatusSchema.options }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const taskSpecs = sqliteTable("task_specs", {
  id: text("id").primaryKey(),
  workIntentId: text("work_intent_id").notNull(),
  slug: text("slug").notNull(),
  branch: text("branch").notNull(),
  role: text("role").notNull(),
  modelHint: text("model_hint"),
  allowedPaths: text("allowed_paths", { mode: "json" }).$type<string[]>().notNull(),
  forbiddenPaths: text("forbidden_paths", { mode: "json" }).$type<string[]>().notNull(),
  acceptance: text("acceptance", { mode: "json" }).$type<string[]>().notNull(),
  // R0-R4, unset until P1 (spec §1.5) — nullable AND enum-narrowed.
  riskTier: text("risk_tier", { enum: RiskTierSchema.options }),
  createdAt: text("created_at").notNull(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  taskSpecId: text("task_spec_id").notNull(),
  provider: text("provider", { enum: AgentRunProviderSchema.options }).notNull(),
  claudeSessionId: text("claude_session_id"),
  status: text("status", { enum: AgentRunStatusSchema.options }).notNull(),
  lastHeartbeatSummary: text("last_heartbeat_summary"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  costUsd: real("cost_usd"),
});

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  agentRunId: text("agent_run_id").notNull(),
  taskSpecId: text("task_spec_id").notNull(),
  outcome: text("outcome", { enum: ReceiptOutcomeSchema.options }).notNull(),
  summary: text("summary").notNull(),
  prUrl: text("pr_url"),
  prTitle: text("pr_title"),
  filesTouched: text("files_touched", { mode: "json" }).$type<string[]>(),
  verification: text("verification", { enum: VerificationSchema.options }).notNull(), // D11
  costUsd: real("cost_usd"),
  createdAt: text("created_at").notNull(),
});

// entity_type / event_type have no Zod counterpart in @orchestra/core (they're
// a schema.ts-only bookkeeping concept, not a domain contract) — narrowed with
// a literal tuple instead, still enum-enforced rather than bare `text`.
const EVENT_ENTITY_TYPES = ["work_intent", "task_spec", "agent_run", "receipt"] as const;
const EVENT_TYPES = ["created", "updated"] as const;

/**
 * D6 — append-only, write-only audit trail. NEVER read to reconstruct current
 * state; the materialized tables above are the sole source of truth for that.
 * This table exists purely so a human can ask "what actually happened here,
 * in order" — a diary, not a filing cabinet.
 *
 * "Append-only" is enforced, not just conventional: migration 0001 adds
 * RAISE(ABORT) triggers on UPDATE/DELETE against this table (Fable review,
 * 2026-07-18, F5 — verified empirically that without them, both succeeded).
 */
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type", { enum: EVENT_ENTITY_TYPES }).notNull(),
  entityId: text("entity_id").notNull(),
  eventType: text("event_type", { enum: EVENT_TYPES }).notNull(),
  payload: text("payload", { mode: "json" }).notNull(),
  recordedAt: text("recorded_at").notNull(),
});
