import { randomUUID } from "node:crypto";
import path from "node:path";
import { AgentRunSchema, ReceiptSchema, type TaskSpec, type Worktree, type AgentRun, type Receipt } from "@orchestra/core";
import { consumeClaudeCodeStream } from "./claudeCodeStream";

const HOOK_PATH = path.join(import.meta.dir, "fence", "hook.ts");

// ponytail: a flat timeout, not per-task budgeting off riskTier/acceptance
// count — ceiling is "long enough for a real single-shot coding task,"
// upgrade path is per-TaskSpec timeouts once P1's single-lane assumption
// stops holding (multiple concurrent dispatches, longer-running work).
const PROVIDER_TIMEOUT_MS = 15 * 60 * 1000;

/** Drains a stream to a string without parsing it — used for proc.stderr,
 * which must be read concurrently with stdout (see runClaudeCodeCapabilityProvider's
 * doc comment): an unread pipe fills its OS buffer (~64KB) and blocks the
 * child's next write() to it, which can stall the whole process. */
export async function drainStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return text;
}

/**
 * The real capability provider (Phase 1 spec §3 step 9) — parallel to
 * fixtureCapabilityProvider.ts, but actually spawns Claude Code and drives
 * fence enforcement for real. D15: synchronous-after-await — awaits the
 * full run internally, returns a final {agentRun, receipt} once done. No
 * --bare, no CLAUDE_CONFIG_DIR override (D26 — both break OAuth auth on a
 * subscription-authenticated machine; the fence hook itself works correctly
 * under normal auth, live-verified this session).
 */
export async function runClaudeCodeCapabilityProvider(
  intent: string,
  taskSpec: TaskSpec,
  worktree: Worktree,
): Promise<{ agentRun: AgentRun; receipt: Receipt }> {
  const startedAt = new Date().toISOString();

  const prompt = [
    intent,
    "",
    `Role: ${taskSpec.role}`,
    "Acceptance criteria:",
    ...taskSpec.acceptance.map((criterion) => `- ${criterion}`),
  ].join("\n");

  const settings = {
    hooks: {
      PreToolUse: [
        {
          matcher: "Edit|Write",
          hooks: [{ type: "command", command: `bun run ${HOOK_PATH}` }],
        },
      ],
    },
  };

  // argv array, never an interpolated shell string (ADR 0001 §2 Stack).
  const proc = Bun.spawn(
    [
      "claude",
      "-p",
      prompt,
      "--settings",
      JSON.stringify(settings),
      "--output-format",
      "stream-json",
      "--allowedTools",
      "Read,Edit", // D25 — no Bash
      "--permission-mode",
      "acceptEdits",
    ],
    {
      cwd: worktree.path,
      env: {
        ...process.env,
        ORCHESTRA_WORKTREE_ROOT: worktree.path,
        ORCHESTRA_ALLOWED_PATHS: JSON.stringify(taskSpec.allowedPaths),
        ORCHESTRA_FORBIDDEN_PATHS: JSON.stringify(taskSpec.forbiddenPaths),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  // Second independent review round, 2026-07-19 — MAJOR: this used to await
  // consumeClaudeCodeStream(proc.stdout) alone, with stderr piped but never
  // read (a deadlock risk — see drainStream's doc comment), no timeout (a
  // hung `claude` process hung this dispatch, and the HTTP request behind
  // it, forever), and no exit-code check (a nonzero exit that still managed
  // to emit a well-formed terminal `result` event before dying would have
  // been reported as a normal success). All three fixed together: stdout
  // and stderr drain concurrently, a timeout kills the process and fails
  // loud instead of hanging, and a nonzero exit always throws regardless of
  // what the stream looked like.
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, PROVIDER_TIMEOUT_MS);

  let streamResult: Awaited<ReturnType<typeof consumeClaudeCodeStream>>;
  let stderrText: string;
  try {
    [streamResult, stderrText] = await Promise.all([consumeClaudeCodeStream(proc.stdout), drainStream(proc.stderr)]);
    await proc.exited;
  } catch (err) {
    proc.kill();
    await proc.exited.catch(() => undefined);
    clearTimeout(timeoutHandle);
    if (timedOut) {
      throw new Error(`Claude Code run timed out after ${PROVIDER_TIMEOUT_MS}ms and was killed.`);
    }
    throw err;
  }
  clearTimeout(timeoutHandle);

  if (timedOut) {
    throw new Error(`Claude Code run timed out after ${PROVIDER_TIMEOUT_MS}ms and was killed.`);
  }
  if (proc.exitCode !== 0) {
    throw new Error(
      `Claude Code exited with code ${String(proc.exitCode)}${stderrText ? `: ${stderrText.slice(0, 2000)}` : ""}`,
    );
  }

  const endedAt = new Date().toISOString();

  const agentRun = AgentRunSchema.parse({
    id: randomUUID(),
    taskSpecId: taskSpec.id,
    provider: "claude-code",
    status: streamResult.isError ? "failed" : "done",
    lastHeartbeatSummary: streamResult.resultText.slice(0, 280),
    startedAt,
    endedAt,
    ...(streamResult.sessionId !== undefined ? { claudeSessionId: streamResult.sessionId } : {}),
    ...(streamResult.costUsd !== undefined ? { costUsd: streamResult.costUsd } : {}),
  });

  const receipt = ReceiptSchema.parse({
    id: randomUUID(),
    agentRunId: agentRun.id,
    taskSpecId: taskSpec.id,
    outcome: streamResult.isError ? "failed" : "succeeded",
    summary: streamResult.resultText || "Claude Code run completed with no summary text.",
    verification: "none", // D11 — still moot for P1, no R4 action reached
    createdAt: endedAt,
    ...(agentRun.costUsd !== undefined ? { costUsd: agentRun.costUsd } : {}),
  });

  return { agentRun, receipt };
}
