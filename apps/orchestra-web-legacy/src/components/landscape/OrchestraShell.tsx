"use client";

import { useEffect, useMemo, useState } from "react";

import { AddProjectDialog } from "~/components/landscape/AddProjectDialog";
import { ConductorDesk } from "~/components/landscape/ConductorDesk";
import { LaneBoard } from "~/components/landscape/LaneBoard";
import { MonitorStrip } from "~/components/landscape/MonitorStrip";
import { StartWorkerDialog } from "~/components/landscape/StartWorkerDialog";
import { TrunkMap } from "~/components/landscape/TrunkMap";
import { OnboardingWizard } from "~/components/onboarding/OnboardingWizard";
import { fixtureTrunkScan } from "~/server/orchestra/fixtures";
import type {
  OrchestraRegistry,
  SyncLog,
  TrunkScanSnapshot,
} from "~/server/orchestra/schemas";
import { api } from "~/trpc/react";

type Props = {
  registry: OrchestraRegistry;
};

function upsertLog(prev: SyncLog[], next: SyncLog): SyncLog[] {
  const without = prev.filter((l) => l.workerSlug !== next.workerSlug);
  return [next, ...without].slice(0, 12);
}

export function OrchestraShell({ registry: initialRegistry }: Props) {
  const registryQuery = api.registry.list.useQuery(undefined, {
    initialData: initialRegistry,
  });
  const registry = registryQuery.data ?? initialRegistry;

  const onboardState = api.onboarding.state.useQuery();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showStartWorker, setShowStartWorker] = useState(false);
  const [repoId, setRepoId] = useState<string | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [focused, setFocused] = useState(true);
  const [useFixture, setUseFixture] = useState(true);

  useEffect(() => {
    if (onboardState.data && !onboardState.data.completedAt) {
      setShowOnboarding(true);
    }
  }, [onboardState.data]);

  // Prefer last opened project when the list first loads with entries.
  useEffect(() => {
    if (repoId || useFixture === false) return;
    if (registry.entries.length === 0) return;
    const sorted = [...registry.entries].sort((a, b) => {
      const at = a.lastOpenedAt ?? a.addedAt;
      const bt = b.lastOpenedAt ?? b.addedAt;
      return bt.localeCompare(at);
    });
    const pick = sorted[0];
    if (!pick) return;
    setRepoId(pick.id);
    setUseFixture(false);
  }, [registry.entries, repoId, useFixture]);

  useEffect(() => {
    setLogs([]);
  }, [repoId]);

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const pollMs = focused
    ? registry.defaults.pollMsFocused
    : registry.defaults.pollMsBlurred;

  const trunkQuery = api.scan.trunk.useQuery(
    { repoId: repoId! },
    {
      enabled: Boolean(repoId) && !useFixture,
      refetchInterval: pollMs,
    },
  );

  const fixture = useMemo(() => fixtureTrunkScan(), []);

  const emptySnapshot = useMemo((): TrunkScanSnapshot => {
    const entry = registry.entries.find((e) => e.id === repoId);
    return {
      schema: "orchestra.trunk_scan.v1",
      repoId: repoId ?? "00000000-0000-4000-8000-000000000000",
      repoSlug: entry?.slug ?? "none",
      displayName: entry?.displayName ?? "No project",
      baseBranch: "main",
      scannedAt: new Date().toISOString(),
      lanes: [],
    };
  }, [registry.entries, repoId]);

  const snapshot: TrunkScanSnapshot = useFixture
    ? fixture
    : (trunkQuery.data ?? emptySnapshot);

  function selectProject(next: string) {
    if (!next) {
      setRepoId(null);
      setUseFixture(true);
      return;
    }
    setRepoId(next);
    setUseFixture(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--color-ink)] text-white">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-6 py-2 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-white/55">
            <span>Project</span>
            <select
              className="border border-white/15 bg-black/40 px-2 py-1 text-white/85 outline-none"
              value={repoId ?? ""}
              onChange={(e) => selectProject(e.target.value)}
            >
              <option value="">Demo (fake branches)</option>
              {registry.entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowAddProject(true)}
            className="border border-[color:var(--color-petal)]/35 bg-[color:var(--color-petal)]/10 px-2 py-1 text-[10px] text-[color:var(--color-petal)] hover:bg-[color:var(--color-petal)]/20"
          >
            + Add project
          </button>
          <button
            type="button"
            disabled={!repoId || useFixture}
            onClick={() => setShowStartWorker(true)}
            className="border border-[color:var(--color-brass)]/40 bg-[color:var(--color-brass)]/10 px-2 py-1 text-[10px] text-[color:var(--color-brass)] hover:bg-[color:var(--color-brass)]/20 disabled:opacity-35"
          >
            + Start worker
          </button>
          {useFixture ? (
            <span className="text-[10px] tracking-wide text-[color:var(--color-petal)]">
              DEMO
            </span>
          ) : trunkQuery.isFetching ? (
            <span className="text-[10px] text-white/35">checking…</span>
          ) : (
            <span className="text-[10px] text-white/35">
              {registry.entries.length} project
              {registry.entries.length === 1 ? "" : "s"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowOnboarding(true)}
            className="border border-white/15 px-2 py-1 text-[10px] text-white/45 hover:text-white/70"
          >
            Setup
          </button>
        </div>
        <p className="hidden text-[10px] text-white/35 sm:block">
          refreshes every {Math.round(pollMs / 1000)}s
        </p>
      </div>

      <TrunkMap snapshot={snapshot} />
      <LaneBoard
        repoId={repoId}
        useFixture={useFixture}
        lanes={snapshot.lanes}
      />
      <MonitorStrip logs={logs} />
      <ConductorDesk
        repoId={repoId}
        useFixture={useFixture}
        onSyncLog={(log) => setLogs((prev) => upsertLog(prev, log))}
      />

      <OnboardingWizard
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onAnchored={(id) => {
          setRepoId(id);
          setUseFixture(false);
        }}
      />

      <AddProjectDialog
        open={showAddProject}
        onClose={() => setShowAddProject(false)}
        onAdded={(id) => {
          setRepoId(id);
          setUseFixture(false);
        }}
      />

      {repoId ? (
        <StartWorkerDialog
          open={showStartWorker}
          repoId={repoId}
          onClose={() => setShowStartWorker(false)}
          onCreated={() => {
            /* trunk poll + dialog invalidate refresh the map */
          }}
        />
      ) : null}
    </div>
  );
}
