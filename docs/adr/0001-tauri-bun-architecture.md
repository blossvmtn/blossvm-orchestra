# ADR 0001 — Tauri v2 + Bun sidecar architecture (Phase 0 seed)

**Status:** Accepted
**Date:** 2026-07-18

## Reason

The original v0 Constitution (`docs/ORCHESTRA-CONSTITUTION-v2.md`) locked create-t3-app
(Next.js + tRPC), deferred a desktop shell entirely, and pinned `gemma4:31b` as the local
clerk model. Since then: JD chose Tauri v2 as the desktop shell to learn Rust through the
build; the model landscape moved (Hermes 4 14B Q5 and Qwen3-30B-A3B supersede the original
pin); and an adversarial architecture critique plus a plan-critique of the resulting spec
found and closed real gaps (dead packaging tooling, wrong section citations, an
unspecified IPC transport). `docs/specs/2026-07-18-phase-0-constitutional-seed.md` is the
resulting determined-sequence spec. This ADR is its formal acceptance record.

## Decisions

1. **Desktop shell is Tauri v2.** Rust is scoped to the native shell and to
   spawning/supervising exactly one child process (the Bun daemon) — no business logic, no
   multi-process supervision, no PTY handling in Rust.
2. **Sidecar runtime is Bun, stable channel.** Not the Rust-rewrite canary (Linux x64 glibc
   only as of 2026-07-18; JD is on Apple Silicon macOS). Not compiled to a single binary
   until P5 — no `pkg` (archived, dead), no Node SEA.
3. **IPC transport is a token-authenticated local HTTP server** on `127.0.0.1`, not a Unix
   domain socket — a webview cannot open a raw socket, only a native process can. Cockpit
   and CLI both call the daemon with plain `fetch()`.
4. **First capability provider is Claude Code only**, via `--output-format stream-json`
   (structured events, not PTY scraping). Codex and Cursor are sequenced to P5, not cut.
5. **Local persistence is SQLite**, replacing the plain-JSON state files. An append-only
   event table is a write-only audit trail, never replayed to reconstruct state —
   materialized tables are the sole source of truth for current state.
6. **Four schemas at P0**: `WorkIntent`, `TaskSpec`, `AgentRun`, `Receipt` — field-level
   definitions in the spec §1.5. `Evidence`, `Handoff`, `Approval`, `PromotionProposal` wait
   for the phase that needs them.
7. **No shared Runtime core with a future Sakura Home.** Only the R0–R4 risk-tier
   convention and the receipt shape are copy-candidates later, informally — not shared
   code.

## Consequences for downstream

- Constitution v2 §12's Tauri/Electron non-goal is superseded — Tauri is now the locked
  choice, not deferred.
- Constitution v2 §11's **OD1 row only** (the `gemma4:31b` pin) is superseded. **OD2**
  (`FenceSpec` in `state.json` is source of truth), **OD3** (T3-mirror stacked dirty-tree
  semantics), and **PATH** (`<repo>/.orchestra/worktrees/<slug>/`) remain in force — P1's
  fence and stacked-PR work depends on them.
- The existing Next.js v0 app is not deprecated by this decision — it moves to
  `apps/orchestra-web-legacy` unchanged, available until the Tauri cockpit passes its own
  P3 exit criteria.

## What this does NOT change

- §2 Stack's git-safety rule (`execFile`, no shell interpolation) — still binding.
- §6 Module boundaries' ownership-separation spirit — the concrete modules are renamed
  (`orchestra-core`/`daemon`/`cli`/`cockpit`) but the separation principle isn't.
- The five-phase-plus-seed build order (P0→P5) — unchanged from the spec.

## Amendment 2026-07-18 — D8/D9/D11 recorded, F4 resolved (Step 7 + PR0 polish)

### Reason

Spec §3 step 7 requires D8 (fence/hooks), D9 (git-write mutex), and D11 (R4 verification) —
already ratified in spec §1 — recorded here as accepted with implementation explicitly
deferred, so P1 builds against a decided, dated record instead of re-deriving them from the
spec table. F4 (Step 4's Fable review, `HANDOFF.md`) was first given an explicit
decided-deferred disposition in this same amendment, then reconsidered same-day before PR0
opened: D1 already scopes Rust to *supervising* the one daemon child process it spawns, so
closing F4's gap is completing D1's own scope, not new P1 scope — folded in rather than
carried forward.

### Decisions

8. **D8 — fence enforcement is decided, not built at P0.** Claude Code gets a real
   `PreToolUse` hook checking Edit/Write paths against the fence and denying violations;
   Codex gets its OS-level sandbox scoped to the worktree root; Cursor's `.cursor/rules`
   stay advisory. Constitution v2's "physical isolation" language is corrected: the git
   worktree boundary is the real hard isolation, the fence a softer secondary constraint.
   **Implemented: P1.**
9. **D9 — git-write concurrency is decided, not built at P0.** A per-repo mutex in the
   daemon will serialize all git *write* operations across lanes, since worktrees share one
   `.git` object store. **Implemented: whenever P1/P2 first touch real git writes.**
10. **D11 — R4 verification is decided, moot for P0.** R4 ("sensitive": merge, deploy,
    migration, secrets, destructive git) verification is JD running the acceptance walk
    himself — no automated verifier is built. Phase 0 performs no real git writes and
    reaches no R4 action, so there is no P0 implementation surface; `Receipt.verification`
    (spec §1.5) exists now and stays `"none"` until a phase actually reaches R4.
11. **F4 (Step 4's Fable review) — Tauri daemon-supervision cleanup is resolved, not
    deferred.** The daemon child was previously killed only via `WindowEvent::Destroyed`
    (`apps/orchestra-cockpit/src-tauri/src/lib.rs`) — no `RunEvent::ExitRequested` net, no
    `.wait()` after `.kill()`. Both fixed same-day: a `RunEvent::ExitRequested` handler is
    now a second kill path (covers Cmd+Q and an app-level quit, not just the window closing),
    and `.kill()` is followed by `.wait()` so an exited daemon doesn't sit as a zombie.
    Compile-verified with `cargo check` against the real macOS target this session (Step 4's
    Fable review only had a headless Linux container available). **Still genuinely open, not
    silently resolved:** detecting and killing an *orphaned* daemon left by a prior crash, on
    the *next* cockpit launch, is a separate and bigger call — not attempted here, still a
    named P1-or-later item if it ever proves necessary in practice.

### Consequences for downstream

- P1's build-readiness review treats D8/D9/D11's implementation as named, planned scope —
  not something to rediscover from the spec table.
- F4's cross-launch orphan-detection question (see above) is the one piece of process
  supervision still open — named here, not silently dropped.

### What this does NOT change

- The Decisions and Consequences recorded above (D1–D7, D10) — this amendment is additive
  only.
- Phase 0's acceptance criteria (spec §4) — none of D8/D9/D11/F4 gate P0 completion.
