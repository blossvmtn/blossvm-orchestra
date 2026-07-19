import { ZodError } from "zod";
import type { OrchestraDb } from "./db/db";
import {
  dispatchFixtureWorkIntent,
  getReceiptById,
  registerRepo,
  dispatchWorkIntent,
  RepoNotRegisteredError,
  type DispatchWorkIntentInput,
} from "./pipeline";
import { runStackedAction, StackedActionError, WorktreeChainNotFoundError, type StackedStep } from "./git/stackedAction";

type DispatchWorkIntentTaskSpecInput = DispatchWorkIntentInput["taskSpec"];

/**
 * The daemon's HTTP surface. Factored out from daemon.ts so it can be exercised
 * directly with a Request object in tests, without binding a real port.
 */
export type DaemonDeps = {
  token: string;
  db: OrchestraDb;
};

// The cockpit's webview calls this daemon cross-origin (dev: http://localhost:1420,
// prod macOS/Linux: tauri://localhost, prod Windows: http://tauri.localhost — see
// apps/orchestra-cockpit/src-tauri/tauri.conf.json's devUrl, and CodeRabbit's PR #1
// review, 2026-07-18, for the Windows origin) with a custom `authorization` header,
// which is a non-simple request: the browser sends a preflight OPTIONS first, and
// blocks the real request if that preflight isn't answered with CORS headers.
//
// Scoped to exactly these origins, not `*` (security review, 2026-07-18): a
// wildcard doesn't leak the token by itself, but it does let the browser deliver
// a preflighted, `authorization`-bearing request from *any* web origin —
// including a malicious page open in the user's regular browser, nothing to do
// with this app. Only the cockpit ever legitimately calls this API, so there's
// no functional cost to naming it explicitly.
const ALLOWED_ORIGINS = new Set([
  "http://localhost:1420",
  "tauri://localhost",
  "http://tauri.localhost",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
}

function withCors(res: Response, req: Request): Response {
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    res.headers.set(key, value);
  }
  return res;
}

// routeRequest is async (Phase 1 — the real /work-intents dispatch awaits real
// git/spawn work). Plan-critique, 2026-07-18: a prior draft of this spec
// claimed the CORS/auth wrapper stayed "unchanged" while only routeRequest
// became async — that breaks every route, not just the new one, since
// withCors would receive a Promise instead of a Response. createFetchHandler
// below awaits routeRequest before passing its result to withCors.
async function routeRequest(req: Request, deps: DaemonDeps): Promise<Response> {
  const url = new URL(req.url);

  // Every route requires the daemon's token — the one piece of hardening a
  // localhost HTTP server needs (see token.ts). `!deps.token` is a defensive
  // second check, not just the equality below (security review, 2026-07-18):
  // an uninitialized/empty deps.token must never itself become a valid
  // credential just because a request also omits the bearer value.
  const authHeader = req.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!deps.token || provided !== deps.token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (url.pathname === "/ping" && req.method === "GET") {
    return Response.json({ ok: true, pong: true, at: new Date().toISOString() });
  }

  // Spec §3.6's IPC path: the cockpit's UI dispatches a fixture WorkIntent
  // through the same pipeline the contract-path test exercises, then reads
  // the resulting Receipt back over a second, separate call — proving the
  // real Tauri<->Bun HTTP boundary, not just the in-process write path.
  if (url.pathname === "/fixture/dispatch" && req.method === "POST") {
    const result = dispatchFixtureWorkIntent(deps.db);
    return Response.json({
      workIntentId: result.workIntent.id,
      taskSpecId: result.taskSpec.id,
      agentRunId: result.agentRun.id,
      receiptId: result.receipt.id,
    });
  }

  // Phase 1 §2 — repo registration. isGitRepo validation happens inside
  // registerRepo() itself; a non-git rootPath throws, caught below as a 400.
  if (url.pathname === "/repos" && req.method === "POST") {
    try {
      const body = (await req.json()) as { rootPath?: unknown };
      if (typeof body.rootPath !== "string" || body.rootPath.length === 0) {
        return Response.json({ error: "rootPath is required" }, { status: 400 });
      }
      const repo = await registerRepo(deps.db, body.rootPath);
      return Response.json(repo);
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "registration failed" }, { status: 400 });
    }
  }

  // Phase 1 §2 — the real dispatch route. Parallel to /fixture/dispatch but
  // takes real founder input instead of fabricating it.
  if (url.pathname === "/work-intents" && req.method === "POST") {
    try {
      const body = (await req.json()) as {
        repoSlug?: unknown;
        intent?: unknown;
        taskSpec?: unknown;
      };
      if (typeof body.repoSlug !== "string" || typeof body.intent !== "string" || !body.taskSpec) {
        return Response.json({ error: "repoSlug, intent, and taskSpec are required" }, { status: 400 });
      }
      const result = await dispatchWorkIntent(deps.db, {
        repoSlug: body.repoSlug,
        intent: body.intent,
        taskSpec: body.taskSpec as DispatchWorkIntentTaskSpecInput,
      });
      return Response.json({
        workIntentId: result.workIntent.id,
        taskSpecId: result.taskSpec.id,
        worktreeId: result.worktree.id,
        agentRunId: result.agentRun.id,
        receiptId: result.receipt.id,
      });
    } catch (err) {
      if (err instanceof RepoNotRegisteredError) {
        return Response.json({ error: err.message }, { status: 404 });
      }
      // PR #2 review, 2026-07-18 — should-fix: a Zod validation failure on
      // taskSpec (e.g. a malformed field) is a client input error, not a
      // server fault — it was falling through to the generic 500 branch.
      if (err instanceof ZodError) {
        return Response.json({ error: "invalid taskSpec", issues: err.issues }, { status: 400 });
      }
      // Nit from the same review: don't echo internal error detail (git
      // stderr, absolute filesystem paths) to the caller on a genuine server
      // fault — log it server-side, return a generic message.
      // eslint-disable-next-line no-console
      console.error("orchestra-daemon: /work-intents dispatch failed —", err);
      return Response.json({ error: "dispatch failed" }, { status: 500 });
    }
  }

  // Phase 2 §2 — the stacked-action route (D27: always an explicit cockpit
  // click, never automatic). runStackedAction resolves its own repoRoot
  // internally (worktree -> taskSpec -> workIntent -> repo) — no
  // pre-resolution here.
  const stackedActionMatch = /^\/worktrees\/([^/]+)\/stacked-action$/.exec(url.pathname);
  if (stackedActionMatch && req.method === "POST") {
    try {
      const worktreeId = stackedActionMatch[1];
      const body = (await req.json()) as { steps?: unknown; message?: unknown };
      if (
        !worktreeId ||
        !Array.isArray(body.steps) ||
        !body.steps.every((s) => s === "commit" || s === "push" || s === "pr")
      ) {
        return Response.json({ error: "steps must be an array of \"commit\" | \"push\" | \"pr\"" }, { status: 400 });
      }
      if (body.message !== undefined && typeof body.message !== "string") {
        return Response.json({ error: "message must be a string if provided" }, { status: 400 });
      }
      const result = await runStackedAction(deps.db, worktreeId, body.steps as StackedStep[], body.message);
      return Response.json({
        worktreeId: result.worktree.id,
        status: result.worktree.status,
        prUrl: result.worktree.prUrl,
        prNumber: result.worktree.prNumber,
        committed: result.committed,
        pushed: result.pushed,
        warnings: result.warnings,
      });
    } catch (err) {
      if (err instanceof StackedActionError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof WorktreeChainNotFoundError) {
        return Response.json({ error: err.message }, { status: 404 });
      }
      // eslint-disable-next-line no-console
      console.error("orchestra-daemon: /worktrees/:id/stacked-action failed —", err);
      return Response.json({ error: "stacked action failed" }, { status: 500 });
    }
  }

  const receiptMatch = /^\/receipts\/([^/]+)$/.exec(url.pathname);
  if (receiptMatch && req.method === "GET") {
    const id = receiptMatch[1];
    const receipt = id ? getReceiptById(deps.db, id) : undefined;
    if (!receipt) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json(receipt);
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

export function createFetchHandler(deps: DaemonDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // Preflight requests never carry the authorization header (browsers strip
    // it), so this must be answered before routeRequest's auth check, not after.
    if (req.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), req);
    }
    return withCors(await routeRequest(req, deps), req);
  };
}
