import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitError extends Error {
  constructor(
    message: string,
    readonly args: string[],
    readonly stderr: string,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "GitError";
  }
}

/**
 * Run git with argv only — never shell-interpolate paths.
 * Pattern borrowed from T3 Code (MIT © 2026 T3 Tools Inc.).
 */
export async function git(
  cwd: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: opts?.timeoutMs ?? 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString() };
  } catch (err) {
    const e = err as {
      message?: string;
      stderr?: string | Buffer;
      code?: number | string | null;
      killed?: boolean;
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
    throw new GitError(
      e.message ?? `git ${args.join(" ")} failed`,
      args,
      stderr.trim(),
      Number.isFinite(code) ? code : null,
    );
  }
}

export async function gitStdout(
  cwd: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<string> {
  const { stdout } = await git(cwd, args, opts);
  return stdout.trim();
}

export async function isGitRepo(rootPath: string): Promise<boolean> {
  try {
    const out = await gitStdout(rootPath, ["rev-parse", "--is-inside-work-tree"]);
    return out === "true";
  } catch {
    return false;
  }
}

export async function resolveDefaultBaseBranch(repoRoot: string): Promise<string> {
  // Prefer symbolic-ref for origin/HEAD, then common locals.
  try {
    const ref = await gitStdout(repoRoot, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
    ]);
    const match = /^refs\/remotes\/origin\/(.+)$/.exec(ref);
    if (match?.[1]) return match[1];
  } catch {
    // no origin/HEAD
  }

  for (const candidate of ["main", "master"]) {
    try {
      await gitStdout(repoRoot, [
        "rev-parse",
        "--verify",
        `refs/heads/${candidate}`,
      ]);
      return candidate;
    } catch {
      // try next
    }
  }

  // Fall back to current branch in the main checkout
  return gitStdout(repoRoot, ["branch", "--show-current"]);
}

export type PorcelainWorktree = {
  path: string;
  branch: string | null;
  bare: boolean;
  detached: boolean;
};

/** Parse `git worktree list --porcelain` (T3-pattern). */
export function parseWorktreePorcelain(stdout: string): PorcelainWorktree[] {
  const entries: PorcelainWorktree[] = [];
  let current: Partial<PorcelainWorktree> | null = null;

  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current?.path) {
        entries.push({
          path: current.path,
          branch: current.branch ?? null,
          bare: current.bare ?? false,
          detached: current.detached ?? false,
        });
      }
      current = {
        path: line.slice("worktree ".length),
        branch: null,
        bare: false,
        detached: false,
      };
    } else if (!current) {
      continue;
    } else if (line.startsWith("branch refs/heads/")) {
      current.branch = line.slice("branch refs/heads/".length);
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "") {
      if (current.path) {
        entries.push({
          path: current.path,
          branch: current.branch ?? null,
          bare: current.bare ?? false,
          detached: current.detached ?? false,
        });
      }
      current = null;
    }
  }

  if (current?.path) {
    entries.push({
      path: current.path,
      branch: current.branch ?? null,
      bare: current.bare ?? false,
      detached: current.detached ?? false,
    });
  }

  return entries;
}

export async function listWorktrees(repoRoot: string): Promise<PorcelainWorktree[]> {
  const stdout = await gitStdout(repoRoot, ["worktree", "list", "--porcelain"]);
  return parseWorktreePorcelain(stdout);
}
