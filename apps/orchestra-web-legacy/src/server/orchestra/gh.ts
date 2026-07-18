import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

/**
 * Run `gh` with argv only — never shell-interpolate.
 * Pattern borrowed from T3 Code GitHubCli (MIT © 2026 T3 Tools Inc.).
 */
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
      stdout?: string | Buffer;
      code?: number | string | null;
    };
    const stderr =
      typeof e.stderr === "string"
        ? e.stderr
        : e.stderr
          ? e.stderr.toString()
          : "";
    const code =
      typeof e.code === "number"
        ? e.code
        : e.code === null || e.code === undefined
          ? null
          : Number.NaN;
    throw new GhError(
      e.message ?? `gh ${args.join(" ")} failed`,
      args,
      stderr.trim(),
      Number.isFinite(code) ? code : null,
    );
  }
}

export async function ghStdout(
  cwd: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<string> {
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

/** Resolve open PR for a head branch via `gh pr view`, or null if none. */
export async function viewPrForBranch(
  cwd: string,
  branch: string,
): Promise<GhPrView | null> {
  try {
    const raw = await ghStdout(cwd, [
      "pr",
      "view",
      branch,
      "--json",
      "number,title,url,state,mergedAt",
    ]);
    const parsed = JSON.parse(raw) as GhPrView;
    return parsed;
  } catch (err) {
    const stderr = err instanceof GhError ? err.stderr : "";
    if (/no pull requests found|could not find/i.test(stderr)) {
      return null;
    }
    // `gh pr view <branch>` also fails when branch has no PR
    if (err instanceof GhError && (err.code === 1 || err.code === null)) {
      return null;
    }
    throw err;
  }
}

export async function createPullRequest(
  cwd: string,
  input: {
    title: string;
    body: string;
    base: string;
    head?: string;
  },
): Promise<string> {
  const args = [
    "pr",
    "create",
    "--title",
    input.title,
    "--body",
    input.body,
    "--base",
    input.base,
  ];
  if (input.head) {
    args.push("--head", input.head);
  }
  const stdout = await ghStdout(cwd, args, { timeoutMs: 90_000 });
  // gh prints the PR URL on success
  const url = stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^https?:\/\//.test(l));
  if (!url) {
    throw new GhError(
      `gh pr create succeeded but no URL in stdout: ${stdout}`,
      args,
      "",
      null,
    );
  }
  return url;
}
