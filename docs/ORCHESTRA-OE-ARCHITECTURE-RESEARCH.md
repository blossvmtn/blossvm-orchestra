# Orchestra ↔ OE — Architecture Research & Manifesto Options

**Org:** BlossomTN, LLC
**Status:** Working draft — DECIDE stage, not compiled
**Scope:** `blossvm-orchestra` → `blossvmtn-okf` → `tenjo-os` → `construction-os`
**Reference:** Sakura Operating Environment Foundational Specification v0.1 (32pp, 2026‑07‑10)
**Date:** 2026‑07‑14

> Compiled from direct inspection of `construction-os`, `blossvmtn-okf`, `tenjo-os`,
> `blossvm-orchestra`, and the full OE spec. No repo files were changed to produce this document.

---

## Part 0 · Teach-back — the problem in three sentences

You are one person acting as loop-head across four live repos, three subscription coding tools, and a local model — and right now **you** are the only shared state between all of them.

Three separate systems already implement pieces of the fix (construction-os's hook-enforced harness, OKF's cross-repo doctrine vendoring, Orchestra's worktree-fenced conductor desk), but none of them talk to each other.

The Sakura OE spec you just handed me already solved this exact class of problem — intent → capability → risk-tier → receipt — for the **product** you're building; the fastest path to fixing your own workflow is pointing that same protocol at yourself.

---

## Part 1 · Ground truth — the constellation, as it actually stands

Four repos, one spec. Nothing below is aspirational — it's what's on disk right now.

| Repo | What it is | Maturity | Governs |
|---|---|---|---|
| `construction-os` | Sakura OS — the live multi-tenant Business OS. Production, real tenants, real money. | **shipping daily** | Itself. Houses the *original* harness (ORIENT→…→WRITE-BACK, model routing, hook-enforced dispatch contract) that OKF later extracted. |
| `blossvmtn-okf` | Organizational Knowledge Framework — the doc-precedence ladder + vendored, drift-checked lints and guard hooks every other repo pulls from. | **live, 2 consumers** | Nothing directly — it's the shared substrate construction-os and tenjo-os both vendor and pin against. |
| `tenjo-os` | BlossomTN's own guarded internal-ops layer. Pre-production, OKF consumer #2, uses Codex for fenced parallel-worktree execution already. | **pre-prod** | BlossomTN's own entitlement/company truth — never construction-os's tenant data. |
| `blossvm-orchestra` | The conductor desk: fences Cursor/Claude/Codex into git worktrees, relays state via a local Hermes/Ollama clerk, drives commit→push→PR. | **working v0, ~5.8k LOC, tested** | Its own worktrees only, today. Registry supports N repos; cross-repo view isn't built yet. |
| *Sakura OE spec* | Not a repo — the foundational spec for a local-first, AI-native personal/business layer: five surfaces, 12 constitutional invariants, intent→receipt lifecycle. | **v0.1, paper stage** | Nothing yet, by design — an OE v0.2 paper session is already open in construction-os reconciling it against the live Business OS (see Part 5). |

**One fact does most of the work in this document:** OKF's own docs already flagged the connection you're asking about. `blossvmtn-okf/docs/oe-knowledge-fabric-blueprint.md`, written two days before this session, proposes extending OKF into the OE's typed knowledge fabric and explicitly maps the constellation — including a line noting Orchestra is "a developer-facing rehearsal for a wider rigid agentic operating environment." **Nobody has run that paper session yet. That's the actual gap.**

---

## Part 2 · Diagnosis — three systems, none of them talking

Coordination discipline already exists in three places. Each one is real and load-bearing. None of them know the other two exist.

- **construction-os harness** — Hook-enforced (`PreToolUse`), phase-gated, model-routed. Deep, mature, battle-tested — **but Claude-Code-specific.** The dispatch guard only fires for Claude Code's own Task/Agent tool; a bare Codex session gets the same rules pasted as prose, not enforced.
- **blossvmtn-okf** — Cross-repo, but **documentation** — it vendors and drift-checks doctrine, it doesn't observe anything live. It has no idea what's running right now in any repo.
- **blossvm-orchestra** — Cross-**tool** (Cursor/Claude/Codex), but today single-repo-scoped in practice, no risk-tiering on its own git actions, and workers report back by **human copy-paste** — no live hook into either of the other two systems.
- **Sakura OE spec** — Already solved this shape of problem for the *product*: intent envelope → capability registry → risk tier R0–R4 → action plan → receipt. Nobody has pointed it at the *tooling* yet.

> **You are the only edge connecting these four nodes.**

Restated plainly: every one of these systems assumes a *single* coordination surface per session. You have four repos, three subscription tools, and a local model running in parallel, and the only place that state currently reconciles is your own head. Orchestra's own constitution names this exactly — *"Stay Grand Conductor… no desk that liaises master intent ↔ worker sessions"* — but the v0 build only solves it *inside one repo's worktrees*, via clipboard. It doesn't yet answer "what is Codex doing in tenjo-os right now while Claude Code applies a migration in construction-os and Cursor is polishing a fence in Orchestra itself" — and that cross-repo, cross-tool blindness is the actual pain point, not any single repo's discipline.

---

## Part 3 · Architecture — point OE's protocol at Orchestra's own domain

Orchestra's wire protocol (`[ORCHESTRA-MANIFEST]` / `[WORKTREE-SYNC-LOG]` / `[CONDUCTOR-OVERRIDE]` / `[PR-BRIEF]`) is structurally a thinner, unaudited cousin of the OE spec's intent→plan→receipt lifecycle. Rather than inventing new abstractions, five moves reuse OE's already-validated shapes on Orchestra's actual capabilities — no new theory, just applying a spec you already have to a codebase you already have.

| OE abstraction | Orchestra today | → | Orchestra, adjusted |
|---|---|---|---|
| Intent envelope | `ORCHESTRA-MANIFEST` — close already | → | add `actor` (claude-code \| codex \| cursor \| hermes) and `confirmation_policy` fields |
| Capability registry | tRPC procedures, undifferentiated | → | each of `worktree.*` / `git.stackedAction` declares an explicit risk tier |
| Risk tiers R0–R4 | none — create/push/PR all look the same to the human | → | `git.stackedAction` with push+PR = R3: Desk shows side-effect preview, requires explicit confirm |
| Action plan + receipt | `PR-BRIEF` — thin, PR-only | → | every capability call emits a full receipt (steps, side effects, risk tier, rollback) |
| OKF knowledge contract | receipts live only in `~/.orchestra/registry.json` | → | receipts persist as OKF `workflow` / `agent` objects — durable, greppable, cross-repo |

**The last row is the one that actually fixes the pain point.** OE's Part 4 taxonomy already ships a `workflow` type ("define a repeatable human/agent process") and an `agent` type ("define an AI actor and its authority") — Orchestra's Worker/Clerk roles and dispatched manifests map onto those two *without inventing a 14th object type*. Once a dispatch and its outcome are OKF objects, they're queryable the same way any other Sakura knowledge is: cited by ID, revisioned, greppable from any future agent session in any of the four repos — which is the actual fix for "I lost track of what changed where while I was in three tools at once."

> **Where this bridges the Claude-Code-only gap:** Today, `guard-agent-dispatch.sh` enforces the six-point dispatch contract (authority anchor · bounded context · done-condition · model+effort · output contract · stop conditions) — but only for Claude Code's own Task/Agent tool. A bare Codex or Cursor session gets none of that mechanically. If Hermes (Module C) validates every `ORCHESTRA-MANIFEST` against the same six points before it's handed to a Codex or Cursor worker, those tools inherit the identical mechanical floor Claude Code sessions already get — enforced by the clerk instead of a hook, because that's the only enforcement surface those tools expose.

---

## Part 4 · Manifesto options — Orchestra

What Orchestra commits to being. Constitution v2 already locked A/B/C module boundaries "do not reopen" — options B and C both touch that lock and need their own decision log before any build.

### A — Cockpit, not Brain *(conservative)*
Ship v0 exactly as Constitution v2 specs it. No risk tiers, no OKF integration. All memory stays human — you, plus git history.
**Trade:** fastest to P5, zero scope creep, matches the doc's own explicit "swan-song OS" deferral. Doesn't fix the cross-repo audit gap — you stay the only shared state.

### B — Orchestra dogfoods the OE runtime *(recommended destination)*
Module A capabilities get OE-style risk tiers and receipts; receipts land in OKF as `workflow`/`agent` objects (Part 3, above).
**Trade:** directly answers the ask, reuses validated abstractions instead of inventing new ones, retires real risk on OE's Runtime before the Android Shell exists. Reopens Module A's lock — needs its own paper session (OD4+) first.

### C — Split the concerns *(incremental path to B)*
Orchestra emits receipts but stays an OKF *producer*, never a client. A separate async step (script or Hermes) writes them into OKF objects after the fact.
**Trade:** Module A/B/C boundaries stay untouched — no lock reopened. Two sources of truth during the lag; receipts aren't live-queryable from the Desk itself yet.

### D — No new product, formalize the discipline *(cheapest)*
Stop building. Paste `model-agnostic-agent-contract.md`'s envelope into every Codex/Cursor session by hand; keep one shared markdown dispatch-log per repo.
**Trade:** zero build cost, works today. 100% manual — which is exactly the status quo Orchestra's own Pain table says already fails ("prompt-only fencing fails; shared directories pollute").

---

## Part 5 · Manifesto options — Sakura OE

OE's own paper session (D1–D10, construction-os, 2026‑07‑11) is already open and reconciling the spec against the live Business OS. None of its ten agenda items mention Orchestra. That's the genuinely un-litigated question below — not "what is OE" (already being decided) but "how does OE relate to the tool you're building it with."

### 1 — Orchestra is disposable scaffolding *(narrowest)*
OE's Android/five-surface Shell is the end-state. Orchestra exists only to build it faster, and gets retired once parallel-dev coordination is no longer needed.
**Trade:** keeps scope airtight. Throws away everything Orchestra will have learned about running the intent→receipt loop for real, daily, under pressure.

### 2 — Same pattern, two altitudes *(boldest)*
Make explicit and permanent what Orchestra's own doc already gestures at: it is "OE for developers." Orchestra's Runtime and OE's Runtime intentionally converge on the same component shapes.
**Trade:** daily use of Orchestra directly retires risk on OE's Runtime before the Android Shell exists — real dogfooding, not a demo. Couples two roadmaps that currently move at different speeds.

### 3 — Separate lineages, shared only by OKF *(lowest risk)*
Keep the locked track order (Business OS → extraction → Android Shell) exactly as-is. Orchestra and OE both happen to be OKF consumers and nothing more.
**Trade:** matches every explicit non-goal already on record in both docs. Leaves the actual cross-tool blindness (Part 2) unaddressed — this option solves nothing new.

### 4 — You are OE's first "Home" user *(narrow, concrete)*
Don't merge the runtimes. Scope OE's local-first "Personal/Home" deployment profile — already proposed as decision D1 in the live paper session — to be validated *first* through your own solo-dev workflow via Orchestra, before it's built for any end consumer.
**Trade:** closes the local-first loop against a real, painful, daily use case instead of a hypothetical one, with a small honest scope. Doesn't get you the full cross-tool visibility fix on its own — pair with an Orchestra option.

---

## Part 6 · Recommendation — the pairing that actually solves your workflow

**Orchestra C → B**, paired with **OE option 4**, narrowing into **option 2** once it's proven. Start where nothing locked has to reopen, get receipts flowing into OKF as a fact of daily use, and let the "same pattern, two altitudes" thesis earn itself rather than being declared on day one.

1. **Run the deferred OKF paper session first.** `oe-knowledge-fabric-blueprint.md` is already sitting in blossvmtn-okf waiting for exactly this — ratify Part II of SPEC.md (frontmatter schema, the 13 object types, the answer envelope) before any Orchestra code changes.
2. **Add risk tiers to Module A only — Orchestra option C.** Tag `worktree.create/list/remove` R0/R1, `git.stackedAction` R2 (draft) / R3 (push+PR). Show the side-effect preview before an R3 confirm. No OKF write yet — this alone fixes "I didn't realize that button pushes to the real remote."
3. **Wire receipts into OKF async — still option C.** A small script (or Hermes, since it's already the clerk) writes each `PR-BRIEF`/receipt as a `workflow` object under a new `/knowledge/orchestra` domain. This is the fix for cross-repo, cross-tool memory.
4. **Extend the manifest validator to Codex/Cursor dispatches — the dispatch-contract bridge.** Hermes checks every outbound `ORCHESTRA-MANIFEST` against the same six points `guard-agent-dispatch.sh` already enforces for Claude Code.
5. **Only then decide B vs. staying at C.** By this point you'll have weeks of real receipt data. Whether Orchestra's Runtime should formally converge with OE's Runtime (option B / OE‑2) becomes an evidence-backed call, not a guess made today.

> **Why this order:** Every other sequencing either reopens Constitution v2's locked module boundaries before you have evidence it's worth it, or leaves the actual pain (cross-repo, cross-tool blindness) untouched while you debate product philosophy. This order fixes the pain first, cheaply, inside boundaries that are already open to change — and lets the bigger "same pattern, two altitudes" bet get made with real data instead of conviction alone.

---

## Part 7 · Decision register — open questions

Mirrors the OE spec's own convention (its Part 13) — nothing below is resolved by this document; each needs its own paper session with the pattern already in place (`grill-with-docs` → `paper-to-spec` → `plan-critique`).

| ID | Question | Decision pressure |
|---|---|---|
| Q‑A1 | Does the OKF Knowledge Fabric paper session (blueprint's own trigger) get pulled forward to unblock step 01, or wait for the Android M0/M1 trigger it currently names? | Pulling it forward means OKF's Part II gets designed against Orchestra's receipts, not Android's captures — a different first real consumer than the blueprint assumed. |
| Q‑A2 | Who validates an `ORCHESTRA-MANIFEST` before dispatch to a non-Claude worker — Hermes (local, free, weaker) or a cloud model call? | Hermes-only keeps the "no API keys" v0 non-goal intact but means dispatch-contract validation is only as good as the pinned local model. |
| Q‑A3 | Does a rejected/blocked R3 confirmation get its own receipt (a "refused" outcome), or only successful actions get recorded? | OE's own C‑11 (reversibility and receipts) implies refusals are as auditable as executions — worth confirming before the schema is fixed. |
| Q‑A4 | Single `/knowledge/orchestra` domain, or does each registered repo get its own sub-domain under the existing tenjo/sakura/shared split? | Orchestra dispatches touch all four repos at once — the domain boundary OE Part 4 assumes (one workspace per domain) doesn't cleanly fit a tool that spans workspaces by design. |
