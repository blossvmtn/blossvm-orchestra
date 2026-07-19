import { useEffect, useState } from "react";
import {
  pingDaemon,
  dispatchFixtureWorkIntent,
  getReceipt,
  pickRepoFolder,
  registerRepo,
  submitWorkIntent,
  type Receipt,
  type Repo,
} from "./lib/daemonClient";
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

type RepoState =
  | { status: "none" }
  | { status: "registering" }
  | { status: "registered"; repo: Repo }
  | { status: "error"; message: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function App() {
  const [ping, setPing] = useState<PingState>({ status: "checking" });
  const [dispatch, setDispatch] = useState<DispatchState>({ status: "idle" });
  const [repo, setRepo] = useState<RepoState>({ status: "none" });
  const [intent, setIntent] = useState("");

  useEffect(() => {
    pingDaemon()
      .then((result) => setPing({ status: "ok", at: result.at }))
      .catch((err: unknown) => setPing({ status: "error", message: errorMessage(err) }));
  }, []);

  async function handleRegisterRepo() {
    setRepo({ status: "registering" });
    try {
      const rootPath = await pickRepoFolder();
      if (!rootPath) {
        setRepo({ status: "none" });
        return;
      }
      const registered = await registerRepo(rootPath);
      setRepo({ status: "registered", repo: registered });
    } catch (err: unknown) {
      setRepo({ status: "error", message: errorMessage(err) });
    }
  }

  // Phase 1 spec §1, D24: the UI stays exactly this minimal — folder picker,
  // intent text, dispatch. TaskSpec fields the UI doesn't expose (allowed/
  // forbiddenPaths, a custom slug/branch/role) get plain derived defaults;
  // real fence testing during the acceptance walk goes through a direct API
  // call with a narrower TaskSpec, not this form — no new form fields, that
  // would front-run P3's actual design pass.
  async function handleDispatch() {
    if (repo.status !== "registered") return;
    setDispatch({ status: "dispatching" });
    try {
      const slug = `lane-${Date.now()}`;
      const dispatched = await submitWorkIntent({
        repoSlug: repo.repo.slug,
        intent,
        taskSpec: {
          slug,
          branch: `orch/${slug}`,
          role: "Worker",
          allowedPaths: [],
          forbiddenPaths: [],
          acceptance: [],
        },
      });
      const receipt = await getReceipt(dispatched.receiptId);
      setDispatch({ status: "done", receipt });
    } catch (err: unknown) {
      setDispatch({ status: "error", message: errorMessage(err) });
    }
  }

  async function handleDispatchFixture() {
    setDispatch({ status: "dispatching" });
    try {
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

      <section>
        <h2>Repo</h2>
        <button onClick={() => void handleRegisterRepo()} disabled={repo.status === "registering"}>
          {repo.status === "registering" ? "Registering…" : "Register repo"}
        </button>
        {repo.status === "registered" && (
          <p className="ok">
            registered: {repo.repo.slug} — {repo.repo.rootPath}
          </p>
        )}
        {repo.status === "error" && <p className="error">registration failed — {repo.message}</p>}
      </section>

      <section>
        <h2>Dispatch a real work intent</h2>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Describe the work…"
          rows={4}
        />
        <button
          onClick={() => void handleDispatch()}
          disabled={repo.status !== "registered" || intent.trim().length === 0 || dispatch.status === "dispatching"}
        >
          {dispatch.status === "dispatching" ? "Dispatching…" : "Dispatch"}
        </button>
      </section>

      <section>
        <h2>Or dispatch the Phase 0 fixture</h2>
        <button onClick={() => void handleDispatchFixture()} disabled={dispatch.status === "dispatching"}>
          {dispatch.status === "dispatching" ? "Dispatching…" : "Dispatch fixture work intent"}
        </button>
      </section>

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
