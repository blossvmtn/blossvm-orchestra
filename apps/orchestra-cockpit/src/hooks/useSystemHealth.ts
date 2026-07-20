import { useCallback, useEffect, useRef, useState } from "react";
import { getSystemHealth, type SystemHealth } from "../lib/daemonClient";

export type HealthState = {
  health: SystemHealth | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Polls /system/health on the same visibility-aware cadence as the snapshot
 * (D37). Health changes slowly, so a slower default interval is fine; the
 * last good result is kept through a transient failure.
 */
export function useSystemHealth(intervalMs = 5000): HealthState {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setHealth(await getSystemHealth());
      setError(null);
    } catch (err) {
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

  return { health, error, loading, refresh };
}
