# Phase 3A — Operational Cockpit (determined-sequence spec)

**Status:** In progress · slice A (backend read layer) landed
**Date:** 2026-07-20
**Branch:** `claude/phase-3a-operational-cockpit`
**Predecessors:** P0 (constitutional seed), P1 (worktree isolation), P2 (stacked PR actions). ADR-0001 supersedes the Constitution's create-t3-app/tRPC stack with Tauri v2 + Bun.

## Reason

Through P2 the daemon grew real tables and a real mutation surface, but the cockpit
(`App.tsx`) can only show what it *just* dispatched this session — the daemon exposes no
read/list/snapshot endpoint, so persisted state is invisible after a restart. P3A closes
that: the Tauri cockpit renders **real daemon state** (the two surfaces designed in the
2026-07-20 Paper session — the operational **Desk** and the **System** instrument panel),
backed by SQLite instead of fixtures. D24 (P1's "UI stays plain, defer design to P3") is
now discharged.

## 1. Decisions

- **D34 — one read endpoint.** `GET /state/snapshot` composes the six materialized tables
  (`repos`, `workIntents`, `taskSpecs`, `worktrees`, `agentRuns`, `receipts`). No new
  persisted "lane" table: a lane is a **client-side view model** joining
  WorkIntent → TaskSpec → Worktree → AgentRun → Receipt (`snapshotViewModel.ts`). The
  append-only `events` table is never read for state (D6).
- **D35 — validated, ordered aggregate.** Each list is ordered newest-relevant-first in
  the query; every row passes its `@orchestra/core` mapper; the whole aggregate is
  validated against `StateSnapshotSchema` (new, in core) before leaving the daemon. A
  malformed persisted row surfaces as a **500**, never a silently wrong snapshot.
- **D36 — honest health.** `GET /system/health` runs only real, safe checks — a trivial DB
  read, `Bun.version`, and `<tool> --version` / `gh auth status` via **argv + bounded
  timeouts**. Each check reports `ok | degraded | unavailable`; an absent tool reports
  `unavailable`, never a faked pass. No check returns a credential or token (details are
  fixed safe strings, not raw process output).
- **D37 — polling, not streaming.** The cockpit fetches the snapshot on startup, after every
  mutation, and ~2s while the document is visible; it stops when hidden, prevents
  overlapping requests, keeps the last good snapshot through a transient failure, and shows
  a visible stale/error state. No WebSockets/SSE this phase.
- **D38 — state-driven single-window shell.** `AppShell` + `LeftRail` + `SystemBar` + the
  Desk/Lanes/Repos/Review/System features (per the handoff's component layout). No router
  unless it materially helps.
- **D39 — visual direction locked.** Dark instrument-panel structure skinned with the
  cherry-blossom hero (`hero-dark-blossom.png`), rose = conductor actions, cyan = live
  agents, IBM Plex for data, Cormorant + blossom for identity. Ships the hero as a cockpit
  asset; tokens in `styles/tokens.css`.
- **D40 — promotion unchanged.** Push & Open PR remains the existing explicit stacked
  action (D27); the control is hidden/locked until the run has completed, a receipt exists,
  a worktree exists, and the state is eligible. No new promotion path, never automatic.
- **D41 — trunk scan is read-only and unbreakable.** The Trunk-map view is backed by a
  `git log` scan (`GET /repos/:slug/trunk`), not a persisted commit table. It is bounded
  (≤50 commits/branch, timeout), takes no git-write mutex, and degrades per-branch rather
  than failing — a missing/detached branch comes back flagged and empty. Per-commit diffs
  (`git show --numstat`) are the immediately-next slice, not built yet.

## 2. Backend read layer — **landed this slice**

- `@orchestra/core` gains `StateSnapshotSchema` / `StateSnapshot` (`snapshot.ts`) — a pure
  contract over the existing domain schemas.
- `orchestra-daemon`:
  - `state/snapshot.ts` → `buildStateSnapshot(db)` (D34/D35).
  - `system/health.ts` → `SystemHealthSchema`, `checkSystemHealth(db)` (D36).
  - `state/trunk.ts` → `scanTrunk(db, slug)` (D41) — read-only `git log` scan for the
    Trunk-map view: base branch + each live lane's branch with recent commits, **bounded**
    (≤50 commits/branch, timeout) and **gracefully degrading** (a branch it can't scan
    returns `degraded: true`, empty, never failing the whole scan). No git-write mutex —
    nothing here writes. `TrunkScanSchema` in `@orchestra/core`.
  - `server.ts` → `GET /state/snapshot`, `GET /system/health`, `GET /repos/:slug/trunk`
    (all behind the existing bearer-token auth; snapshot → 500 on a bad row, trunk → 404
    only for an unregistered repo).
- `daemonClient.ts` → typed `getStateSnapshot()`, `getSystemHealth()`, reusing the bounded
  `daemonFetch`.
- Tests (`server.test.ts`, Phase 3A block): 401 on both routes unauthenticated; empty
  snapshot well-formed; a dispatched fixture appears; a malformed row → 500; health reports
  Daemon + Database `ok` with a well-formed checks array and no token leakage.

**Gates run:** `bun test` (127 pass / 0 fail), `tsc --noEmit` clean on core/daemon/cli/cockpit,
`drizzle-kit check` clean (no schema change). Rust untouched.

## 3. UI — slices B and C (next)

- **B —** `useOrchestraSnapshot` polling hook (D37); `AppShell`/`LeftRail`/`SystemBar`;
  Desk = the real WorkIntent composer (reusing `submitWorkIntent`) + the joined lane list
  (`snapshotViewModel.ts`). `tokens.css` + hero asset.
- **C —** `LaneInspector` (evidence + the gated `runStackedAction`), `SystemHealthPanel`
  (from `getSystemHealth`), the empty/loading/error/stale states, keyboard focus +
  reduced-motion. A `RuntimeTarget` seam is left clean for future MacBook/Fedora/DGX Spark
  targets without implementing them.

## 4. Acceptance criteria

The exit condition (unchanged from the handoff): a real persisted Orchestra lane can be
**dispatched, observed, reviewed, and explicitly promoted** through the new cockpit, and
survives a close/reopen. The 12-step manual walk (launch → health → see repos → register →
compose with visible fences + risk tier → dispatch → see intent/task/run/worktree/receipt
in a lane → inspect verification → enter commit message → click Push & Open PR → see PR
URL/warnings → reopen and see persisted state) is run against a throwaway repo before the
branch is called ready.

## 5. Invariants preserved (verified against ADR-0001)

Rust supervises one Bun daemon only; business logic stays in the daemon; React never reads
SQLite or receives the token; daemon stays bound to `127.0.0.1`; every new route is
bearer-authenticated; current state comes from materialized tables, never event replay; git
uses argv arrays; push/PR stay explicit human actions. P3A adds no new security surface —
both new routes are authenticated reads.
