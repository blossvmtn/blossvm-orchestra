import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { orchestraHome, tokenPath } from "./paths";

/**
 * Every daemon start generates a fresh token — the one piece of hardening a
 * localhost-only HTTP server needs, since any other local process can otherwise
 * reach it too. Cockpit and CLI both read the same file to authenticate.
 */
export async function generateAndWriteToken(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await mkdir(orchestraHome(), { recursive: true });
  await writeFile(tokenPath(), token, { mode: 0o600 });
  await chmod(tokenPath(), 0o600);
  return token;
}

export async function readToken(): Promise<string> {
  return (await readFile(tokenPath(), "utf8")).trim();
}
