import { sqliteTable, text, real, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  WorkIntentStatusSchema,
  RiskTierSchema,
  AgentRunProviderSchema,
  AgentRunStatusSchema,
  ReceiptOutcomeSchema,
  VerificationSchema,
  WorktreeStatusSchema,
} from "@orchestra/core";

// Materialized tables — one row per live entity, always overwritten in place.
// These are the sole source of truth for "what is true right now" (D6).
// Field names mirror the Zod schemas in @orchestra/core exactly, and enum
// columns are narrowed to the *same* value sets (imported, not retyped) —
// Fable review, 2026-07-18, F1: a bare `text("status")` compiles and inserts
// any string under the strict tsconfig, silently defeating the point of
// having two schema definitions agree in the first place.

// One row per registered repo — one row for P1 (spec §2, D21). `slug` needs
// a UNIQUE index, not a plain one: SQLite requires an FK's target column to
// be a PK or carry a UNIQUE constraint, and workIntents.repoSlug below
// references it.
export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  rootPath: text("root_path").notNull(),
  registeredAt: text("registered_at").notNull(),
}, (table) => [uniqueIndex("repos_slug_idx").on(table.slug)]);

export const workIntents = sqliteTable("work_intents", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull(),
  repoSlug: text("repo_slug")
    .notNull()
    .references(() => repos.slug),
  intent: text("intent").notNull(),
  status: text("status", { enum: WorkIntentStatusSchema.options }).notNull(),
  createdAt: text("created_at").notNull(),
});

// Foreign keys + indexes on every fk column (CodeRabbit, PR #1 review,
// 2026-07-18): without them SQLite can't stop a task_spec pointing at a
// nonexistent work_intent, and a lookup by workIntentId/taskSpecId/agentRunId
// degrades to a full table scan as data grows. pipeline.ts's transactional
// write makes an orphan unlikely on the fixture happy path, but doesn't
// protect against a partial delete or a future direct-SQL bug. Enforcement
// itself needs `PRAGMA foreign_keys = ON` at the connection level — see
// createDb() in db.ts, since SQLite ignores `.references()` without it.
export const taskSpecs = sqliteTable(
  "task_specs",
  {
    id: text("id").primaryKey(),
    workIntentId: text("work_intent_id")
      .notNull()
      .references(() => workIntents.id),
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
  },
  (table) => [index("task_specs_work_intent_id_idx").on(table.workIntentId)],
);

// The physical, on-disk realization of a TaskSpec's worker lane — 1:1 with
// TaskSpec, a distinct entity with its own mutating lifecycle (see
// @orchestra/core's worktree.ts doc comment). Phase 1 spec §2, D20.
export const worktrees = sqliteTable(
  "worktrees",
  {
    id: text("id").primaryKey(),
    taskSpecId: text("task_spec_id")
      .notNull()
      .references(() => taskSpecs.id),
    path: text("path").notNull(),
    branch: text("branch").notNull(),
    anchorSha: text("anchor_sha").notNull(),
    status: text("status", { enum: WorktreeStatusSchema.options }).notNull(),
    createdAt: text("created_at").notNull(),
    lastSyncAt: text("last_sync_at"),
  },
  (table) => [index("worktrees_task_spec_id_idx").on(table.taskSpecId)],
);

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    taskSpecId: text("task_spec_id")
      .notNull()
      .references(() => taskSpecs.id),
    provider: text("provider", { enum: AgentRunProviderSchema.options }).notNull(),
    claudeSessionId: text("claude_session_id"),
    status: text("status", { enum: AgentRunStatusSchema.options }).notNull(),
    lastHeartbeatSummary: text("last_heartbeat_summary"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    costUsd: real("cost_usd"),
  },
  (table) => [index("agent_runs_task_spec_id_idx").on(table.taskSpecId)],
);

export const receipts = sqliteTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    agentRunId: text("agent_run_id")
      .notNull()
      .references(() => agentRuns.id),
    taskSpecId: text("task_spec_id")
      .notNull()
      .references(() => taskSpecs.id),
    outcome: text("outcome", { enum: ReceiptOutcomeSchema.options }).notNull(),
    summary: text("summary").notNull(),
    prUrl: text("pr_url"),
    prTitle: text("pr_title"),
    filesTouched: text("files_touched", { mode: "json" }).$type<string[]>(),
    verification: text("verification", { enum: VerificationSchema.options }).notNull(), // D11
    costUsd: real("cost_usd"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("receipts_agent_run_id_idx").on(table.agentRunId),
    index("receipts_task_spec_id_idx").on(table.taskSpecId),
  ],
);

// entity_type / event_type have no Zod counterpart in @orchestra/core (they're
// a schema.ts-only bookkeeping concept, not a domain contract) — narrowed with
// a literal tuple instead, still enum-enforced rather than bare `text`.
const EVENT_ENTITY_TYPES = [
  "work_intent",
  "task_spec",
  "agent_run",
  "receipt",
  "worktree",
  "repo",
] as const;
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
