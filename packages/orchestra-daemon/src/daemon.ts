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

  // The cockpit's Rust side reaps this process with SIGKILL on
  // WindowEvent::Destroyed / RunEvent::ExitRequested (lib.rs) — a graceful
  // handler here gives the daemon a chance to close idle HTTP connections
  // cleanly on the more common signal-based exits (Ctrl-C in a terminal,
  // `kill`), rather than relying solely on that kill (CodeRabbit, PR #1
  // review, 2026-07-18). SQLite recovers the WAL on next open regardless —
  // this isn't forcing a checkpoint, just a cleaner HTTP-layer exit.
  const shutdown = () => {
    server.stop(true);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("orchestra-daemon failed to start:", err);
  process.exit(1);
});
