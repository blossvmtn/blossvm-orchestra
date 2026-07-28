# R8B File Atlas live proof

**Date:** 2026-07-28
**Result:** PASS
**Mode:** read-only, three explicitly registered repositories, in-memory
Orchestra database

## Snapshot

- elapsed: 34 ms
- overall status: `healthy`
- This Mac, Anywhere, repositories, recovery, company documents, workstation,
  and storage: `healthy`
- issues: none
- repository aggregate: 3 registered, 2 dirty, 0 ahead, 0 detached

The aggregate is an observation from existing local refs. No fetch occurred and
the counts are not a claim about current GitHub state.

## Before/after repository proof

| Repository | HEAD | Status SHA-256 | Index SHA-256 | Unchanged |
|---|---|---|---|---|
| construction-os | `2caef815b920738b2df1b7f1a99a24452eeff293` | `c2a7fab910ca76ad09d152cd9d9626949a2ba747e3f35e90ff9ab8cdf510dce1` | `64f5d0df6206ce1e4b04044ff8e9b516decd4193a20b0ae4d5af30c2c4f2934e` | yes |
| tenjo-os | `3aec86bb8d060ea957fe7e3c12e4bc0e1ac52da0` | `bbbeeccb1d230ff0fab1f046b5f8a20d44a63bcc280d28f2dcc75c1742d0cc33` | `65a143d001b49998fe1e13226876c490222e6a8c08afcb8012a14e8e90c540ee` | yes |
| blossvm-orchestra active checkout | `e24d03d6e429623cd1a16b30f86014c1926841dc` | `06a3af5f947a9e64881dc2ce9273e6310f7ec243182e916975053af4e0e6e7f7` | `9d1a73fda2d80207cde086fbb5b9911c23f1baf03c387679c81fb3927abdd7a9` | yes |

Every status command used `GIT_OPTIONAL_LOCKS=0`. The live adapter used normal
directory-level untracked reporting; the independent before/after proof used
full untracked reporting and compared only SHA-256 digests.

## Approved-directory identity proof

| Surface | Identity SHA-256 | Unchanged |
|---|---|---|
| This Mac | `1b35f1ceea1d57c76a709bf9446c6e5e0d16e1fd59b9006745e359da9ea52018` | yes |
| Anywhere | `c6a7748d2361bb4075d5c54c2a312421571ef9295049fac7e38a6fe35b2cf9e2` | yes |

Each digest covers only approved root/category device, inode, mode, and
directory-type metadata. No payload names or contents were included.

## Disclosure proof

- redacted Gitleaks directory scan: zero findings
- machine-specific absolute-path and Drive-identifier scan of changed
  production/docs surfaces: zero findings
- runtime snapshot contained only schema-approved labels, counts, states, and
  redacted issue codes

No active repository was written. The isolated implementation worktree is the
only product checkout changed by this build.
