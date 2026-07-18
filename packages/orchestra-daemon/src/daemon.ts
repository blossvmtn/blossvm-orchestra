import { DAEMON_PORT } from "./paths";
import { generateToken, writeToken } from "./token";
import { createFetchHandler, type DaemonDeps } from "./server";
import { createDb } from "./db/db";

async function main() {
  // Security review, 2026-07-18: deps.token must never be empty once the
  // server starts accepting connections — an empty in-memory token makes
  // `authorization: "Bearer "` (nothing after the space) match it, an
  // outright auth bypass. generateToken() is synchronous (crypto.randomBytes
  // needs no I/O), so the real token is ready before Bun.serve() binds.
  //
  // Fable review, 2026-07-18, F3: the disk WRITE still happens after the
  // bind, not before — if an orphaned daemon already holds DAEMON_PORT,
  // Bun.serve() throws here and we exit, instead of overwriting a live
  // daemon's token file with one it never reads (see F4 — the two compound).
  const token = generateToken();
  const deps: DaemonDeps = { token, db: createDb() };
  const fetch = createFetchHandler(deps);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: DAEMON_PORT,
    fetch,
  });

  await writeToken(token);

  // eslint-disable-next-line no-console
  console.log(`orchestra-daemon listening on http://${server.hostname}:${server.port}`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("orchestra-daemon failed to start:", err);
  process.exit(1);
});
