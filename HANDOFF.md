# Handoff — Phase 0, after Step 7 (2026-07-18)

**Update, same date, later in the session:** Steps 5, 6, and 7 (below, originally written as
the next session's TODO) are now done — see the three newest commits and the "Session 2"
note at the bottom of this file for what actually shipped and the one thing still unverified
(JD's real Mac). The rest of this file is left as written for the historical record of what
Session 1 handed off; don't take its checklist at face value without reading the update at
the bottom.

# Handoff — Phase 0, after Step 4 (2026-07-18) — Session 1's original handoff

Written because this session hit its context window mid-build. Read this before touching
anything — it has the state a fresh session has no memory of.

## Model routing for the next session (JD's explicit instruction)

> "the next session will be a sonnet 5 session utilizing fable and opus for review and
> critique - only escalate to fable for specific review so as to not obliterate usage"

- **Sonnet 5** — main-loop executor. Writes the code, runs the verification commands, does
  the day-to-day work.
- **Opus** — regular review/critique. Use for the routine "does this look right" passes,
  plan-critique on any new spec/ADR text, and ordinary code review.
- **Fable** — reserved for specific, named-moment adversarial reviews only. Not routine.
  Use it the way it was used for Step 4: author (Sonnet) ≠ reviewer (Fable), fresh context,
  reviewer explicitly charged to refute, at a deliberately chosen checkpoint — not on every
  diff. Escalating to Fable by default burns budget it's specifically being rationed against.

## Where the build actually is right now

Governing spec: `docs/specs/2026-07-18-phase-0-constitutional-seed.md` (plan-critiqued,
zero open decisions, this is the contract — read its §1 Ratified decisions and §1.5
Contract definitions before writing any code that touches the schemas). ADR:
`docs/adr/0001-tauri-bun-architecture.md`.

§3 Determined build sequence, against the task list:

- [x] Step 1 — ADR landed (D1-D13).
- [x] Step 2 — four-package workspace scaffolded; legacy Next.js app moved to
      `apps/orchestra-web-legacy` via `git mv`, untouched, still builds and runs.
- [x] Step 3 — the four §1.5 schemas (`WorkIntent`, `TaskSpec`, `AgentRun`, `Receipt`) as
      Zod schemas in `packages/orchestra-core`, 19 real tests, all passing.
- [x] Step 4 — SQLite (Drizzle) in `packages/orchestra-daemon` — **just committed**
      (commit `a450c7c` on this branch), Fable-reviewed first. See "Fable review" below for
      what shipped, what was fixed, and the two findings that did NOT get fixed and need a
      decision before Step 5/6.
- [ ] Step 5 — fake capability-provider adapter (next up). Spec §3.5: deterministic, no real
      agent, no real git, mirrors the existing `fixtures.ts` pattern in the legacy v0 app
      (`apps/orchestra-web-legacy` — grep it for the actual pattern rather than
      reimplementing from prose). Accepts a `TaskSpec`, produces a fixture `AgentRun`
      (`provider: "fixture"`) and `Receipt` (`verification: "none"`).
- [ ] Step 6 — two end-to-end verifications (spec §3.6): the **contract path** (fixture
      `WorkIntent` → `TaskSpec` → fake `AgentRun` → `Receipt`, lands in SQLite, read back
      from materialized tables only) and the **IPC path** (same fixture submitted from
      `orchestra-cockpit`'s UI over real authenticated `fetch()` to the daemon's local HTTP
      server, `Receipt` read back the same way — this is the actual architecture bet Phase 0
      exists to de-risk). Do Step 5 before Step 6; Step 6's contract-path test needs Step 5's
      adapter to produce something to persist.
- [ ] Step 7 — record D8 (fence/hooks), D9 (git mutex), D11 (R4 verification) as short,
      dated ADR entries — decision recorded, implementation deferred to the phase named in
      spec §1 (D8/D9 → P1, D11 → moot for P0, applies from whichever phase does R4 work).

## Fable review — what happened and what's still open

Before Step 4's commit, JD asked for a Fable adversarial review of the uncommitted SQLite
work (author = Sonnet, reviewer = Fable, fresh context, charged to refute). It returned
BLOCKING/SHOULD-FIX/NIT findings. The cheap ones (roughly an hour combined, cheapest to fix
before the code ever touched a commit) are done, in commit `a450c7c`:

- **F1** — Drizzle columns silently widened enum fields to bare `string` (verified
  empirically: `status: "bogus"` compiled and inserted). Fixed: every enum column now uses
  `{ enum: SomeSchema.options }` imported from `@orchestra/core`, so the two schema
  definitions can't drift apart under the strict tsconfig.
- **F3** — `daemon.ts` wrote the auth token to disk *before* binding the port. An orphaned
  daemon already holding `DAEMON_PORT` would have its live token silently clobbered, and a
  fresh daemon would then fail to bind but exit with the orphan's token now gone — the
  cockpit stuck in a confusing indefinite 401 loop. Fixed: bind first, write token only
  after `Bun.serve()` succeeds.
- **F5** — the `events` table's append-only-ness was convention only; UPDATE and DELETE
  both silently succeeded (verified empirically). Fixed: migration
  `0001_events_append_only.sql` adds `RAISE(ABORT)` triggers on both. `db.test.ts` now
  asserts both throw, and the old test (misleadingly named as if it proved append-only-ness
  when it only proved inserts worked) is renamed to say what it actually tests.
- **F6** — root `package.json` had no scoped test script; a bare `bun test` from repo root
  sweeps in every `*.test.ts` in the tree regardless of package.json, including
  `apps/orchestra-web-legacy`'s vitest-authored tests. Fixed: root now has
  `"test": "bun run core:test && bun run daemon:test"` — **use `bun run test`, not bare
  `bun test`, from repo root.** Bare `bun test` still sweeps the legacy app (confirmed: one
  of its tests is pre-existing-flaky, unrelated to this build) — a full fix would need a
  bunfig.toml exclude or similar, judged not worth doing for Phase 0.
- **F7** — `db.ts`'s `createDb()` always `mkdir`'d `~/.orchestra`, regardless of what path
  was actually passed in. Any future caller passing an explicit path outside
  `~/.orchestra` (a test fixture, an alternate profile) would hit `ENOENT` on the sqlite
  open. Fixed: mkdirs the target path's own parent directory.

**Two findings were deliberately NOT fixed** — Fable's own recommendation was that these are
real decisions, not mechanical fixes, and rushing them now risks getting the decision wrong
under time pressure. They need to be resolved as part of Step 5/6, in writing, before code
depends on the answer:

- **F2 — the Zod/Drizzle null-vs-undefined seam.** The Zod schemas in `@orchestra/core` use
  `.optional()` for absent fields (e.g. `TaskSpec.modelHint`, `TaskSpec.riskTier`,
  `Receipt.prUrl`). SQLite via Drizzle represents an absent column value as `null`, not
  `undefined`, when a row is selected back. A raw cast from a Drizzle row to the
  corresponding Zod-inferred type will **not** type-check cleanly under
  `exactOptionalPropertyTypes: true` (this repo's locked tsconfig — see `tsconfig.base.json`
  and, for the cross-repo precedent, `construction-os`'s ADR 0005 Amendment 2026-05-09,
  which hit the same seam), and worse, `SomeSchema.parse(rawRow)` will actively reject a
  `null` where the schema expects `undefined | string`. **This will detonate the first time
  Step 6's contract-path test tries to read a row back and parse it against the Zod schema.**
  The decision needed: does the daemon get an explicit row→domain mapping function per table
  (converting `null` → `undefined` at the boundary before handing to `SomeSchema.parse`), or
  do the Zod schemas change to accept `null` directly (`.nullable()` alongside/instead of
  `.optional()`)? Recommend the former — it keeps `@orchestra/core`'s contracts persistence-
  agnostic, which is the whole point of it being a zero-I/O package — but this is a real
  paper-session-sized call, not a default to assume silently.
- **F4 — the Tauri daemon-supervision cleanup gap.** In
  `apps/orchestra-cockpit/src-tauri/src/lib.rs`, the daemon child process is killed only via
  `.on_window_event()` matching `WindowEvent::Destroyed`. This is a single path: it does not
  cover a crash, a panic, `RunEvent::ExitRequested` (no second net registered there), or a
  force-quit. `child.kill()` is also not followed by a `.wait()`, a minor zombie-process risk.
  Combined with F3's fix: a daemon orphaned by a cockpit crash will still hold `DAEMON_PORT`,
  and the *next* cockpit launch's daemon will now fail loudly at bind (good — F3 fixed the
  silent-corruption failure mode) but the user still has no orphan-cleanup path except
  killing it by hand. This needs a real decision on process-supervision robustness (a
  `RunEvent::ExitRequested` handler at minimum; whether to detect-and-kill an orphan on the
  next launch is a separate, bigger call) — reasonable to fold into Step 5/6's work or defer
  explicitly to P1, but it should be a named decision, not silently carried forward.

## Repo / environment facts a fresh session needs

- Repo: `blossvmtn/blossvm-orchestra`. Branch: `claude/orchestra-workflow-architecture-mwijvk`
  (already exists, already has this history — do not create a new branch).
- Latest commits on this branch, oldest to newest at handoff time: `278ca0f` (D13 wording
  fix) → `1e4ecab` (plan-critique resolved) → `b737c4a` (IPC transport corrected to local
  HTTP + token) → `997053f` (Step 1-2) → `061285f` (Step 3) → `a450c7c` (Step 4,
  Fable-reviewed) → this handoff commit.
- Package manager/runtime: Bun. `bun install` at repo root sets up the workspace.
  `npm run dev` is banned in the *other* BlossomTN repos (Sakura/Tenjō) for an unrelated
  reason (Turbopack); that ban does not apply here — Orchestra has no such constraint, this
  is a fresh Bun monorepo, not a Next.js app (except the untouched legacy app, which does
  carry its own `npm run dev` convention — see its own scripts).
- Verification commands that are known-good right now (all re-run clean before the Step 4
  commit): `bun run test` from repo root (core 19/19, daemon 4/4); `bunx tsc --noEmit` from
  each of `packages/orchestra-core`, `packages/orchestra-daemon`, `packages/orchestra-cli`;
  `bunx drizzle-kit check` from `packages/orchestra-daemon` (confirms no schema/migration
  drift). Rust side (`cargo check` / `cargo build` in
  `apps/orchestra-cockpit/src-tauri`) was not touched this pass and was not re-run — no Rust
  files changed since it was last verified clean in Step 2.
- This container is headless Linux, not JD's actual Apple Silicon macOS target. Tauri build
  verification here used `xvfb-run` (virtual display) and confirmed the daemon spawns,
  binds, and answers an authenticated request — but literal pixel rendering has never been
  seen on this machine and needs JD's real Mac to confirm.
- System deps installed on this container for Tauri builds (will need reinstalling in any
  fresh container): `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
  libayatana-appindicator3-dev libsoup-3.0-dev build-essential`.

## Linear

- Initiative: **Orchestra**.
- Project: **Orchestra — Build** (`5b13f36b-0986-419b-aefd-a3c852846fc7`,
  https://linear.app/blossomtn/project/orchestra-build-a977c5ae54ad) — one project, six real
  Linear Milestones (not the old per-phase-project convention; JD explicitly chose to switch
  to Linear's actual recommended Initiative → Project → Milestone → Issue shape for
  Orchestra specifically, a deliberate divergence from his historical pattern elsewhere).
  Milestone IDs: P0 `1c9ecae0-ed6b-407c-92f1-cb7fbb01a466`, P1 `93e80185-fbb9-470f-b445-2189b57a6eef`,
  P2 `7ebd59e6-2eea-43f9-8718-a2a6e71f19de`, P3 `172153da-da77-4cb8-bbe2-75bd7b1e75d6`,
  P4 `2de968d1-035c-4fdc-b374-fedf5060a470`, P5 `d56b965f-48f5-4b6b-809a-70cc668451ab`.
- No issues have been filed under the project yet (`list_issues` on the project returns
  empty) — the build so far has been tracked via this repo's spec + this session's own task
  list, not Linear issues. Whether to retroactively file Steps 1-4 as closed issues, or just
  start filing from Step 5 forward, is JD's call, not decided here.
- There is also an **Orchestra — Product Backlog** project
  (`c606b5bf-357e-4001-aa51-1169b05c0da8`) — intake-only, not for active build work.

## Immediate next action for the fresh session

Start Step 5 (fake capability-provider adapter) in `packages/orchestra-daemon` (or a new
`packages/orchestra-core` addition if the adapter turns out to belong with the pure-domain
code rather than the daemon — worth a quick judgment call reading spec §3.5 again, it says
"in `orchestra-daemon`" but doesn't elaborate further). Before writing it, resolve F2 (the
null/undefined seam) as part of the same step, since the fake adapter's `Receipt` output
will be the first thing Step 6 tries to persist and read back — better to decide the mapping
approach here than discover it mid-Step-6. Delete this file (`HANDOFF.md`) once its content
has been fully absorbed into normal working memory for the session, or leave it — JD hasn't
stated a preference either way.

---

## Session 2 update — Steps 5, 6, 7 done (2026-07-18, same day)

Model routing followed exactly as instructed above: Sonnet wrote every line, Opus reviewed
both Step 5 and Step 6 in fresh context before commit, Fable was not invoked (nothing met
the "specific, deliberately-chosen checkpoint" bar this pass). Three new commits on this
branch, oldest to newest: `2815b57` (Step 5) → `9cff8b6` (Step 6) → this one (Step 7, ADR
only, no code).

- **Step 5 — F2 resolved, fake adapter built.** `packages/orchestra-daemon/src/db/mappers.ts`
  converts Drizzle's `null` to `undefined` for every optional field across all four §1.5
  schemas before `Schema.parse()` sees a row (the recommended approach from the Step 4
  handoff — keeps `@orchestra/core` persistence-agnostic). `fixtureCapabilityProvider.ts` is
  the adapter itself, placed in `orchestra-daemon` (not `-core`) since P1's real providers
  will need I/O and belong there too.
- **Step 6 — both end-to-end verifications built and automated.** `pipeline.ts`'s
  `dispatchFixtureWorkIntent`/`getReceiptById` are the contract path
  (`pipeline.test.ts` proves the read sources only materialized tables, not just asserts it).
  `server.ts` grew `POST /fixture/dispatch` + `GET /receipts/:id`; `server.test.ts` binds a
  real `Bun.serve()` on an ephemeral port and drives it with real `fetch()` over a real
  loopback socket — the closest an automated test gets to the IPC path without a real Tauri
  window. **Opus's review caught a real gap before commit:** the daemon had no CORS
  handling, so the cockpit's cross-origin `fetch()` (carrying a custom `authorization`
  header, forcing a preflight) would have failed before ever reaching the auth check — the
  one class of bug a loopback-only automated test structurally cannot see. Fixed with an
  `OPTIONS` handler + CORS headers on every response; this completes the already-locked
  "plain fetch(), no Tauri relay" decision (spec §3 step 2), it doesn't reopen it. `App.tsx`
  grew a "Dispatch fixture work intent" button + Receipt render for the manual click-through.
- **Step 7 — D8/D9/D11 recorded, plus F4 given an explicit disposition.** See the
  "Amendment 2026-07-18" section appended to `docs/adr/0001-tauri-bun-architecture.md`. F4
  (Step 4's Fable finding on Tauri daemon-supervision cleanup) is explicitly deferred to P1
  there, not silently carried forward again.

**Real-Mac verification — done, 2026-07-18, same day.** `bun run cockpit:dev` needed two
one-time machine setup steps neither Session 1 nor Session 2 had hit before (this Mac had
neither Bun nor the Rust toolchain installed): Bun via `brew install oven-sh/bun/bun`, Rust
via `rustup` (the standard installer), plus adding `. "$HOME/.cargo/env"` to `~/.zshrc` since
`rustup`'s installer only wired it into `~/.profile`, which zsh doesn't source. Xcode Command
Line Tools were already present. Once both toolchains were on `PATH`, `cargo metadata`
resolved cleanly and `bun run cockpit:dev` compiled and launched the real Tauri window.

JD clicked "Dispatch fixture work intent" in the real cockpit window and confirmed by
screenshot: `daemon reachable`, then a rendered Receipt — `outcome: succeeded`,
`verification: none`, the fixture summary text — literal pixels, real WKWebView, real
Rust-resolved token. The CORS fix from Step 6 held on first try against the real webview.
**All three of spec §4's acceptance criteria are now met.** Phase 0 is complete.

Verification commands re-confirmed clean at the end of this session (same as Session 1's
list, now with more tests): `bun run test` (core 19/19, daemon 22/22 — was 4/4 at Step 4);
`bunx tsc --noEmit` clean in all four packages/apps (`orchestra-core`, `orchestra-daemon`,
`orchestra-cli`, `orchestra-cockpit`); `bunx drizzle-kit check` from `packages/orchestra-daemon`
clean (no drift — Steps 5-7 touched no migrations). Rust/Tauri build itself was not
re-verified this session (no Rust files changed since Step 2); still needs the real-Mac
click-through above regardless.

Bun was not installed on this machine at the start of this session (installed via
`brew install oven-sh/bun/bun`, then `bun install` at repo root) — worth noting since Session
1's container had it preinstalled and this one didn't; a fresh session/container should
expect to do this step if `bun --version` fails.
