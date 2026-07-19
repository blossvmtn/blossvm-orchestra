#!/usr/bin/env bun
import { pathAllowed } from "./glob";

/**
 * The PreToolUse fence hook (Phase 1 spec §3 step 8, D8/D25) — invoked by
 * Claude Code itself as a subprocess for every Edit/Write tool call (the
 * `--settings` JSON's `matcher: "Edit|Write"`, built by
 * claudeCodeCapabilityProvider.ts). Contract verified live against the real
 * `claude` CLI this session (spec §4, D26): stdin carries `tool_input.file_path`,
 * stdout carries `hookSpecificOutput.permissionDecision`.
 *
 * Fence data travels via environment variables set by the daemon when
 * spawning `claude` (ORCHESTRA_ALLOWED_PATHS/ORCHESTRA_FORBIDDEN_PATHS —
 * JSON-stringified arrays; ORCHESTRA_WORKTREE_ROOT — a plain path) rather
 * than a file, since this process has no other channel back to the daemon
 * that spawned its parent.
 */

type HookInput = { tool_input?: { file_path?: string } };

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeDecision(allowed: boolean, filePath: string): void {
  const hookSpecificOutput = allowed
    ? { hookEventName: "PreToolUse" as const, permissionDecision: "allow" as const }
    : {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "deny" as const,
        permissionDecisionReason: `Path outside the fence: ${filePath}`,
      };
  console.log(JSON.stringify({ hookSpecificOutput }));
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const input = JSON.parse(raw) as HookInput;
  const filePath = input.tool_input?.file_path;

  // No file_path on this tool call — nothing this hook is scoped to fence.
  if (!filePath) {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }));
    return;
  }

  const worktreeRoot = process.env.ORCHESTRA_WORKTREE_ROOT ?? "";
  const allowedPaths = JSON.parse(process.env.ORCHESTRA_ALLOWED_PATHS ?? "[]") as string[];
  const forbiddenPaths = JSON.parse(process.env.ORCHESTRA_FORBIDDEN_PATHS ?? "[]") as string[];

  writeDecision(pathAllowed(filePath, worktreeRoot, allowedPaths, forbiddenPaths), filePath);
}

/**
 * PR #2 review, 2026-07-18 — BLOCKING, fixed same-day, before merge: `main()`
 * was invoked bare with no try/catch. A malformed ORCHESTRA_ALLOWED_PATHS/
 * ORCHESTRA_FORBIDDEN_PATHS env var (or malformed stdin) crashed this
 * process with an uncaught JSON.parse error — verified empirically. Per
 * Claude Code's documented hook exit-code contract, only exit code 2 is a
 * blocking error for PreToolUse; any other non-zero exit (an uncaught throw
 * exits 1) is non-blocking, so the gated tool call would have proceeded —
 * the fence failing open on its own internal error, the opposite of what a
 * security boundary needs. Any error here now writes an explicit `deny`
 * instead, so a broken hook blocks edits rather than silently allowing them.
 */
main().catch((err: unknown) => {
  const reason = err instanceof Error ? err.message : String(err);
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Fence hook failed closed on an internal error: ${reason}`,
      },
    }),
  );
});
