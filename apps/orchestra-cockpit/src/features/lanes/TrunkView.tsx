import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { getTrunkScan, type TrunkScan } from "../../lib/daemonClient";
import { layoutGraph } from "../../lib/gitGraph";
import { GraphRail } from "./GraphRail";

const ROW_H = 58;

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** #rrggbb → rgba() so lane colors can drive translucent washes. */
function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function rowBg(active: boolean, focused: boolean, color: string): string {
  if (active) return `linear-gradient(90deg, rgba(221,159,176,0.11), ${rgba(color, 0.05)} 42%, rgba(0,0,0,0) 78%)`;
  if (focused) return `linear-gradient(90deg, ${rgba(color, 0.08)}, rgba(0,0,0,0) 60%)`;
  return "transparent";
}

export function TrunkView({ scope }: { scope: string | null }) {
  const [scan, setScan] = useState<TrunkScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [focusedBranch, setFocusedBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!scope) {
      setScan(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTrunkScan(scope)
      .then((s) => !cancelled && (setScan(s), setLoading(false)))
      .catch((e) => !cancelled && (setError(e instanceof Error ? e.message : String(e)), setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const rows = useMemo(() => layoutGraph(scan?.commits ?? []).rows, [scan]);
  const commitsBySha = useMemo(() => new Map((scan?.commits ?? []).map((c) => [c.sha, c])), [scan]);
  const branchStatus = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of scan?.branches ?? []) if (b.status) m.set(b.name, b.status);
    return m;
  }, [scan]);
  const focusedShas = useMemo(() => {
    if (!focusedBranch) return null;
    const b = scan?.branches.find((x) => x.name === focusedBranch);
    const s = new Set<string>();
    for (const c of b?.commits ?? []) s.add(c.sha);
    return s;
  }, [scan, focusedBranch]);

  const maxLane = rows.reduce((m, r) => Math.max(m, r.laneCount), 1);
  const selected = selectedSha ? commitsBySha.get(selectedSha) ?? null : null;
  const selectedRow = rows.find((r) => r.sha === selectedSha) ?? null;
  const selectedColor = selectedRow?.nodeColor ?? "#79b7bd";

  if (!scope) return <div className="empty">Register and select a repository to see its history.</div>;

  return (
    <div className="trunk">
      <div className="trunk-list">
        {focusedBranch ? (
          <div className="trunk-head">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span className="dot" style={{ background: "#79b7bd", boxShadow: "0 0 8px rgba(121,183,189,0.7)" }} />
              <span className="mono" style={{ fontSize: 11, fontWeight: 500, color: "#a9cdce" }}>focused · {focusedBranch}</span>
            </div>
            <button className="linkbtn" onClick={() => setFocusedBranch(null)}>show all lanes ✕</button>
          </div>
        ) : (
          <div className="trunk-head">
            <span className="mono" style={{ fontSize: 11, fontWeight: 500, color: "#c7cdc7" }}>
              {scan?.repoSlug ?? scope} · {scan?.commits.length ?? 0} commits
            </span>
            <span className="mono" style={{ fontSize: 10.5, color: "#7c8a80" }}>
              base {scan?.base ?? "…"} · click a branch to focus
            </span>
          </div>
        )}

        <div className="trunk-rows">
          {loading && !scan ? <div className="empty">scanning history…</div> : null}
          {error ? <div className="empty err">trunk scan failed — {error}</div> : null}
          {scan && rows.length === 0 ? <div className="empty">No commits yet.</div> : null}
          {rows.map((row) => {
            const commit = commitsBySha.get(row.sha);
            const active = row.sha === selectedSha;
            const inFocus = focusedShas != null && focusedShas.has(row.sha);
            const dimmed = focusedShas != null && !focusedShas.has(row.sha);
            const refs = commit?.refs ?? [];
            return (
              <button
                key={row.sha}
                className="trunk-row"
                style={{ opacity: dimmed ? 0.46 : 1, backgroundImage: rowBg(active, inFocus, row.nodeColor) }}
                onClick={() => setSelectedSha(row.sha)}
              >
                <GraphRail row={row} rowHeight={ROW_H} maxLaneCount={maxLane} active={active} />
                <div className="trunk-main">
                  <span className="trunk-subject" style={{ color: dimmed ? "#c9cfd4" : "#f2ece2" }}>
                    {commit?.subject ?? row.sha.slice(0, 8)}
                  </span>
                  <div className="trunk-meta">
                    <span className="mono" style={{ fontSize: 11, fontWeight: 500, color: row.nodeColor }}>
                      {commit?.shortSha ?? row.sha.slice(0, 7)}
                    </span>
                    <span className="mono" style={{ fontSize: 10.5, color: "#7c8a80" }}>
                      {commit?.author ?? "—"} · {commit ? relTime(commit.committedAt) : ""}
                    </span>
                  </div>
                </div>
                {refs.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {refs.map((ref) => (
                      <span
                        key={ref}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setFocusedBranch((cur) => (cur === ref ? null : ref));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setFocusedBranch((cur) => (cur === ref ? null : ref));
                          }
                        }}
                        title="Focus this branch"
                        style={{
                          color: row.nodeColor,
                          background: rgba(row.nodeColor, 0.13),
                          borderRadius: 8,
                          padding: "4px 10px",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10.5,
                          cursor: "pointer",
                        }}
                      >
                        {ref}
                        {branchStatus.get(ref) ? ` · ${branchStatus.get(ref)}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Commit inspector */}
      <aside className="trunk-inspector">
        {selected ? (
          <>
            <div className="insp-head">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="eyebrow">Commit</span>
                {refsChip(selected.refs, selectedColor)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="mono" style={{ fontSize: 19, fontWeight: 600, letterSpacing: "0.02em", color: "#e9e4da" }}>
                  {selected.shortSha}
                </span>
                <span className="mono" style={{ fontSize: 11, color: "#5a6472" }}>
                  {selected.parents.length === 0 ? "root" : `parent ${selected.parents[0]?.slice(0, 7)}`}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 14.5, fontWeight: 500, lineHeight: "145%", color: "#dde2e7" }}>
                {selected.subject}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#e6b2c0,#d9bc8e)" }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#9ba6b2" }}>{selected.author}</span>
                <span className="mono" style={{ fontSize: 11, color: "#667080" }}>{relTime(selected.committedAt)}</span>
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <div className="insp-foot">
              <div className="insp-diffbtn">View full diff</div>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, lineHeight: "140%", color: "#5a6472" }}>
                Per-file diffs come from a read-only <span className="mono" style={{ fontSize: 10.5 }}>git show</span> scan — the
                next slice. History here is a <span className="mono" style={{ fontSize: 10.5 }}>git log</span> scan.
              </span>
            </div>
          </>
        ) : (
          <div className="empty">Select a commit to inspect it.</div>
        )}
      </aside>
    </div>
  );
}

function refsChip(refs: string[], color: string) {
  if (refs.length === 0) return null;
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "4px 10px",
    borderRadius: 6,
    background: rgba(color, 0.14),
    border: `1px solid ${rgba(color, 0.3)}`,
  };
  return (
    <span style={style}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span className="mono" style={{ fontSize: 11, fontWeight: 500, color }}>{refs[0]}</span>
    </span>
  );
}
