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

## Amendment 2026-07-18 (session 2) — D14–D25 recorded (Phase 1 kickoff)

### Reason

`docs/specs/2026-07-18-phase-1-worktree-isolation.md` is Phase 1's determined-sequence spec
— compiled via a paper session with JD, independently plan-critiqued by two blind critics
(correctness/sequencing + security/architecture lenses), and re-judged clean after fixes.
This amendment records its ratified decisions at the architecture level, the same way D8/D9/
D11 were recorded above for P0's spec, so a future session finds them here without
re-deriving from the spec.

### Decisions

12. **D14 — superseded during build by D26 below.** Originally: Claude Code dispatch uses
    `--bare` + explicit `--settings <json>` to inject the `PreToolUse` fence hook. Live
    testing on JD's actual machine found both `--bare` and its named fallback
    (`CLAUDE_CONFIG_DIR` override) break OAuth/subscription auth outright — not a hook
    question, an auth one. See D26.
13. **D15 — the real capability-provider seam is synchronous-after-await**, matching
    `fixtureCapabilityProvider.ts`'s object shape (not its sync signature — the real one
    returns a `Promise`). No incremental SQLite progress writes in P1; live progress is
    deferred, not scheduled to a phase.
14. **D16 — D9's git-write mutex stays deferred to P2.** P1 is single-lane; no concurrent
    git writes exist yet to protect against.
15. **D17 — P1 starts writing real `events` rows (D6).** Payload is the already-validated
    domain object, JSON-serialized — no new events-specific schema, per D6's own "diary, not
    replayed" framing.
16. **D18 — restates D4**: P1 is Claude Code only: no fence-fallback logic for Codex/Cursor
    this phase.
17. **D19 — repo registration uses a native Tauri folder picker**, not the legacy app's
    fuzzy `~/dev/<name>` path-guessing.
18. **D20 — worktree physical state is a new fifth domain schema, `Worktree`** (path, branch,
    anchorSha, status, 1:1 with `TaskSpec`) — not fields folded onto `TaskSpec`, since
    `TaskSpec` is the immutable lane plan and `Worktree` is that lane's live, mutating
    on-disk state.
19. **D21 — repo registration is backed by a new minimal `Repo` table**, one row for P1
    (Linear's own P1 scope: "one repo") — not a JSON registry file.
20. **D22 — fence-path matching uses Bun's built-in `Bun.Glob`**, no new dependency.
21. **D23 — `git.ts` is ported near-verbatim from the legacy app**; `gh.ts`'s port is
    deferred to P2 (its first real consumer). The port adds branch-name validation the
    legacy code lacked (rejects a leading `-`, an argument-injection gap the plan-critique
    pass found).
22. **D24 — P1's cockpit UI stays plain/functional**, extending `App.tsx`'s existing
    unstyled pattern. No visual design investment — reserved for P3.
23. **D25 — `--allowedTools` for P1 is `"Read,Edit"` — no `Bash`.** The plan-critique
    security-lens pass found that granting `Bash` alongside a `PreToolUse` hook matched only
    on `Edit|Write` made the fence a no-op (`Bash`-tool writes never hit the hook), and —
    since a git worktree gives no OS-level filesystem confinement — amounted to unrestricted
    disk access. **Named, accepted residual**: `Read` stays unfenced (the hook doesn't match
    it either), so the agent can read outside its worktree even though it can't write outside
    the fence — accepted for P1 (read-exfiltration risk is materially smaller and founder-
    authored prompts aren't adversarial input), revisit if it's ever worth its own hook.
24. **D26 — corrects D14, live-tested on JD's machine mid-build, 2026-07-18.** The
    `PreToolUse` hook mechanism itself works correctly under normal auth: a real dispatch
    fired the hook, the hook received the documented stdin shape, and its `deny` decision was
    honored (verified: the target file was never written, `permission_denials` in the result
    event confirmed it, Claude Code's own response text confirmed the block). But both of
    D14's isolation paths — `--bare` and the `CLAUDE_CONFIG_DIR` fallback — break OAuth
    lookup outright on a subscription-authenticated machine (no `ANTHROPIC_API_KEY` set);
    both failed identically ("Not logged in"). **Resolved: P1 dispatches with plain
    `claude -p ... --settings <hook-json>`, no `--bare`, no `CLAUDE_CONFIG_DIR` override** —
    confirmed working end to end in the same test. **Named, accepted residual**: JD's
    personal hooks/skills/MCP servers/CLAUDE.md are active during a dispatched run, not
    isolated from it (acceptable for P1 — JD's own machine, single-lane, D16); a real API key
    would restore `--bare`'s isolation if this ever needs to run outside JD's personal
    environment. Also untested: hook-resolution order if JD ever adds his own `PreToolUse`
    hook (he has none today).

### Consequences for downstream

- P2's build-readiness review treats D9 (the mutex) and `gh.ts`'s port (D23) as named,
  planned scope carried forward from here — not rediscovered from the P1 spec.
- The unfenced-`Read` residual (D25) and the no-isolation-during-dispatch residual (D26) are
  the two things this amendment names as open rather than resolved — neither gates P1, both
  should be revisited explicitly rather than silently forgotten.

### What this does NOT change

- D1–D13 and the prior "Amendment 2026-07-18" section above — additive only.
- Phase 0's acceptance criteria — unaffected; P1's own criteria live in its spec §5.

## Amendment 2026-07-19 — D27–D33 recorded (Phase 2 kickoff)

### Reason

`docs/specs/2026-07-19-phase-2-stacked-pr-actions.md` is Phase 2's determined-sequence spec
— compiled via a paper session with JD, independently plan-critiqued across three re-judge
rounds (each finding real, fixed issues: a missing required commit-message field that would
have broken every real dispatch, a promise-chain mutex that could permanently deadlock on
its first git-write failure, a silently-dropped fourth case in the ported OD3 algorithm, and
several smaller contract gaps), and confirmed clean on the final pass. This amendment
records its ratified decisions at the architecture level, matching how D14–D26 were recorded
above for P1's spec.

### Decisions

25. **D27 — the PR trigger is an explicit cockpit action** (a "Push & Open PR" button),
    never an automatic side effect of `dispatchWorkIntent`. Keeps a human decision between
    "AI made an edit" and "that edit is a public PR."
26. **D28 — D9's per-repo git-write mutex covers both this phase's new commit/push/PR-create
    writes and Phase 1's `createWorktree`/`removeWorktree` writes** — both touch the same
    shared `.git` object store D9 exists to protect.
27. **D29 — the mutex is an in-process `Map<string, Promise<unknown>>` promise-chain lock**,
    keyed by canonicalized repo root (reusing `registerRepo`'s `realpathSync`). No
    file-based or cross-process lock — the daemon is a single Bun process. **Named
    implementation constraint**: a naive `.then(fn)` chain wedges permanently on the first
    throw; the correct mechanism decouples the queue-advancing tracker (`result.catch(() =>
    undefined)`) from the caller-visible result (`prior.then(fn, fn)`, `fn` as both
    handlers) — see spec §2 for the exact code.
28. **D30 — `Worktree` gains `prUrl`/`prNumber`** (both optional), mirroring `Receipt.prUrl`
    and giving the already-existing-but-unset `"pr_open"` status value something to point
    at.
29. **D31 — OD3's dirty-tree semantics (Constitution v2 §11, locked) are inherited
    unchanged, all four cases**: dirty + `"commit"` in steps → commit (requires a non-empty
    message) then continue; bare `"pr"` + dirty → refuse; bare `"push"` + dirty → push-only,
    warn, no commit; `"pr"` present + `"push"` absent + the tree clean by the time the pr
    step runs (whether originally clean or just-committed-clean) → push first, then
    create/reuse the PR. `.cursor/`-only dirt never counts as dirty.
30. **D32 — `gh.ts`, `stacked.ts`'s algorithm, and `workingTree.ts`'s `isMeaningfulDirty` are
    ported near-verbatim from the legacy app** (executing D23), persistence reworked onto
    the `worktrees` SQLite table. `createPullRequest`'s title/body inputs (`prTitle`/
    `prBody` in the legacy caller) are **not** carried forward — `message` is P2's only
    caller-supplied text, a deliberate scope cut named here, not silently dropped. **Named,
    accepted residual**: `viewPrForBranch`'s inherited swallow treats any `gh pr view`
    exit-code-1-or-null failure as "no PR found," not just "genuinely no PR" — ported as-is,
    surfaces loudly on the next `createPullRequest` call for the same underlying reason.
31. **D33 — the two P1 residuals (D25 unfenced `Read`, D26 no isolation during dispatch) are
    re-confirmed as still-accepted, not fixed.** Neither blocks stacked-PR work.

### Consequences for downstream

- P3's build-readiness review inherits `Worktree.prUrl`/`prNumber` and the `withRepoLock`
  mutex as load-bearing infrastructure, not scaffolding to revisit.
- D32's dropped `prTitle`/`prBody` override capability and D30/D32's two named residuals are
  the things this amendment names as open rather than resolved — none gate P2, all should be
  revisited explicitly rather than silently forgotten.

### What this does NOT change

- D1–D26 and both prior amendments — additive only.
- Phase 0/Phase 1's acceptance criteria — unaffected; P2's own criteria live in its spec §5.
