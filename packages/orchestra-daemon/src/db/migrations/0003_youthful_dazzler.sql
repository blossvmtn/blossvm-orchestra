-- Phase 1 (spec docs/specs/2026-07-18-phase-1-worktree-isolation.md §2, D20/D21):
-- adds `repos` and `worktrees`, and a FK from work_intents.repo_slug ->
-- repos.slug (SQLite requires the FK target to carry a UNIQUE constraint,
-- hence the unique index on repos.slug rather than a plain one). `repos` and
-- its index are created before work_intents is rebuilt with the new FK —
-- generated as-is, not hand-edited, so `drizzle-kit check` stays exact.
CREATE TABLE `repos` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`root_path` text NOT NULL,
	`registered_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repos_slug_idx` ON `repos` (`slug`);--> statement-breakpoint
CREATE TABLE `worktrees` (
	`id` text PRIMARY KEY NOT NULL,
	`task_spec_id` text NOT NULL,
	`path` text NOT NULL,
	`branch` text NOT NULL,
	`anchor_sha` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`last_sync_at` text,
	FOREIGN KEY (`task_spec_id`) REFERENCES `task_specs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `worktrees_task_spec_id_idx` ON `worktrees` (`task_spec_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_work_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`repo_slug` text NOT NULL,
	`intent` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`repo_slug`) REFERENCES `repos`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_work_intents`("id", "plan_id", "repo_slug", "intent", "status", "created_at") SELECT "id", "plan_id", "repo_slug", "intent", "status", "created_at" FROM `work_intents`;--> statement-breakpoint
DROP TABLE `work_intents`;--> statement-breakpoint
ALTER TABLE `__new_work_intents` RENAME TO `work_intents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;