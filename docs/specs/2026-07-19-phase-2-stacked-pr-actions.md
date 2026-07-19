# Phase 2 — Stacked PR Actions

## 0. Goal

Give a completed dispatch a real path to a real GitHub PR: JD reviews a Receipt, clicks
"Push & Open PR" in the cockpit, and the daemon commits (if dirty), pushes, and opens (or
reuses) a real pull request on a throwaway repo — with the per-repo git-write mutex (D9)
now actually protecting every git write, not just this phase's new ones. Success test: JD
watches a real PR URL appear in the cockpit after clicking the button, and a second click
against the same lane (with new commits) updates the same PR rather than opening a
duplicate. No automatic push-on-dispatch, no multi-repo, no concurrent-lane UI (P2+).

---

## 1. Ratified decisions

Continues ADR 0001's D-numbering (D1–D26 already recorded; D27 onward here). D27, D28, D30,
and D33 resolved this session via AskUserQuestion with JD — each line is the decision *as
chosen*, not a fork.

| # | Decision | Rationale / source |
|---|---|---|
| D27 | The PR trigger is an **explicit cockpit action** — a "Push & Open PR" button JD clicks after reviewing a completed dispatch's Receipt — not an automatic side effect of every successful `dispatchWorkIntent` call. | JD's explicit choice. Keeps a human decision between "AI made an edit" and "that edit is a public PR"; matches OD3's own step-list design (`["commit","push","pr"]` is caller-supplied, not auto-fired). |
| D28 | The new per-repo git-write mutex (D9) covers **both** this phase's new commit/push/PR-create writes **and** Phase 1's existing `createWorktree`/`removeWorktree` writes (`git worktree add/remove/prune`). | JD's explicit choice. Both write to the same shared `.git` object store D9 exists to protect; today two overlapping `POST /repos`/`POST /work-intents`/the new stacked-action route against one repo have zero serialization. |
| D29 | The mutex is an **in-process async lock** (`Map<string, Promise<unknown>>` promise chain — corrected from an earlier `Promise<void>` draft that didn't match §2's own settled-tracker mechanism, plan-critique re-judge round 2, 2026-07-19, nit), keyed by the repo's canonicalized root path (`fs.realpathSync`, reusing `registerRepo`'s existing canonicalization so two different-looking paths to the same repo share one key). No file-based or cross-process lock. | Mechanical consequence of D9's own framing ("a per-repo mutex **in the daemon**") — the daemon is a single Bun process; there is no multi-daemon scenario in the Constitution or either ADR amendment to protect against. Not a new fork. |
| D30 | `Worktree` gains `prUrl: z.string().url().optional()` and `prNumber: z.number().int().positive().optional()`. | JD's explicit choice. Mirrors `Receipt.prUrl` (already present, `packages/orchestra-core/src/receipt.ts:17`) and gives the already-existing-but-unset `"pr_open"` status value (`worktree.ts:9`) something to point at, so the cockpit can render "this lane has an open PR" from one row instead of joining through Receipt. |
| D31 | OD3's dirty-tree semantics (Constitution v2 §11, a **locked** decision ADR 0001 keeps in force) are inherited unchanged — **all four cases**, not three (plan-critique re-judge, 2026-07-19 — blocking: the first pass's restatement silently dropped a real fourth case the legacy code implements, `apps/orchestra-web-legacy/src/server/orchestra/stacked.ts:72,125-141`): (1) dirty tree + `steps` includes `"commit"` → commit (requires a non-empty `message`, faithfully matching the legacy port) then continue; (2) bare `"pr"` (no `"commit"` in `steps`) + **dirty** tree → refuse (`StackedActionError`); (3) bare `"push"` + dirty → push existing commits only, return a warning, do not commit; (4) **corrected, round-2 re-judge — the real trigger is `steps` includes `"pr"` but NOT `"push"`, evaluated on whatever the tree's state is BY THE TIME the pr step runs** (`stacked.ts:127`: `if (wantsPr && !wantsPush)`, not gated on `!wantsCommit` at all) — if that state is clean with unpushed commits (`!hasUpstream(cwd)` or `aheadCount(cwd) > 0`), push first then create the PR. This composes with case 1: `steps: ["commit","pr"]` (no explicit `"push"`) on an initially-dirty, no-upstream branch runs case 1 (commit — tree becomes clean), then case 4 still fires on the now-clean tree even though `"commit"` was present in `steps`. The prior restatement's "(no commit in steps)" qualifier on case 4 was wrong; case 4 is gated on `!wantsPush`, never on `wantsCommit`. `.cursor/`-only dirt (fence files) never counts as dirty. | Not a new decision — OD3 is locked, this restates it for completeness so P2's spec reads standalone without cross-referencing the Constitution. |
| D32 | `gh.ts` is ported near-verbatim from `apps/orchestra-web-legacy/src/server/orchestra/gh.ts` into `packages/orchestra-daemon/src/git/` (executing D23, already decided in the P1 amendment) — same `execFile`-only, argv-array-never-a-shell-string discipline as `git.ts`. `stacked.ts`'s `runStackedAction` algorithm and `workingTree.ts`'s `isMeaningfulDirty` are ported the same way, persistence reworked from `state.ts`'s JSON read-modify-write onto the `worktrees` SQLite table (same rework pattern P1 applied to `worktrees.ts`). **Named, accepted residual (plan-critique, 2026-07-19, nit; broadened round-2 re-judge — the swallow is wider than first described)**: `viewPrForBranch`'s inherited swallow (`apps/orchestra-web-legacy/src/server/orchestra/gh.ts:97,101`) treats **any** `gh pr view` failure with exit code `1` **or** `null` (not just a null/signal-killed exit) as "no PR found" and returns `null` — an ordinary auth hiccup, rate limit, or network blip is silently read the same as "this branch has no PR." Ported as-is, not hardened; a masked failure surfaces loudly moments later when the unguarded `createPullRequest` call fails for the same underlying reason, so this isn't a silent-corruption path, just a confusing error message. Revisit only if it's ever actually confusing in practice. | Executing already-decided scope (D23), not a new fork. |
| D33 | The two P1 residuals — D25 (unfenced `Read`) and D26 (no isolation during dispatch) — are **re-confirmed as still-accepted**, not fixed, in this phase's ADR amendment. | JD's explicit choice. Neither blocks stacked-PR work; fixing them isn't what P2 is for. Satisfies the P1 amendment's own instruction ("should be revisited explicitly rather than silently forgotten") without scope-creeping this phase. |

---

## 2. Contract definitions

### `Worktree` additions (`packages/orchestra-core/src/worktree.ts`)

| Field | Type | Source |
|---|---|---|
| `prUrl` | `string` (url), optional | new — D30 |
| `prNumber` | `number` (positive int), optional | new — D30 |

### `gh.ts` (new, `packages/orchestra-daemon/src/git/gh.ts`)

| Export | Signature | Behavior |
|---|---|---|
| `GhError` | `class GhError extends Error` | ported as-is from legacy |
| `gh` | `(cwd: string, args: string[], opts?: {timeoutMs?: number}) => Promise<{stdout: string; stderr: string}>` | `execFile`-based, argv-only |
| `ghStdout` | `(cwd, args, opts?) => Promise<string>` | trimmed stdout |
| `viewPrForBranch` | `(cwd: string, branch: string) => Promise<GhPrView \| null>` | `gh pr view <branch> --json number,title,url,state,mergedAt`; swallows "no PR found" into `null` |
| `createPullRequest` | `(cwd: string, opts: {title: string; body: string; base: string; head?: string}) => Promise<{url: string; number: number}>` | `gh pr create --title ... --body ... --base ... [--head ...]`. URL extraction is the **legacy's own defensive line-scan, unchanged** (`apps/orchestra-web-legacy/src/server/orchestra/gh.ts:130-144` — split stdout into lines, trim each, take the first line matching `/^https?:\/\//`), throws `GhError` if no such line exists. **plan-critique re-judge, 2026-07-19 — should-fix, corrected**: the first pass's fix assumed `gh pr create`'s stdout is *always exactly* the bare URL and dropped the legacy line-scan in favor of a `$`-anchored regex on raw stdout — nothing in §4's ground-truth anchors actually establishes that stdout shape, and `gh` printing an extra line (a version banner, a warning) would break it. Restore the legacy scan as the URL source of truth; only the **number** extraction is new, applied to the already-found URL line: `/\/pull\/(\d+)$/` on that one line (safe here — a matched `^https?://...` line is a known-shape URL, not arbitrary stdout). **plan-critique re-judge round 2, 2026-07-19 — should-fix, closed**: the number-not-found path was previously undefined despite `number` being declared non-optional in the return type — throws `GhError` if the regex doesn't match, the same failure mode as the URL-not-found path (not a silent coercion, not an optional field). `Worktree.prNumber` (D30) would otherwise stay permanently unset on every first-ever PR creation, since the legacy port never captured it either. |
| `GhPrView` | `type {number: number; title: string; url: string; state: string; mergedAt: string \| null}` | raw `gh pr view --json` shape |

### `mutex.ts` (new, `packages/orchestra-daemon/src/git/mutex.ts`)

| Export | Signature | Behavior |
|---|---|---|
| `withRepoLock` | `<T>(repoRoot: string, fn: () => Promise<T>) => Promise<T>` | canonicalizes `repoRoot` via `fs.realpathSync`, chains onto that key's pending promise in a module-level `Map<string, Promise<unknown>>` |

**plan-critique, 2026-07-19 — blocking, precise mechanism required (a naive `.then(fn)` chain wedges permanently on a throw — verified by the critic: if call N's `fn` rejects, the stored promise is rejected, and call N+1's `prior.then(fn)` has no rejection handler, so `fn` never runs again for that key — every subsequent call silently short-circuits forever).** The only correct implementation:

```ts
const locks = new Map<string, Promise<unknown>>();

async function withRepoLock<T>(repoRoot: string, fn: () => Promise<T>): Promise<T> {
  const key = fs.realpathSync(repoRoot);
  const prior = locks.get(key) ?? Promise.resolve();
  const result = prior.then(fn, fn); // fn as BOTH handlers — runs regardless of prior's outcome
  locks.set(key, result.catch(() => undefined)); // the stored tracker never itself rejects
  return result; // the caller still sees fn's real success/failure
}
```

The queue-advancing token (`locks.get(key)`) and the caller-visible result (`return result`) are deliberately different promises — the tracker is unconditionally settled so the *next* caller's `prior` is never itself a rejection, while `result` still faithfully rejects for the caller that triggered the failure.

### `workingTree.ts` (new, `packages/orchestra-daemon/src/git/workingTree.ts`)

| Export | Signature | Behavior |
|---|---|---|
| `isMeaningfulDirty` | `(cwd: string) => Promise<boolean>` | `git status --porcelain`, ported from legacy; `.cursor/`-only entries don't count (D31) |

### `stackedAction.ts` (new, `packages/orchestra-daemon/src/git/stackedAction.ts`)

| Export | Signature | Behavior |
|---|---|---|
| `StackedStep` | `type = "commit" \| "push" \| "pr"` | request-body-only shape — no new `@orchestra/core` schema (nothing materialized persists this list itself, only its *effects* on `Worktree`); mirrors how P1's `DispatchWorkIntentInput.taskSpec` stayed a local inline type rather than a core export |
| `StackedActionError` | `class extends Error` | ported from legacy — the dirty-tree-and-bare-pr refuse case (D31 case 2), **also** thrown when `steps` includes `"commit"`, the tree is dirty, and `message` is missing/empty (D31 case 1; plan-critique, 2026-07-19, blocking) |
| `WorktreeChainNotFoundError` | `class extends Error` | **plan-critique re-judge, 2026-07-19 — should-fix, new**: thrown when `worktreeId` doesn't resolve, or its `TaskSpec`→`WorkIntent`→`Repo` chain is broken — named the same way `RepoNotRegisteredError` already is (`packages/orchestra-daemon/src/pipeline.ts:77-82`), the exact precedent this spec should have followed the first time instead of leaving the 404 case's error type unnamed |
| `StackedActionResult` | `type = {worktree: Worktree; committed: boolean; pushed: boolean; warnings: string[]}` | **plan-critique, 2026-07-19 — blocking, new**: D31's own "bare `push` + dirty → return a warning" behavior had no field to land in the original `Promise<Worktree>` return type; ported from legacy `StackedActionResultSchema` (`apps/orchestra-web-legacy/src/server/orchestra/schemas.ts:101-108`) minus its own `prUrl` (redundant with `worktree.prUrl`) |
| `StackedActionDeps` | `type = {createPullRequest: typeof createPullRequest}` | **Build-time addition, 2026-07-19**: this contract table's original `runStackedAction` signature had no seam for the "createPullRequest is stubbed/injected in unit tests" testing note two rows below to actually work against — added when writing the colocated tests surfaced the gap. Mirrors the legacy's `StackedActionDeps`, narrowed to the one dependency that needs stubbing (`viewPrForBranch` runs for real in tests — confirmed fast/local/no-network-hang against a repo with no git remote: `gh pr view` fails immediately, exit code 1, "no git remotes found"). Not a ratified-decision fork — a mechanical testability seam, same category as D23's branch-validation addition. |
| `runStackedAction` | `(db: OrchestraDb, worktreeId: string, steps: StackedStep[], message?: string, deps: StackedActionDeps = defaultDeps) => Promise<StackedActionResult>` | **Fully self-contained — resolves its own `repoRoot`, server.ts does not pre-resolve it** (plan-critique re-judge, 2026-07-19 — should-fix, clarified: the first pass's §3 step 9 wording implied server.ts resolves the worktree→taskSpec→workIntent→repo chain itself before calling this function, which the signature above has no parameter for — that was stale/contradictory prose, not a real second resolution path; deleted from step 9 below). Looks up the `Worktree` row → its `TaskSpec` → `WorkIntent` → `Repo` (for `repoRoot`) itself, throwing `WorktreeChainNotFoundError` if any link is missing; runs the full 4-case OD3 algorithm (D31) inside `withRepoLock(repoRoot, ...)` — including case 4 (`steps` includes `"pr"` but not `"push"`, and the tree is clean with unpushed commits **by the time the pr step runs**, whether it started clean or was made clean by a preceding case-1 commit → push first, then create/reuse the PR; see D31's corrected round-2 text — this is gated on `!wantsPush`, never on whether `"commit"` was also in `steps`); `message` is required, faithfully matching the legacy port, whenever `steps` includes `"commit"` AND the tree is actually dirty — throws `StackedActionError` if missing (every real P1 dispatch leaves its worktree dirty, since `claudeCodeCapabilityProvider.ts` never commits on the agent's behalf — the cockpit is responsible for prompting for/prefilling this, e.g. from `Receipt.summary`, before calling the route); on a `"pr"` step, calls `viewPrForBranch` first (reuse an existing open PR) before `createPullRequest`, passing `title: message?.trim() \|\| \`Orchestra: ${taskSpec.slug}\`` and `body: \`Opened by blossvm-orchestra stacked action for worker \`${taskSpec.slug}\`.\`` — **plan-critique round 3, 2026-07-19 — should-fix, closed**: the legacy port (`apps/orchestra-web-legacy/src/server/orchestra/schemas.ts:91-98`, `stacked.ts:156-163`) let the caller override title/body via separate `prTitle`/`prBody` input fields; this contract deliberately does NOT carry those two fields forward (`steps`/`message` is the full input surface, §2's route body) — a real, intentional scope cut, named here rather than silently dropped, since D27 already put a human in the loop via the cockpit button and a second override-the-PR-title input field adds UI surface for a capability nothing in P2's acceptance criteria needs; `taskSpec.slug` replaces legacy's `node.slug` token in the fallback text; persists `prUrl`/`prNumber`/`status` back onto the `Worktree` row + `writeEvent(db, "worktree", ..., "updated", ...)` (D6/D17 pattern already established in `worktrees.ts`), returns `{worktree, committed, pushed, warnings}` |

### `worktrees.ts` changes (`packages/orchestra-daemon/src/git/worktrees.ts`)

**Whole git-touching section wrapped, not individual call sites** (plan-critique, 2026-07-19 — should-fix: naming only `add`/`remove`/`prune` missed two real git-writes the critic found by reading the actual merged code — the repair-branch's own `git worktree prune` call at `worktrees.ts:200`, run *before* any `add`/attach, and `removeWorktree`'s `git branch -D` at `worktrees.ts:310` when `mode === "delete-branch"`. Both mutate the same shared `.git` state D9 exists to protect). **Exact boundary (plan-critique re-judge, 2026-07-19 — nit, tightened: the prior pass's own two sentences disagreed with each other on where the wrap starts — this is the single authoritative statement, superseding both)**: `createWorktree`'s `withRepoLock(input.repoRoot, async () => { ...everything from the disk/git listing (`listWorktrees`, `worktrees.ts:192`) through `upsertWorktreeRow`... })` — validation, `fs.mkdir`, `resolveDefaultBaseBranch`, and the anchor-SHA lookup stay outside the lock, since none of them are git *writes*; `removeWorktree`'s `withRepoLock(repoRoot, async () => { ...everything from the disk/git listing (`worktrees.ts:281`) through the DB delete+event transaction (`:326-329`)... })`. Existing tests must stay green unmodified — this is a pure wrap, no behavior change for the single-lane case.

**Named, accepted residual (plan-critique re-judge round 2, 2026-07-19, nit)**: `removeWorktree`'s own `row` lookup (`worktrees.ts:276-279`) happens *before* the lock is taken — two concurrent `removeWorktree` calls for the *same* `worktreeId` can both pass the not-found check before either acquires the lock, so the second call runs against an already-deleted row (a no-op DB delete plus a misleading duplicate "updated" event for an already-gone entity). Not data corruption, not in scope for D28 (which protects *different* writes racing, not double-invocation of the *same* one) — accepted for P2's single-founder usage pattern; revisit only if the cockpit ever allows firing the same remove action twice concurrently.

### Daemon HTTP surface addition (`packages/orchestra-daemon/src/server.ts`)

| Route | Method | Body | Response |
|---|---|---|---|
| `/worktrees/:id/stacked-action` | POST | `{ steps: StackedStep[]; message?: string }` | `{ worktreeId, status, prUrl?, prNumber?, committed, pushed, warnings }` (mirrors `StackedActionResult`, §2) — calls `runStackedAction(db, id, steps, message)` directly, no pre-resolution of `repoRoot` in this route (§2's `runStackedAction` is self-contained — plan-critique re-judge, 2026-07-19); `StackedActionError` (the OD3 refuse case, **including** the missing-`message`-while-dirty case) → 400; `WorktreeChainNotFoundError` → 404; same generic-500-with-server-side-log pattern the P1 review round established for `/work-intents`; same bearer-token auth as every other route |

---

## 3. Determined build sequence

1. **`packages/orchestra-core/src/worktree.ts`**: add `prUrl`/`prNumber` (§2, D30). Update `worktree.test.ts` to cover both present and both absent (both optional — a worktree can be `"active"` with neither set).
2. **`packages/orchestra-daemon/src/git/gh.ts`** (new): port from `apps/orchestra-web-legacy/src/server/orchestra/gh.ts` (D32) — `gh`, `ghStdout`, `viewPrForBranch`, `createPullRequest`, `GhError`, `GhPrView` (§2). Colocated test against a real repo with `gh` invoked for read-only operations only (`gh pr view` on a branch with no PR — real network call, cheap, no side effects); `createPullRequest` itself is exercised only in the live acceptance walk (§5), not in the automated suite, since it always has a real side effect (opens a real PR) — same reasoning P1 applied to real `claude` spawns.
3. **`packages/orchestra-daemon/src/git/mutex.ts`** (new): `withRepoLock` (§2, D29 — see §2's exact `.then(fn, fn)` mechanism, not a naive `.then(fn)`). Colocated tests: (a) two `withRepoLock` calls against the same canonicalized key, using a shared array both callbacks push into with an artificial delay, asserting the second callback's push only happens after the first's completes; (b) a same-shape test with two *different* keys proving they run concurrently, not needlessly serialized; (c) **plan-critique, 2026-07-19 — blocking, new required test**: the first callback for a key throws, asserting the second callback for the *same* key still runs (and its own result is independently correct) — the exact reject-path the naive implementation gets wrong.
4. **`packages/orchestra-daemon/src/git/workingTree.ts`** (new): `isMeaningfulDirty` (D31). Colocated test: a clean repo (false), a repo with a real file change (true), a repo with only a `.cursor/` file changed (false).
5. **`packages/orchestra-daemon/src/git/worktrees.ts`**: wrap `createWorktree`'s and `removeWorktree`'s entire git-touching sections in `withRepoLock` (D28, §2 — the whole-body wrap, not a per-call one). Existing tests must stay green unmodified.
6. **`packages/orchestra-daemon/src/db/schema.ts`**: add `prUrl`, `prNumber` columns to the `worktrees` table. Generate migration `0006_...sql` via `bunx drizzle-kit generate` (not hand-authored, same discipline as `0005`); verify against a real copy of `~/.orchestra/orchestra.db` before merging (same procedure the P1 PR #2 review round established for `0004`/`0005`). `bunx drizzle-kit check` clean. **plan-critique, 2026-07-19 — blocking, reordered**: this step must land before `stackedAction.ts` (originally sequenced the other way around) — `runStackedAction` writes these columns, and referencing a column the typed Drizzle table object doesn't have yet is the identical failure class the P1 spec's own plan-critique pass already caught once for `writeEvent`'s entity-type tuple (`docs/specs/2026-07-18-phase-1-worktree-isolation.md:76`).
7. **`packages/orchestra-daemon/src/db/mappers.ts`**: `rowToWorktree` picks up the two new columns automatically via the existing `nullsToUndefined` + `Schema.parse` pattern — confirm with a mapper test asserting both null-in-DB and populated-in-DB cases parse correctly.
8. **`packages/orchestra-daemon/src/git/stackedAction.ts`** (new): `runStackedAction`, `StackedStep`, `StackedActionError`, `WorktreeChainNotFoundError`, `StackedActionResult` (§2). Ported OD3 algorithm from legacy `stacked.ts` (D31), using steps 2–4's new modules and step 6's new columns. Colocated tests against real repos (mirroring `worktrees.test.ts`'s real-`mkdtemp`-plus-real-`git`-init convention): clean tree + `["commit","push"]` → no-op commit step, real push, no PR step requested so no `gh` call, `committed: false`; dirty tree + `["commit","push","pr"]` + a real `message` → all three run in order, `committed: true`; dirty tree + `["commit"]` with **no `message`** → throws `StackedActionError` (D31 case 1); dirty tree + `["pr"]` (no `"commit"`) → throws `StackedActionError` (D31 case 2); `.cursor/`-only dirt + `["push"]` → treated as clean, no refusal; a **dirty** repo with unpushed commits + `["push"]` and no `"commit"` step → pushes existing commits, returns `warnings` non-empty, `committed: false` (D31 case 3); **a *clean* repo with unpushed commits (no upstream) + `["pr"]`** → pushes first, then creates the PR, `pushed: true` (D31 case 4, plan-critique re-judge, 2026-07-19 — blocking, new test — this is NOT the same as the dirty-bare-pr-refuses case above); **a *dirty*, no-upstream repo + `["commit","pr"]` (no explicit `"push"`) + a real `message`** → commits (case 1), then case 4 still fires on the now-clean tree despite `"commit"` being present in `steps`, `committed: true` AND `pushed: true` (plan-critique re-judge round 2, 2026-07-19 — should-fix, new test — the exact composition the corrected D31 case 4 text calls out); an unknown `worktreeId` → throws `WorktreeChainNotFoundError`. The `"pr"` step itself (`createPullRequest`) is stubbed/injected in these unit tests (real PR creation is real-cost, §5's job) — but `viewPrForBranch` (read-only) runs for real.
9. **`packages/orchestra-daemon/src/server.ts`**: add `POST /worktrees/:id/stacked-action` (§2) — calls `runStackedAction(db, id, steps, message)` directly (it resolves its own `repoRoot` internally, per §2); map `StackedActionError` → 400, `WorktreeChainNotFoundError` → 404, same generic-500-with-server-side-log pattern the P1 review round established for `/work-intents`.
10. **`apps/orchestra-cockpit/src/lib/daemonClient.ts` + `App.tsx`**: add a `runStackedAction()` client function calling the new route; a "Push & Open PR" button next to a completed dispatch's rendered Receipt (D27); render `worktree.prUrl` as a link once the response includes one. No visual design investment (extends P1's D24 plain/functional posture — P3 is still where the design pass lands).
11. **`docs/adr/0001-tauri-bun-architecture.md`**: amendment recording D27–D33 — mutex shape and scope (D28/D29), `gh.ts` port complete (D32), the new schema fields (D30), the explicit-trigger decision (D27), OD3 restated (D31), and D25/D26 re-confirmed as still-accepted (D33) — not reopened.

---

## 4. Ground-truth anchors

| Claim | Status |
|---|---|
| `apps/orchestra-web-legacy/src/server/orchestra/{gh,stacked,workingTree,schemas}.ts` exist and match the function signatures / algorithm described in §1 D31–D32 and §2 | **VERIFIED 2026-07-19** — direct file reads this session (Explore agent, file:line cited) |
| OD3's dirty-tree semantics text (`"Dirty + stack includes commit → commit then continue. Bare create_pr + dirty → refuse. Bare push + dirty → push commits only, warn."`) | **VERIFIED 2026-07-19** — `docs/ORCHESTRA-CONSTITUTION-v2.md:311`, direct read |
| No mutex/lock/semaphore/queue implementation exists anywhere in the legacy codebase or the current daemon | **VERIFIED 2026-07-19** — exhaustive grep across `server/orchestra/` (legacy) and `packages/orchestra-daemon/src/` (current), zero hits beyond unrelated substrings (`block`/`blockers`) |
| `Receipt.prUrl`/`Receipt.prTitle` already exist; `Worktree` has no `prUrl`/`prNumber` despite an unset `"pr_open"` status value | **VERIFIED 2026-07-19** — `packages/orchestra-core/src/receipt.ts:17-18`, `worktree.ts:9,18`, direct read |
| `dispatchWorkIntent` stops after persisting `AgentRun`+`Receipt`; no push/PR step exists in that flow today | **VERIFIED 2026-07-19** — `packages/orchestra-daemon/src/pipeline.ts:225-234`, direct read |
| `docs/ORCHESTRA-CONSTITUTION-v2.md` contains zero mentions of R0–R4, D-numbers, or "capability" — that vocabulary belongs exclusively to the ADR/spec layer | **VERIFIED 2026-07-19** — targeted greps across the full 445-line document, zero matches |
| `Bun.spawn`/`execFile` argv-only discipline (no shell interpolation) is the established pattern for both `git.ts` (P1) and the legacy `gh.ts` | **VERIFIED 2026-07-19** — `packages/orchestra-daemon/src/git/git.ts` (P1, merged), `apps/orchestra-web-legacy/src/server/orchestra/gh.ts` (legacy), both direct-read this session |

---

## 5. Acceptance (exit criteria)

- [ ] JD dispatches a real intent against a **disposable/throwaway repo** (not a real BlossomTN repo — matches Constitution §9's own P2 exit criterion: *"One real PR opened from desk on a throwaway branch"*), reviews the Receipt, clicks "Push & Open PR," and watches a real PR URL appear in the cockpit.
- [ ] A second click against the same lane (with a new commit made in between) updates the same PR (`viewPrForBranch` finds it, no duplicate `gh pr create`) rather than opening a second one.
- [ ] Triggering a bare `"pr"` step (no `"commit"`) against a **dirty** worktree is observably refused (400, `StackedActionError`'s message surfaces) — no partial push, no PR opened. Triggering the same bare `"pr"` step against a **clean** worktree with unpushed commits instead auto-pushes then opens the PR (D31 case 4, plan-critique re-judge, 2026-07-19) — the two must be observably distinguishable, not both refused.
- [ ] A real concurrency test proves the mutex: two `createWorktree` (or one `createWorktree` + one `runStackedAction`) calls fired at the same real repo root execute their git-write sections serially, not interleaved — asserted via a shared ordering array, not just "both eventually completed."
- [ ] `bun run test`, `bunx tsc --noEmit` (all four packages/apps), `bunx drizzle-kit check`, `cargo check` all green — same gate every P0/P1 commit used.

---

## 6. Out of scope for Phase 2 (explicitly deferred, not dropped)

- Automatic push-on-dispatch (D27) — the trigger is always an explicit cockpit click.
- File-based or cross-process locking (D29) — the mutex is in-process only; revisit if the daemon ever needs to run as more than one process against the same repo.
- Fixing D25 (unfenced `Read`) or D26 (no isolation during dispatch) — re-confirmed accepted, not touched (D33).
- Multiple registered repos, multiple concurrent lanes' UI, any cockpit visual design pass — all still P2+/P3 per the Linear milestone plan, unchanged from P1's own deferral list.
- A "stacked" chain of multiple *dependent* PRs (Graphite-style) — confirmed this session that neither the legacy code nor the Constitution's "stacked" vocabulary ever meant this; `runStackedAction` operates on exactly one lane/branch per call and produces at most one PR.
