-- Phase 2 (spec docs/specs/2026-07-19-phase-2-stacked-pr-actions.md §2, D30):
-- mirrors Receipt.prUrl and gives the already-existing "pr_open" status
-- value something to point at. Both nullable — every existing worktrees row
-- gets NULL for both, a safe default identical to "no PR yet." Generated
-- as-is, not hand-edited.
ALTER TABLE `worktrees` ADD `pr_url` text;--> statement-breakpoint
ALTER TABLE `worktrees` ADD `pr_number` integer;