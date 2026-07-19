import { describe, expect, test } from "bun:test";
import path from "node:path";

const HOOK_PATH = path.join(import.meta.dir, "hook.ts");
const WORKTREE_ROOT = "/repo/.orchestra/worktrees/security-sanitize";

async function runHook(
  stdin: object,
  env: Record<string, string>,
): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", HOOK_PATH], {
    stdin: "pipe",
    stdout: "pipe",
    env: { ...process.env, ...env },
  });
  proc.stdin.write(JSON.stringify(stdin));
  proc.stdin.end();
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), exitCode };
}

describe("PreToolUse fence hook (real subprocess)", () => {
  test("allows an Edit within the fence", async () => {
    const { stdout, exitCode } = await runHook(
      { tool_name: "Edit", tool_input: { file_path: `${WORKTREE_ROOT}/src/lib/auth/index.ts` } },
      {
        ORCHESTRA_WORKTREE_ROOT: WORKTREE_ROOT,
        ORCHESTRA_ALLOWED_PATHS: JSON.stringify(["src/lib/auth/**"]),
        ORCHESTRA_FORBIDDEN_PATHS: JSON.stringify(["src/components/**"]),
      },
    );

    expect(exitCode).toBe(0);
    const decision = JSON.parse(stdout);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  test("denies a Write outside the fence, with a reason", async () => {
    const { stdout, exitCode } = await runHook(
      { tool_name: "Write", tool_input: { file_path: `${WORKTREE_ROOT}/src/components/Button.tsx` } },
      {
        ORCHESTRA_WORKTREE_ROOT: WORKTREE_ROOT,
        ORCHESTRA_ALLOWED_PATHS: JSON.stringify(["src/lib/auth/**"]),
        ORCHESTRA_FORBIDDEN_PATHS: JSON.stringify(["src/components/**"]),
      },
    );

    expect(exitCode).toBe(0);
    const decision = JSON.parse(stdout);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision.hookSpecificOutput.permissionDecisionReason).toContain("Button.tsx");
  });

  test("allows when tool_input has no file_path", async () => {
    const { stdout, exitCode } = await runHook(
      { tool_name: "Edit", tool_input: {} },
      { ORCHESTRA_WORKTREE_ROOT: WORKTREE_ROOT, ORCHESTRA_ALLOWED_PATHS: "[]", ORCHESTRA_FORBIDDEN_PATHS: "[]" },
    );

    expect(exitCode).toBe(0);
    const decision = JSON.parse(stdout);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  // PR #2 review, 2026-07-18 — BLOCKING, confirmed by an independent security
  // reviewer via the real hook exit-code contract (only exit 2 blocks a
  // PreToolUse call; an uncaught throw exits 1, non-blocking, tool call
  // proceeds). A malformed env var used to crash this process with no stdout
  // output at all — the edit would have silently gone through. Asserts the
  // fix: any internal error now writes an explicit deny, exit 0, not a crash.
  test("fails closed — a malformed env var denies instead of crashing open", async () => {
    const { stdout, exitCode } = await runHook(
      { tool_name: "Edit", tool_input: { file_path: `${WORKTREE_ROOT}/src/index.ts` } },
      {
        ORCHESTRA_WORKTREE_ROOT: WORKTREE_ROOT,
        ORCHESTRA_ALLOWED_PATHS: "not-valid-json",
        ORCHESTRA_FORBIDDEN_PATHS: "[]",
      },
    );

    expect(exitCode).toBe(0);
    const decision = JSON.parse(stdout);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(decision.hookSpecificOutput.permissionDecisionReason).toContain("failed closed");
  });

  test("fails closed — malformed stdin denies instead of crashing open", async () => {
    const proc = Bun.spawn(["bun", "run", HOOK_PATH], {
      stdin: "pipe",
      stdout: "pipe",
      env: {
        ...process.env,
        ORCHESTRA_WORKTREE_ROOT: WORKTREE_ROOT,
        ORCHESTRA_ALLOWED_PATHS: "[]",
        ORCHESTRA_FORBIDDEN_PATHS: "[]",
      },
    });
    proc.stdin.write("not valid json at all");
    proc.stdin.end();
    const stdout = (await new Response(proc.stdout).text()).trim();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    const decision = JSON.parse(stdout);
    expect(decision.hookSpecificOutput.permissionDecision).toBe("deny");
  });
});
