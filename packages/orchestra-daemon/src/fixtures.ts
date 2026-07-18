import { randomUUID } from "node:crypto";
import {
  WorkIntentSchema,
  TaskSpecSchema,
  RepoSchema,
  type WorkIntent,
  type TaskSpec,
  type Repo,
} from "@orchestra/core";

/**
 * Same slug as fixtureWorkIntent's repoSlug — since work_intents.repoSlug
 * gained a FK to repos.slug in Phase 1 (spec §2, D21), the fixture dispatch
 * path needs a matching repos row to exist before it can insert a WorkIntent
 * at all (re-judge pass, 2026-07-18: this FK broke the fixture path when it
 * first landed, since nothing seeded one).
 */
export function fixtureRepo(overrides?: Partial<Repo>): Repo {
  const base: Repo = {
    id: randomUUID(),
    slug: "blossvm-orchestra",
    rootPath: "/fixture/blossvm-orchestra",
    registeredAt: new Date().toISOString(),
  };
  return RepoSchema.parse({ ...base, ...overrides });
}

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
