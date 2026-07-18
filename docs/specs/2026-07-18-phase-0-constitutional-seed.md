# Phase 0 — Constitutional Seed

**Status:** Determined — zero open decisions. Ready to build.
**Repo:** `blossvmtn/blossvm-orchestra`
**Branch:** `claude/orchestra-workflow-architecture-mwijvk`
**Supersedes:** `docs/ORCHESTRA-CONSTITUTION-v2.md` §11 (Tauri deferred), §16.OD1 (model pin), §24 (create-t3-app as terminal architecture)
**Does not supersede:** Constitution v2 §26 (git safety via `execFile`, no shell interpolation), §27 module-boundary spirit (ownership separation, even though the concrete modules are renamed below)

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
| D13 | The existing Next.js v0 app is **not touched, not removed, not deprecated** by Phase 0. It keeps running as JD's daily-use tool for real multi-session coordination while the new architecture is built beside it. Cutover to the Tauri cockpit happens only once P3 exit criteria are met. | Stated urgency this session — ten parallel agent sessions in one day is real, current pain; the rebuild must never regress JD below his current baseline. |

---

## 2. Ground-truth anchors

| Claim | Status |
|---|---|
| Current `blossvm-orchestra` is a working v0: Next.js 15.2.3 + tRPC + React + Tailwind, no database, plain-JSON state, ~5.8k LOC with real tests | **VERIFIED** — direct file read this session (`package.json`, `src/server/orchestra/*.ts`) |
| `vercel/pkg` is archived, deprecated since January 2024, last release 5.8.1, no further maintenance | **VERIFIED** — web search this session, GitHub archive notice |
| Bun stable (1.3.x) remains Zig-based; the Rust rewrite is canary-only via `bun upgrade --canary`; canary is Linux x64 glibc only, macOS/Windows/ARM support not yet shipped | **VERIFIED** — web search this session |
| Herdr is dual-licensed AGPL-3.0-or-later / commercial, single unified `LICENSE` covering the whole repo (not a split open-core model) | **VERIFIED** — direct `LICENSE` file read this session |
| Claude Code supports `--output-format stream-json` for structured non-interactive output and `PreToolUse` hooks for deterministic tool-call gating | **NOT independently re-verified this session** — asserted by the Opus critique agent from training knowledge. Re-confirm against current Claude Code docs at P1 kickoff, before the D4/D8 implementation begins. |

---

## 3. Determined build sequence

1. Land this spec + a short ADR entry in `docs/adr/` recording D1–D13 as accepted, explicitly marking Constitution v2 §11/§16.OD1/§24 as superseded (not deleted — historical record stays).
2. Scaffold the four-package skeleton:
   - `orchestra-core` — pure TypeScript domain logic, zero I/O. Empty except type/schema exports at this stage.
   - `orchestra-daemon` — Bun entry point (`daemon.ts`). Boots, opens a local socket, responds to one `ping` command. Spawns nothing yet.
   - `orchestra-cli` — scriptable entry point, separate from any GUI. A single `status` command that calls the daemon's `ping`.
   - `orchestra-cockpit` — Tauri v2 + Vite + React scaffold. One screen. Calls `orchestra-daemon`'s `ping` through Tauri's sidecar IPC and renders the result.
   - The existing Next.js app is untouched, in its current location, still runnable via `npm run dev`.
3. Define the four Phase-0 schemas (`WorkIntent`, `TaskSpec`, `AgentRun`, `Receipt`) as Zod schemas in `orchestra-core`, explicitly mapped from the existing packet types rather than invented fresh:
   - `ORCHESTRA-MANIFEST` → splits into `WorkIntent` (the founder's stated goal) + `TaskSpec` (one worker's bounded assignment)
   - `WORKTREE-SYNC-LOG` → becomes `AgentRun` progress state
   - `PR-BRIEF` → becomes part of `Receipt`
4. Stand up SQLite (Drizzle) in `orchestra-daemon`: one materialized table per schema above, plus one append-only `events` table (D6). No business logic writes to them yet — schema and migration only.
5. Write a fake capability-provider adapter — deterministic, no real agent, no real git — mirroring the existing `fixtures.ts` pattern already in the v0 code. It accepts a `TaskSpec` and produces a fixture `AgentRun` and `Receipt`.
6. Write one end-to-end verification: a fixture `WorkIntent` flows through `TaskSpec` → fake `AgentRun` → `Receipt`, lands in SQLite, is retrievable from the materialized tables, and the test explicitly asserts the event table is never read to reconstruct state (D6 proven, not just stated).
7. Record D8 (fence/hooks), D9 (git mutex), and D11 (R4 verification) as short, dated entries in `docs/adr/` — decision recorded, implementation explicitly deferred to the phase named in §1.

---

## 4. Acceptance (exit criteria)

- [ ] Steps 1–7 above are complete.
- [ ] A fixture `WorkIntent` reaches a stored `Receipt` with zero model calls, zero real git operations, zero real agent CLI involvement.
- [ ] `orchestra-cockpit` (Tauri) launches and successfully round-trips one typed command to `orchestra-daemon` (Bun) over local IPC.
- [ ] The existing Next.js v0 app still runs, untouched, via `npm run dev`.
- [ ] All of §1's decisions exist in the repo as committed text (this spec + ADR entries) — not only in chat history.

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
