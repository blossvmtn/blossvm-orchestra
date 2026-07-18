import { invoke } from "@tauri-apps/api/core";
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

export async function pingDaemon(): Promise<{ ok: boolean; pong: boolean; at: string }> {
  const token = await getToken();
  const res = await fetch(`${DAEMON_BASE_URL}/ping`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`daemon responded ${res.status}`);
  }
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
  const token = await getToken();
  const res = await fetch(`${DAEMON_BASE_URL}/fixture/dispatch`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`daemon responded ${res.status}`);
  }
  return (await res.json()) as FixtureDispatchResponse;
}

/** Spec §3.6's IPC path, second leg: read the Receipt back over its own separate fetch() call. */
export async function getReceipt(id: string): Promise<Receipt> {
  const token = await getToken();
  const res = await fetch(`${DAEMON_BASE_URL}/receipts/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`daemon responded ${res.status}`);
  }
  return (await res.json()) as Receipt;
}
