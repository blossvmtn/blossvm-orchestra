/**
 * The daemon's HTTP surface. Factored out from daemon.ts so it can be exercised
 * directly with a Request object in tests, without binding a real port.
 */
export type DaemonDeps = {
  token: string;
};

export function createFetchHandler(deps: DaemonDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
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

    return Response.json({ error: "not_found" }, { status: 404 });
  };
}
