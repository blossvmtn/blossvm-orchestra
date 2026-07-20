import { useMemo, useState, type CSSProperties } from "react";
import { useOrchestraSnapshot } from "../hooks/useOrchestraSnapshot";
import { useSystemHealth } from "../hooks/useSystemHealth";
import { toLanes } from "../lib/snapshotViewModel";
import { LeftRail } from "../components/LeftRail";
import { SystemBar } from "../components/SystemBar";
import { DeskView } from "../features/desk/DeskView";
import { TrunkView } from "../features/lanes/TrunkView";
import { SystemView } from "../features/system/SystemView";
import { ErrorBoundary } from "../components/ErrorBoundary";
import heroUrl from "../assets/hero-dark-blossom.jpg";
import "../styles/tokens.css";
import "../styles/shell.css";

export type View = "desk" | "lanes" | "repositories" | "review" | "system";

export function AppShell() {
  const snap = useOrchestraSnapshot();
  const health = useSystemHealth();
  const [view, setView] = useState<View>("desk");
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const snapshot = snap.snapshot;
  const repos = useMemo(() => snapshot?.repos ?? [], [snapshot]);
  const scope = selectedRepo ?? repos[0]?.slug ?? null;
  const lanes = useMemo(() => (snapshot ? toLanes(snapshot) : []), [snapshot]);

  const shellStyle = { "--hero": `url(${heroUrl})` } as unknown as CSSProperties;

  return (
    <div className="shell" style={shellStyle}>
      <LeftRail
        view={view}
        onView={setView}
        repos={repos}
        scope={scope}
        onScope={setSelectedRepo}
        health={health.health}
        laneCount={lanes.length}
      />
      <main className="main">
        <SystemBar view={view} snap={snap} />
        <ErrorBoundary key={view}>
        {view === "desk" && (
          <div className="view">
            <DeskView
              snapshot={snapshot}
              lanes={lanes}
              scope={scope}
              refresh={snap.refresh}
              loading={snap.loading}
              error={snap.error}
            />
          </div>
        )}
        {view === "lanes" && (
          <div className="view">
            <TrunkView scope={scope} />
          </div>
        )}
        {view === "system" && (
          <div className="view">
            <SystemView {...health} />
          </div>
        )}
        {view !== "desk" && view !== "lanes" && view !== "system" && (
          <div className="view placeholder">
            <p>{view} — wired next; the Desk, Trunk map, and System are live.</p>
          </div>
        )}
        </ErrorBoundary>
      </main>
    </div>
  );
}
