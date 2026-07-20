# Orchestra UI — Constitution v2

**Status:** Authority for build  
**Last amended:** 2026-07-20 (§13 — two-machine hardware + Hermes-4 clerk; supersedes the gemma4:31b / 48 GB-laptop clerk pin)  
**Repo home:** `blossvmtn/blossvm-orchestra` (this repo; orchestrates *over* registered product repos — never ships inside them)  
**Product name:** blossvm-orchestra (not “Orchestra UI” / not `orchestra-ui`)  
**Companions:** heart extraction (pain) + Hermes mental model (engine)  
**T3 Code:** MIT (`pingdotgg/t3code`) — borrow worktree + stacked PR mechanics with attribution  

---

## 0. Teach-back (the product in three sentences)

Parallel subscription agent sessions collide when scopes overlap (Security vs Composure), and nothing gives both a multi-lane overview and coherent orchestration. Orchestra UI is a cinematic local conductor desk powered by a **free Hermes clerk** that fences workers into git worktrees, keeps communication traveling correctly, and mirrors Fable-*style* orchestration without requiring any particular cloud model. Painful git → PR mechanics are taken from **T3 Code’s proven MIT patterns** (`worktree` lifecycle + commit → push → `gh pr create`), not reinvented.

---

## 1. Spine: pain + engine (locked together)

### Pain (why it exists)

| Need | Gap today |
|------|-----------|
| See work at scale across parallel scopes | cmux = panes, no coherence; T3 Code = clean threads, no multi-lane landscape |
| Stop semantic bleed | Prompt-only fencing fails; shared directories pollute |
| Stay Grand Conductor | No desk that liaises master intent ↔ worker sessions on subscriptions |
| Newbie-safe git literacy | Worktrees / stash / orphan / merge are opaque |

### Engine (how it runs)

| Seat | Who | Job |
|------|-----|-----|
| **Orchestrator** | You, playing the Fable *pattern* (any planner surface optional) | Goals, model discernment, fences, overrides |
| **Clerk** | **Hermes-4-70B** (local weights) via Ollama on **Machine 2 (DGX Spark, 128 GB)** — **product core**; gemma-class interim behind the replaceable gateway until the Spark is online | Liaison, packet compile/parse, sync coherence, landscape truth |
| **Workers** | Cursor / Claude / Codex **subscriptions** | Execute inside fenced worktrees |

**Fable is not a vendor dependency.** It is the mental model of lane dispatch + fencing + reconcile. The UI mirrors that shape so *you* inhabit the orchestrator seat. Hermes is the free assistant inside the harness that keeps the stream of thought conscious, relevant, and current.

**Deeper arc (non-blocking):** Orchestra is a developer-facing rehearsal for a wider rigid agentic operating environment (business OS, family OS) with a local clerk. Do not expand v0 scope into that OS — keep the door open in naming and packet shapes only.

---

## 2. Stack (locked — do not reopen)

| Choice | Lock |
|--------|------|
| Scaffold | [create.t3.gg](https://create.t3.gg/) — TypeScript · Tailwind · tRPC |
| Out | Prisma · NextAuth (local tool; file-based state) |
| Git | `child_process.execFile("git", …)` only — no shell string interpolation |
| PR host | `gh` CLI (same posture as T3 Code) |
| Local clerk | **Hermes-4-70B** (FP8) via Ollama on the **Spark over the private overlay** (not loopback) · gemma-class interim until the Spark is online · Qwen 3.6 parked spare · **the Hermes-4 weights ARE the clerk brain** (supersedes v2 "weights ≠ Agent brain" — see §13) |
| Transport | Clipboard + parseable markdown JSON fences — **no API keys required** |
| Visual libs v0 | Native SVG only — **no** React Flow / Recharts |
| Multi-repo | `~/.orchestra/registry.json` registers N repos; Orchestra never ships inside them |

---

## 3. Relationship to T3 Code (legal + technical)

**License:** MIT — Copyright (c) 2026 T3 Tools Inc. Attribution required in NOTICE / README when porting substantial portions.

### Borrow directly (v0 mandate)

Port/adapt these behaviors from `pingdotgg/t3code` (study `GitManager`, `GitVcsDriverCore`, `GitHubCli`, `runStackedAction`):

1. **Worktree lifecycle** — create branch off base (`main`), `git worktree add`, list, remove, prune; fail-soft when directory already exists (attach/repair).
2. **Stacked git actions** — `commit` → `push` (set upstream) → `gh pr create` as one conductor action.
3. **PR awareness** — resolve PR via `gh pr view`; track open/merged; optional “open PR in browser.”
4. **Isolation posture** — each worker lane = its own worktree directory + branch; main checkout stays clean.

### Do **not** wholesale-fork the T3 Code GUI in v0

| Reason | Detail |
|--------|--------|
| Product surface differs | T3 = agent-thread GUI + providers; Orchestra = Hermes clerk + cinematic trunk + clipboard liaison + Conductor Desk |
| Cost | Fighting their desktop/provider stack slows the clerk-first product |
| Revisit trigger | If porting git/PR layer costs more than extracting their packages cleanly → soft-fork git packages only, still not the full GUI |

**Worktree path convention (Orchestra) — LOCKED T3-analogue:**  
`<repo>/.orchestra/worktrees/<workerSlug>/`  
(Project-local like T3’s `.t3-worktrees/`, Orchestra naming; main checkout stays clean. Not `~/.orchestra/worktrees/`.)

---

## 4. System context (payloads on every arrow)

```text
You (Orchestrator seat)
   │  NL goals / overrides
   ▼
┌──────────────────────────────────────────┐
│  ORCHESTRA UI (create-t3-app)            │
│  Conductor Desk · Trunk Map · Clerk UI   │
│            ▲                             │
│            │ JSON chat (localhost)       │
│            ▼                             │
│     HERMES CLERK (Ollama)                │
└───────┬───────────────────┬──────────────┘
        │ execFile git/gh   │ clipboard MD packets
        ▼                   ▼
   N worktrees + fences   Any planner tab (optional)
        │                   ▲
        ▼                   │ relay packets
   N Cursor/Claude/Codex ───┘  (human paste or desk copy)
```

| Arrow | Format |
|-------|--------|
| You → Desk | Natural language / structured override form |
| Desk ↔ Hermes | JSON over `127.0.0.1:11434` |
| Orchestra → git/gh | `execFile` argv arrays |
| Hermes/Desk → planner or workers | Markdown fences: MANIFEST / SYNC-LOG / OVERRIDE / PR-BRIEF |
| Workers → Desk | Paste or drop SYNC-LOG (v0); no live Cursor injection |

---

## 5. Canonical schemas

### `~/.orchestra/registry.json` → types `OrchestraRegistry`, `OrchestraRegistryEntry`

```json
{
  "version": 1,
  "entries": [
    {
      "id": "uuid",
      "slug": "construction-os",
      "rootPath": "/abs/path",
      "displayName": "Construction OS",
      "addedAt": "ISO8601",
      "lastOpenedAt": null
    }
  ],
  "defaults": {
    "worktreeRoot": "<repo>/.orchestra/worktrees",
    "pollMsFocused": 3000,
    "pollMsBlurred": 10000,
    "ollamaBaseUrl": "http://127.0.0.1:11434/v1",
    "ollamaModel": "gemma4:31b",
    "ollamaContextTokens": 64000,
    "hermesRuntime": "hermes-agent",
    "spareModels": ["qwen3.6"]
  }
}
```

> **Interim defaults (2026-07-20).** The values above are interim — loopback `ollamaBaseUrl` and a small `ollamaModel`. The OD1 / §13 target is **Hermes-4-70B on the DGX Spark**: `ollamaBaseUrl` becomes the Spark's private-overlay address, **not `127.0.0.1`**, and `ollamaModel` the pinned Hermes-4 tag.

### `<repo>/.orchestra/state.json` → `OrchestraRepoState`, `WorktreeNode`, `FenceSpec`, `TrunkScanSnapshot`, `NodeStatus`

`NodeStatus`: `active` | `merged` | `stashed` | `orphaned` | `pr_open`  
Colors: active **blue** · merged **green** · stashed **orange** · orphaned **red** · pr_open **blue with PR badge**

`WorktreeNode` must include: `id`, `slug`, `branch`, `path`, `status`, `anchorSha`, `fence`, `modelHint`, `prUrl?`, `createdAt`, `lastSyncAt`.

### Wire protocol (machine-parseable)

**`[ORCHESTRA-MANIFEST]`** — planner/you → Hermes/UI (dispatch)

```json
{
  "schema": "orchestra.manifest.v1",
  "planId": "uuid",
  "repoSlug": "construction-os",
  "intent": "one-line",
  "workers": [
    {
      "slug": "security-sanitize",
      "branch": "orch/security-sanitize",
      "role": "Security",
      "modelHint": "cursor-sonnet",
      "allowedPaths": ["src/lib/auth/**"],
      "forbiddenPaths": ["src/components/**"],
      "acceptance": ["no UI layout edits"]
    }
  ]
}
```

**`[WORKTREE-SYNC-LOG]`** — worker → Hermes → orchestrator relay

```json
{
  "schema": "orchestra.sync_log.v1",
  "planId": "uuid",
  "workerSlug": "security-sanitize",
  "repoSlug": "construction-os",
  "branch": "orch/security-sanitize",
  "status": "progress",
  "summary": "≤280 chars",
  "commits": [],
  "filesTouched": [],
  "blockers": [],
  "nextAction": "",
  "recordedAt": "ISO8601"
}
```

`status`: `progress` | `blocked` | `ready_for_review` | `done`

**`[CONDUCTOR-OVERRIDE]`** — desk → Hermes → broadcast packet for workers/planner

```json
{
  "schema": "orchestra.override.v1",
  "planId": "uuid",
  "repoSlug": "construction-os",
  "target": "all",
  "priority": "normal",
  "instruction": "plain text",
  "issuedAt": "ISO8601"
}
```

**`[PR-BRIEF]`** — Hermes compiles after stacked PR action (for planner awareness)

```json
{
  "schema": "orchestra.pr_brief.v1",
  "repoSlug": "construction-os",
  "branch": "orch/security-sanitize",
  "prUrl": "https://github.com/…",
  "title": "",
  "summary": ""
}
```

---

## 6. Module boundaries

| Module | Owns | Must NEVER |
|--------|------|------------|
| **A — Git & PR Engine** | Worktree CRUD/repair, fence writer (`.cursor/rules/orchestra-fence.mdc`), trunk scan, stacked commit/push/PR (`gh`) — **T3-pattern** | Talk to Ollama; render UI; invent custom PR UX that fights `gh` |
| **B — Landscape + Desk** | Cinematic SVG trunk (`main` horizontal backbone), status colors, Conductor Desk (paste/compile/copy), poll via tRPC | Call git/gh directly; embed live Cursor chats |
| **C — Hermes Clerk** | Ollama proxy, packet parse/compile, liaison prompts, “keep stream coherent” assist, manifest dispatch *orchestration* (calls A) | Require cloud API keys; replace the human orchestrator seat |

**Dependency rule:** B → tRPC → A|C. C may invoke A only through server services. A never imports B or C.

**UI spatial lock (cinematic, not SaaS grid):**

1. **Top — Endless main trunk** — horizontal backbone; branches curve off at `anchorSha`.
2. **Middle — Monitor strip** — compact per-worker status from sync logs (not fake live chats).
3. **Bottom — Conductor Desk** — primary point of contact; Hermes speaks here; copy/paste packets live here.

---

## 7. tRPC map

| Procedure | Input | Output |
|-----------|-------|--------|
| `registry.list` | void | `OrchestraRegistry` |
| `registry.add` | `{ rootPath }` | `OrchestraRegistryEntry` |
| `worktree.create` | `{ repoId, slug, branch, allowedPaths, forbiddenPaths, modelHint? }` | `WorktreeNode` |
| `worktree.list` | `{ repoId }` | `WorktreeNode[]` |
| `worktree.remove` | `{ repoId, nodeId, mode: "keep-branch" \| "delete-branch" }` | `{ ok: true }` |
| `scan.trunk` | `{ repoId }` | `TrunkScanSnapshot` |
| `git.stackedAction` | `{ repoId, nodeId, steps: ("commit"\|"push"\|"pr")[], message?, prTitle?, prBody? }` | `{ ok, prUrl? }` |
| `manifest.parse` | `{ rawMarkdown }` | `OrchestraManifest` |
| `manifest.dispatch` | `{ manifest }` | `{ nodes, warnings }` |
| `packet.compile` | `{ kind, payload }` | `{ markdown }` |
| `hermes.chat` | `{ messages, model? }` | `{ content, model }` |
| `hermes.liaise` | `{ repoId, intent: "summarize_lanes" \| "draft_override" \| "draft_relay" }` | `{ markdown }` |

---

## 8. Onboarding (≤4 steps)

1. **Detect** — git, `gh`, Cursor path, Ollama tags (Hermes preferred).
2. **Hook Hermes** — one click set model + base URL; skip only if user insists (clerk-degraded mode).
3. **Anchor repo** — drag-drop → `registry.add` → init `.orchestra/state.json`.
4. **MCP cards** — enable filesystem/git via copy/reveal — no raw JSON editing required.

---

## 9. Build plan (solo, subscription Cursor)

| Phase | Focus | Exit criteria |
|-------|--------|---------------|
| **P0 — Scaffold** | `create-t3-app` (TS+TW+tRPC, no Prisma/NextAuth); `~/.orchestra/` bootstrap; land this constitution in `docs/` | `npm run dev` loads; registry created on first visit |
| **P1 — Module A worktrees** | Port T3-pattern worktree create/list/remove/repair; fence writer; `state.json` | Disposable repo: create → list → remove; fence file present |
| **P2 — Module A stacked PR** | `git.stackedAction` commit→push→`gh pr create`; node `pr_open` / `merged` | One real PR opened from desk on a throwaway branch |
| **P3 — Module B landscape** | SVG trunk + colors + Conductor Desk paste/copy; poll | Fixture scan paints correctly; desk round-trips a SYNC-LOG |
| **P4 — Module C Hermes** | `hermes.chat` / `hermes.liaise`; manifest parse/dispatch via clerk; packet compile | From desk: ask Hermes to package lane state → clipboard MD valid |
| **P5 — Polish** | 4-step onboarding; override broadcast; PR-BRIEF; README + MIT NOTICE for T3 borrow | Newbie path: detect → Hermes → anchor → paste manifest → PR without terminal |

**Ordering rule:** Do not start Pn+1 until Pn exit is green. Prefer one phase per focused Cursor session.

**First implementation slice after P0:** Module A worktrees (P1) — physical isolation is the painkiller; Hermes without fences is theater.

**Clerk-host note (2026-07-20).** P4 (Module C) is built against the **replaceable clerk gateway** with a **gemma-class interim model**; **Hermes-4-70B on the DGX Spark** is the production target the gateway swaps to once the Spark is online. Do **not** hard-wire P4 to a single model or to loopback — the gateway abstracts model + address (see §13, OD1).

---

## 10. Honest deferrals

| Deferred | Upgrade trigger |
|----------|-----------------|
| Live Cursor/Claude session feeds | Stable local session API |
| Semantic drift auto-detector | ≥3 real fence collisions in a week of use |
| Auto-open IDE windows | Deep-link verified on JD’s machines |
| 24/7 FS watcher daemon | Focused poll lag >2s becomes a real complaint |
| Wholesale T3 Code GUI fork | Git/PR port cost exceeds extracting their packages |
| Full swan-song OS (business/family) | After Orchestra v0 clerk loop is daily-driver |

**Out of this constitution:** Worker runtime `.cursorrules` executor templates — separate artifact after P1 fence writer exists.

---

## 11. Decisions — LOCKED (2026-07-11)

| ID | Lock | Notes |
|----|------|-------|
| **OD1** *(amended 2026-07-20)* | Re-pin → **Hermes-4-70B (FP8)** on the **DGX Spark over the private overlay** → gemma-class interim behind the gateway until the Spark is online | **Supersedes the original `gemma4:31b` pin** (archived verbatim in §13). Hybrid `<think>` used deliberately — off for clerical packet work, on for orchestration. **The Hermes-4 weights ARE the clerk brain.** Qwen 3.6 = manual spare. |
| **OD2** | `FenceSpec` in `state.json` is SoT → emit `.cursor/rules/orchestra-fence.mdc` into worktree | No parallel `fence.json` |
| **OD3** | **T3-mirror** stacked semantics | Dirty + stack includes commit → commit then continue. Bare `create_pr` + dirty → refuse. Bare `push` + dirty → push commits only, warn. |
| **Path** | `<repo>/.orchestra/worktrees/<workerSlug>/` | T3-analogue project-local isolation |

---


## 12. Non-goals v0

- Prisma / NextAuth / cloud API key vaults  
- Shipping Orchestra inside `construction-os` / `tenjo-os`  
- React Flow / Recharts  
- Replacing subscription workers with local codegen  
- Electron/Tauri unless browser+local server proves insufficient (trigger: need OS notifications / global hotkey)

---

## 13. Amendment 2026-07-20 — Two-machine hardware + Hermes-4 clerk

**Status:** Accepted · supersedes the OD1 `gemma4:31b` / 48 GB-laptop clerk pin.

### Trigger

Machine 2 resolved as a single **NVIDIA DGX Spark** (128 GB, CUDA). Apple retired the 256 GB Mac Studio M3 Ultra tier, killing the "Mac Studio hosts the clerk" plan. The **M5 MacBook Pro (48 GB)** docks at the desk for macOS creative/gaming and is the interim clerk host + remote-control surface; **Machine 1** stays the Fedora KDE cockpit + cloud worker agents.

### Decision

The clerk brain is **Hermes-4-70B (FP8)** served via **Ollama on the Spark over a private network overlay**. A **gemma-class small model** runs the clerk locally behind the replaceable gateway until the Spark is online.

**Why Hermes-4-70B:** it is trained for schema adherence — emitting valid JSON *for a given schema* and *repairing* malformed objects — which is precisely the clerk's packet job (compile/parse MANIFEST / SYNC-LOG / OVERRIDE / PR-BRIEF) and its worst-case failure mode. It emits real `<tool_call>` tags, is steerable and low-refusal, and its hybrid `<think>` mode is used deliberately (off for clerical packet work, on for orchestration). FP8 weights (~70 GB) fit the Spark's 128 GB.

### What changed

- **OD1** re-pinned (§11) — Hermes-4-70B on the Spark; gemma-class interim; Qwen 3.6 spare.
- The v2 rule that "Hermes Agent runtime ≠ Hermes 3/4 LLM weights" is **retired** — the Hermes-4 weights **are** the clerk brain. §1, §2, §5, §9, and the `[ORCHESTRA-ARCH-SPEC]` `clerk{}` block are updated to match.
- Clerk transport target moves from loopback (`127.0.0.1:11434`) to the Spark's private-overlay address; loopback + a small model remain the interim default.

### Non-blocking build implication

Moving the gateway from loopback to networked pulls a **private-overlay + auth control surface** into **Module C** scope. This does not block P1–P3: build **P4 against the replaceable gateway with an interim model**, then swap the gateway's target to the Spark when it comes online. Do not hard-wire P4 to one model or to loopback.

### Still open

- Concrete private-overlay tooling + the Spark's actual address.
- The authenticated phone/MacBook **remote-control surface** (job state, approve bounded actions, cancel, retrieve outputs) — grown *past* the original P5 polish scope; likely its own ADR.
- Hermes-4-70B's served context window on the Spark — the Llama-3.1-70B base implies 128k; verify at deploy.

### Superseded state — archived verbatim (do not delete)

> Original **OD1** (§11, locked 2026-07-11):
>
> | **OD1** | Detect once → pin **`gemma4:31b`** (64k ctx Modelfile) → freeze in registry/`~/.hermes` | Hermes Agent runtime ≠ Hermes 3/4 LLM weights. Qwen 3.6 = manual spare only. JD hardware: M5 MBP 48 GB. |
>
> Original §2 "Local clerk" row:
>
> | Local clerk | **Hermes Agent** + Ollama `http://127.0.0.1:11434/v1` · pinned brain: **`gemma4:31b`** (64k ctx) · Qwen 3.6 parked spare · Hermes 3/4 LLM weights are NOT the Agent brain |
>
> Retired naming rule: "Hermes 3/4 LLM weights are NOT the Hermes Agent brain."

---

### [ORCHESTRA-ARCH-SPEC]
```json
{
  "version": 2,
  "repo": "blossvmtn/blossvm-orchestra",
  "product_name": "blossvm-orchestra",
  "stack": "create-t3-app: typescript+tailwind+trpc, no prisma, no nextauth",
  "spine": {
    "pain": "parallel subscription sessions collide; need multi-lane overview + conductor control",
    "engine": "Hermes-4-70B clerk is product core (clerk/product core); Claude Code is the worker provider; human plays Fable-pattern orchestrator",
    "fable": "mental model / UI shape — not a vendor dependency",
    "naming_resolution_2026-07-20": "the Hermes-4-70B weights ARE the clerk brain; the earlier 'Hermes Agent runtime != Hermes 3/4 weights' rule is retired (see section 13)"
  },
  "clerk": {
    "runtime": "ollama",
    "ollama_base": "<spark-private-overlay-address>",
    "ollama_base_note": "Spark overlay address, NOT loopback; 127.0.0.1 was the interim-only default",
    "pinned_model": "hermes-4-70b-fp8",
    "interim_model": "gemma-class (small) behind the replaceable gateway until the Spark is online",
    "context_tokens": 128000,
    "spare_models": ["qwen3.6"],
    "hardware": {
      "machine_1": "Fedora KDE workstation — cockpit + cloud worker agents",
      "machine_2": "NVIDIA DGX Spark (128GB, CUDA) — clerk host (Hermes-4-70B FP8 via Ollama)",
      "dock": "Apple M5 MacBook Pro (48GB) — macOS creative/gaming; interim clerk host + remote-control surface"
    },
    "amended": "2026-07-20 (section 13) — supersedes the gemma4:31b @64k / M5-48GB-laptop clerk pin"
  },
  "t3_code": {
    "upstream": "pingdotgg/t3code",
    "license": "MIT",
    "strategy": "borrow_not_fork_gui",
    "port": [
      "worktree lifecycle create/list/remove/prune/repair",
      "stacked commit → push → gh pr create (T3-mirror dirty-tree semantics)",
      "PR status via gh"
    ],
    "diverge": {
      "worktree_root": "<repo>/.orchestra/worktrees/<workerSlug>",
      "reason": "T3-analogue project-local isolation with Orchestra naming"
    },
    "attribution": "NOTICE + README required when porting substantial code",
    "revisit_full_fork_when": "git/PR port cost exceeds extracting T3 packages"
  },
  "modules": {
    "A": "Git & PR Engine — T3-pattern worktrees + stacked PR; fence writer; trunk scan; execFile git/gh only",
    "B": "Landscape + Conductor Desk — cinematic SVG trunk; monitor strip; desk paste/copy; never call git",
    "C": "Hermes Clerk — Hermes-4-70B via Ollama on the DGX Spark over the private overlay (gemma-class interim behind the replaceable gateway); liaise; packet parse/compile; manifest dispatch; no API keys"
  },
  "ui_zones": ["trunk_top", "monitor_mid", "conductor_desk_bottom"],
  "schemas": {
    "registry": { "path": "~/.orchestra/registry.json", "types": ["OrchestraRegistry", "OrchestraRegistryEntry"] },
    "state": {
      "path": "<repo>/.orchestra/state.json",
      "types": ["OrchestraRepoState", "WorktreeNode", "FenceSpec", "TrunkScanSnapshot", "NodeStatus"],
      "status_colors": {
        "active": "blue",
        "merged": "green",
        "stashed": "orange",
        "orphaned": "red",
        "pr_open": "blue+badge"
      }
    },
    "manifest": { "tag": "[ORCHESTRA-MANIFEST]", "schema": "orchestra.manifest.v1" },
    "sync_log": { "tag": "[WORKTREE-SYNC-LOG]", "schema": "orchestra.sync_log.v1" },
    "override": { "tag": "[CONDUCTOR-OVERRIDE]", "schema": "orchestra.override.v1" },
    "pr_brief": { "tag": "[PR-BRIEF]", "schema": "orchestra.pr_brief.v1" }
  },
  "trpc_routers": [
    "registry.list",
    "registry.add",
    "worktree.create",
    "worktree.list",
    "worktree.remove",
    "scan.trunk",
    "git.stackedAction",
    "manifest.parse",
    "manifest.dispatch",
    "packet.compile",
    "hermes.chat",
    "hermes.liaise"
  ],
  "onboarding": [
    "detect git+gh+Cursor+Ollama",
    "one-click clerk hook → gateway pins Hermes-4-70B on the Spark (gemma-class interim until online)",
    "drag-drop repo anchor",
    "MCP cards via copy/reveal"
  ],
  "phases": [
    { "id": "P0", "name": "Scaffold + registry", "exit": "dev boots; registry on first visit" },
    { "id": "P1", "name": "Worktrees + fences (T3-pattern)", "exit": "CRUD+fence on disposable repo" },
    { "id": "P2", "name": "Stacked PR actions", "exit": "real PR from desk via gh" },
    { "id": "P3", "name": "Cinematic trunk + desk", "exit": "fixture map + SYNC-LOG round-trip" },
    { "id": "P4", "name": "Hermes clerk core (Hermes-4-70B on the Spark; interim model via gateway)", "exit": "liaise → clipboard MD valid" },
    { "id": "P5", "name": "Onboarding + polish", "exit": "newbie path green end-to-end" }
  ],
  "first_slice_after_p0": "P1 Module A worktrees",
  "deferred": [
    { "item": "live session feeds", "trigger": "stable local session API" },
    { "item": "drift AI", "trigger": "≥3 fence collisions / week" },
    { "item": "auto-open IDE", "trigger": "deep-link verified" },
    { "item": "FS watcher daemon", "trigger": "poll lag >2s complaint" },
    { "item": "full T3 GUI fork", "trigger": "port cost > extract cost" },
    { "item": "swan-song multi-OS", "trigger": "Orchestra clerk is daily-driver" }
  ],
  "decisions_locked": [
    {
      "id": "OD1",
      "lock": "re-pin Hermes-4-70B (FP8) on the DGX Spark over the private overlay; gemma-class interim behind the gateway; qwen3.6 spare; the Hermes-4 weights ARE the clerk brain",
      "amended": "2026-07-20 (section 13) — supersedes the original gemma4:31b @64k pin, archived verbatim in section 13"
    },
    {
      "id": "OD2",
      "lock": "FenceSpec in state.json SoT → emit .cursor/rules/orchestra-fence.mdc"
    },
    {
      "id": "OD3",
      "lock": "T3-mirror stacked dirty-tree semantics"
    },
    {
      "id": "PATH",
      "lock": "<repo>/.orchestra/worktrees/<workerSlug>/"
    }
  ]
}
```
### [/ORCHESTRA-ARCH-SPEC]
