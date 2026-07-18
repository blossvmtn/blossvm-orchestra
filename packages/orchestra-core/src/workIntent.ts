import { z } from "zod";

// One per founder-stated goal. Was the manifest's top-level fields, minus the
// workers array — see docs/specs/2026-07-18-phase-0-constitutional-seed.md §1.5.
export const WorkIntentSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  repoSlug: z.string().min(1),
  intent: z.string().min(1),
  status: z.enum(["captured", "scoped", "planned", "closed"]),
  createdAt: z.string().datetime(),
});

export type WorkIntent = z.infer<typeof WorkIntentSchema>;
