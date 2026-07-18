import { z } from "zod";

// A registered repository — the daemon's rootPath resolution target for a
// WorkIntent.repoSlug. One row for P1 (Linear's own P1 scope: "one repo").
// See spec docs/specs/2026-07-18-phase-1-worktree-isolation.md §2, D21.
export const RepoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  rootPath: z.string().min(1),
  registeredAt: z.string().datetime(),
});

export type Repo = z.infer<typeof RepoSchema>;
