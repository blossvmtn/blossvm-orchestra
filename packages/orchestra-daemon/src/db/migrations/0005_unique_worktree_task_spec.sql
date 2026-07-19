-- Second independent review round, 2026-07-19: enforces at the schema level
-- an invariant the app code already assumed (D20, Worktree is 1:1 with
-- TaskSpec) but never enforced — git/worktrees.ts's upsert selects the
-- first matching row by task_spec_id, so a second row silently aliasing the
-- same TaskSpec previously went undetected. Generated as-is, not hand-edited.
DROP INDEX `worktrees_task_spec_id_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `worktrees_task_spec_id_idx` ON `worktrees` (`task_spec_id`);