# blossvm-orchestra

Local conductor desk for driving parallel AI coding agents (Claude Code today; Codex and
Cursor sequenced later — ADR 0001 D4) across one or more git projects, each in its own
isolated worktree.

Architecture: `docs/adr/0001-tauri-bun-architecture.md`. Current build: the Phase 0
constitutional seed — `docs/specs/2026-07-18-phase-0-constitutional-seed.md`.

A Bun workspace of four packages/apps:

- **`packages/orchestra-core`** — pure TypeScript domain schemas (Zod), zero I/O.
- **`packages/orchestra-daemon`** — the long-lived local HTTP server. SQLite (Drizzle) for
  state; this is the one process that does real work.
- **`packages/orchestra-cli`** — a scriptable entry point that talks to the daemon.
- **`apps/orchestra-cockpit`** — the Tauri v2 + React desktop shell. Rust spawns and
  supervises the daemon as its one child process; the UI talks to it directly over a
  token-authenticated `fetch()`, no relay through Rust.

`apps/orchestra-web-legacy` is the original v0 Next.js app — untouched by the Phase 0
rebuild, still runs on its own (`bun run web-legacy:dev`), not deprecated (see ADR 0001's
"Consequences for downstream").

## Run it

```bash
bun install
bun run cockpit:dev   # the real Tauri desktop app
```

First run also compiles the Rust side — needs a Rust toolchain (`rustup`) and, on macOS,
Xcode Command Line Tools.

Or run the pieces separately:

```bash
bun run daemon:dev    # daemon only — http://127.0.0.1:41417
bun run cockpit:web   # cockpit UI in a browser tab, no Tauri window
bun run web-legacy:dev # the original v0 app — http://localhost:3000
```

## Test

```bash
bun run test
```

Per-package typecheck: `bunx tsc --noEmit` from inside any of the four package/app
directories. Schema/migration drift check: `bunx drizzle-kit check` from
`packages/orchestra-daemon`. All four run in CI on every push and PR
(`.github/workflows/ci.yml`).

## Notes

- Daemon token lives at `~/.orchestra/daemon.token`; SQLite db at
  `~/.orchestra/orchestra.db`.
- Product rules: `docs/ORCHESTRA-CONSTITUTION-v2.md` — superseded in part by ADR 0001; the
  ADR is authoritative where the two disagree.
- T3 Code MIT attribution: `NOTICE`
