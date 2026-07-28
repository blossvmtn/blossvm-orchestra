import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFileAtlasSnapshot,
  type FileAtlasSnapshot,
} from "../lib/daemonClient";

export type FileAtlasState = {
  snapshot: FileAtlasSnapshot | null;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * File Atlas changes slowly. Keep the last good projection through a transient
 * read failure and stop polling while the cockpit is hidden.
 */
export function useFileAtlasSnapshot(intervalMs = 30_000): FileAtlasState {
  const [snapshot, setSnapshot] = useState<FileAtlasSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setSnapshot(await getFileAtlasSnapshot());
      setError(null);
    } catch {
      setError("Workstation evidence is temporarily unavailable");
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
  }, [intervalMs, refresh]);

  return { snapshot, error, loading, refresh };
}
