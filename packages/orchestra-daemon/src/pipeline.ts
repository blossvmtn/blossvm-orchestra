import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  WorkIntentSchema,
  TaskSpecSchema,
  RepoSchema,
  type WorkIntent,
  type TaskSpec,
  type AgentRun,
  type Receipt,
  type Worktree,
  type Repo,
} from "@orchestra/core";
import type { OrchestraDb } from "./db/db";
import { repos, workIntents, taskSpecs, agentRuns, receipts } from "./db/schema";
import { rowToReceipt, rowToRepo } from "./db/mappers";
import { writeEvent } from "./db/events";
import { fixtureRepo, fixtureWorkIntent, fixtureTaskSpec } from "./fixtures";
import { runFixtureCapabilityProvider } from "./fixtureCapabilityProvider";
import { runClaudeCodeCapabilityProvider } from "./claudeCodeCapabilityProvider";
import { createWorktree } from "./git/worktrees";
import { isGitRepo } from "./git/git";

export type FixtureDispatchResult = {
  workIntent: WorkIntent;
  taskSpec: TaskSpec;
  agentRun: AgentRun;
  receipt: Receipt;
};

/**
 * The write half of spec §3.6's contract path: fixture WorkIntent -> TaskSpec
 * -> fake AgentRun -> Receipt, written to the four materialized tables.
 * Shared by the contract-path test and the daemon's POST /fixture/dispatch
 * route, so both exercise the identical write logic.
 *
 * Deliberately does not write to `events` — D6's audit trail is real business
 * logic (what actually happened, in order) and this dispatch is still a
 * fixture path with nothing to audit yet; wiring events writes is P1's job
 * once a real provider does something worth recording.
 */
export function dispatchFixtureWorkIntent(db: OrchestraDb): FixtureDispatchResult {
  const workIntent = fixtureWorkIntent();
  const taskSpec = fixtureTaskSpec(workIntent.id);
  const { agentRun, receipt } = runFixtureCapabilityProvider(taskSpec);

  // One transaction, not four independent inserts (Opus review, 2026-07-18) —
  // a failure partway through must not leave an orphan WorkIntent/TaskSpec
  // with no matching Receipt.
  db.transaction((tx) => {
    // work_intents.repoSlug gained a FK to repos.slug in Phase 1 (D21) — seed
    // a matching repo first (idempotent: repeated dispatches share one row).
    tx.insert(repos).values(fixtureRepo()).onConflictDoNothing().run();
    tx.insert(workIntents).values(workIntent).run();
    tx.insert(taskSpecs).values(taskSpec).run();
    tx.insert(agentRuns).values(agentRun).run();
    tx.insert(receipts).values(receipt).run();
  });

  return { workIntent, taskSpec, agentRun, receipt };
}

/**
 * The read path (spec §3.6): sources the `receipts` materialized table only
 * — never `events`. Shared by the contract-path test and the daemon's
 * GET /receipts/:id route.
 */
export function getReceiptById(db: OrchestraDb, id: string): Receipt | undefined {
  const row = db.select().from(receipts).where(eq(receipts.id, id)).get();
  return row ? rowToReceipt(row) : undefined;
}

/** Thrown by dispatchWorkIntent when repoSlug names no registered repo — the
 * daemon's HTTP layer (server.ts) turns this into a 404. */
export class RepoNotRegisteredError extends Error {
  constructor(repoSlug: string) {
    super(`Repo not registered: ${repoSlug}`);
    this.name = "RepoNotRegisteredError";
  }
}

export async function registerRepo(db: OrchestraDb, rootPath: string): Promise<Repo> {
  if (!(await isGitRepo(rootPath))) {
    throw new Error(`Not a git repository: ${rootPath}`);
  }

  const repo = RepoSchema.parse({
    id: randomUUID(),
    slug: path.basename(rootPath),
    rootPath,
    registeredAt: new Date().toISOString(),
  });

  db.insert(repos).values(repo).run();
  writeEvent(db, "repo", repo.id, "created", repo);
  return repo;
}

export type DispatchWorkIntentInput = {
  repoSlug: string;
  intent: string;
  taskSpec: {
    slug: string;
    branch: string;
    role: string;
    allowedPaths: string[];
    forbiddenPaths: string[];
    acceptance: string[];
  };
};

export type DispatchWorkIntentResult = {
  workIntent: WorkIntent;
  taskSpec: TaskSpec;
  worktree: Worktree;
  agentRun: AgentRun;
  receipt: Receipt;
};

/**
 * The real dispatch (spec §3, step 10). Not one atomic transaction — bun:sqlite
 * transactions are synchronous and this flow has two real async boundaries
 * (worktree creation, the Claude Code spawn), so a single wrapping
 * transaction isn't buildable here. Real shape: (a) resolve repoSlug -> Repo,
 * 404-equivalent if unregistered; (b) WorkIntent+TaskSpec in one sync
 * transaction + their events; (c) createWorktree (async git — persists its
 * own Worktree row + event, see git/worktrees.ts); (d) the real capability
 * provider (async spawn), AgentRun+Receipt in a final sync transaction +
 * their events.
 *
 * Named, accepted risk: a failure between (c) and (d) can leave a real
 * on-disk worktree with a Worktree row but no AgentRun/Receipt — acceptable
 * for P1 (single-lane, JD can observe and manually clean up); reconciliation
 * is not built this phase.
 */
export async function dispatchWorkIntent(
  db: OrchestraDb,
  input: DispatchWorkIntentInput,
): Promise<DispatchWorkIntentResult> {
  const repoRow = db.select().from(repos).where(eq(repos.slug, input.repoSlug)).get();
  if (!repoRow) {
    throw new RepoNotRegisteredError(input.repoSlug);
  }
  const repo = rowToRepo(repoRow);

  const now = new Date().toISOString();
  const workIntent = WorkIntentSchema.parse({
    id: randomUUID(),
    planId: randomUUID(),
    repoSlug: input.repoSlug,
    intent: input.intent,
    status: "captured",
    createdAt: now,
  });
  const taskSpec = TaskSpecSchema.parse({
    id: randomUUID(),
    workIntentId: workIntent.id,
    ...input.taskSpec,
    createdAt: now,
  });

  db.transaction((tx) => {
    tx.insert(workIntents).values(workIntent).run();
    tx.insert(taskSpecs).values(taskSpec).run();
  });
  writeEvent(db, "work_intent", workIntent.id, "created", workIntent);
  writeEvent(db, "task_spec", taskSpec.id, "created", taskSpec);

  const worktree = await createWorktree(db, {
    repoRoot: repo.rootPath,
    taskSpecId: taskSpec.id,
    slug: taskSpec.slug,
    branch: taskSpec.branch,
  });

  const { agentRun, receipt } = await runClaudeCodeCapabilityProvider(input.intent, taskSpec, worktree);

  db.transaction((tx) => {
    tx.insert(agentRuns).values(agentRun).run();
    tx.insert(receipts).values(receipt).run();
  });
  writeEvent(db, "agent_run", agentRun.id, "created", agentRun);
  writeEvent(db, "receipt", receipt.id, "created", receipt);

  return { workIntent, taskSpec, worktree, agentRun, receipt };
}
