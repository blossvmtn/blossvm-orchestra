import { randomUUID } from "node:crypto";
import {
  AgentRunSchema,
  ReceiptSchema,
  type TaskSpec,
  type AgentRun,
  type Receipt,
} from "@orchestra/core";

/**
 * Phase 0's stand-in capability provider (spec §3.5) — deterministic, no real
 * agent process, no real git. Lives in orchestra-daemon rather than
 * orchestra-core because it's the first of what P1 grows into a family of real
 * providers (claude-code, codex, cursor), all of which will need real I/O
 * (spawning a CLI, touching git) and belong in the I/O-capable package; keeping
 * this one alongside them now avoids relocating it later. @orchestra/core stays
 * schemas-only.
 *
 * Mirrors the fixtureTrunkScan/fixtureSyncLog pattern in
 * apps/orchestra-web-legacy/src/server/orchestra/fixtures.ts: build a base
 * object, apply overrides, validate with the real Zod schema before returning.
 *
 * "Deterministic" means the fixed outcome shape (always `provider: "fixture"`,
 * `status: "done"`, `outcome: "succeeded"`, `verification: "none"` unless
 * overridden) — not literal byte-stable ids/timestamps. `id`/`startedAt` still
 * vary per call (real `randomUUID()`/`Date`) since Step 6 persists each run
 * under a primary key and a fixed id would collide on the second dispatch.
 */
export function runFixtureCapabilityProvider(
  taskSpec: TaskSpec,
  overrides?: { agentRun?: Partial<AgentRun>; receipt?: Partial<Receipt> },
): { agentRun: AgentRun; receipt: Receipt } {
  const startedAt = new Date().toISOString();

  const agentRun = AgentRunSchema.parse({
    id: randomUUID(),
    taskSpecId: taskSpec.id,
    provider: "fixture",
    status: "done",
    lastHeartbeatSummary: `Fixture run for "${taskSpec.slug}" completed — no real agent.`,
    startedAt,
    endedAt: startedAt,
    costUsd: 0,
    ...overrides?.agentRun,
  });

  const receipt = ReceiptSchema.parse({
    id: randomUUID(),
    agentRunId: agentRun.id,
    taskSpecId: taskSpec.id,
    outcome: "succeeded",
    summary: `Fixture provider completed "${taskSpec.slug}" — no real agent, no real git.`,
    verification: "none",
    costUsd: agentRun.costUsd,
    createdAt: startedAt,
    ...overrides?.receipt,
  });

  return { agentRun, receipt };
}
