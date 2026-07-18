import { randomUUID } from "node:crypto";
import {
  WorkIntentSchema,
  TaskSpecSchema,
  type WorkIntent,
  type TaskSpec,
} from "@orchestra/core";

/**
 * Fixture WorkIntent/TaskSpec builders for Step 6's two end-to-end
 * verifications (spec §3.6) — deterministic outcome shape, no real repo, no
 * real git. Mirrors the fixtureTrunkScan/fixtureSyncLog pattern in
 * apps/orchestra-web-legacy/src/server/orchestra/fixtures.ts: build a base
 * object, apply overrides, validate with the real Zod schema before returning.
 * Shared by pipeline.ts's dispatchFixtureWorkIntent (used by both the
 * contract-path test and the daemon's HTTP dispatch route) so the fixture
 * shape is defined exactly once.
 */
export function fixtureWorkIntent(overrides?: Partial<WorkIntent>): WorkIntent {
  const base: WorkIntent = {
    id: randomUUID(),
    planId: randomUUID(),
    repoSlug: "blossvm-orchestra",
    intent: "Fixture: prove a WorkIntent survives the real IPC round trip",
    status: "captured",
    createdAt: new Date().toISOString(),
  };
  return WorkIntentSchema.parse({ ...base, ...overrides });
}

export function fixtureTaskSpec(workIntentId: string, overrides?: Partial<TaskSpec>): TaskSpec {
  const base: TaskSpec = {
    id: randomUUID(),
    workIntentId,
    slug: "fixture-lane",
    branch: "orch/fixture-lane",
    role: "Fixture",
    allowedPaths: [],
    forbiddenPaths: [],
    acceptance: ["fixture capability provider returns a valid Receipt"],
    createdAt: new Date().toISOString(),
  };
  return TaskSpecSchema.parse({ ...base, ...overrides });
}
