import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { SystemHealthSchema, type HealthCheck, type SystemHealth } from "@orchestra/core";
import type { OrchestraDb } from "../db/db";
import { repos } from "../db/schema";

const execFileAsync = promisify(execFile);

/**
 * Phase 3A — measured system health. Every check is real and safe: a trivial
 * DB read, `Bun.version`, and `<tool> --version` / `gh auth status` run with an
 * argv array (never a shell string) and a bounded timeout. Nothing here runs a
 * destructive command, and no check ever returns a credential or token — the
 * `detail` strings are fixed, safe summaries, not raw process output that could
 * carry a token (gh's especially).
 */
// HealthCheck / SystemHealth contracts live in @orchestra/core (shared with the
// cockpit, CodeRabbit PR #5); this module keeps only the real I/O checks.
const CHECK_TIMEOUT_MS = 4000;

/** First line of `<cmd> --version`, or `unavailable` if the tool isn't runnable. */
async function checkExecutable(name: string, cmd: string, args: string[]): Promise<HealthCheck> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: CHECK_TIMEOUT_MS, encoding: "utf8" });
    const firstLine = stdout.split("\n")[0]?.trim();
    return firstLine ? { name, status: "ok", detail: firstLine } : { name, status: "ok" };
  } catch {
    return { name, status: "unavailable" };
  }
}

/** gh auth: exit 0 = authenticated. Never echoes gh's output (may name a host/account) — fixed summary only. */
async function checkGhAuth(): Promise<HealthCheck> {
  try {
    await execFileAsync("gh", ["auth", "status"], { timeout: CHECK_TIMEOUT_MS });
    return { name: "GitHub auth", status: "ok", detail: "authenticated" };
  } catch {
    return { name: "GitHub auth", status: "degraded", detail: "not authenticated" };
  }
}

function checkDatabase(db: OrchestraDb): HealthCheck {
  try {
    db.select().from(repos).limit(1).all();
    return { name: "Database", status: "ok", detail: "SQLite" };
  } catch {
    return { name: "Database", status: "unavailable" };
  }
}

export async function checkSystemHealth(db: OrchestraDb): Promise<SystemHealth> {
  const [gitCheck, ghCheck, ghAuthCheck, claudeCheck] = await Promise.all([
    checkExecutable("git", "git", ["--version"]),
    checkExecutable("GitHub CLI", "gh", ["--version"]),
    checkGhAuth(),
    checkExecutable("Claude Code", "claude", ["--version"]),
  ]);

  const checks: HealthCheck[] = [
    // The daemon is answering this request, so by definition it's reachable.
    { name: "Daemon", status: "ok", detail: "reachable" },
    checkDatabase(db),
    { name: "Bun runtime", status: "ok", detail: `v${Bun.version}` },
    gitCheck,
    ghCheck,
    ghAuthCheck,
    claudeCheck,
  ];

  return SystemHealthSchema.parse({ generatedAt: new Date().toISOString(), checks });
}
