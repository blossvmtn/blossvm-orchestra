import { useEffect, useState } from "react";
import { pingDaemon } from "./lib/daemonClient";
import "./App.css";

type PingState =
  | { status: "checking" }
  | { status: "ok"; at: string }
  | { status: "error"; message: string };

function App() {
  const [ping, setPing] = useState<PingState>({ status: "checking" });

  useEffect(() => {
    pingDaemon()
      .then((result) => setPing({ status: "ok", at: result.at }))
      .catch((err: unknown) =>
        setPing({ status: "error", message: err instanceof Error ? err.message : String(err) }),
      );
  }, []);

  return (
    <main className="container">
      <h1>Orchestra</h1>
      <p className="subtitle">local conductor desk</p>
      {ping.status === "checking" && <p>checking daemon…</p>}
      {ping.status === "ok" && <p className="ok">daemon reachable — {ping.at}</p>}
      {ping.status === "error" && <p className="error">daemon unreachable — {ping.message}</p>}
    </main>
  );
}

export default App;
