import { useCallback, useEffect, useRef, useState } from "react";
import { getStateSnapshot, type StateSnapshot } from "../lib/daemonClient";

export type SnapshotState = {
  snapshot: StateSnapshot | null;
  /** Last error message; the previous good snapshot is kept alongside it. */
  error: string | null;
  /** True when we have a snapshot but the most recent refresh failed. */
  stale: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Phase 3A polling model (D37): fetch on mount, then every `intervalMs` while
 * the document is visible; stop when hidden; never overlap requests; keep the
 * last good snapshot through a transient failure and surface it as `stale`.
 * Callers also call `refresh()` immediately after any mutation. No WebSockets/SSE.
 */
export function useOrchestraSnapshot(intervalMs = 2000): SnapshotState {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // prevent overlapping requests
    inFlight.current = true;
    try {
      const next = await getStateSnapshot();
      setSnapshot(next);
      setError(null);
    } catch (err) {
      // Keep the last good snapshot — only record the error (drives `stale`).
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      void refresh();
      timer = setInterval(() => void refresh(), intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, intervalMs]);

  return { snapshot, error, stale: error !== null && snapshot !== null, loading, refresh };
}
