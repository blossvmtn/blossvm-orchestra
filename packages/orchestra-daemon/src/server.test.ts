import { afterEach, describe, expect, test } from "bun:test";
import { createDb } from "./db/db";
import { createFetchHandler, type DaemonDeps } from "./server";

/**
 * Binds a real Bun.serve() on an ephemeral port (0, not the fixed
 * DAEMON_PORT — avoids colliding with a real running daemon or a parallel
 * test run) and drives it with the real global fetch() over a real loopback
 * TCP socket. This is the same mechanism the cockpit's webview uses (plain
 * authenticated fetch() against 127.0.0.1, per spec §3 step 2) — the closest
 * an automated test gets to spec §3.6's IPC path without a real Tauri window.
 * JD's manual click-through in the cockpit (spec §4) is what proves the last
 * mile: the real webview, the real Rust-resolved token, literal pixels.
 */
function startTestDaemon() {
  const deps: DaemonDeps = { token: "test-token", db: createDb(":memory:") };
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: createFetchHandler(deps) });
  return { server, baseUrl: `http://127.0.0.1:${server.port}` };
}

let activeServer: ReturnType<typeof Bun.serve> | undefined;

afterEach(() => {
  activeServer?.stop(true);
  activeServer = undefined;
});

describe("the IPC path (spec §3.6): real authenticated fetch() over a real loopback socket", () => {
  test("an unauthenticated request is rejected before it reaches any route", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const res = await fetch(`${baseUrl}/ping`);
    expect(res.status).toBe(401);
  });

  test("the fixture-dispatch and receipt-read routes reject an unauthenticated request too", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const dispatchRes = await fetch(`${baseUrl}/fixture/dispatch`, { method: "POST" });
    expect(dispatchRes.status).toBe(401);

    const receiptRes = await fetch(`${baseUrl}/receipts/d290f1ee-6c54-4b01-90e6-d701748f9999`);
    expect(receiptRes.status).toBe(401);
  });

  test("dispatching a fixture WorkIntent, then reading the Receipt back over a second call, round-trips correctly", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token" };

    const dispatchRes = await fetch(`${baseUrl}/fixture/dispatch`, { method: "POST", headers });
    expect(dispatchRes.status).toBe(200);
    const dispatched = (await dispatchRes.json()) as { receiptId: string };
    expect(typeof dispatched.receiptId).toBe("string");

    // A second, separate fetch() call — "read back the same way" (spec
    // §3.6), not the create response reused as a stand-in for a real read.
    const receiptRes = await fetch(`${baseUrl}/receipts/${dispatched.receiptId}`, { headers });
    expect(receiptRes.status).toBe(200);
    const receipt = (await receiptRes.json()) as { id: string; verification: string; outcome: string };

    expect(receipt.id).toBe(dispatched.receiptId);
    expect(receipt.verification).toBe("none");
    expect(receipt.outcome).toBe("succeeded");
  });

  test("reading an unknown receipt id returns 404, not a 500", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token" };

    const res = await fetch(`${baseUrl}/receipts/d290f1ee-6c54-4b01-90e6-d701748f9999`, {
      headers,
    });
    expect(res.status).toBe(404);
  });

  test("an unauthenticated CORS preflight (OPTIONS) is answered directly, not gated behind the token", async () => {
    // The cockpit's webview sends the authorization header on the real request,
    // never on the preflight (browsers strip it) — a webview fetch() would
    // otherwise never get past this step. Every real route response also
    // needs the same headers, or the browser discards the response body even
    // after a 200.
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const preflight = await fetch(`${baseUrl}/fixture/dispatch`, {
      method: "OPTIONS",
      headers: { origin: "http://localhost:1420" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("authorization");

    const real = await fetch(`${baseUrl}/ping`, {
      headers: { authorization: "Bearer test-token" },
    });
    expect(real.headers.get("access-control-allow-origin")).toBe("*");
  });
});
