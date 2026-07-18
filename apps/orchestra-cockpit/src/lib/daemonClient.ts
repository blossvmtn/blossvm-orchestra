import { invoke } from "@tauri-apps/api/core";

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
