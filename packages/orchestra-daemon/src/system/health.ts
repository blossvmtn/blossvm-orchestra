import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Database } from "bun:sqlite";
import { SystemHealthSchema, type HealthCheck, type SystemHealth } from "@orchestra/core";
import type { OrchestraDb } from "../db/db";
import { DAEMON_PORT } from "../paths";

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

/** Real sub-metrics: user-table count + journal mode. The queries double as the
 *  liveness probe — if the db is unreadable they throw and the check degrades. */
function checkDatabase(db: OrchestraDb): HealthCheck {
  try {
    // drizzle's runtime exposes the raw bun:sqlite handle as $client; its public
    // type doesn't, so cast (verified against the running daemon).
    const client = (db as unknown as { $client: Database }).$client;
    const t = client
      .query("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .get() as { n: number } | null;
    const j = client.query("PRAGMA journal_mode").get() as { journal_mode: string } | null;
    const mode = j?.journal_mode ? j.journal_mode.toUpperCase() : "?";
    return { name: "Database", status: "ok", detail: `${t?.n ?? 0} tables · ${mode}` };
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
    { name: "Daemon", status: "ok", detail: `127.0.0.1:${DAEMON_PORT}` },
    checkDatabase(db),
    { name: "Bun runtime", status: "ok", detail: `v${Bun.version}` },
    gitCheck,
    ghCheck,
    ghAuthCheck,
    claudeCheck,
  ];

  return SystemHealthSchema.parse({ generatedAt: new Date().toISOString(), checks });
}
