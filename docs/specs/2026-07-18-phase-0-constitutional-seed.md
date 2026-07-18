# Phase 0 — Constitutional Seed

**Status:** Revised post plan-critique (2026-07-18) — see §6 Revision log. Zero open decisions remaining.
**Repo:** `blossvmtn/blossvm-orchestra`
**Branch:** `claude/orchestra-workflow-architecture-mwijvk`
**Supersedes:** `docs/ORCHESTRA-CONSTITUTION-v2.md` §12 Non-goals (the Electron/Tauri deferral only) and §11's **OD1 row specifically** (the `gemma4:31b` model pin) — corrected citation; the Constitution has sections §0–§12 only, no §16/§24/§26/§27.
**Does NOT supersede — still in force:** §11's **OD2** (`FenceSpec` in `state.json` is source of truth) and **OD3** (T3-mirror stacked dirty-tree semantics) and **PATH** rows — D8 and D9 below depend on these. §2 Stack (git safety via `execFile`, no shell interpolation — still binding). §6 Module boundaries (ownership-separation spirit — the concrete modules are renamed below, the separation principle isn't).

---

## 0. Goal

Stand up the contractual and structural foundation for the Tauri v2 + Bun-sidecar architecture, so that Phase 1 (worktree isolation) begins against a locked, zero-ambiguity base. Phase 0 produces contracts and skeletons, not working orchestration. It proves the *shape* holds before anything real runs inside it.

**The full build goal this seeds (recorded now, not invented later, per JD's explicit instruction to map the whole walk up front):**

```
P0  Constitutional seed        ← this document
P1  Worktree isolation          (Module A logic, real git, one repo)
P2  Stacked PR actions          (commit → push → gh pr create)
P3  Landscape + Desk UI         (Tauri cockpit renders real state)
P4  Hermes clerk                (local model integration)
P5  Multi-agent + polish        (Codex, Cursor adapters; packaging; onboarding)
```

P1 begins with **one** capability provider (Claude Code) not because the others are cut, but because everything past P1 depends on the loop existing at all — a dependency-ordering choice, not a scope-reduction one. Codex and Cursor adapters are P5 line items in this map, not deferred-indefinitely ideas.

---

## 1. Ratified decisions

| # | Decision | Rationale / source |
|---|---|---|
| D1 | Desktop shell is Tauri v2. Rust is scoped to: native shell (windowing, tray, notifications, menus) and spawning/supervising **exactly one child process** (the sidecar). No business logic, no multi-process supervision, no PTY handling in Rust. | JD locked Tauri explicitly this session. Scope narrowed per critique finding #4 — process supervision is the hard, unforgiving kind of Rust and sits on JD's learning-curve critical path; keep his first Rust small and safe. |
| D2 | Sidecar runtime is **Bun**, on the **stable channel**. Not the Rust-rewrite canary (`bun upgrade --canary`) — canary is Linux x64 glibc only as of this writing; JD is on Apple Silicon macOS. Verified 2026-07-18. | Resolves the dead-`pkg` problem (see D3) with a native, actively maintained alternative; matches JD's TypeScript-first strength. |
| D3 | Sidecar is **not** compiled to a single binary in P0–P4. It runs as `bun run daemon.ts` from source, assuming Bun is installed on JD's own machine. No `pkg` (archived January 2024, confirmed dead), no Node SEA. Single-binary packaging (`bun build --compile`, evaluated fresh) is explicitly a P5 concern. | Critique finding #3. Removes a real week of native-module packaging risk (`node-pty`, `better-sqlite3`) from the critical path before any orchestration logic exists. |
| D4 | First capability provider is **Claude Code only**, driven via `--output-format stream-json` (structured events) — not raw PTY scraping. Codex and Cursor adapters are real, planned, P5 line items, sequenced after the Claude-only loop is proven end-to-end. | Critique finding #1 (three simultaneous adapters is the highest-risk scope trap for a solo dev) + finding #2 (structured output avoids the terminal-emulation/backpressure problem PTY driving creates). Anchor to re-verify before P1 build: confirm `--output-format stream-json` and `PreToolUse` hooks against current Claude Code docs at P1 kickoff — asserted by the critique from training knowledge, not independently re-fetched this session. |
| D5 | Local persistence is **SQLite** (Drizzle or Kysely), replacing the current plain-JSON `~/.orchestra/registry.json` / `<repo>/.orchestra/state.json` files. | Needed for the state machine and multi-schema model; JSON files don't survive concurrent writes from multiple lanes safely. |
| D6 | **Event log is a write-only audit trail. It is never replayed to reconstruct current state.** Materialized state tables (one row per live entity: intent, task, run, receipt) are the sole source of truth for "what is true right now." Every state-changing operation writes to both: the event row (append, never edited) and the materialized row (upsert in place). | Critique finding #7. Removes the classic event-sourcing failure mode (log and projection silently drifting apart) while preserving the durable, inspectable history JD wants. |
| D7 | Phase 0 defines exactly **four** schemas: `WorkIntent`, `TaskSpec`, `AgentRun`, `Receipt`. `Evidence`, `Handoff`, `Approval`, `PromotionProposal` are real and will be built, but not modeled until the phase that needs them (P2+). | Critique finding #8 — eight schemas and a nineteen-state machine, defined before one real lane has run, is front-loaded modeling churn with zero feedback yet. |
| D8 | Fence enforcement decision (locked now, implemented in P1, not P0): Claude Code gets a real `PreToolUse` hook checking Edit/Write paths against the fence and denying violations. Codex gets its OS-level sandbox scoped to the worktree root. Cursor's `.cursor/rules` remain advisory. Constitution v2's "physical isolation" language is corrected: the git worktree boundary is the real hard isolation; the fence is a softer, secondary constraint. | Critique finding #5 — the strongest single finding: fences were advisory for every agent, not just two of three, and the language overclaimed. |
| D9 | Git-write concurrency decision (locked now, implemented when P1/P2 touch real git writes): a per-repo mutex in the daemon serializes all git *write* operations across lanes, since worktrees share one `.git` object store. | Critique finding #6. |
| D10 | Orchestra does **not** build a shared domain-neutral Runtime core with a future Sakura Home today. Only the R0–R4 risk-tier convention and the receipt shape are copy-candidates for later, informal, not shared code. Orchestra's four schemas belong to Orchestra. | Critique finding #9, and JD's explicit agreement this session — corrects an earlier recommendation in this same conversation. Revisit only when Sakura Home is a real second consumer, not before. |
| D11 | R4 ("sensitive": merge, deploy, migration, secrets, destructive git) verification is defined concretely as: **JD runs the acceptance walk himself.** No automated verifier is built for this. Moot for Phase 0 specifically — Phase 0 performs no real git writes and reaches no R4 action. | Critique finding #11. |
| D12 | Herdr (`ogulcancelik/herdr`, AGPL-3.0-or-later, real and fully open source) is **not** a dependency and no Herdr code enters this repo. Its design — per-agent detection manifests, the workspace/tab/pane/agent hierarchy, event-subscribe primitives — may be studied and independently reimplemented under Orchestra's own code, at any future phase this becomes relevant (likely P3+, live state detection). | AGPL is viral on code copying; ideas and observed behavior carry no such restriction. |
| D13 | The existing Next.js v0 app is **not touched, not removed, not deprecated** by Phase 0 — it stays in the repo, buildable, available. Whether JD actively runs it day to day is his call, not assumed: he's flagged that its `localhost` dev server competes with `localhost` as his proving ground for everything else he builds, so it is *not* presumed to be his daily-use stopgap. Cutover to the Tauri cockpit happens only once P3 exit criteria are met. | Corrected 2026-07-18 — the original wording of this decision asserted daily use as settled; it wasn't. Ten parallel agent sessions in one day is still the real, current pain this rebuild exists to fix — the rebuild must never regress JD below his current baseline, whatever form that baseline actually takes. |

---

## 1.5 Contract definitions (resolves plan-critique F1, F4)

Concrete field sets for the four D7 schemas — mapped from the existing packet types in `schemas.ts` where a field genuinely carries over, marked **new** where it doesn't. This section is the actual deliverable of Phase 0; §3 steps 3–6 build against it, not against prose.

### `WorkIntent` — one per founder-stated goal (was: the manifest's top-level fields, minus the workers array)

| Field | Type | Source |
|---|---|---|
| `id` | uuid | new |
| `planId` | uuid | carried from `OrchestraManifestSchema.planId` |
| `repoSlug` | string | carried |
| `intent` | string | carried |
| `status` | `"captured" \| "scoped" \| "planned" \| "closed"` | new — the intent-level slice of the state machine; task-level status lives on `AgentRun` |
| `createdAt` | ISO8601 | new |

### `TaskSpec` — one per worker lane. **N per `WorkIntent`, not 1:1.** This is the fan-out that makes parallel lanes possible — the original prose implied a false 1:1 split.

| Field | Type | Source |
|---|---|---|
| `id` | uuid | new |
| `workIntentId` | uuid (fk) | new — the explicit fan-out link `ORCHESTRA-MANIFEST` never needed, since it nested workers inline |
| `slug` | string | carried from `ManifestWorker.slug` |
| `branch` | string | carried |
| `role` | string | carried |
| `modelHint` | string, optional | carried |
| `allowedPaths` | string[] | carried |
| `forbiddenPaths` | string[] | carried |
| `acceptance` | string[] | carried |
| `riskTier` | `"R0"\|"R1"\|"R2"\|"R3"\|"R4"` | new — field exists from P0 so P1's D8/D9 work has somewhere to land; always unset until P1 |
| `createdAt` | ISO8601 | new |

### `AgentRun` — one per actually-dispatched process. **This entire schema is new.** `WORKTREE-SYNC-LOG` is a heartbeat *within* a run, not the run itself — it has no run identity, no start/end time, no provider. Conflating the two was the actual bug in the original mapping.

| Field | Type | Source |
|---|---|---|
| `id` | uuid | new |
| `taskSpecId` | uuid (fk) | new |
| `provider` | `"claude-code"\|"codex"\|"cursor"\|"fixture"` | new — `"fixture"` is what P0's fake adapter writes |
| `claudeSessionId` | string, optional | new — populated from the real `system`/`init` event's `session_id` once P1 wires real driving (§2 anchor); null for every P0 run |
| `status` | `"queued"\|"running"\|"blocked"\|"done"\|"failed"` | new |
| `lastHeartbeatSummary` | string, ≤280 chars, optional | this is where `SyncLogSchema.summary` actually lives now — a run's latest known status, not a separate object |
| `startedAt` | ISO8601 | new |
| `endedAt` | ISO8601, optional | new |
| `costUsd` | number, optional | new — sourced from the real `result` event's cost field (§2 anchor) once P1 wires real driving |

### `Receipt` — one per completed `AgentRun`. `PR-BRIEF` genuinely becomes *part* of this, not all of it — the fields below name what the rest is and where it comes from.

| Field | Type | Source |
|---|---|---|
| `id` | uuid | new |
| `agentRunId` | uuid (fk) | new |
| `taskSpecId` | uuid (fk, denormalized) | new |
| `outcome` | `"succeeded"\|"failed"\|"cancelled"` | new |
| `summary` | string | new |
| `prUrl` | string, optional | carried from `PrBriefSchema.prUrl` |
| `prTitle` | string, optional | carried from `PrBriefSchema.title` |
| `filesTouched` | string[], optional | new |
| `verification` | `"none"\|"human_acceptance_walk"` | new — ties to D11; always `"none"` for P0's fixture receipts since nothing real happened |
| `costUsd` | number, optional | carried forward from the parent `AgentRun` |
| `createdAt` | ISO8601 | new |

`CONDUCTOR-OVERRIDE` maps to nothing in this list — it's a broadcast instruction, not a lifecycle record, and stays its own packet type per D7's scope (not modeled as a P0 schema; revisit if a later phase needs it as one).

---

## 2. Ground-truth anchors

| Claim | Status |
|---|---|
| Current `blossvm-orchestra` is a working v0: Next.js 15.2.3 + tRPC + React + Tailwind, no database, plain-JSON state, ~5.8k LOC with real tests | **VERIFIED** — direct file read this session (`package.json`, `src/server/orchestra/*.ts`) |
| `vercel/pkg` is archived, deprecated since January 2024, last release 5.8.1, no further maintenance | **VERIFIED** — web search this session, GitHub archive notice |
| Bun stable (1.3.x) remains Zig-based; the Rust rewrite is canary-only via `bun upgrade --canary`; canary is Linux x64 glibc only, macOS/Windows/ARM support not yet shipped | **VERIFIED** — web search this session |
| Herdr is dual-licensed AGPL-3.0-or-later / commercial, single unified `LICENSE` covering the whole repo (not a split open-core model) | **VERIFIED** — direct `LICENSE` file read this session |
| Claude Code supports `-p --output-format stream-json` (NDJSON: one JSON object per line — `system`/`init`, `assistant`, `user`, `result`, plus `system`/`api_retry` with a full documented field table). The terminal `result` line carries final text, cost, and session metadata directly usable as a `Receipt`. `--bare` mode skips hooks/skills/plugins/CLAUDE.md for reproducible dispatch. `--allowedTools`/`--permission-mode acceptEdits` is a real, already-built tool-fence mechanism, a live alternative or complement to a custom `PreToolUse` hook for D8. | **PARTIALLY VERIFIED 2026-07-18** — confirmed live via `code.claude.com/docs/en/headless`: the flag, NDJSON event types, the `result` terminal event, `--bare`, `--allowedTools`/`--permission-mode` all real and documented with field-level detail. NOT yet seen: the exact `tool_use`/`tool_result` JSON field shapes (referenced by the docs, not shown verbatim) — needed before `AgentRun`'s field set can be called final (see plan-critique F7). |

---

## 3. Determined build sequence

1. Land this spec + a short ADR entry in `docs/adr/` recording D1–D13 as accepted, explicitly marking Constitution v2 §12's Tauri/Electron non-goal and §11's **OD1 row only** as superseded — OD2, OD3, and PATH in the same §11 table remain in force (not deleted — historical record stays).
2. Scaffold the four-package skeleton as a workspace: `packages/orchestra-core`, `packages/orchestra-daemon`, `packages/orchestra-cli`, `apps/orchestra-cockpit`. The existing Next.js app moves to `apps/orchestra-web-legacy` via `git mv` (a location change, not a rewrite — `npm run dev` inside that folder behaves identically, so D13 stays literally true).
   - `orchestra-core` — pure TypeScript domain logic, zero I/O. Empty except the §1.5 Zod schema exports at this stage.
   - `orchestra-daemon` — Bun entry point (`daemon.ts`). A long-lived server listening on a **Unix domain socket** at `~/.orchestra/daemon.sock` — not TCP, no port to collide, no network exposure, matches the local-first posture already established. Responds to one `ping` command. Spawns nothing yet.
   - `orchestra-cli` — scriptable entry point, separate from any GUI. A single `status` command that connects to the same socket directly and calls `ping`. Works with or without Tauri running.
   - `orchestra-cockpit` — Tauri v2 + Vite + React scaffold. On launch, Tauri's Rust side spawns `bun run daemon.ts` as a **plain child process** (`std::process::Command`) — this is the one process D1 scopes Rust to supervise. This deliberately does **not** use Tauri's `externalBin`/sidecar-bundling feature, which expects a compiled, platform-suffixed binary — D3 defers compilation to P5, so that mechanism doesn't apply yet. Rust resolves the `bun` binary's absolute path explicitly (checked install locations, or a one-time settings prompt) rather than trusting inherited shell `PATH` — GUI-launched macOS apps get a minimal PATH that typically excludes a Homebrew install, and this is the single most likely P0 failure mode on JD's machine if left implicit. The cockpit UI talks to the daemon directly over the same Unix socket, not through Rust as a relay.
3. Implement the four Phase-0 schemas exactly as specified in §1.5 above, as Zod schemas in `orchestra-core` — including the 1:N `WorkIntent`→`TaskSpec` cardinality.
4. Stand up SQLite (Drizzle) in `orchestra-daemon`: one materialized table per §1.5 schema, plus one append-only `events` table (D6). No business logic writes to them yet — schema and migration only.
5. Write a fake capability-provider adapter — deterministic, no real agent, no real git — mirroring the existing `fixtures.ts` pattern already in the v0 code. It accepts a `TaskSpec` and produces a fixture `AgentRun` (`provider: "fixture"`) and `Receipt` (`verification: "none"`).
6. Write **two** end-to-end verifications, not one:
   - **The contract path**: a fixture `WorkIntent` flows through `TaskSpec` → fake `AgentRun` → `Receipt`, lands in SQLite, is retrievable from the materialized tables. The test asserts the *read path sources only materialized tables* — a provable claim, unlike an unprovable universal "never read anywhere."
   - **The IPC path**: the same fixture `WorkIntent` is submitted from `orchestra-cockpit`'s UI, over the real Unix-socket connection, to `orchestra-daemon`, and the resulting `Receipt` is read back the same way. This is the actual architecture bet Phase 0 exists to de-risk (a real schema surviving the real Tauri↔Bun boundary) — the contract path alone never touches it.
7. Record D8 (fence/hooks), D9 (git mutex), and D11 (R4 verification) as short, dated entries in `docs/adr/` — decision recorded, implementation explicitly deferred to the phase named in §1.

---

## 4. Acceptance (exit criteria)

- [ ] Steps 1–7 above are complete, including both end-to-end verifications in step 6.
- [ ] A fixture `WorkIntent`, submitted from the real Tauri cockpit UI over the real daemon socket, reaches a stored `Receipt` — zero model calls, zero real git operations, zero real agent CLI involvement, but a genuine IPC round-trip, not a simulated one.
- [ ] JD can trigger the fixture flow from the cockpit window and watch the resulting `Receipt` render on screen — observable by looking, not by reading a log.
- [ ] The existing Next.js v0 app still runs, unchanged, from its new `apps/orchestra-web-legacy` location via `npm run dev`.
- [ ] All of §1's decisions and §1.5's schemas exist in the repo as committed text (this spec + ADR entries) — not only in chat history.

## 5. Out of scope for Phase 0 (explicitly deferred, not dropped)

- Real worktree creation (P1)
- Real Claude Code driving via `stream-json` (P1)
- Real git writes; the D9 mutex implementation (P1/P2)
- The D8 fence-enforcement hook implementation (P1)
- Single-binary sidecar packaging (P5)
- Hermes/Ollama integration (P4)
- Codex and Cursor adapters (P5)
- Sakura Home / any shared Runtime core (not scheduled — D10)
- Herdr-inspired live agent-state detection (not scheduled — D12, likely P3+ if ever)

---

## 6. Revision log

**2026-07-18 — plan-critique run (verdict: ESCALATED), all findings resolved same-day:**

- **F1/F4 (BLOCKING/SHOULD-FIX)** — the four schemas had no field definitions anywhere; "zero open decisions" was false for the phase's central deliverable. Added §1.5 with concrete, sourced field tables for all four. Corrected the `WorkIntent`→`TaskSpec` cardinality from an implied 1:1 to the real 1:N fan-out. Named `AgentRun` as an entirely new schema (not a renamed sync-log) and `Receipt`'s non-PR fields explicitly.
- **F2 (BLOCKING)** — every Constitution v2 section citation in the header and step 1 was wrong (the document has §0–§12 only; §16/§24/§26/§27 don't exist). Worse, the original wording would have instructed superseding all of §11, which contains OD2/OD3/PATH — decisions this very spec still depends on. Corrected to the real sections and scoped the supersession to exactly what changed.
- **F3 (BLOCKING)** — the Tauri↔Bun IPC transport was named two incompatible ways and never specified; it's also the one seam P0 exists to de-risk. Named it concretely: a Unix domain socket, Rust spawning the daemon via plain process-spawn (not Tauri's compiled-binary sidecar feature, correctly reconciled with D3), and the macOS minimal-PATH failure mode named with a resolution.
- **F5 (SHOULD-FIX)** — the original single verification never crossed the Tauri↔Bun boundary and asserted an unprovable negative. Split into two verifications (contract path, IPC path) and downgraded the D6 claim to what a test can actually show.
- **F6 (SHOULD-FIX)** — the four-package layout collided, unstated, with "the Next.js app is untouched." Named the workspace layout explicitly; the existing app moves via `git mv`, not a rewrite.
- **F7** — closed same-session, ahead of the P1-kickoff deadline originally set: the stream-json ground-truth anchor is now live-verified against current docs (NDJSON event types, the `result` event, `--bare`, `--allowedTools`), not resting on the critique agent's training knowledge alone.
- **F8 (NIT)** — reworded the ambiguous "round-trips one typed command" acceptance line to something JD can observe on screen.
- **F9 (NIT, disclosed, not fixed)** — P0 still has no human-observable payoff against the daily pain this rebuild exists to fix. Accepted as inherent to a seed phase; first real relief is P1. Not a defect, named so it isn't mistaken for one.
