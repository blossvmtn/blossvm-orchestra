import { DAEMON_PORT } from "./paths";
import { generateAndWriteToken } from "./token";
import { createFetchHandler } from "./server";

async function main() {
  // Fable review, 2026-07-18, F3: bind the port BEFORE writing the token. If
  // an orphaned daemon already holds DAEMON_PORT, Bun.serve() throws here and
  // we exit — instead of overwriting a live daemon's token with one it never
  // reads, which would strand the cockpit in a silent, indefinite 401 loop
  // against the still-running orphan (see F4 — the two compound).
  const deps = { token: "" };
  const fetch = createFetchHandler(deps);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: DAEMON_PORT,
    fetch,
  });

  deps.token = await generateAndWriteToken();

  // eslint-disable-next-line no-console
  console.log(`orchestra-daemon listening on http://${server.hostname}:${server.port}`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("orchestra-daemon failed to start:", err);
  process.exit(1);
});
