import { useState, type CSSProperties, type KeyboardEvent } from "react";
import type { StateSnapshot, RiskTier } from "../../lib/daemonClient";
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

// Risk tiers R0…R4 escalate green → red; the meter lights every segment up to
// the chosen tier, matching the Paper composer board (9I-0).
const TIERS: RiskTier[] = ["R0", "R1", "R2", "R3", "R4"];
const TIER_COLOR: Record<RiskTier, string> = {
  R0: "#6FC28C",
  R1: "#D9B24A",
  R2: "#D98B5A",
  R3: "#C77A6C",
  R4: "#B0736C",
};
const ROLES = ["Worker", "Reviewer", "Architect", "Clerk"];
const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

/** Split a comma/whitespace list into clean glob entries. */
function splitPaths(raw: string): string[] {
  return raw.split(/[\s,]+/).map((p) => p.trim()).filter((p) => p.length > 0);
}

const fieldBox: CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 34,
  padding: "0 11px",
  borderRadius: 7,
  background: "#0E1218",
  border: "1px solid #232B36",
  color: "#E9E4DA",
  fontFamily: SANS,
  fontSize: 12.5,
  outline: "none",
};

function laneVar(color: string): CSSProperties {
  return { "--lane-color": color } as unknown as CSSProperties;
}
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function DeskView({ snapshot, lanes, scope, refresh, loading, error }: Props) {
  const [intent, setIntent] = useState("");
  const [role, setRole] = useState("Worker");
  const [branch, setBranch] = useState("");
  const [riskTier, setRiskTier] = useState<RiskTier>("R1");
  const [allowed, setAllowed] = useState<string[]>([]);
  const [forbidden, setForbidden] = useState<string[]>([]);
  const [allowedDraft, setAllowedDraft] = useState("");
  const [forbiddenDraft, setForbiddenDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");

  const hasRepo = scope !== null;
  const selected = lanes.find((l) => l.workIntent.id === selectedId) ?? null;

  const branchName = branch.trim() ? (branch.startsWith("orch/") ? branch.trim() : `orch/${branch.trim()}`) : "";
  const laneSlug = (branchName || `orch/lane-${Date.now()}`).split("/").pop()!.replace(/[^\w.-]/g, "-");

  function addPath(which: "allowed" | "forbidden") {
    const draft = which === "allowed" ? allowedDraft : forbiddenDraft;
    const next = splitPaths(draft);
    if (next.length === 0) return;
    if (which === "allowed") { setAllowed((p) => [...new Set([...p, ...next])]); setAllowedDraft(""); }
    else { setForbidden((p) => [...new Set([...p, ...next])]); setForbiddenDraft(""); }
  }
  const onPathKey = (which: "allowed" | "forbidden") => (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addPath(which); }
  };
  const removePath = (which: "allowed" | "forbidden", p: string) =>
    which === "allowed" ? setAllowed((a) => a.filter((x) => x !== p)) : setForbidden((a) => a.filter((x) => x !== p));

  const renderFence = (
    label: string,
    color: string,
    items: string[],
    draft: string,
    setDraft: (v: string) => void,
    which: "allowed" | "forbidden",
  ) => (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px", borderRadius: 9, background: "rgba(20,26,24,0.42)", border: "1px solid rgba(150,168,150,0.14)" }}>
      <span style={{ fontFamily: SANS, fontWeight: 500, fontSize: 10, letterSpacing: "0.13em", textTransform: "uppercase", color }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
        {items.map((p) => (
          <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 7px", borderRadius: 5, border: "1px solid #2A3340", fontFamily: MONO, fontSize: 11, color: "#C7CDD4" }}>
            {p}
            <span onClick={() => removePath(which, p)} title="Remove" style={{ cursor: "pointer", color: "#667080" }}>✕</span>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onPathKey(which)}
          onBlur={() => addPath(which)}
          placeholder={items.length ? "add…" : "glob, ⏎ to add"}
          aria-label={label}
          style={{ flex: "1 1 90px", minWidth: 70, background: "transparent", border: "none", outline: "none", color: "#C7CDD4", fontFamily: MONO, fontSize: 11 }}
        />
      </div>
    </div>
  );

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
    const slug = laneSlug || `lane-${Date.now()}`;
    void run("dispatch", async () => {
      await submitWorkIntent({
        repoSlug: scope,
        intent: intent.trim(),
        taskSpec: {
          slug,
          branch: branchName || `orch/${slug}`,
          role,
          riskTier,
          allowedPaths: allowed,
          forbiddenPaths: forbidden,
          acceptance: [],
        },
      });
      setIntent("");
      setBranch("");
      setAllowed([]);
      setForbidden([]);
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

              {/* Role · Lane slug · Risk tier */}
              <div style={{ display: "flex", gap: 10 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 0 }}>
                  <span className="field-label">Role</span>
                  <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...fieldBox, appearance: "none" }}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1.5, minWidth: 0 }}>
                  <span className="field-label">Lane slug</span>
                  <input
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="orch/short-name (auto if blank)"
                    aria-label="Lane branch"
                    style={{ ...fieldBox, fontFamily: MONO, fontSize: 12 }}
                  />
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 150, flexShrink: 0 }}>
                  <span className="field-label">Risk tier</span>
                  <div style={{ ...fieldBox, gap: 7, cursor: "default" }}>
                    <div style={{ display: "flex", gap: 3 }}>
                      {TIERS.map((t) => {
                        const lit = TIERS.indexOf(t) <= TIERS.indexOf(riskTier);
                        return (
                          <button
                            key={t}
                            onClick={() => setRiskTier(t)}
                            title={t}
                            aria-label={`Risk ${t}`}
                            style={{ width: 14, height: 5, borderRadius: 2, border: "none", padding: 0, cursor: "pointer", background: lit ? TIER_COLOR[t] : "#2A3340" }}
                          />
                        );
                      })}
                    </div>
                    <span style={{ marginLeft: "auto", fontFamily: MONO, fontWeight: 500, fontSize: 11.5, color: TIER_COLOR[riskTier] }}>{riskTier}</span>
                  </div>
                </div>
              </div>

              {/* Fences */}
              <div style={{ display: "flex", gap: 10 }}>
                {renderFence("Allowed paths", "#5E97A0", allowed, allowedDraft, setAllowedDraft, "allowed")}
                {renderFence("Forbidden paths", "#B0736C", forbidden, forbiddenDraft, setForbiddenDraft, "forbidden")}
              </div>

              {/* Preflight + dispatch */}
              <div className="row">
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span className="field-label">Preflight</span>
                  <span className="mono dim" style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {branchName || `orch/${laneSlug}`} · {role} · {riskTier} · {allowed.length} allowed / {forbidden.length} forbidden
                  </span>
                </div>
                <div className="spacer" />
                <button className="btn btn-ghost" onClick={onFixture} disabled={busy !== null}>
                  {busy === "fixture" ? "…" : "fixture"}
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
