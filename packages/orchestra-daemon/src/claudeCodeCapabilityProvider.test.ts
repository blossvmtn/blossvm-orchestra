import { describe, expect, test } from "bun:test";
import { drainStream } from "./claudeCodeCapabilityProvider";

/**
 * runClaudeCodeCapabilityProvider itself spawns a real `claude` process (real
 * API cost, real latency) — this file's own doc comment already scopes that
 * to a live acceptance walk, not automated tests (same posture as pipeline.ts's
 * dispatchWorkIntent). drainStream is the one piece of the second review
 * round's process-supervision hardening (stderr/stdout drained concurrently,
 * so neither pipe can back up and stall the child — see the doc comment on
 * runClaudeCodeCapabilityProvider) that's cheap and real to test in isolation.
 */
describe("drainStream", () => {
  function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
  }

  test("concatenates every chunk across multiple reads into one string", async () => {
    const result = await drainStream(streamOf(["hello ", "world", "\n"]));
    expect(result).toBe("hello world\n");
  });

  test("returns an empty string for a stream that closes with no data", async () => {
    const result = await drainStream(streamOf([]));
    expect(result).toBe("");
  });

  test("correctly decodes a multi-byte UTF-8 character split across chunk boundaries", async () => {
    // "café" — the é is 2 bytes (0xC3 0xA9); split the encoded bytes mid-character
    // to prove the streaming TextDecoder (not a naive per-chunk decode) is in use.
    const encoded = new TextEncoder().encode("café");
    const first = encoded.slice(0, encoded.length - 1);
    const second = encoded.slice(encoded.length - 1);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first);
        controller.enqueue(second);
        controller.close();
      },
    });

    expect(await drainStream(stream)).toBe("café");
  });
});
