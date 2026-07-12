"use client";

import { useState } from "react";

import type { TrunkLane } from "~/server/orchestra/schemas";
import { api } from "~/trpc/react";

type Props = {
  repoId: string | null;
  useFixture: boolean;
  lanes: TrunkLane[];
};

function errText(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      data?: { message?: unknown };
      shape?: { message?: unknown };
    };
    if (typeof e.shape?.message === "string" && e.shape.message.trim()) {
      return e.shape.message;
    }
    if (typeof e.data?.message === "string" && e.data.message.trim()) {
      return e.data.message;
    }
    if (typeof e.message === "string" && e.message.trim()) {
      // tRPC often wraps as "…TRPCClientError: actual message"
      const m = e.message.replace(/^.*TRPCClientError:\s*/i, "").trim();
      return m || fallback;
    }
  }
  return fallback;
}

export function LaneBoard({ repoId, useFixture, lanes }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const utils = api.useUtils();
  const stackedMut = api.git.stackedAction.useMutation();
  const removeMut = api.worktree.remove.useMutation();

  async function openPr(lane: TrunkLane) {
    if (!repoId || useFixture) return;
    setBusyId(lane.id);
    setError(null);
    setNote(null);
    try {
      const result = await stackedMut.mutateAsync({
        repoId,
        nodeId: lane.id,
        steps: ["pr"],
        prTitle: `Orchestra: ${lane.slug}`,
      });
      await utils.scan.trunk.invalidate({ repoId });
      if (result.prUrl) {
        setNote(`Pull request ready: ${result.prUrl}`);
      } else {
        setNote("Pull request step finished.");
      }
    } catch (err) {
      setError(errText(err, "Could not open the pull request."));
    } finally {
      setBusyId(null);
    }
  }

  async function finishWorker(lane: TrunkLane) {
    if (!repoId || useFixture) return;
    const ok = window.confirm(
      `Remove worker “${lane.slug}” from the desk?\n\nThe folder goes away. The git branch stays (you can delete it later).`,
    );
    if (!ok) return;
    setBusyId(lane.id);
    setError(null);
    setNote(null);
    try {
      await removeMut.mutateAsync({
        repoId,
        nodeId: lane.id,
        mode: "keep-branch",
      });
      await utils.scan.trunk.invalidate({ repoId });
      await utils.worktree.list.invalidate({ repoId });
      setNote(`Removed “${lane.slug}” from the desk.`);
    } catch (err) {
      setError(errText(err, "Could not remove that worker."));
    } finally {
      setBusyId(null);
    }
  }

  async function copyPath(path: string) {
    await navigator.clipboard.writeText(path);
    setNote("Folder path copied.");
    setError(null);
  }

  if (lanes.length === 0) {
    return (
      <section
        aria-label="Workers"
        className="border-b border-white/10 bg-[color:var(--color-charcoal)]/90 px-6 py-4"
      >
        <p className="text-sm text-white/55">Workers</p>
        <p className="mt-1 text-sm text-white/40">
          None yet. Hit “Start worker” above — then open that folder in Cursor.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Workers"
      className="border-b border-white/10 bg-[color:var(--color-charcoal)]/90 px-6 py-4"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-white/70">What’s happening</p>
          <p className="text-xs text-white/40">
            This updates from git every few seconds — you don’t need to paste
            anything for commits to show up.
          </p>
        </div>
        {note ? (
          <p className="max-w-md text-xs text-[color:var(--color-status-merged)]">
            {note}
          </p>
        ) : null}
        {error ? (
          <p className="max-w-md text-xs text-[color:var(--color-status-orphaned)]">
            {error}
          </p>
        ) : null}
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lanes.map((lane) => {
          const canPr =
            Boolean(repoId) &&
            !useFixture &&
            lane.status !== "orphaned" &&
            lane.status !== "merged" &&
            !lane.prUrl &&
            (lane.commitsAhead ?? 0) > 0;

          return (
            <li
              key={lane.id}
              className="border border-white/10 bg-black/30 px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-base text-white/90">{lane.slug}</p>
                <span className="shrink-0 text-[10px] tracking-wide text-white/35 uppercase">
                  {lane.shortSha}
                </span>
              </div>
              <p className="mt-1 text-sm text-[color:var(--color-brass)]">
                {lane.plainStatus ?? "Working"}
              </p>
              {lane.lastCommitMessage ? (
                <p className="mt-1 line-clamp-2 text-xs text-white/50">
                  Latest: {lane.lastCommitMessage}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-white/45">
                Next: {lane.nextStep ?? "Keep going in the worker chat."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {lane.path ? (
                  <button
                    type="button"
                    onClick={() => void copyPath(lane.path!)}
                    className="border border-white/15 px-2 py-1 text-[11px] text-white/60 hover:text-white/85"
                  >
                    Copy folder
                  </button>
                ) : null}
                {lane.prUrl ? (
                  <a
                    href={lane.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="border border-[color:var(--color-status-active)]/40 px-2 py-1 text-[11px] text-[color:var(--color-status-active)]"
                  >
                    Open PR
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={!canPr || busyId === lane.id}
                    onClick={() => void openPr(lane)}
                    className="border border-[color:var(--color-brass)]/40 bg-[color:var(--color-brass)]/10 px-2 py-1 text-[11px] text-[color:var(--color-brass)] disabled:opacity-35"
                  >
                    {busyId === lane.id ? "Opening…" : "Open pull request"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyId === lane.id || useFixture || !repoId}
                  onClick={() => void finishWorker(lane)}
                  className="border border-white/10 px-2 py-1 text-[11px] text-white/40 hover:border-white/25 hover:text-white/70 disabled:opacity-35"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
