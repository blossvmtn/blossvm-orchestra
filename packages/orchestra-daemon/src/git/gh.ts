import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Ported near-verbatim from apps/orchestra-web-legacy/src/server/orchestra/gh.ts
 * (Phase 2 spec docs/specs/2026-07-19-phase-2-stacked-pr-actions.md §2, D32) —
 * a pure execFile wrapper, same argv-only discipline as git.ts. Run gh with
 * argv only — never shell-interpolate. Pattern borrowed from T3 Code (MIT
 * © 2026 T3 Tools Inc.).
 */
export class GhError extends Error {
  constructor(
    message: string,
    readonly args: string[],
    readonly stderr: string,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "GhError";
  }
}

export async function gh(
  cwd: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("gh", args, {
      cwd,
      encoding: "utf8",
      timeout: opts?.timeoutMs ?? 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (err) {
    const e = err as {
      message?: string;
      stderr?: string | Buffer;
      code?: number | string | null;
    };
    const stderr = typeof e.stderr === "string" ? e.stderr : e.stderr ? e.stderr.toString() : "";
    const code =
      typeof e.code === "number" ? e.code : e.code === null || e.code === undefined ? null : Number.NaN;
    throw new GhError(
      e.message ?? `gh ${args.join(" ")} failed`,
      args,
      stderr.trim(),
      Number.isFinite(code) ? code : null,
    );
  }
}

export async function ghStdout(cwd: string, args: string[], opts?: { timeoutMs?: number }): Promise<string> {
  const { stdout } = await gh(cwd, args, opts);
  return stdout.trim();
}

export type GhPrView = {
  number: number;
  title: string;
  url: string;
  state: string;
  mergedAt: string | null;
};

/**
 * Resolve open PR for a head branch via `gh pr view`, or null if none.
 *
 * Named, accepted residual (ADR 0001 amendment 2026-07-19, D32): the
 * `err.code === 1 || err.code === null` branch below treats any `gh pr view`
 * failure with that exit code as "no PR found," not just a genuine no-PR
 * case — an auth hiccup, rate limit, or network blip reads the same way.
 * Ported as-is from the legacy app; a masked failure here surfaces loudly
 * moments later when the unguarded createPullRequest call fails for the
 * same underlying reason.
 */
export async function viewPrForBranch(cwd: string, branch: string): Promise<GhPrView | null> {
  try {
    const raw = await ghStdout(cwd, ["pr", "view", branch, "--json", "number,title,url,state,mergedAt"]);
    return JSON.parse(raw) as GhPrView;
  } catch (err) {
    const stderr = err instanceof GhError ? err.stderr : "";
    if (/no pull requests found|could not find/i.test(stderr)) {
      return null;
    }
    if (err instanceof GhError && (err.code === 1 || err.code === null)) {
      return null;
    }
    throw err;
  }
}

/**
 * D30/D32 (spec §2): returns both the PR URL and its number. URL extraction
 * is the legacy's own defensive line-scan (find the first line matching
 * `/^https?:\/\//`, not a raw-stdout assumption) — `gh pr create`'s exact
 * stdout shape isn't pinned by any ground-truth anchor, so scanning line by
 * line is the safer bet. The number is a new extraction on top of that
 * already-found URL line; a URL without a trailing `/pull/<n>` throws the
 * same way a missing URL does, since Worktree.prNumber (D30) has nowhere
 * else to come from on first-ever PR creation.
 */
export async function createPullRequest(
  cwd: string,
  input: { title: string; body: string; base: string; head?: string },
): Promise<{ url: string; number: number }> {
  const args = ["pr", "create", "--title", input.title, "--body", input.body, "--base", input.base];
  if (input.head) {
    args.push("--head", input.head);
  }
  const stdout = await ghStdout(cwd, args, { timeoutMs: 90_000 });
  const url = stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^https?:\/\//.test(l));
  if (!url) {
    throw new GhError(`gh pr create succeeded but no URL in stdout: ${stdout}`, args, "", null);
  }
  const match = /\/pull\/(\d+)$/.exec(url);
  if (!match?.[1]) {
    throw new GhError(`gh pr create returned a URL with no parseable PR number: ${url}`, args, "", null);
  }
  return { url, number: Number.parseInt(match[1], 10) };
}
