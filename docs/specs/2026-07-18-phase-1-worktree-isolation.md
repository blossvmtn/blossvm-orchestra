# Phase 1 — Worktree Isolation

## 0. Goal

Prove Orchestra's actual painkiller — physical, isolated worker lanes — with real work, not
a fixture. One registered repo, one real Claude Code capability provider, one worktree at a
time. Success test: JD registers a real repo from the cockpit, submits a real intent, and
watches a real `git worktree` get created, a real Claude Code process run inside it under
real fence enforcement, and a real Receipt land in SQLite — all observable on screen, not in
a log. No stacked PR actions yet (P2), no concurrency (P2), no UI design pass (P3).

---

## 1. Ratified decisions

Continues ADR 0001's D-numbering (D1–D13 already recorded; D14 onward here). Resolved this
session via AskUserQuestion with JD — each line is the decision *as chosen*, not a fork.

| # | Decision | Rationale / source |
|---|---|---|
| D14 | Claude Code is dispatched with `--bare` **and** an explicit `--settings <json>` argument injecting the `PreToolUse` fence hook. `--bare` skips auto-discovery of hooks from settings *files*, but explicitly-passed `--settings` is still honored — confirmed against live docs this session. | Keeps reproducible dispatch (D4's original reasoning for `--bare`) without silently losing fence enforcement. |
| D15 | The real capability provider's seam is **synchronous-after-await**: it awaits the full Claude Code run internally (spawn → consume NDJSON stream to completion → parse the terminal `result` event) and returns a final `{agentRun, receipt}`, matching `fixtureCapabilityProvider.ts`'s existing contract shape. No incremental `AgentRun.status`/`lastHeartbeatSummary` writes to SQLite while a run is in flight. | JD's explicit choice — P1's first real slice; live progress is a real UX investment better made once P3 designs the cockpit's real-state rendering, not invented ad hoc here. |
| D16 | D9 (the per-repo git-write mutex) stays deferred to P2. P1 supports exactly one worktree/dispatch at a time — no concurrent git writes exist yet to protect against. | JD's explicit choice; matches Linear's own P2 milestone description ("The per-repo git-write mutex (D9) is implemented here"). |
| D17 | P1 starts writing real `events` rows (D6). Every real state-changing operation (WorkIntent created, TaskSpec created, Worktree created/updated, AgentRun created/updated, Receipt created) writes one event. **Payload shape**: the event's `payload` column is the already-`Schema.parse()`-validated domain object itself, JSON-serialized — no new events-specific schema. This follows directly from D6's own framing (`events` is a diary, never replayed to reconstruct state, so its payload doesn't need independent validation — it only needs to be a faithful snapshot of what the materialized row looked like at that moment). | JD's explicit choice to start now, not defer further; payload shape derived from the already-locked D6 principle, not a new fork. |
| D18 | P1 stays Claude Code only, restating D4 — no fence-fallback logic for Codex (OS sandbox) or Cursor (advisory `.cursor/rules`) is built this phase; both remain P5 scope. | Not a new decision — D4 already settles this; included here only so P1's scope reads complete without cross-referencing the ADR. |
| D19 | Repo registration uses a native Tauri folder picker (`@tauri-apps/plugin-dialog`'s `open({directory: true})`) feeding a new daemon endpoint, **not** the legacy app's fuzzy `~/dev/<name>` path-guessing (`registry.ts`'s `resolveGitRoot`). | JD's explicit choice — matches the desktop-app UX the cockpit is already built as. |
| D20 | Worktree physical state (filesystem path, git status, anchor SHA) is a **new fifth domain schema, `Worktree`** — not fields folded onto `TaskSpec`. 1:1 with `TaskSpec` (one worktree per worker lane), but a distinct entity: `TaskSpec` is the immutable plan for a lane (has no status field today), `Worktree` is that lane's live physical state (mutates over its on-disk lifetime, independent of any single `AgentRun`). Mirrors the Constitution's own `WorktreeNode` shape (proven prior art, §5). | JD's explicit choice, surfaced mid-compile per this session's own anti-fake-determinism discipline — not silently invented. |
| D21 | Repo registration is backed by a new minimal `Repo` table (`id`, `slug`, `rootPath`, `registeredAt`) — one row for P1 (Linear's own P1 milestone text: "one repo"), not a JSON registry file. `WorkIntent.repoSlug` already exists and continues to reference it by slug. | Mechanical consequence of D19 (the endpoint needs *some* persistence) plus already-locked D5/D6 (materialized SQLite tables, not JSON files) — not a new strategic fork, just the natural implementation of an already-decided endpoint. |
| D22 | Fence-path matching uses Bun's built-in `Bun.Glob` (`new Bun.Glob(pattern).match(path)`) — no new dependency. Nothing in the codebase evaluates `allowedPaths`/`forbiddenPaths` as actual glob patterns yet (confirmed this session — the legacy app only ever *renders* them as text, never matches them); this is new logic P1 must build regardless of what's ported. | Ladder: native platform feature (Bun ships this) beats adding a globbing library for one call site. |
| D23 | `git.ts` is ported near-verbatim from `apps/orchestra-web-legacy/src/server/orchestra/git.ts` into `packages/orchestra-daemon/src/git/` — confirmed this session to be a pure `execFile` wrapper (**argv array only, never a shell string** — the same invariant ADR 0001 §2 Stack keeps binding) with zero coupling to the legacy JSON-file state model. `gh.ts`'s port is **deferred to P2**, where its first real consumer (`gh pr create`) actually lands — P1 has no PR/push actions, so porting it now would be dead code for a full phase (plan-critique nit). `worktrees.ts`'s create/repair/attach/reconcile/remove *algorithm* is ported and adapted; its persistence (JSON-file read-modify-write via `state.ts`) is reworked into SQLite transactions against the new `worktrees` table. The port also adds a **branch-name validation** the legacy code lacked (it validates `slug` via `SLUG_RE` but never `branch` — a branch beginning with `-` is positional in `git worktree add <path> <branch>` and could be parsed as a flag, an argument-injection gap found in the plan-critique pass); reject any `branch` starting with `-`. | Confirmed via direct code reading this session — not a rewrite-from-scratch, real prior art exists and is safe to reuse. The `gh.ts` deferral and branch-validation addition are corrections from the plan-critique pass, not new forks. |
| D24 | P1's cockpit UI stays plain/functional, extending `App.tsx`'s existing unstyled pattern (a folder-picker button, an intent textarea, a dispatch button) — no visual design investment. | Not a new fork — Linear's own P3 milestone description explicitly reserves "first real design pass" for P3; building UI polish now would front-run and be discarded. |
| D25 | `--allowedTools` for P1's Claude Code dispatch is **`"Read,Edit"` — `Bash` is not granted.** An independent security-lens critique of this spec found that granting `Bash` alongside a `PreToolUse` hook matched only on `Edit\|Write` makes the fence a no-op (`Bash`-tool file writes never hit the hook at all), and — since a git worktree provides no OS-level filesystem confinement — that combination amounts to unrestricted disk access, not fenced access. | JD's explicit choice after the plan-critique pass. Matches D8's original framing exactly (Edit/Write-checked, nothing else); keeps P1 from needing Bash-command-inspection logic, which is real scope growth and a leaky approach besides. Consequence: P1's agent can read anything in its worktree but can't run tests/builds itself this phase — acceptable, since P1 is proving isolation, not full autonomy. |

---

## 2. Contract definitions

### `Worktree` (new schema, `packages/orchestra-core/src/worktree.ts`)

| Field | Type | Source |
|---|---|---|
| `id` | uuid | new |
| `taskSpecId` | uuid (fk), 1:1 | new |
| `path` | string | new — `<repoRoot>/.orchestra/worktrees/<slug>/`, PATH convention (Constitution §11, unchanged) |
| `branch` | string | new — the actual on-disk branch, may differ from a repair-attached existing branch |
| `anchorSha` | string | new — base branch SHA at creation |
| `status` | `"active"\|"merged"\|"stashed"\|"orphaned"\|"pr_open"` | new — ported from Constitution's `NodeStatus` |
| `createdAt` | ISO8601 | new |
| `lastSyncAt` | ISO8601, optional | new — stamped on reconcile |

### `Repo` (new schema, `packages/orchestra-core/src/repo.ts`)

| Field | Type | Source |
|---|---|---|
| `id` | uuid | new |
| `slug` | string | new — matches `WorkIntent.repoSlug` |
| `rootPath` | string | new — absolute path from the Tauri folder picker |
| `registeredAt` | ISO8601 | new |

### Daemon HTTP surface additions (`packages/orchestra-daemon/src/server.ts`)

| Route | Method | Body | Response |
|---|---|---|---|
| `/repos` | POST | `{ rootPath: string }` | `{ id, slug, rootPath }` — validates `isGitRepo(rootPath)` first, 400 if not a git repo |
| `/work-intents` | POST | `{ repoSlug: string, intent: string, taskSpec: { slug, branch, role, allowedPaths, forbiddenPaths, acceptance } }` | `{ workIntentId, taskSpecId, worktreeId, agentRunId, receiptId }` — the real dispatch route, parallel to `/fixture/dispatch` but taking real input instead of fabricating it |
| `/receipts/:id` | GET | — | unchanged from P0 — already provider-agnostic |

No fan-out UI for multiple `TaskSpec`s per `WorkIntent` in P1 (D24) — the request body carries exactly one `taskSpec` object; the 1:N cardinality the schema already supports is exercised starting P2+.

---

## 3. Determined build sequence

1. **`packages/orchestra-core`**: add `Worktree` and `Repo` Zod schemas (§2 above), each with its own test file mirroring the existing four (`worktree.test.ts`, `repo.test.ts`). Export from `index.ts`.
2. **`packages/orchestra-daemon/src/db/schema.ts`**: add `worktrees` table (fk → `taskSpecs`, indexed, enum-narrowed `status`) and `repos` table (`uniqueIndex()` on `slug`, not a plain `index()` — SQLite requires the FK's target column to be a PK or carry a UNIQUE constraint, and the next sentence's FK depends on this). Add a `.references(() => repos.slug)` fk from `workIntents.repoSlug` to `repos.slug` (plan-critique found this reference was named in D21 but never actually enforced). Extend `EVENT_ENTITY_TYPES` (currently `["work_intent", "task_spec", "agent_run", "receipt"]`) to include `"worktree"` and `"repo"` — plan-critique found the existing tuple would make `writeEvent(db, "worktree", ...)` (step 4) fail `tsc --noEmit`, silently breaking §5's own acceptance criterion. New migration (`0003_...sql`, `bunx drizzle-kit generate`) must create `repos` (+ its unique index) before rebuilding `work_intents` with the new FK — `drizzle-kit generate` orders new-table creation first by default; confirm the generated SQL actually does so before applying. `bunx drizzle-kit check` clean.

   **Regression this FK introduces, must be fixed in the same step (re-judge pass found it):** P0's existing fixture-dispatch path (`fixtureWorkIntent()` in `fixtures.ts`, still live and exercised by `pipeline.test.ts`/`server.test.ts`/the cockpit's "Dispatch fixture work intent" button) creates a `WorkIntent` with `repoSlug: "blossvm-orchestra"` but nothing seeds a matching `repos` row — with `PRAGMA foreign_keys = ON` already active on every connection (`db.ts`), the new FK rejects that insert outright, breaking two currently-green P0 tests and the acceptance criterion that requires `bun run test` to stay green. Fix: add a `fixtureRepo()` builder to `fixtures.ts` (same `slug: "blossvm-orchestra"`, same base+override+parse pattern as `fixtureWorkIntent`/`fixtureTaskSpec`), and have `dispatchFixtureWorkIntent` (`pipeline.ts`) upsert it (`INSERT ... ON CONFLICT(slug) DO NOTHING`, or an existence check) before inserting the `WorkIntent`, inside the same transaction.
3. **`packages/orchestra-daemon/src/db/mappers.ts`**: add `rowToWorktree`, `rowToRepo` following the existing `nullsToUndefined` + `Schema.parse` pattern.
4. **`packages/orchestra-daemon/src/db/events.ts`** (new): `writeEvent(db, entityType, entityId, eventType, payload)` — one small insert helper against the existing `events` table (D17's payload shape).
5. **`packages/orchestra-daemon/src/git/git.ts`** (new): ported from `apps/orchestra-web-legacy/src/server/orchestra/git.ts` (D23) — same `execFile`-only discipline (argv array, never a shell string), same `GitError` type. Colocated tests against a real throwaway git repo (`git init` in a temp dir), matching this repo's "verified empirically" convention rather than mocking `execFile`.
6. **`packages/orchestra-daemon/src/git/worktrees.ts`** (new): `createWorktree`, `listWorktrees`/reconcile, `removeWorktree` — algorithm ported from legacy `worktrees.ts` (D23), persistence rewritten against the new `worktrees` SQLite table instead of `state.json`. Reuses `git.ts` from step 5. `PATH` convention (`<repoRoot>/.orchestra/worktrees/<slug>/`) unchanged from Constitution §11. `createWorktree` persists its own `Worktree` row (and its `"worktree"`/`created` event, step 4) as part of this step, not deferred to the pipeline layer — see step 10's corrected transaction description.
7. **`packages/orchestra-daemon/src/fence/glob.ts`** (new): `pathAllowed(filePath, worktreeRoot, allowedPaths, forbiddenPaths): boolean` using `Bun.Glob`, **matching against `filePath` relativized to `worktreeRoot` first** (`path.relative(worktreeRoot, filePath)`) — `allowedPaths`/`forbiddenPaths` are repo-relative patterns (e.g. `"src/components/**"`, per the Constitution's own examples), but `tool_input.file_path` arrives as an absolute path. Plan-critique found that matching the raw absolute path against a relative pattern always fails silently — `Bun.Glob` is start-anchored, so `"src/components/**"` never matches `"/Users/.../src/components/Foo.tsx"` — which would make the fence a no-op end to end despite every individual piece looking correct in isolation. Colocated test with representative glob patterns **and an absolute-path input**, asserting relativization actually happens.
8. **`packages/orchestra-daemon/src/fence/hook.ts`** (new): the `PreToolUse` hook script itself — reads `tool_input.file_path` from stdin JSON, reads fence patterns and the worktree root from `ORCHESTRA_ALLOWED_PATHS`/`ORCHESTRA_FORBIDDEN_PATHS`/`ORCHESTRA_WORKTREE_ROOT` env vars (JSON-stringified arrays + a plain string, set by the daemon when spawning `claude`), calls `pathAllowed` from step 7, writes `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "allow"|"deny", permissionDecisionReason}}` to stdout, exits 0. Colocated test invoking it as a subprocess with fixed env vars and stdin.
9. **`packages/orchestra-daemon/src/claudeCodeCapabilityProvider.ts`** (new): the real provider, parallel to `fixtureCapabilityProvider.ts`. Given a `TaskSpec` + its `Worktree`, builds a `--settings` JSON object inlining the `PreToolUse` hook config pointing at step 8's script, spawns Claude Code via `Bun.spawn(["claude", "-p", intent, "--bare", "--settings", settingsJson, "--output-format", "stream-json", "--allowedTools", "Read,Edit", "--permission-mode", "acceptEdits"], {...})` — **an argv array, never an interpolated shell string** (ADR 0001 §2 Stack's invariant, restated explicitly here since a prior draft of this step showed it as a shell-string example and plan-critique flagged that as inviting a shell-string implementation). `--allowedTools` is `"Read,Edit"` only, per D25 — no `Bash`. `env` carries `ORCHESTRA_ALLOWED_PATHS`/`ORCHESTRA_FORBIDDEN_PATHS`/`ORCHESTRA_WORKTREE_ROOT`; `cwd` is the worktree path. Reads stdout as NDJSON lines, extracts `session_id` from the `system`/`init` event and cost/final text from the terminal `result` event (confirmed shapes, live-verified this session), builds and returns `Promise<{agentRun, receipt}>` (D15 — synchronous-after-await; note the `Promise` explicitly, since `fixtureCapabilityProvider.ts`'s object *shape* matches but its synchronous *signature* does not — plan-critique nit). **First sub-step, before anything else in this file is written**: verify the `--bare` + `--settings`-injected-`PreToolUse`-hook combination actually fires (§4's named risk) with a throwaway manual test. If it doesn't hold, fall back to dropping `--bare`, **and** set `CLAUDE_CONFIG_DIR` to an empty temp directory for the spawned process (plan-critique found the naive fallback — just drop `--bare`, no mitigation — would silently reintroduce JD's own `~/.claude` settings/hooks/CLAUDE.md/skills into what's supposed to be an isolated, reproducible dispatch; pointing `CLAUDE_CONFIG_DIR` at an empty directory keeps the isolation property even without `--bare`). Test: a real (not mocked) dispatch against a trivial prompt in CI is impractical (needs API access) — colocated test instead exercises NDJSON parsing against a fixture transcript file, and the spawn/env/cwd wiring (plus the fence-denial behavior) is verified via the acceptance walk (§5) on JD's machine, matching how P0 handled the Rust/Tauri leg it couldn't unit-test either.
10. **`packages/orchestra-daemon/src/pipeline.ts`**: add `dispatchWorkIntent(db, input)` — the real counterpart to `dispatchFixtureWorkIntent`, taking the real `{repoSlug, intent, taskSpec}` input (§2). **Not one atomic transaction** — `bun:sqlite` transactions are synchronous and this flow has two real async boundaries (git worktree creation, the Claude Code spawn), so plan-critique correctly found the original "one transaction" framing impossible to build as stated. Real shape: (a) look up `repoSlug` in `repos`, 404 if unregistered (plan-critique found this lookup was implied but never named — without it, an unregistered/typo'd slug would feed an undefined `rootPath` into real git); (b) insert `WorkIntent`+`TaskSpec` in one sync transaction + their events (step 4); (c) call `createWorktree` (step 6, which persists its own `Worktree` row + event as noted above); (d) call `claudeCodeCapabilityProvider` (step 9) and insert the resulting `AgentRun`+`Receipt` + their events in a final sync transaction. **Named, accepted risk**: a failure between (c) and (d) can leave a real on-disk worktree with a `Worktree` row but no `AgentRun`/`Receipt` — acceptable for P1 (single-lane, JD can observe and manually clean up); reconciliation/recovery logic is not built this phase. Also add `registerRepo(db, rootPath)` — validates via `isGitRepo`, derives `slug` from the directory basename, inserts into `repos` + its event.
11. **`packages/orchestra-daemon/src/server.ts`**: add the `POST /repos` and `POST /work-intents` routes (§2). The auth check and CORS wrapper (`withCors`, `createFetchHandler`) are reused unchanged, but `routeRequest` itself must become `async function routeRequest(req: Request, deps: DaemonDeps): Promise<Response>` (it's synchronous today) so the new dispatch route can `await` real git/spawn work — `createFetchHandler` must `await routeRequest(...)` before passing the result to `withCors`, not pass a `Promise` straight through (plan-critique found the original "unchanged" framing would, taken literally, produce a `TypeError` on every route, not just the new one, if only `routeRequest` were made async without also fixing the caller).
12. **`apps/orchestra-cockpit`**: add `@tauri-apps/plugin-dialog` dependency; `daemonClient.ts` gets `registerRepo()`/`submitWorkIntent()` following the existing `daemonFetch` pattern (timeout included, D24 — no new UI framework, plain functional elements added to `App.tsx`: a "Register repo" button invoking the native folder picker, an intent textarea, a "Dispatch" button).

---

## 4. Ground-truth anchors

| Claim | Status |
|---|---|
| `--output-format stream-json` NDJSON; terminal `result` event carries final text, cost, session metadata; `tool_use`/`tool_result` appear **nested inside `assistant`/`user` messages**, not as distinct top-level event types | **VERIFIED 2026-07-18** — re-fetched `code.claude.com/docs/en/headless` live this session (supersedes the P0 spec's "PARTIALLY VERIFIED" note, which flagged exactly this as unconfirmed) |
| `PreToolUse` hook config shape (`matcher` syntax, e.g. `"Edit\|Write"`), stdin JSON (`tool_name`, `tool_input.file_path`), stdout JSON (`hookSpecificOutput.permissionDecision: "allow"\|"deny"\|"ask"\|"defer"`, `permissionDecisionReason`) | **VERIFIED 2026-07-18** — re-fetched `code.claude.com/docs/en/hooks` live this session |
| `PreToolUse` hooks fire in headless (`-p`) mode, not just interactive sessions | **VERIFIED 2026-07-18** — same fetch, explicitly stated |
| `--bare` skips auto-discovery of hooks/skills/plugins/CLAUDE.md from settings *files*, but explicitly-passed flags (including `--settings <json>`) still take effect | **VERIFIED 2026-07-18** — same fetch: "Only flags you pass explicitly take effect" under `--bare` |
| Whether `--bare` mode specifically honors a `PreToolUse` hook passed via `--settings` (as opposed to hooks generally) | **NOT independently confirmed** — inferred from the general "`--bare` + explicit flags" rule, not a `--bare`+hooks-specific statement in the docs. **Risk, not a silent assumption**: resolution step is to verify this concretely as the first sub-step of build step 9, before writing the rest of the real provider. If it doesn't hold, the fallback (D14's second option) is dropping `--bare` **plus** setting `CLAUDE_CONFIG_DIR` to an empty temp directory for the spawned process — plan-critique found that dropping `--bare` alone would silently reintroduce JD's own `~/.claude` settings/hooks/CLAUDE.md/skills into a dispatch meant to be isolated and reproducible; the `CLAUDE_CONFIG_DIR` addition preserves that isolation property without `--bare`. |
| `apps/orchestra-web-legacy/src/server/orchestra/{git,gh,worktrees,fence,schemas}.ts` exist and match the descriptions in §1/§3 above | **VERIFIED 2026-07-18** — direct file reads this session |
| Constitution v2 §11 OD2/OD3/PATH still in force, unchanged by ADR 0001 | **VERIFIED 2026-07-18** — direct file read this session (`docs/ORCHESTRA-CONSTITUTION-v2.md`), cross-checked against ADR 0001's "Consequences for downstream" |
| `Bun.Glob` exists as a built-in Bun API | **VERIFIED** — documented Bun API (`new Bun.Glob(pattern).match(str)`), no new dependency needed |

---

## 5. Acceptance (exit criteria)

- [ ] JD clicks "Register repo" in the real cockpit, picks a real folder via the native dialog, and the daemon confirms it as a registered repo (observable: a success state renders on screen).
- [ ] JD types a real intent + task-spec fields, clicks "Dispatch," and watches (via logs or a rendered status, whichever lands first — no live-progress UI is required per D15) a real `git worktree` appear on disk at `<repo>/.orchestra/worktrees/<slug>/`.
- [ ] The dispatched Claude Code process is confirmed fenced: a task whose `allowedPaths`/`forbiddenPaths` are set narrowly, given a prompt that would touch a forbidden path via the `Edit` tool, is observably denied (the hook's `permissionDecisionReason` surfaces, Claude Code doesn't edit the forbidden file). No `Bash`-tool bypass path exists to test, since D25 doesn't grant `Bash` in P1 at all.
- [ ] A real `Receipt` lands in SQLite with `verification: "none"` (D11 — still moot, no R4 action reached), a real `costUsd`, and a real `claudeSessionId` on the parent `AgentRun`.
- [ ] `events` rows exist for the full chain (WorkIntent → TaskSpec → Worktree → AgentRun → Receipt), each payload matching the materialized row it snapshot.
- [ ] `bun run test`, `bunx tsc --noEmit` (all packages/apps), `bunx drizzle-kit check`, `cargo check` all green — same gate P0 used.

---

## 6. Out of scope for Phase 1 (explicitly deferred, not dropped)

- D9's git-write mutex (P2 — D16, this session)
- Stacked commit → push → `gh pr create` actions, OD3's T3-mirror dirty-tree semantics (P2 — those git *write* actions don't exist yet in P1, only worktree creation)
- Multiple concurrent worktrees/lanes (P2+ — P1 is one at a time)
- Multiple registered repos (P2+ — D21, one `Repo` row for P1)
- Any cockpit visual design pass (P3 — D24)
- Live/incremental dispatch progress in the UI (deferred by D15, not scheduled to a specific later phase — revisit when P3's real-state rendering makes it worth the infrastructure)
- Codex and Cursor capability providers, their fence mechanisms (P5 — D18)
- Single-binary packaging (P5, unchanged from P0)
- `Bash` tool access for the dispatched agent (D25) — P1's agent can `Read` its worktree and
  `Edit` within the fence, nothing more; running its own tests/builds/git commands is a later
  call, not scoped here. Revisit once there's a real fence mechanism that covers `Bash`
  (command-inspection, or Codex's P5 OS-level sandbox) rather than granting it unguarded.
- **Read-fencing** (re-judge pass, named not silently dropped): `--allowedTools "Read,Edit"`
  grants unfenced `Read` — the `PreToolUse` hook only matches `Edit|Write`, so the agent can
  read files anywhere on disk, not just inside its worktree, even though it can only *write*
  within the fence. Accepted for P1 (read-exfiltration is a materially smaller risk than the
  write-side bypass D25 closes, and the intent text/prompts are founder-authored, not
  adversarial-input-driven); revisit if `Read` scoping becomes worth its own hook matcher.
- `gh.ts`'s port from the legacy app (D23) — deferred to P2, where `gh pr create` is first
  actually called; porting it now would be dead code for a full phase.
