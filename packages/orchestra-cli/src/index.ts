import { DAEMON_BASE_URL, readToken } from "@orchestra/daemon";

async function statusCommand(): Promise<void> {
  let token: string;
  try {
    token = await readToken();
  } catch {
    console.error("orchestra: no daemon token found — is the daemon running? (bun run daemon:dev)");
    process.exit(1);
  }

  try {
    const res = await fetch(`${DAEMON_BASE_URL}/ping`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error(`orchestra: daemon responded ${res.status}`);
      process.exit(1);
    }
    const body = (await res.json()) as { ok: boolean; pong: boolean; at: string };
    console.log(`orchestra: daemon reachable — ${body.at}`);
  } catch (err) {
    console.error("orchestra: daemon unreachable —", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const [, , command] = process.argv;

switch (command) {
  case "status":
    await statusCommand();
    break;
  default:
    console.log("usage: orchestra status");
    process.exit(command ? 1 : 0);
}
