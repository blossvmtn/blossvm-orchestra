import { DAEMON_PORT } from "./paths";
import { generateAndWriteToken } from "./token";
import { createFetchHandler } from "./server";

async function main() {
  const token = await generateAndWriteToken();
  const fetch = createFetchHandler({ token });

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: DAEMON_PORT,
    fetch,
  });

  // eslint-disable-next-line no-console
  console.log(`orchestra-daemon listening on http://${server.hostname}:${server.port}`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("orchestra-daemon failed to start:", err);
  process.exit(1);
});
