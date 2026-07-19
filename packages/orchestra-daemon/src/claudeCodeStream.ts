/**
 * NDJSON parsing for `claude -p --output-format stream-json` (Phase 1 spec
 * §3 step 9). Split from claudeCodeCapabilityProvider.ts so it can be tested
 * against a canned transcript, not just a real spawned process.
 */

export async function* parseNdjsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.trim().length > 0) yield JSON.parse(line);
        newlineIndex = buffer.indexOf("\n");
      }
    }
    if (buffer.trim().length > 0) yield JSON.parse(buffer);
  } finally {
    reader.releaseLock();
  }
}

export type ClaudeCodeRunResult = {
  sessionId?: string;
  costUsd?: number;
  resultText: string;
  isError: boolean;
};

/**
 * Extracts the `system`/`init` event's `session_id` and the terminal
 * `result` event's cost/text/error fields — the exact shapes live-verified
 * against the real `claude` CLI this session (spec §4). `tool_use`/
 * `tool_result` blocks (nested inside `assistant`/`user` messages, per the
 * same verification) aren't consumed here — D15 keeps this synchronous-
 * after-await, no incremental progress tracking in P1.
 */
export async function consumeClaudeCodeStream(stream: ReadableStream<Uint8Array>): Promise<ClaudeCodeRunResult> {
  let sessionId: string | undefined;
  let final: { costUsd: number | undefined; resultText: string; isError: boolean } | undefined;

  for await (const event of parseNdjsonLines(stream)) {
    const e = event as Record<string, unknown>;

    if (e.type === "system" && e.subtype === "init" && typeof e.session_id === "string") {
      sessionId = e.session_id;
    }

    if (e.type === "result") {
      final = {
        costUsd: typeof e.total_cost_usd === "number" ? e.total_cost_usd : undefined,
        resultText: typeof e.result === "string" ? e.result : "",
        isError: Boolean(e.is_error),
      };
    }
  }

  if (!final) {
    throw new Error("Claude Code stream ended without a terminal result event");
  }

  return {
    ...(sessionId !== undefined ? { sessionId } : {}),
    ...(final.costUsd !== undefined ? { costUsd: final.costUsd } : {}),
    resultText: final.resultText,
    isError: final.isError,
  };
}
