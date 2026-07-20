import { useEffect, useMemo, useState } from "react";
import { getTrunkScan, type TrunkScan } from "../../lib/daemonClient";
import { layoutGraph } from "../../lib/gitGraph";
import { GraphRail } from "./GraphRail";

const ROW_H = 50;

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

export function TrunkView({ scope }: { scope: string | null }) {
  const [scan, setScan] = useState<TrunkScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);

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
  const tipBadge = useMemo(() => {
    const m = new Map<string, { name: string; status?: string; isBase: boolean }>();
    for (const b of scan?.branches ?? []) {
      const tip = b.commits[0]?.sha;
      if (tip && !m.has(tip)) m.set(tip, { name: b.name, status: b.status, isBase: b.isBase });
    }
    return m;
  }, [scan]);

  const maxLane = rows.reduce((m, r) => Math.max(m, r.laneCount), 1);
  const selected = selectedSha ? commitsBySha.get(selectedSha) ?? null : null;
  const selectedRow = rows.find((r) => r.sha === selectedSha) ?? null;

  if (!scope) return <div className="empty">Register and select a repository to see its history.</div>;

  return (
    <div className="trunk">
      <div className="trunk-list panel">
        <div className="panel-head">
          <span className="panel-title mono">
            {scan?.repoSlug ?? scope} · {scan?.commits.length ?? 0} commits
          </span>
          <span className="mono dim" style={{ fontSize: 10.5 }}>
            base {scan?.base ?? "…"} · git log --all
          </span>
        </div>
        <div className="trunk-rows">
          {loading && !scan ? <div className="empty">scanning history…</div> : null}
          {error ? <div className="empty err">trunk scan failed — {error}</div> : null}
          {scan && rows.length === 0 ? <div className="empty">No commits yet.</div> : null}
          {rows.map((row) => {
            const commit = commitsBySha.get(row.sha);
            const badge = tipBadge.get(row.sha);
            const active = row.sha === selectedSha;
            return (
              <button
                key={row.sha}
                className={`trunk-row ${active ? "is-active" : ""}`}
                style={{ ["--lane-color" as string]: row.nodeColor } as React.CSSProperties}
                onClick={() => setSelectedSha(row.sha)}
              >
                <GraphRail row={row} rowHeight={ROW_H} maxLaneCount={maxLane} active={active} />
                <div className="trunk-main">
                  <span className="lane-intent">{commit?.subject ?? row.sha.slice(0, 8)}</span>
                  <span className="trunk-meta">
                    <span className="mono" style={{ color: row.nodeColor }}>
                      {commit?.shortSha ?? row.sha.slice(0, 7)}
                    </span>
                    <span className="mono dim">
                      {commit?.author ?? "—"} · {commit ? relTime(commit.committedAt) : ""}
                    </span>
                  </span>
                </div>
                {badge ? (
                  <span className="pill" style={{ color: row.nodeColor }}>
                    <span className="dot" style={{ background: row.nodeColor }} />
                    {badge.name}
                    {badge.status ? ` · ${badge.status}` : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <aside className="trunk-inspector panel">
        {selected ? (
          <>
            <div className="panel-head">
              <span className="field-label">Commit</span>
              {tipBadge.get(selected.sha) ? (
                <span className="mono dim" style={{ fontSize: 11 }}>
                  {tipBadge.get(selected.sha)?.name}
                </span>
              ) : null}
            </div>
            <div className="composer-body">
              <div className="row">
                <span className="mono" style={{ fontSize: 17, color: selectedRow?.nodeColor ?? "var(--ink)" }}>
                  {selected.shortSha}
                </span>
                <span className="mono dim" style={{ fontSize: 11 }}>
                  {selected.parents.length === 0
                    ? "root"
                    : `parent ${selected.parents.map((p) => p.slice(0, 7)).join(", ")}`}
                </span>
              </div>
              <span className="lane-intent" style={{ whiteSpace: "normal", fontSize: 14.5 }}>
                {selected.subject}
              </span>
              <span className="mono dim" style={{ fontSize: 11.5 }}>
                {selected.author} · {relTime(selected.committedAt)}
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
