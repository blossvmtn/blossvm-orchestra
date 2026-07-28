# R8B File Atlas read-only adapter

**Status:** implementation
**Authority:** `blossvmtn/workstation` planning contract
`planning/R8B-ORCHESTRA-FILE-ATLAS-PILOT.md` at merge commit
`5c2ba53de9538ea349afd760b73b78037a00e408`

This document records the Orchestra integration seam. It does not restate or
replace the workstation contract.

## Shipped slice

- `@orchestra/core` owns the strict
  `workstation.file_atlas_snapshot.v1` presentation schema.
- The existing Bun daemon owns fixture and live provider adapters.
- `GET /workstation/file-atlas` uses the existing bearer-token boundary.
- The React cockpit renders one aggregate `Files` view.
- No new daemon, database, watcher, or persistent File Atlas state is created.

## Live-provider boundary

The live adapter may:

- inspect only the approved top-level `This Mac` and `Anywhere` categories and
  direct Inbox counts;
- inspect only repositories already registered with Orchestra;
- run `git status --porcelain=v2 --branch --untracked-files=normal` with
  `GIT_OPTIONAL_LOCKS=0`, with normal (directory-level) untracked reporting so
  the aggregate view does not enumerate private filenames or cache contents;
- compare the Git index SHA-256 before and after inspection;
- compare approved directory identity metadata before and after inspection;
- read fixed PASS markers from sanitized recovery receipts without traversing
  protected payloads;
- compare the workstation bootstrap to its committed `HEAD` content and read
  available storage.

The adapter does not fetch, mutate Git, enumerate protected file contents, read
Drive contents, or infer company-document availability without a sanitized
machine-readable receipt. Receipt presence alone remains `unverified`.

Every source has an independent 1.8-second observation budget. A failed source
returns a redacted reason code and `unknown`; other evidence still renders.
Storage enters `attention` below 64 GiB available, enough headroom for one large
local build/worktree cycle without claiming a platform-wide disk-health law.
Unexpected adapter failure returns a strict all-unknown snapshot without raw
error detail. A successful encrypted-custody receipt also supplies the
sanitized availability evidence for the existing company Shared Drive.

## Verification

Automated proof covers:

- strict schema acceptance and rejection of path/raw-error fields;
- fixture rendering without live filesystem access;
- partial snapshots and redacted issues;
- registered-repository aggregation only;
- Git index byte equality across inspection;
- bounded timeout behavior;
- authenticated HTTP access and redacted route fallback;
- plain-language cockpit view-model output.

The final PR receipt records the executed build, test, drift, and active-checkout
fingerprint checks.
