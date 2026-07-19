import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb } from "./db/db";
import { git } from "./git/git";
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
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:1420");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("authorization");

    const real = await fetch(`${baseUrl}/ping`, {
      headers: { authorization: "Bearer test-token", origin: "http://localhost:1420" },
    });
    expect(real.headers.get("access-control-allow-origin")).toBe("http://localhost:1420");
  });

  test("the Windows production webview origin (http://tauri.localhost) is also allowed", async () => {
    // Tauri v2 uses tauri://localhost on macOS/Linux but http://tauri.localhost
    // on Windows (CodeRabbit, PR #1 review, 2026-07-18) — not yet a real target
    // platform for this build (JD is on Apple Silicon macOS, ADR 0001 D2), but
    // cheap to cover now rather than rediscover when Windows support lands.
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const preflight = await fetch(`${baseUrl}/ping`, {
      method: "OPTIONS",
      headers: { origin: "http://tauri.localhost" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://tauri.localhost");
  });

  test("CORS is scoped to the cockpit's known origins, not a wildcard — an unrelated origin gets no allow-origin header", async () => {
    // Security review, 2026-07-18: a wildcard ACAO would let the browser
    // deliver a preflighted, authorization-bearing request from ANY web
    // origin — a malicious page open in the user's regular browser, nothing
    // to do with this app. Only the two real cockpit origins should ever see
    // this header set.
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const preflight = await fetch(`${baseUrl}/fixture/dispatch`, {
      method: "OPTIONS",
      headers: { origin: "https://evil.example.com" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();

    const real = await fetch(`${baseUrl}/ping`, {
      headers: { authorization: "Bearer test-token", origin: "https://evil.example.com" },
    });
    expect(real.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("an empty deps.token can never itself be a valid credential — defense in depth against the startup-race bypass", async () => {
    // Security review, 2026-07-18: daemon.ts previously started Bun.serve()
    // with deps.token === "" while the async token write was still in
    // flight; `authorization: "Bearer "` (empty) matched it. daemon.ts now
    // generates the token synchronously before binding, so this window no
    // longer exists in practice — this test guards the second, independent
    // layer: routeRequest must reject an empty token outright, not just rely
    // on equality, so the bug class can't resurface from a future refactor.
    const deps: DaemonDeps = { token: "", db: createDb(":memory:") };
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: createFetchHandler(deps) });
    activeServer = server;
    const baseUrl = `http://127.0.0.1:${server.port}`;

    const res = await fetch(`${baseUrl}/ping`, { headers: { authorization: "Bearer " } });
    expect(res.status).toBe(401);
  });
});

// dispatchWorkIntent's success path spawns a real `claude` process (real API
// cost) — not exercised here. These cover the cheap paths: auth, real repo
// registration (no API cost), and the unregistered-repo 404 (rejects before
// any spawn happens). The full chain was verified live on JD's machine
// (spec §5's acceptance walk).
describe("POST /repos and POST /work-intents (Phase 1)", () => {
  test("POST /repos rejects an unauthenticated request", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const res = await fetch(`${baseUrl}/repos`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("POST /repos registers a real git repo", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-server-repo-test-"));
    try {
      await git(repoRoot, ["init", "-b", "main"]);

      const res = await fetch(`${baseUrl}/repos`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rootPath: repoRoot }),
      });
      expect(res.status).toBe(200);
      const repo = (await res.json()) as { slug: string; rootPath: string };
      // .toEndWith, not .toBe: registerRepo canonicalizes via realpath
      // (second review round) — macOS resolves /tmp -> /private/tmp.
      expect(repo.rootPath).toEndWith(repoRoot);
      expect(repo.slug).toBe(path.basename(repoRoot));
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  test("POST /repos rejects a non-git rootPath with 400", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const notARepo = await mkdtemp(path.join(tmpdir(), "orchestra-server-not-a-repo-"));
    try {
      const res = await fetch(`${baseUrl}/repos`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rootPath: notARepo }),
      });
      expect(res.status).toBe(400);
    } finally {
      await rm(notARepo, { recursive: true, force: true });
    }
  });

  test("POST /work-intents returns 404 for an unregistered repoSlug", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const res = await fetch(`${baseUrl}/work-intents`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        repoSlug: "never-registered",
        intent: "test",
        taskSpec: {
          slug: "lane-1",
          branch: "orch/lane-1",
          role: "Test",
          allowedPaths: [],
          forbiddenPaths: [],
          acceptance: [],
        },
      }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /work-intents returns 400 when required fields are missing", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const res = await fetch(`${baseUrl}/work-intents`, {
      method: "POST",
      headers,
      body: JSON.stringify({ repoSlug: "x" }),
    });
    expect(res.status).toBe(400);
  });

  // PR #2 review, 2026-07-18 — should-fix: a Zod validation failure on a
  // *registered* repo's taskSpec used to fall through to a generic 500. This
  // registers a real repo first (so the request gets past the 404 check)
  // then sends a taskSpec Zod actually rejects (missing required fields).
  test("POST /work-intents returns 400 (not 500) when taskSpec fails Zod validation", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-server-zod-test-"));
    try {
      await git(repoRoot, ["init", "-b", "main"]);
      const registerRes = await fetch(`${baseUrl}/repos`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rootPath: repoRoot }),
      });
      const repo = (await registerRes.json()) as { slug: string };

      const res = await fetch(`${baseUrl}/work-intents`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          repoSlug: repo.slug,
          intent: "test",
          taskSpec: { slug: "lane-1" /* missing branch, role, allowedPaths, etc. */ },
        }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("invalid taskSpec");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
