# blossvm-orchestra

Local **conductor desk** for parallel subscription agent sessions.

- **Orchestrator seat:** you (Fable-*pattern* — not a vendor dependency)
- **Clerk:** Hermes Agent + Ollama `gemma4:31b` @ 64k
- **Workers:** Cursor / Claude / Codex inside fenced git worktrees
- **Isolation:** `<repo>/.orchestra/worktrees/<workerSlug>/` + `.cursor/rules/orchestra-fence.mdc`

**Repo:** [blossvmtn/blossvm-orchestra](https://github.com/blossvmtn/blossvm-orchestra)  
Authority: `docs/ORCHESTRA-CONSTITUTION-v2.md`.

## Stack

create-t3-app · TypeScript · Tailwind · tRPC · **no** Prisma · **no** NextAuth  
Git/gh via `execFile` argv only (T3 Code MIT patterns — see `NOTICE`).

## Phase status

| Phase | Status |
|-------|--------|
| P0 Scaffold + registry | Done |
| P1 Worktrees + fences | Done |
| P2 Stacked PR (`gh`) | Done |
| P3 Landscape + Conductor Desk | Done |
| P4 Hermes clerk | Done |
| P5 Onboarding + polish | Done |

## Newbie path (P5)

1. **Detect** — git, `gh`, Cursor, Ollama  
2. **Pin Hermes** — one click → `gemma4:31b` @ 64k (or skip degraded)  
3. **Anchor repo** — paste/drag path → `registry.add`  
4. **MCP cards** — copy/reveal only  

Then: paste a `[ORCHESTRA-MANIFEST]` / SYNC-LOG at the desk, package lanes with Hermes, open PRs via `git.stackedAction` — no terminal required for the happy path.

## Dev

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # P1–P5 suite
```

Override registry home in tests: `ORCHESTRA_HOME=/tmp/...`  
Force deterministic clerk packets: `ORCHESTRA_HERMES_DETERMINISTIC=1`

## Note on naming

Earlier docs called this `orchestra-ui`. That name is retired. Product + GitHub + folder = **blossvm-orchestra**.
