import fs from "node:fs";

/**
 * Per-repo git-write mutex (D9, implemented in Phase 2 — spec
 * docs/specs/2026-07-19-phase-2-stacked-pr-actions.md §2, D28/D29). In-process
 * only (the daemon is a single Bun process) — no file-based or cross-process
 * lock. Keys on the canonicalized repo root (fs.realpathSync, matching
 * registerRepo's own canonicalization) so two different-looking paths to the
 * same repo share one lock.
 *
 * The queue-advancing token (stored in `locks`) and the caller-visible
 * `result` are deliberately different promises: `fn` is passed as BOTH the
 * fulfillment and rejection handler for `prior`, so it always runs exactly
 * once regardless of whether the previous holder threw — a naive
 * `prior.then(fn)` wedges permanently the moment any call for that key
 * rejects, since a rejected `prior` has no fulfillment handler to invoke on
 * the next call. The stored tracker (`result.catch(() => undefined)`) is
 * unconditionally settled so the *next* caller's `prior` is never itself a
 * rejection, while `result` still faithfully rejects for the caller that
 * triggered the failure.
 */
const locks = new Map<string, Promise<unknown>>();

export async function withRepoLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const key = fs.realpathSync(repoRoot);
  const prior = locks.get(key) ?? Promise.resolve();
  const result = prior.then(fn, fn);
  locks.set(key, result.catch(() => undefined));
  return result;
}
