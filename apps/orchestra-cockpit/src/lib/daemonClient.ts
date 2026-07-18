import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Receipt } from "@orchestra/core";

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
async function daemonFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${DAEMON_BASE_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(DAEMON_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`daemon responded ${res.status}`);
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
