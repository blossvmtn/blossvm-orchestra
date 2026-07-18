import { useEffect, useState } from "react";
import { pingDaemon, dispatchFixtureWorkIntent, getReceipt, type Receipt } from "./lib/daemonClient";
import "./App.css";

type PingState =
  | { status: "checking" }
  | { status: "ok"; at: string }
  | { status: "error"; message: string };

type DispatchState =
  | { status: "idle" }
  | { status: "dispatching" }
  | { status: "done"; receipt: Receipt }
  | { status: "error"; message: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function App() {
  const [ping, setPing] = useState<PingState>({ status: "checking" });
  const [dispatch, setDispatch] = useState<DispatchState>({ status: "idle" });

  useEffect(() => {
    pingDaemon()
      .then((result) => setPing({ status: "ok", at: result.at }))
      .catch((err: unknown) => setPing({ status: "error", message: errorMessage(err) }));
  }, []);

  async function handleDispatch() {
    setDispatch({ status: "dispatching" });
    try {
      // Spec §3.6's IPC path — the actual architecture bet Phase 0 exists to
      // de-risk: a real schema surviving the real Tauri<->Bun boundary, not
      // a simulated one. Two separate authenticated fetch() calls: dispatch,
      // then a genuinely distinct read of the resulting Receipt.
      const dispatched = await dispatchFixtureWorkIntent();
      const receipt = await getReceipt(dispatched.receiptId);
      setDispatch({ status: "done", receipt });
    } catch (err: unknown) {
      setDispatch({ status: "error", message: errorMessage(err) });
    }
  }

  return (
    <main className="container">
      <h1>Orchestra</h1>
      <p className="subtitle">local conductor desk</p>
      {ping.status === "checking" && <p>checking daemon…</p>}
      {ping.status === "ok" && <p className="ok">daemon reachable — {ping.at}</p>}
      {ping.status === "error" && <p className="error">daemon unreachable — {ping.message}</p>}

      <button onClick={() => void handleDispatch()} disabled={dispatch.status === "dispatching"}>
        {dispatch.status === "dispatching" ? "Dispatching…" : "Dispatch fixture work intent"}
      </button>

      {dispatch.status === "error" && <p className="error">dispatch failed — {dispatch.message}</p>}
      {dispatch.status === "done" && (
        <section>
          <h2>Receipt</h2>
          <p>outcome: {dispatch.receipt.outcome}</p>
          <p>verification: {dispatch.receipt.verification}</p>
          <p>summary: {dispatch.receipt.summary}</p>
        </section>
      )}
    </main>
  );
}

export default App;
