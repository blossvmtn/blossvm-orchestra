import { describe, expect, test } from "bun:test";
import { consumeClaudeCodeStream, parseNdjsonLines } from "./claudeCodeStream";

// Shapes match what was captured live against the real `claude` CLI this
// session (spec §4, D26) — not invented from the docs alone.
const INIT_EVENT = JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "e8ddb8b0-a725-4c25-aede-5761ba74d8ae",
  cwd: "/repo/.orchestra/worktrees/lane-1",
  model: "claude-opus-4-8[1m]",
});

const ASSISTANT_EVENT = JSON.stringify({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text: "Working on it..." }] },
  session_id: "e8ddb8b0-a725-4c25-aede-5761ba74d8ae",
});

const RESULT_EVENT_SUCCESS = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "Done — added the requested helper function.",
  total_cost_usd: 0.35124750000000005,
  session_id: "e8ddb8b0-a725-4c25-aede-5761ba74d8ae",
});

const RESULT_EVENT_DENIED = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "The edit was blocked — a hook denied the write to target.txt.",
  total_cost_usd: 0.351,
  session_id: "e8ddb8b0-a725-4c25-aede-5761ba74d8ae",
  permission_denials: [{ tool_name: "Write" }],
});

function streamOf(...lines: string[]): ReadableStream<Uint8Array> {
  const text = lines.join("\n") + "\n";
  return new Response(text).body as ReadableStream<Uint8Array>;
}

describe("parseNdjsonLines", () => {
  test("yields one parsed object per line", async () => {
    const events: unknown[] = [];
    for await (const event of parseNdjsonLines(streamOf(INIT_EVENT, RESULT_EVENT_SUCCESS))) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
  });

  test("handles a chunk boundary splitting a line in the middle", async () => {
    const combined = INIT_EVENT + "\n" + RESULT_EVENT_SUCCESS + "\n";
    const mid = Math.floor(combined.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(combined.slice(0, mid)));
        controller.enqueue(new TextEncoder().encode(combined.slice(mid)));
        controller.close();
      },
    });

    const events: unknown[] = [];
    for await (const event of parseNdjsonLines(stream)) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
  });
});

describe("consumeClaudeCodeStream", () => {
  test("extracts session_id from system/init and cost/text/error from the terminal result", async () => {
    const result = await consumeClaudeCodeStream(streamOf(INIT_EVENT, ASSISTANT_EVENT, RESULT_EVENT_SUCCESS));

    expect(result.sessionId).toBe("e8ddb8b0-a725-4c25-aede-5761ba74d8ae");
    expect(result.costUsd).toBeCloseTo(0.35124750000000005);
    expect(result.resultText).toBe("Done — added the requested helper function.");
    expect(result.isError).toBe(false);
  });

  test("a fence denial still surfaces as a successful (not errored) run — the agent handled it", async () => {
    const result = await consumeClaudeCodeStream(streamOf(INIT_EVENT, RESULT_EVENT_DENIED));

    expect(result.isError).toBe(false);
    expect(result.resultText).toContain("blocked");
  });

  test("throws if the stream ends without a terminal result event", async () => {
    await expect(consumeClaudeCodeStream(streamOf(INIT_EVENT))).rejects.toThrow(/terminal result/);
  });
});
