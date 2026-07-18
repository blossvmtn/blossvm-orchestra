import os from "node:os";
import path from "node:path";

export function orchestraHome(): string {
  return path.join(os.homedir(), ".orchestra");
}

export function tokenPath(): string {
  return path.join(orchestraHome(), "daemon.token");
}

export function dbPath(): string {
  return path.join(orchestraHome(), "orchestra.db");
}

// Fixed port per docs/specs/2026-07-18-phase-0-constitutional-seed.md — chosen to avoid
// common dev-server collisions (3000, 5173, 8080, ...).
export const DAEMON_PORT = 41417;
export const DAEMON_BASE_URL = `http://127.0.0.1:${DAEMON_PORT}`;
