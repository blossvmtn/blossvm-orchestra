import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb } from "./db/db";
import { repos, workIntents, taskSpecs, worktrees } from "./db/schema";
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
  return { server, baseUrl: `http://127.0.0.1:${server.port}`, deps };
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

// Phase 2 (spec docs/specs/2026-07-19-phase-2-stacked-pr-actions.md §3 step
// 9). Seeds workIntent/taskSpec/worktree rows directly against deps.db
// (rather than a real dispatch, which spawns a real, real-cost `claude`
// process) pointing at a real registered repo — a real git push still runs
// for real (D28's mutex, D31's OD3 algorithm), only createPullRequest is out
// of reach at the HTTP layer (no injection seam through routeRequest, by
// design — the live acceptance walk covers the real gh pr create path).
describe("POST /worktrees/:id/stacked-action (Phase 2)", () => {
  test("rejects an unauthenticated request", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const res = await fetch(`${baseUrl}/worktrees/${randomUUID()}/stacked-action`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("returns 404 for an unknown worktreeId", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const res = await fetch(`${baseUrl}/worktrees/${randomUUID()}/stacked-action`, {
      method: "POST",
      headers,
      body: JSON.stringify({ steps: ["push"] }),
    });
    expect(res.status).toBe(404);
  });

  test("returns 400 for a malformed steps array", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const res = await fetch(`${baseUrl}/worktrees/${randomUUID()}/stacked-action`, {
      method: "POST",
      headers,
      body: JSON.stringify({ steps: ["not-a-real-step"] }),
    });
    expect(res.status).toBe(400);
  });

  test("a real push against a real registered repo succeeds end to end over HTTP", async () => {
    const { server, baseUrl, deps } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const originRoot = await mkdtemp(path.join(tmpdir(), "orchestra-server-stacked-origin-"));
    const repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-server-stacked-repo-"));
    try {
      await git(originRoot, ["init", "--bare", "-b", "main"]);
      await git(repoRoot, ["init", "-b", "main"]);
      await git(repoRoot, ["config", "user.email", "test@example.com"]);
      await git(repoRoot, ["config", "user.name", "Orchestra Test"]);
      await Bun.write(path.join(repoRoot, "README.md"), "test\n");
      await git(repoRoot, ["add", "README.md"]);
      await git(repoRoot, ["commit", "-m", "initial commit"]);
      await git(repoRoot, ["remote", "add", "origin", originRoot]);
      await git(repoRoot, ["push", "-u", "origin", "main"]);
      await git(repoRoot, ["checkout", "-b", "orch/server-lane"]);

      const registerRes = await fetch(`${baseUrl}/repos`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rootPath: repoRoot }),
      });
      const repo = (await registerRes.json()) as { slug: string };

      const now = "2026-07-19T12:00:00.000Z";
      const workIntentId = randomUUID();
      deps.db
        .insert(workIntents)
        .values({ id: workIntentId, planId: randomUUID(), repoSlug: repo.slug, intent: "test", status: "captured", createdAt: now })
        .run();
      const taskSpecId = randomUUID();
      deps.db
        .insert(taskSpecs)
        .values({
          id: taskSpecId,
          workIntentId,
          slug: "server-lane",
          branch: "orch/server-lane",
          role: "Test",
          allowedPaths: [],
          forbiddenPaths: [],
          acceptance: [],
          createdAt: now,
        })
        .run();
      const worktreeId = randomUUID();
      deps.db
        .insert(worktrees)
        .values({
          id: worktreeId,
          taskSpecId,
          path: repoRoot,
          branch: "orch/server-lane",
          anchorSha: "abcdef0123456789",
          status: "active",
          createdAt: now,
        })
        .run();

      const res = await fetch(`${baseUrl}/worktrees/${worktreeId}/stacked-action`, {
        method: "POST",
        headers,
        body: JSON.stringify({ steps: ["push"] }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { worktreeId: string; pushed: boolean; committed: boolean };
      expect(body.worktreeId).toBe(worktreeId);
      expect(body.pushed).toBe(true);
      expect(body.committed).toBe(false);
    } finally {
      await rm(originRoot, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});

// Phase 3A (spec docs/specs/2026-07-20-phase-3a-operational-cockpit.md §2) —
// the read layer the cockpit polls. All cheap: no spawn, no real git, no API
// cost. The snapshot composes the materialized tables; /system/health asserts
// only shape + the checks the daemon can vouch for itself (Daemon, Database) —
// git/gh/claude presence varies by host (absent in CI), which is exactly why
// the design reports "unavailable" honestly rather than faking a pass.
describe("GET /state/snapshot and GET /system/health (Phase 3A)", () => {
  test("GET /state/snapshot rejects an unauthenticated request", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const res = await fetch(`${baseUrl}/state/snapshot`);
    expect(res.status).toBe(401);
  });

  test("a fresh database returns a well-formed, empty snapshot", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token" };

    const res = await fetch(`${baseUrl}/state/snapshot`, { headers });
    expect(res.status).toBe(200);
    const snap = (await res.json()) as Record<string, unknown[]> & { generatedAt: string };
    expect(typeof snap.generatedAt).toBe("string");
    for (const key of ["repos", "workIntents", "taskSpecs", "worktrees", "agentRuns", "receipts"] as const) {
      expect(Array.isArray(snap[key])).toBe(true);
      expect(snap[key]).toHaveLength(0);
    }
  });

  test("a dispatched fixture WorkIntent shows up in the snapshot", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token" };

    const dispatchRes = await fetch(`${baseUrl}/fixture/dispatch`, { method: "POST", headers });
    expect(dispatchRes.status).toBe(200);

    const res = await fetch(`${baseUrl}/state/snapshot`, { headers });
    expect(res.status).toBe(200);
    const snap = (await res.json()) as {
      repos: unknown[];
      workIntents: { id: string }[];
      taskSpecs: unknown[];
      agentRuns: unknown[];
      receipts: unknown[];
      worktrees: unknown[];
    };
    expect(snap.repos.length).toBeGreaterThanOrEqual(1);
    expect(snap.workIntents).toHaveLength(1);
    expect(snap.taskSpecs).toHaveLength(1);
    expect(snap.agentRuns).toHaveLength(1);
    expect(snap.receipts).toHaveLength(1);
    // The fixture path has no real git, so no worktree is created.
    expect(snap.worktrees).toHaveLength(0);
  });

  test("a malformed persisted row surfaces as a 500, not a silently wrong snapshot", async () => {
    const { server, baseUrl, deps } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token" };

    const now = "2026-07-20T12:00:00.000Z";
    deps.db.insert(repos).values({ id: randomUUID(), slug: "bad", rootPath: "/x", registeredAt: now }).run();
    // Bypasses the enum type at the TS layer; SQLite stores any text, so the
    // corruption is caught by the core mapper's Zod parse inside buildStateSnapshot.
    deps.db
      .insert(workIntents)
      .values({
        id: randomUUID(),
        planId: randomUUID(),
        repoSlug: "bad",
        intent: "corrupt",
        status: "not-a-real-status" as never,
        createdAt: now,
      })
      .run();

    const res = await fetch(`${baseUrl}/state/snapshot`, { headers });
    expect(res.status).toBe(500);
  });

  test("GET /system/health rejects an unauthenticated request", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const res = await fetch(`${baseUrl}/system/health`);
    expect(res.status).toBe(401);
  });

  test("GET /system/health reports daemon + database ok and a well-formed checks array", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token" };

    const res = await fetch(`${baseUrl}/system/health`, { headers });
    expect(res.status).toBe(200);
    const health = (await res.json()) as {
      generatedAt: string;
      checks: { name: string; status: string; detail?: string }[];
    };
    expect(typeof health.generatedAt).toBe("string");
    expect(Array.isArray(health.checks)).toBe(true);
    for (const check of health.checks) {
      expect(["ok", "degraded", "unavailable"]).toContain(check.status);
    }
    const daemon = health.checks.find((c) => c.name === "Daemon");
    const database = health.checks.find((c) => c.name === "Database");
    expect(daemon?.status).toBe("ok");
    expect(database?.status).toBe("ok");
    // No check ever carries the token — a coarse guard against a future refactor
    // that pipes raw process output into a detail string.
    for (const check of health.checks) {
      expect(check.detail ?? "").not.toContain("test-token");
    }
  });
});

// Phase 3A — the read-only git-log trunk scan behind the Trunk-map view. Real
// git (cheap, no spawn of `claude`, no push). The third test is the one that
// matters: a lane branch that doesn't exist on disk must degrade in place, not
// take down the whole scan — the "can't fight me" property JD asked for.
describe("GET /repos/:slug/trunk (Phase 3A — git-log trunk scan)", () => {
  test("rejects an unauthenticated request", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const res = await fetch(`${baseUrl}/repos/anything/trunk`);
    expect(res.status).toBe(401);
  });

  test("returns 404 for an unregistered repo", async () => {
    const { server, baseUrl } = startTestDaemon();
    activeServer = server;

    const res = await fetch(`${baseUrl}/repos/never-registered/trunk`, {
      headers: { authorization: "Bearer test-token" },
    });
    expect(res.status).toBe(404);
  });

  test("scans base + a lane branch, and degrades a missing lane branch instead of failing", async () => {
    const { server, baseUrl, deps } = startTestDaemon();
    activeServer = server;
    const headers = { authorization: "Bearer test-token", "content-type": "application/json" };

    const repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-trunk-test-"));
    try {
      await git(repoRoot, ["init", "-b", "main"]);
      await git(repoRoot, ["config", "user.email", "test@example.com"]);
      await git(repoRoot, ["config", "user.name", "Orchestra Test"]);
      await Bun.write(path.join(repoRoot, "README.md"), "hello\n");
      await git(repoRoot, ["add", "README.md"]);
      await git(repoRoot, ["commit", "-m", "initial commit on main"]);
      await git(repoRoot, ["checkout", "-b", "orch/lane-1"]);
      await Bun.write(path.join(repoRoot, "feature.txt"), "work\n");
      await git(repoRoot, ["add", "feature.txt"]);
      await git(repoRoot, ["commit", "-m", "add feature on the lane"]);
      await git(repoRoot, ["checkout", "main"]);

      const registerRes = await fetch(`${baseUrl}/repos`, {
        method: "POST",
        headers,
        body: JSON.stringify({ rootPath: repoRoot }),
      });
      const repo = (await registerRes.json()) as { slug: string };

      // One real lane (orch/lane-1) and one ghost lane (orch/ghost) whose branch
      // was never created on disk — the scan must survive the ghost.
      const now = "2026-07-20T12:00:00.000Z";
      for (const [laneSlug, branch] of [
        ["lane-1", "orch/lane-1"],
        ["ghost", "orch/ghost"],
      ] as const) {
        const workIntentId = randomUUID();
        deps.db
          .insert(workIntents)
          .values({ id: workIntentId, planId: randomUUID(), repoSlug: repo.slug, intent: laneSlug, status: "captured", createdAt: now })
          .run();
        const taskSpecId = randomUUID();
        deps.db
          .insert(taskSpecs)
          .values({ id: taskSpecId, workIntentId, slug: laneSlug, branch, role: "Worker", allowedPaths: [], forbiddenPaths: [], acceptance: [], createdAt: now })
          .run();
        deps.db
          .insert(worktrees)
          .values({ id: randomUUID(), taskSpecId, path: repoRoot, branch, anchorSha: "0".repeat(40), status: "active", createdAt: now })
          .run();
      }

      const res = await fetch(`${baseUrl}/repos/${repo.slug}/trunk`, {
        headers: { authorization: "Bearer test-token" },
      });
      expect(res.status).toBe(200);
      const scan = (await res.json()) as {
        base: string;
        branches: { name: string; isBase: boolean; degraded: boolean; commits: { subject: string }[] }[];
      };

      const base = scan.branches.find((b) => b.isBase);
      expect(base?.commits.length).toBeGreaterThanOrEqual(1);

      const lane = scan.branches.find((b) => b.name === "orch/lane-1");
      expect(lane?.degraded).toBe(false);
      expect(lane?.commits.map((c) => c.subject)).toContain("add feature on the lane");

      const ghost = scan.branches.find((b) => b.name === "orch/ghost");
      expect(ghost?.degraded).toBe(true);
      expect(ghost?.commits).toHaveLength(0);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
