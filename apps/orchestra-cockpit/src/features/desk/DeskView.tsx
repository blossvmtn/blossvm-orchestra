import { useState, type CSSProperties } from "react";
import type { StateSnapshot } from "../../lib/daemonClient";
import {
  pickRepoFolder,
  registerRepo,
  submitWorkIntent,
  dispatchFixtureWorkIntent,
  runStackedAction,
} from "../../lib/daemonClient";
import { laneStatus, type Lane, type LaneStatus } from "../../lib/snapshotViewModel";

type Props = {
  snapshot: StateSnapshot | null;
  lanes: Lane[];
  scope: string | null;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string | null;
};

const STATUS_COLOR: Record<LaneStatus, string> = {
  queued: "var(--status-queued)",
  running: "var(--status-running)",
  blocked: "var(--status-blocked)",
  succeeded: "var(--status-succeeded)",
  failed: "var(--status-failed)",
  cancelled: "var(--status-cancelled)",
  pr_open: "var(--status-pr)",
};
const STATUS_LABEL: Record<LaneStatus, string> = {
  queued: "queued",
  running: "running",
  blocked: "blocked",
  succeeded: "succeeded",
  failed: "failed",
  cancelled: "cancelled",
  pr_open: "PR open",
};

function laneVar(color: string): CSSProperties {
  return { "--lane-color": color } as unknown as CSSProperties;
}
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function DeskView({ snapshot, lanes, scope, refresh, loading, error }: Props) {
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");

  const hasRepo = scope !== null;
  const selected = lanes.find((l) => l.workIntent.id === selectedId) ?? null;

  async function run(tag: string, fn: () => Promise<unknown>) {
    setBusy(tag);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  const onRegister = () =>
    run("register", async () => {
      const path = await pickRepoFolder();
      if (path) await registerRepo(path);
    });

  const onDispatch = () => {
    if (!scope || intent.trim().length === 0) return;
    const slug = `lane-${Date.now()}`;
    void run("dispatch", async () => {
      await submitWorkIntent({
        repoSlug: scope,
        intent: intent.trim(),
        taskSpec: { slug, branch: `orch/${slug}`, role: "Worker", allowedPaths: [], forbiddenPaths: [], acceptance: [] },
      });
      setIntent("");
    });
  };

  const onFixture = () => void run("fixture", () => dispatchFixtureWorkIntent());

  const onPush = (lane: Lane) => {
    if (!lane.worktree) return;
    const worktreeId = lane.worktree.id;
    const message = commitMessage.trim() || lane.receipt?.summary || "orchestra: promote lane";
    void run("push", () => runStackedAction(worktreeId, ["commit", "push", "pr"], message));
  };

  return (
    <div className="desk">
      {/* Composer */}
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">New work intent</span>
          <span className="mono dim" style={{ fontSize: 11 }}>
            {hasRepo ? `→ ${scope}` : "no repo registered"} · Claude Code
          </span>
        </div>
        <div className="composer-body">
          {hasRepo ? (
            <>
              <span className="field-label">Intent</span>
              <textarea
                className="intent-input"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Describe the work — one intent becomes one fenced worktree lane…"
                aria-label="Work intent"
              />
              <div className="row">
                <span className="mono dim" style={{ fontSize: 11.5 }}>
                  into · {scope}
                </span>
                <div className="spacer" />
                <button className="btn btn-ghost" onClick={onFixture} disabled={busy !== null}>
                  {busy === "fixture" ? "Dispatching…" : "Dispatch fixture"}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={onDispatch}
                  disabled={busy !== null || intent.trim().length === 0}
                >
                  {busy === "dispatch" ? "Dispatching…" : "Dispatch lane →"}
                </button>
              </div>
            </>
          ) : (
            <div className="row">
              <span className="dim">Register a repository to start dispatching lanes.</span>
              <div className="spacer" />
              <button className="btn btn-primary" onClick={onRegister} disabled={busy !== null}>
                {busy === "register" ? "Registering…" : "Register repository"}
              </button>
            </div>
          )}
          {actionError ? <span className="err">{actionError}</span> : null}
        </div>
      </section>

      {/* Lanes */}
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">Active &amp; recent lanes</span>
          <span className="mono dim" style={{ fontSize: 11 }}>
            {lanes.length}
          </span>
        </div>
        <div className="composer-body">
          {!snapshot && loading ? <div className="empty">connecting to the daemon…</div> : null}
          {error && !snapshot ? <div className="empty err">daemon unreachable — {error}</div> : null}
          {snapshot && lanes.length === 0 ? (
            <div className="empty">No lanes yet. Dispatch one above to begin.</div>
          ) : null}
          <div className="lanes">
            {lanes.map((lane) => {
              const status = laneStatus(lane);
              const color = STATUS_COLOR[status];
              return (
                <button
                  key={lane.workIntent.id}
                  className="lane"
                  style={laneVar(color)}
                  onClick={() => {
                    setSelectedId(lane.workIntent.id);
                    setCommitMessage(lane.receipt?.summary ?? "");
                  }}
                >
                  <div className="lane-main">
                    <span className="lane-intent">{lane.workIntent.intent}</span>
                    <span className="lane-branch">
                      {scope ?? "—"} · {lane.taskSpec?.branch ?? lane.workIntent.status}
                    </span>
                  </div>
                  <span className="pill" style={{ color }}>
                    <span className="dot" style={{ background: color }} />
                    {STATUS_LABEL[status]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Selected lane detail */}
      {selected ? (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">{selected.workIntent.intent}</span>
            <span className="mono dim" style={{ fontSize: 11 }}>
              {laneStatus(selected)}
            </span>
          </div>
          <div className="composer-body">
            <div className="row">
              <span className="mono dim">receipt</span>
              <span className="mono">
                {selected.receipt ? `${selected.receipt.outcome} · verify ${selected.receipt.verification}` : "pending"}
              </span>
            </div>
            {selected.worktree ? (
              <>
                <span className="field-label">Commit message</span>
                <textarea
                  className="intent-input"
                  style={{ minHeight: 52 }}
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  aria-label="Commit message"
                />
                <div className="row">
                  <span className="mono dim" style={{ fontSize: 11 }}>
                    {selected.worktree.path}
                  </span>
                  <div className="spacer" />
                  <button
                    className="btn btn-primary"
                    onClick={() => onPush(selected)}
                    disabled={busy !== null || !selected.receipt}
                  >
                    {busy === "push" ? "Pushing…" : "Push & Open PR"}
                  </button>
                </div>
                {selected.worktree.prUrl ? (
                  <a className="mono" href={selected.worktree.prUrl} target="_blank" rel="noreferrer">
                    {selected.worktree.prUrl}
                  </a>
                ) : null}
              </>
            ) : (
              <span className="dim">This lane has no worktree (fixture dispatch) — nothing to promote.</span>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
