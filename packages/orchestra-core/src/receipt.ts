import { z } from "zod";

// One per completed AgentRun. PR-BRIEF genuinely becomes *part* of this, not
// all of it — the fields below name what the rest is and where it comes from.
// See spec §1.5.
export const ReceiptOutcomeSchema = z.enum(["succeeded", "failed", "cancelled"]);
// Ties to D11 (ADR 0001/0002): R4 verification is "JD runs the acceptance
// walk himself" — no automated verifier. Always "none" for P0 fixture receipts.
export const VerificationSchema = z.enum(["none", "human_acceptance_walk"]);

export const ReceiptSchema = z.object({
  id: z.string().uuid(),
  agentRunId: z.string().uuid(),
  taskSpecId: z.string().uuid(),
  outcome: ReceiptOutcomeSchema,
  summary: z.string().min(1),
  prUrl: z.string().url().optional(),
  prTitle: z.string().optional(),
  filesTouched: z.array(z.string()).optional(),
  verification: VerificationSchema,
  costUsd: z.number().nonnegative().optional(),
  createdAt: z.string().datetime(),
});

export type ReceiptOutcome = z.infer<typeof ReceiptOutcomeSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type Receipt = z.infer<typeof ReceiptSchema>;
