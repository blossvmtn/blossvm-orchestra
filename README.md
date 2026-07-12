# blossvm-orchestra

A local desk to run several Cursor workers on one project without them stepping on each other.

**Repo:** [blossvmtn/blossvm-orchestra](https://github.com/blossvmtn/blossvm-orchestra)  
**Rules:** `docs/ORCHESTRA-CONSTITUTION-v2.md`

## What it does

1. You pick a project (or add more than one).
2. **Start worker** makes a private folder + branch under  
   `<repo>/.orchestra/worktrees/<name>/`
3. You open that folder in Cursor — that chat is the worker.
4. The desk watches git: commits show up, and you can **Open pull request** from the card.
5. **Remove** clears the worker folder from the desk when you’re done.

No cloud API keys required for the happy path. GitHub uses your local `gh` login.

## Quick start

```bash
npm install
npm run dev   # http://localhost:3000
```

Then: **+ Add project** → **+ Start worker** → copy folder → work in Cursor → come back → **Open pull request**.

```bash
npm test
```

## Under the hood

- create-t3-app · TypeScript · Tailwind · tRPC (no Prisma / NextAuth)
- Local helper: Ollama (preferred model `gemma4:31b`; spare ok)
- Git / `gh` via `execFile` only (T3 Code MIT patterns — see `NOTICE`)

## Note on naming

Earlier notes called this `orchestra-ui`. That name is retired. Product + GitHub + folder = **blossvm-orchestra**.
