import type { View } from "../app/AppShell";
import type { SnapshotState } from "../hooks/useOrchestraSnapshot";

type Props = { view: View; snap: SnapshotState };

const SUBTITLE: Partial<Record<View, string>> = {
  desk: "Compose a lane, watch it run, promote it.",
  system: "Measured reality — only what's actually reachable.",
};

export function SystemBar({ view, snap }: Props) {
  let label = "live";
  let cls = "dot-ok";
  if (snap.error && snap.snapshot) {
    label = "stale — retrying";
    cls = "dot-warn";
  } else if (snap.error) {
    label = "daemon unreachable";
    cls = "dot-bad";
  } else if (snap.loading && !snap.snapshot) {
    label = "connecting…";
    cls = "dot-warn";
  }

  return (
    <header className="systembar">
      <div>
        <span className="systembar-title">{view}</span>
        {SUBTITLE[view] ? <span className="systembar-sub">{SUBTITLE[view]}</span> : null}
      </div>
      <div className="freshness">
        <span className={`dot ${cls}`} />
        <span>{label}</span>
      </div>
    </header>
  );
}
