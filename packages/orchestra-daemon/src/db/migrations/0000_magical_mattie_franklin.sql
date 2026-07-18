CREATE TABLE `agent_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_spec_id` text NOT NULL,
	`provider` text NOT NULL,
	`claude_session_id` text,
	`status` text NOT NULL,
	`last_heartbeat_summary` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`cost_usd` real
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `receipts` (
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
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_specs` (
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
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`repo_slug` text NOT NULL,
	`intent` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
