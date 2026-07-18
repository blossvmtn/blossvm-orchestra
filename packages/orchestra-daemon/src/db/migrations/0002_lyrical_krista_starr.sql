-- Adds FK references + indexes on every fk column that schema.ts previously
-- left as bare text (CodeRabbit, PR #1 review, 2026-07-18) — enforcement
-- itself needs `PRAGMA foreign_keys = ON` at the connection level, set in
-- createDb() (db.ts), since SQLite ignores schema-level FK declarations
-- without it. SQLite has no ALTER TABLE ADD FOREIGN KEY, so drizzle-kit
-- recreates each affected table (create __new_*, copy rows, drop, rename) —
-- generated as-is, not hand-edited, so `drizzle-kit check` stays exact.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_spec_id` text NOT NULL,
	`provider` text NOT NULL,
	`claude_session_id` text,
	`status` text NOT NULL,
	`last_heartbeat_summary` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`cost_usd` real,
	FOREIGN KEY (`task_spec_id`) REFERENCES `task_specs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_agent_runs`("id", "task_spec_id", "provider", "claude_session_id", "status", "last_heartbeat_summary", "started_at", "ended_at", "cost_usd") SELECT "id", "task_spec_id", "provider", "claude_session_id", "status", "last_heartbeat_summary", "started_at", "ended_at", "cost_usd" FROM `agent_runs`;--> statement-breakpoint
DROP TABLE `agent_runs`;--> statement-breakpoint
ALTER TABLE `__new_agent_runs` RENAME TO `agent_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `agent_runs_task_spec_id_idx` ON `agent_runs` (`task_spec_id`);--> statement-breakpoint
CREATE TABLE `__new_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_run_id` text NOT NULL,
	`task_spec_id` text NOT NULL,
	`outcome` text NOT NULL,
	`summary` text NOT NULL,
	`pr_url` text,
	`pr_title` text,
	`files_touched` text,
	`verification` text NOT NULL,
	`cost_usd` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_run_id`) REFERENCES `agent_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_spec_id`) REFERENCES `task_specs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_receipts`("id", "agent_run_id", "task_spec_id", "outcome", "summary", "pr_url", "pr_title", "files_touched", "verification", "cost_usd", "created_at") SELECT "id", "agent_run_id", "task_spec_id", "outcome", "summary", "pr_url", "pr_title", "files_touched", "verification", "cost_usd", "created_at" FROM `receipts`;--> statement-breakpoint
DROP TABLE `receipts`;--> statement-breakpoint
ALTER TABLE `__new_receipts` RENAME TO `receipts`;--> statement-breakpoint
CREATE INDEX `receipts_agent_run_id_idx` ON `receipts` (`agent_run_id`);--> statement-breakpoint
CREATE INDEX `receipts_task_spec_id_idx` ON `receipts` (`task_spec_id`);--> statement-breakpoint
CREATE TABLE `__new_task_specs` (
	`id` text PRIMARY KEY NOT NULL,
	`work_intent_id` text NOT NULL,
	`slug` text NOT NULL,
	`branch` text NOT NULL,
	`role` text NOT NULL,
	`model_hint` text,
	`allowed_paths` text NOT NULL,
	`forbidden_paths` text NOT NULL,
	`acceptance` text NOT NULL,
	`risk_tier` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`work_intent_id`) REFERENCES `work_intents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_task_specs`("id", "work_intent_id", "slug", "branch", "role", "model_hint", "allowed_paths", "forbidden_paths", "acceptance", "risk_tier", "created_at") SELECT "id", "work_intent_id", "slug", "branch", "role", "model_hint", "allowed_paths", "forbidden_paths", "acceptance", "risk_tier", "created_at" FROM `task_specs`;--> statement-breakpoint
DROP TABLE `task_specs`;--> statement-breakpoint
ALTER TABLE `__new_task_specs` RENAME TO `task_specs`;--> statement-breakpoint
CREATE INDEX `task_specs_work_intent_id_idx` ON `task_specs` (`work_intent_id`);