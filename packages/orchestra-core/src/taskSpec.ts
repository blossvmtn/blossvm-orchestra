import { z } from "zod";

// One per worker lane. N per WorkIntent, not 1:1 — this is the fan-out that
// makes parallel lanes possible. See spec §1.5.
export const RiskTierSchema = z.enum(["R0", "R1", "R2", "R3", "R4"]);
export type RiskTier = z.infer<typeof RiskTierSchema>;

export const TaskSpecSchema = z.object({
  id: z.string().uuid(),
  workIntentId: z.string().uuid(),
  slug: z.string().min(1),
  branch: z.string().min(1),
  role: z.string().min(1),
  modelHint: z.string().optional(),
  allowedPaths: z.array(z.string()),
  forbiddenPaths: z.array(z.string()),
  acceptance: z.array(z.string()),
  // Unused (always unset) until P1 — the field exists now so D8/D9's work has
  // somewhere to land without a schema migration.
  riskTier: RiskTierSchema.optional(),
  createdAt: z.string().datetime(),
});

export type TaskSpec = z.infer<typeof TaskSpecSchema>;
