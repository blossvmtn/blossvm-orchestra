import { useEffect, useState } from "react";
import {
  pingDaemon,
  dispatchFixtureWorkIntent,
  getReceipt,
  pickRepoFolder,
  registerRepo,
  runStackedAction,
  submitWorkIntent,
  type Receipt,
  type Repo,
  type StackedActionResponse,
} from "./lib/daemonClient";
import "./App.css";

type PingState =
  | { status: "checking" }
  | { status: "ok"; at: string }
  | { status: "error"; message: string };

type DispatchState =
  | { status: "idle" }
  | { status: "dispatching" }
  // worktreeId is undefined for the fixture-dispatch path (no real worktree
  // gets created) — the "Push & Open PR" button only ever shows once it's set.
  | { status: "done"; receipt: Receipt; worktreeId?: string }
  | { status: "error"; message: string };

type StackedActionState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: StackedActionResponse }
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
  const [stackedAction, setStackedAction] = useState<StackedActionState>({ status: "idle" });
  const [commitMessage, setCommitMessage] = useState("");

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
    setStackedAction({ status: "idle" });
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
      setDispatch({ status: "done", receipt, worktreeId: dispatched.worktreeId });
      // Prefill, not lock — D27's cockpit responsibility to supply a
      // message when the tree is dirty (spec §2's runStackedAction); JD
      // can still edit it before clicking "Push & Open PR".
      setCommitMessage(receipt.summary);
    } catch (err: unknown) {
      setDispatch({ status: "error", message: errorMessage(err) });
    }
  }

  async function handleDispatchFixture() {
    setDispatch({ status: "dispatching" });
    setStackedAction({ status: "idle" });
    try {
      const dispatched = await dispatchFixtureWorkIntent();
      const receipt = await getReceipt(dispatched.receiptId);
      setDispatch({ status: "done", receipt });
    } catch (err: unknown) {
      setDispatch({ status: "error", message: errorMessage(err) });
    }
  }

  // D27 — always an explicit click, never automatic after dispatch.
  async function handleStackedAction() {
    if (dispatch.status !== "done" || !dispatch.worktreeId) return;
    setStackedAction({ status: "running" });
    try {
      const result = await runStackedAction(dispatch.worktreeId, ["commit", "push", "pr"], commitMessage);
      setStackedAction({ status: "done", result });
    } catch (err: unknown) {
      setStackedAction({ status: "error", message: errorMessage(err) });
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

      {dispatch.status === "done" && dispatch.worktreeId && (
        <section>
          <h2>Push &amp; open PR</h2>
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message…"
            rows={2}
          />
          <button
            onClick={() => void handleStackedAction()}
            disabled={stackedAction.status === "running"}
          >
            {stackedAction.status === "running" ? "Pushing…" : "Push & Open PR"}
          </button>
          {stackedAction.status === "error" && (
            <p className="error">stacked action failed — {stackedAction.message}</p>
          )}
          {stackedAction.status === "done" && (
            <div>
              {stackedAction.result.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              {stackedAction.result.prUrl && (
                <p className="ok">
                  <a href={stackedAction.result.prUrl} target="_blank" rel="noreferrer">
                    {stackedAction.result.prUrl}
                  </a>
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default App;
