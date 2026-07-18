import { z } from "zod";

// One per founder-stated goal. Was the manifest's top-level fields, minus the
// workers array — see docs/specs/2026-07-18-phase-0-constitutional-seed.md §1.5.
// Exported as its own schema (not inlined) so the daemon's Drizzle column can
// narrow to the same value set instead of silently widening to `string`
// (Fable review, 2026-07-18, F1).
export const WorkIntentStatusSchema = z.enum(["captured", "scoped", "planned", "closed"]);

export const WorkIntentSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  repoSlug: z.string().min(1),
  intent: z.string().min(1),
  status: WorkIntentStatusSchema,
  createdAt: z.string().datetime(),
});

export type WorkIntentStatus = z.infer<typeof WorkIntentStatusSchema>;
export type WorkIntent = z.infer<typeof WorkIntentSchema>;
