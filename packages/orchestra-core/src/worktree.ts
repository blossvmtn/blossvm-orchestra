import { z } from "zod";

// The physical, on-disk realization of a TaskSpec's worker lane — 1:1 with
// TaskSpec, but a distinct entity: TaskSpec is the immutable plan for a lane
// (no status field), Worktree is that lane's live physical state, which
// mutates over its on-disk lifetime independent of any single AgentRun.
// Mirrors the Constitution's WorktreeNode shape. See spec
// docs/specs/2026-07-18-phase-1-worktree-isolation.md §2, D20.
export const WorktreeStatusSchema = z.enum(["active", "merged", "stashed", "orphaned", "pr_open"]);
export type WorktreeStatus = z.infer<typeof WorktreeStatusSchema>;

export const WorktreeSchema = z.object({
  id: z.string().uuid(),
  taskSpecId: z.string().uuid(),
  path: z.string().min(1),
  branch: z.string().min(1),
  anchorSha: z.string().min(1),
  status: WorktreeStatusSchema,
  createdAt: z.string().datetime(),
  lastSyncAt: z.string().datetime().optional(),
  // Phase 2 (spec docs/specs/2026-07-19-phase-2-stacked-pr-actions.md §2, D30) —
  // mirrors Receipt.prUrl; gives the "pr_open" status value above something to
  // point at without joining through Receipt.
  prUrl: z.string().url().optional(),
  prNumber: z.number().int().positive().optional(),
});

export type Worktree = z.infer<typeof WorktreeSchema>;
