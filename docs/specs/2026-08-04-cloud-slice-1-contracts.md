# Cloud slice 1 — authority and contract seed

**Status:** In progress
**Date:** 2026-08-04
**Authority:** ADR 0002, accepted by JD in GitHub issue #10
**Implementation branch:** `agent/cloud-contracts-slice-1`

## 1. Ratified blueprint

The first cloud vertical slice uses:

- Next.js App Router deployed on Vercel for the responsive PWA and server boundary;
- Supabase Auth with GitHub sign-in initially, plus Supabase Postgres for durable
  organization, task, decision, approval, provider, and receipt state;
- Vercel Workflow for durable provider polling, retries, questions, and approval waits;
- Vercel server-side encrypted environment variables for the first owner-held Cursor key;
- Cursor Cloud Agents API as the first execution adapter.

This stack choice does not change the authority boundaries in ADR 0002. Supabase stores
cloud-owned truth. Vercel Workflow coordinates durable execution. Cursor owns its execution
environment while a provider run is active. GitHub SHAs, branches, checks, and pull requests
reconcile code outcomes. JD retains promotion and destructive-action authority.

## 2. Scope of this PR

This PR only ratifies ADR 0002 and lands the provider-neutral contract layer required by
the first cloud implementation.

It does not:

- provision Vercel or Supabase resources;
- install a workflow runtime;
- apply a remote database migration;
- store or request a Cursor API key;
- dispatch a real provider run;
- change the Tauri cockpit or local daemon;
- grant cloud access to local files or worktrees.

## 3. Minimum cloud schema map

| Required model     | Contract                   | Governing invariant                                                                                                          |
| ------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Organization       | `OrganizationSchema`       | Tenant boundary for every cloud-owned record.                                                                                |
| Actor              | `ActorSchema`              | Human, service, provider, and local-daemon identities remain distinguishable.                                                |
| Task               | `TaskSchema`               | Cloud-owned durable unit with a stable idempotency key and canonical request fingerprint.                                    |
| TaskSpec           | `CloudTaskSpecSchema`      | Tenant-scoped, provider-neutral instructions pinned to an exact GitHub SHA and the Task replay binding.                      |
| AgentRun           | `CloudAgentRunSchema`      | Tenant- and Task-scoped provider execution normalized without granting provider authority over Orchestra.                    |
| RunTree            | `RunTreeSchema` + `RunTreeExecutionSchema` | Every node is bound to its actual AgentRun in one tenant and Task under node, depth, retry, and cost limits.                  |
| Decision           | `DecisionSchema`           | Explicit human or service decision record; conversation alone is not authority.                                              |
| Approval           | `ApprovalSchema`           | A human member other than the requester decides a structured target; approved authority is consumed once by a named command. |
| ArtifactGrant      | `ArtifactGrantSchema`      | File access is task-scoped, operation-scoped, expiring, and revocable with actor, time, and reason.                          |
| Receipt            | `CloudReceiptSchema`       | Every command correlates to the canonical request, exact repository base, and outcome-specific evidence.                     |
| ProviderCapability | `ProviderCapabilitySchema` | Routing uses verified capabilities, including unsupported and unknown states.                                                |
| LocalProjection    | `LocalProjectionSchema`    | Local truth carries explicit authority and connection state; freshness is derived at read time.                              |

`CommandEnvelopeSchema` gives each cross-surface mutation its own stable command and replay
identity. `CloudExecutionChainSchema` binds TaskSpec to Task creation and Receipt to its
Command while rejecting tenant, Task, entity-reference, replay, or repository-base drift.

## 4. Authority and freshness rules

1. A phone-originated task is not accepted until Orchestra Cloud stores its Task and
   TaskSpec under the authenticated Organization and binds the idempotency key to a
   versioned fingerprint of the canonical request bytes. Reuse with different bytes fails.
2. A provider run receives an exact `baseSha`; a branch name alone is not sufficient.
3. A provider status is evidence about provider execution, not an Orchestra approval.
4. Questions and approvals suspend durable workflow execution. A current human membership
   from the same Organization, distinct from the requester, must decide the structured target.
5. Every follow-up, approval, or promotion command has its own idempotency key and canonical
   request fingerprint. Its receipt binds that command identity instead of reusing Task creation.
6. Promotion consumes an approved record once, by an identified command, scoped to the
   repository base, head SHA, branch, and optional pull request.
7. Receipt outcomes are discriminated. Success requires provider/run identity, returned Git
   evidence, verified ancestry, and check evidence. Failure and cancellation require their own
   evidence and cannot carry success-only fields.
8. Local projections are read-only cloud visibility. Freshness is derived from connection
   state and the current read time; stale or offline never implies workstation mutation.
9. Artifact access expires and is limited to named operations. Revocation records who,
   when, and why. Storage keys are server records, not ambient filesystem paths.
10. A run tree cannot cross tenant or Task boundaries or exceed its authorized node, depth,
    retry, or cost limits. The coherence contract validates the actual AgentRun records, not
    tenant and Task claims copied into tree nodes.
11. Provider capability facts record when and where they were verified. Unknown capability
    is not treated as supported.

## 5. Cursor adapter constraints for the next slice

The Cursor adapter must:

- create from the exact Git SHA in `CloudTaskSpec.repository.baseSha`;
- leave automatic PR creation disabled so Orchestra promotion remains explicit;
- persist the provider agent/run identifier before polling or streaming;
- normalize status, interaction requests, failures, branch, commit, PR, artifacts, and
  token usage without exposing the owner key to a browser or mobile client;
- make create retry-safe using Orchestra's idempotency mapping even where provider request
  combinations cannot supply a provider-native idempotency key;
- reconcile SSE with status polling after reconnect;
- treat rate limits and provider 5xx responses as retryable, but auth, validation, and
  unsupported capability failures as visible terminal failures;
- verify returned commit ancestry against the requested base SHA before producing a
  successful cloud receipt.

## 6. Supabase implementation constraints for the next slice

- Browser clients receive only a publishable key. Secret/service-role credentials remain
  server-only.
- Cloud-owned tables are tenant-scoped by `organization_id`.
- RLS is enabled as defense in depth on every exposed table, with ownership predicates;
  `TO authenticated` alone is not authorization.
- Server mutations re-check authenticated organization membership and never authorize from
  user-editable metadata.
- New tables are explicitly granted or withheld from the Data API instead of assuming
  automatic exposure.
- Migration and RLS verification happen locally before any remote application.

## 7. Exit criteria

This contract slice is complete when:

- ADR 0002 is visibly Accepted with the owner ratification date;
- all required models above are exported by `@orchestra/core`;
- existing local contracts remain backward compatible;
- tests prove exact-SHA pinning, distinct Task and Command replay binding, execution-chain
  coherence, actual-run-bound trees, structured and consumable human approvals,
  discriminated receipts, accountable artifact revocation, verified provider capabilities,
  and derived freshness;
- core TypeScript and tests pass.

The next PR may scaffold the authenticated PWA and local Supabase migration, but it must
remain provider-neutral until the schema and RLS tests pass.
