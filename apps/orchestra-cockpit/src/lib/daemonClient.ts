import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Receipt, StateSnapshot, TrunkScan, SystemHealth, HealthCheck, HealthStatus } from "@orchestra/core";

// Fixed port per docs/specs/2026-07-18-phase-0-constitutional-seed.md — mirrors
// packages/orchestra-daemon/src/paths.ts. Duplicated rather than imported: the
// cockpit is a browser bundle and shouldn't pull in the daemon's Node-oriented
// package graph just for one constant.
const DAEMON_BASE_URL = "http://127.0.0.1:41417";

let cachedToken: string | null = null;

/**
 * The webview cannot read ~/.orchestra/daemon.token itself (no filesystem
 * access from a browser context) — Rust reads it and hands it over through
 * Tauri's invoke() bridge. Every other call to the daemon after this is a
 * direct fetch(), no Rust relay.
 */
async function getToken(): Promise<string> {
  cachedToken ??= await invoke<string>("get_daemon_token");
  return cachedToken;
}

const DAEMON_TIMEOUT_MS = 10_000;

/**
 * A daemon process that accepts the TCP connection but never responds (hung,
 * deadlocked, wedged on a bad write) would otherwise leave every caller of
 * this module awaiting indefinitely — the cockpit stuck on "checking…" or
 * "Dispatching…" forever with no way out (CodeRabbit, PR #1 review,
 * 2026-07-18). Every daemon call goes through this one bounded fetch.
 */
async function daemonFetch(path: string, init?: RequestInit, timeoutMs: number = DAEMON_TIMEOUT_MS): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${DAEMON_BASE_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `daemon responded ${res.status}`);
  }
  return res;
}

export async function pingDaemon(): Promise<{ ok: boolean; pong: boolean; at: string }> {
  const res = await daemonFetch("/ping");
  return (await res.json()) as { ok: boolean; pong: boolean; at: string };
}

export type FixtureDispatchResponse = {
  workIntentId: string;
  taskSpecId: string;
  agentRunId: string;
  receiptId: string;
};

export type { Receipt };

/** Spec §3.6's IPC path, first leg: dispatch a fixture WorkIntent through the daemon's pipeline. */
export async function dispatchFixtureWorkIntent(): Promise<FixtureDispatchResponse> {
  const res = await daemonFetch("/fixture/dispatch", { method: "POST" });
  return (await res.json()) as FixtureDispatchResponse;
}

/** Spec §3.6's IPC path, second leg: read the Receipt back over its own separate fetch() call. */
export async function getReceipt(id: string): Promise<Receipt> {
  const res = await daemonFetch(`/receipts/${id}`);
  return (await res.json()) as Receipt;
}

export type Repo = { id: string; slug: string; rootPath: string; registeredAt: string };

/** D19 — native folder picker, not fuzzy path-guessing. Returns null if the user cancels. */
export async function pickRepoFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

export async function registerRepo(rootPath: string): Promise<Repo> {
  const res = await daemonFetch("/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rootPath }),
  });
  return (await res.json()) as Repo;
}

export type WorkIntentDispatchResponse = {
  workIntentId: string;
  taskSpecId: string;
  worktreeId: string;
  agentRunId: string;
  receiptId: string;
};

export type WorkIntentTaskSpecInput = {
  slug: string;
  branch: string;
  role: string;
  allowedPaths: string[];
  forbiddenPaths: string[];
  acceptance: string[];
};

/** Spec §3's real dispatch — parallel to dispatchFixtureWorkIntent, real founder input. */
export async function submitWorkIntent(input: {
  repoSlug: string;
  intent: string;
  taskSpec: WorkIntentTaskSpecInput;
}): Promise<WorkIntentDispatchResponse> {
  const res = await daemonFetch("/work-intents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await res.json()) as WorkIntentDispatchResponse;
}

export type StackedStep = "commit" | "push" | "pr";

export type StackedActionResponse = {
  worktreeId: string;
  status: string;
  prUrl?: string;
  prNumber?: number;
  committed: boolean;
  pushed: boolean;
  warnings: string[];
};

// Longer than DAEMON_TIMEOUT_MS — a real `git push` + `gh pr create` can
// legitimately run close to the daemon's own 90s per-git-command timeout
// (gh.ts); the generic 10s default would abort a call the daemon is still
// correctly working on.
const STACKED_ACTION_TIMEOUT_MS = 120_000;

/** Phase 2 spec §2/§3 step 9/10, D27 — always an explicit cockpit action. */
export async function runStackedAction(
  worktreeId: string,
  steps: StackedStep[],
  message?: string,
): Promise<StackedActionResponse> {
  const res = await daemonFetch(
    `/worktrees/${worktreeId}/stacked-action`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ steps, message }),
    },
    STACKED_ACTION_TIMEOUT_MS,
  );
  return (await res.json()) as StackedActionResponse;
}

export type { StateSnapshot };

/** Phase 3A — the read-model the cockpit polls (composed from the materialized tables). */
export async function getStateSnapshot(): Promise<StateSnapshot> {
  const res = await daemonFetch("/state/snapshot");
  return (await res.json()) as StateSnapshot;
}

export type { SystemHealth, HealthCheck, HealthStatus };

/** Phase 3A — measured system health (daemon, db, and safe `--version` probes). */
export async function getSystemHealth(): Promise<SystemHealth> {
  const res = await daemonFetch("/system/health");
  return (await res.json()) as SystemHealth;
}

export type { TrunkScan };

// A multi-branch scan runs several bounded `git log`s server-side, so give this
// call more than the module-wide 10s default — otherwise the client can abort
// before a slow scan returns its (possibly degraded) result (CodeRabbit, PR #5).
const TRUNK_SCAN_TIMEOUT_MS = 30_000;

/** Phase 3A — the read-only git-log trunk scan behind the Trunk-map view. */
export async function getTrunkScan(repoSlug: string): Promise<TrunkScan> {
  const res = await daemonFetch(
    `/repos/${encodeURIComponent(repoSlug)}/trunk`,
    undefined,
    TRUNK_SCAN_TIMEOUT_MS,
  );
  return (await res.json()) as TrunkScan;
}
