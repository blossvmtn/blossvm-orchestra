# ADR 0002 — Desktop-first, cloud-connected Orchestra

**Status:** Accepted
**Date:** 2026-07-31  
**Accepted:** 2026-08-04 by JD in GitHub issue #10
**Scope:** Product surfaces, authority boundaries, and execution topology

## Context

Orchestra is already a real local application: a Tauri v2 cockpit, a supervised Bun
daemon, SQLite state, registered repositories, isolated git worktrees, fenced Claude Code
dispatch, serialized git writes, explicit PR promotion, an operational cockpit, and the
read-only File Atlas.

That desktop experience is not scaffolding to replace. It is Orchestra's flagship
workstation and the safest place for deep repository inspection, local worktrees, native
filesystem operations, local development servers, and future workstation or DGX-backed
capabilities.

The unresolved limitation is continuity away from the workstation. Remote control of a
local process still requires that workstation to be powered on and reachable. JD needs to
be able to use a phone to plan, dispatch, supervise, review, and approve useful engineering
work while no personal computer is running. Provider-owned cloud environments can execute
some of that work already, but Orchestra has no durable cloud authority or shared mobile
surface over them.

Orchestra therefore needs to grow from one local runtime into one product with coordinated
desktop, cloud, and mobile surfaces without weakening the local safety model or turning
the desktop into a secondary client.

## Decision

Orchestra will become a **desktop-first, cloud-connected system** with three first-class
product surfaces and explicit authority boundaries.

### 1. Product surfaces

| Surface | Responsibility |
| --- | --- |
| **Orchestra Desktop** | Flagship conductor desk and local execution authority. Owns the richest cockpit, File Atlas, registered local repositories, worktrees, native filesystem access, local processes, and local models. |
| **Orchestra Cloud** | Always-available coordination authority. Owns shared identity, tasks, decisions, policy, provider dispatch, run summaries, approvals, audit records, and cross-device continuity. |
| **Orchestra Mobile** | Full control client for work that can be addressed through Orchestra Cloud. Creates and refines tasks, collaborates, answers questions, grants bounded approvals, monitors runs, reviews evidence and diffs, and requests or approves promotion. It is not a phone-hosted development environment. |

The desktop remains independently useful when the cloud is unavailable. Adding cloud and
mobile capabilities is an additive evolution, not a rewrite or migration away from Tauri,
Bun, SQLite, or the existing cockpit.

### 2. Authority is divided by resource

There will not be one database or process pretending to be authoritative for every kind of
state.

| Resource | Authority |
| --- | --- |
| Organization identity, globally visible tasks, decisions, policies, approvals, and audit records | Orchestra Cloud |
| Local repository, worktree, process, filesystem, and local-agent state | The local Orchestra daemon that owns that machine |
| Provider-owned execution environment while a cloud run is active | The provider adapter, normalized into an Orchestra AgentRun |
| Shared code outcome across environments | GitHub commit SHAs, branches, checks, and pull requests |
| Human-agent conversation and shared working context | Buzz collaboration plane |
| Promotion, destructive actions, budget exceptions, and final acceptance | Orchestra policy plus the authorized human; never an agent acting alone |

Local state may be projected into the cloud for visibility, but the cloud must not claim it
can mutate a local repository or process when its owning daemon is offline. Cloud state may
be projected into the desktop, but cloud records do not overwrite local physical truth.

Materialized records remain the source of truth for current state. Append-only events are
an audit diary and synchronization evidence; they are not replayed as the sole means of
reconstructing current state. This extends ADR 0001 D5 rather than replacing it.

### 3. Collaboration and authority remain separate

Buzz is Orchestra's first-class **collaboration plane** for shared human-agent spaces,
messages, identity, presence, and working context.

Buzz content is input, not authority. A message, research contribution, agent suggestion,
or Hermes recommendation may create an Orchestra proposal, but it cannot silently change a
governing plan, dispatch privileged work, promote code, or authorize a destructive action.
Orchestra records the explicit decision that turns collaboration into controlled work.

This separation permits Bill, JD, Hermes, and worker agents to collaborate in one place
without allowing volume, confidence, or agent autonomy to become build authority.

### 4. Hermes coordinates; workers execute

Hermes remains Orchestra's principal planning and coherence agent. Hermes may interpret
intent, assemble context, decompose work, recommend a provider, draft bounded task
specifications, synthesize results, and request follow-up work.

Hermes does not grant its own permissions or approve its own output.

Execution is delegated through capability adapters. Initial and anticipated targets include
Devin, Claude, Codex, Cursor, and Orchestra-owned workers. Each adapter declares what it can
actually support, including launch, follow-up, cancellation, artifacts, pull requests,
approvals, environment type, and status delivery. Orchestra routes from declared
capabilities rather than assuming every provider behaves alike.

A provider may internally coordinate child agents, but Orchestra receives that activity as
a bounded run tree under one authorized task.

### 5. Cloud execution does not require a personal computer

A task eligible for provider-owned or Orchestra-owned cloud execution can be launched,
supervised, and completed while every personal workstation is offline.

Tasks that require a local repository, unexported file, device, credential, local model, or
native application remain local tasks and clearly report that their execution authority is
offline. Orchestra must not obscure that distinction.

Orchestra will not synchronize whole worktrees between machines. Cloud workers clone from
GitHub at an explicit base SHA and return commits, branches, pull requests, artifacts, and
receipts. The existing desktop can then inspect or continue that work through normal git
and Orchestra flows.

### 6. Files cross boundaries only through grants

Mobile and cloud agents do not receive ambient access to a phone, workstation, Google
Drive, or company filesystem.

A file crosses an execution boundary only through an explicit artifact reference or
task-scoped grant. The grant identifies the task, actor, permitted operation, expiry, and
audit record. Phone-selected files are copied into controlled storage; agents do not browse
the iPhone filesystem. Local files remain local unless explicitly selected or exposed by an
online local daemon under policy.

The later Field Vault capability will implement these grants. This ADR decides the boundary,
not the storage vendor or cryptographic design.

### 7. Synchronization is command-and-receipt based

Cross-surface mutations use explicit commands with stable identifiers and idempotency.
Every accepted command produces a durable result or failure receipt. Reconnect logic may
retry safely without duplicating a dispatch, approval, branch operation, or promotion.

The mobile and desktop clients consume the same cloud contracts for cloud-owned resources.
The local daemon retains its token-authenticated local API for local-owned resources and
gains a separately authenticated synchronization boundary. The local daemon is not exposed
directly to the public internet.

## Consequences

### Benefits

- The desktop remains the complete, high-trust Orchestra experience.
- JD can perform meaningful cloud-addressable work from a phone without leaving a personal
  computer running.
- Cloud providers can evolve independently behind capability adapters.
- Buzz enables shared collaboration without becoming an authorization system.
- GitHub provides a stable reconciliation boundary instead of fragile filesystem mirroring.
- Local-only files and capabilities remain honest and protected.
- Mobile, desktop, and cloud actions produce one inspectable history.

### Costs and obligations

- Orchestra must reconcile distributed authorities instead of assuming one local process
  owns everything.
- Identity, authorization, idempotency, secret handling, offline behavior, and recovery
  become load-bearing product work.
- Local and cloud projections can be stale and must display freshness and ownership
  honestly.
- Provider adapters require provider-specific failure handling and capability reporting.
- A mobile client cannot promise execution of work that depends on an offline local
  authority.
- Cloud availability introduces operating cost and incident-response responsibilities.

## Migration constraints

1. Preserve all existing desktop behavior while introducing shared contracts.
2. Do not move business logic into the Tauri Rust shell.
3. Keep the local daemon as the sole process performing local git and filesystem writes.
4. Keep git subprocesses argv-based; do not introduce shell interpolation.
5. Preserve per-repository git-write serialization for local work.
6. Preserve explicit human promotion for PR, merge, deploy, migration, secrets, and other
   R4 actions.
7. Add cloud functionality in vertical slices behind feature flags.
8. Complete one provider path end to end before broad provider expansion.
9. Treat synchronization failures as visible states, never as silent success.
10. Do not make cloud availability a prerequisite for opening or using the desktop cockpit.

## Not decided here

This ADR intentionally does not choose:

- the cloud hosting vendor;
- the cloud database, workflow engine, or secret store;
- the mobile implementation framework or App Store delivery sequence;
- an Orchestra-owned sandbox or VM provider;
- the final cloud schema or transport protocol;
- the deployment shape of Buzz;
- the deployment location or model behind Hermes;
- provider integration order after the first end-to-end vertical slice;
- Field Vault encryption, retention, or offline-cache details;
- implementation phases, dates, or issue breakdowns.

Those belong in current-state architecture documentation, RFCs, specifications, and Linear
execution plans—not additional amendments to this ADR unless the governing decision itself
changes.

## Relationship to prior authority

This ADR:

- **preserves** ADR 0001's Tauri v2 + Bun daemon + local HTTP + SQLite architecture for the
  desktop;
- **preserves** existing worktree, fence, git mutex, explicit-PR, receipt, and materialized
  state decisions;
- **expands** the Constitution's local-conductor framing into a desktop-first,
  cloud-connected product;
- **supersedes** the Constitution v2 §12 blanket non-goal for cloud API key vaults, because
  controlled cloud execution requires server-side credential handling;
- **resolves directionally** Constitution v2 §13's open question about an authenticated
  phone remote-control surface: mobile connects to Orchestra Cloud, not directly to an
  assumed always-on MacBook;
- **does not repin** Hermes, select a cloud vendor, or alter the current local-provider
  implementation sequence.

A materially different authority model—such as replacing the desktop, synchronizing local
worktrees through a cloud filesystem, granting Buzz execution authority, or making event
replay the sole source of current state—requires a superseding ADR.
