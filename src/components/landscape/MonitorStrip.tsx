"use client";

import type { SyncLog, SyncLogStatus } from "~/server/orchestra/schemas";

type Props = {
  logs: SyncLog[];
};

const STATUS_LABEL: Record<SyncLogStatus, string> = {
  progress: "working",
  blocked: "stuck",
  ready_for_review: "ready",
  done: "done",
};

const STATUS_TONE: Record<SyncLogStatus, string> = {
  progress: "text-[color:var(--color-status-active)]",
  blocked: "text-[color:var(--color-status-orphaned)]",
  ready_for_review: "text-[color:var(--color-brass)]",
  done: "text-[color:var(--color-status-merged)]",
};

export function MonitorStrip({ logs }: Props) {
  return (
    <section
      aria-label="Branch updates"
      className="border-b border-white/10 bg-[color:var(--color-charcoal)]/90 px-6 py-3 backdrop-blur-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-white/55">Notes you pasted</p>
        <p className="text-xs text-white/35">
          Optional — commits already show above
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-white/45">
          Nothing pasted yet. That&apos;s fine — git activity is on the cards
          above.
        </p>
      ) : (
        <ul className="flex gap-3 overflow-x-auto pb-1">
          {logs.map((log) => (
            <li
              key={`${log.workerSlug}-${log.recordedAt}`}
              className="min-w-[220px] max-w-[280px] shrink-0 border border-white/10 bg-black/25 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-white/90">
                  {log.workerSlug}
                </span>
                <span
                  className={`text-[10px] tracking-wide uppercase ${STATUS_TONE[log.status]}`}
                >
                  {STATUS_LABEL[log.status]}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/55">
                {log.summary}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
