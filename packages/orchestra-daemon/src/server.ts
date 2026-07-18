import type { OrchestraDb } from "./db/db";
import { dispatchFixtureWorkIntent, getReceiptById } from "./pipeline";

/**
 * The daemon's HTTP surface. Factored out from daemon.ts so it can be exercised
 * directly with a Request object in tests, without binding a real port.
 */
export type DaemonDeps = {
  token: string;
  db: OrchestraDb;
};

// The cockpit's webview calls this daemon cross-origin (dev: http://localhost:1420,
// prod: tauri://localhost — see apps/orchestra-cockpit/src-tauri/tauri.conf.json's
// devUrl) with a custom `authorization` header, which is a non-simple request: the
// browser sends a preflight OPTIONS first, and blocks the real request if that
// preflight isn't answered with CORS headers. `*` is safe here — the token in the
// authorization header (not a cookie) is what actually gates access, and CORS'
// credentials-mode restriction on `*` only applies to cookie/TLS-cert credentials
// (Opus review, 2026-07-18: plain-fetch webview calls would otherwise fail before
// ever reaching the auth check — the daemon had no OPTIONS handler or CORS headers
// at all).
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

function withCors(res: Response): Response {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}

function routeRequest(req: Request, deps: DaemonDeps): Response {
  const url = new URL(req.url);

  // Every route requires the daemon's token — the one piece of hardening a
  // localhost HTTP server needs (see token.ts).
  const authHeader = req.headers.get("authorization");
  const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (provided !== deps.token) {
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
  return (req: Request): Promise<Response> => {
    // Preflight requests never carry the authorization header (browsers strip
    // it), so this must be answered before routeRequest's auth check, not after.
    if (req.method === "OPTIONS") {
      return Promise.resolve(withCors(new Response(null, { status: 204 })));
    }
    return Promise.resolve(withCors(routeRequest(req, deps)));
  };
}
