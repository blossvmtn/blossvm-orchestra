import { randomUUID } from "node:crypto";
import path from "node:path";
import { AgentRunSchema, ReceiptSchema, type TaskSpec, type Worktree, type AgentRun, type Receipt } from "@orchestra/core";
import { consumeClaudeCodeStream } from "./claudeCodeStream";

const HOOK_PATH = path.join(import.meta.dir, "fence", "hook.ts");

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

  const streamResult = await consumeClaudeCodeStream(proc.stdout);
  await proc.exited;

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
