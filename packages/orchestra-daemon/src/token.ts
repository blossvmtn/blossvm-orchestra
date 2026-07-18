import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { orchestraHome, tokenPath } from "./paths";

/**
 * Every daemon start generates a fresh token — the one piece of hardening a
 * localhost-only HTTP server needs, since any other local process can otherwise
 * reach it too. Cockpit and CLI both read the same file to authenticate.
 *
 * Split from the disk write (below) so the caller can populate its in-memory
 * auth check with the real token *before* the server starts accepting
 * connections — `crypto.randomBytes` is synchronous, so there's no reason the
 * value used for auth has to wait on disk I/O (security review, 2026-07-18:
 * daemon.ts previously started the server with an empty in-memory token while
 * this whole function — including its awaits — was still in flight, an
 * exploitable auth-bypass window; see daemon.ts's comment for the fix).
 */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** The disk-write half — kept separate from bind so F3's ordering still holds:
 * only persist to `~/.orchestra/daemon.token` after the caller confirms this
 * daemon actually won the port bind, so an orphaned daemon's live token file
 * is never clobbered. */
export async function writeToken(token: string): Promise<void> {
  await mkdir(orchestraHome(), { recursive: true });
  await writeFile(tokenPath(), token, { mode: 0o600 });
  await chmod(tokenPath(), 0o600);
}

export async function readToken(): Promise<string> {
  return (await readFile(tokenPath(), "utf8")).trim();
}
