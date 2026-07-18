# orchestra-cockpit

The Tauri v2 + React desktop shell — see the root [README](../../README.md) and
[`docs/adr/0001-tauri-bun-architecture.md`](../../docs/adr/0001-tauri-bun-architecture.md)
for the architecture. Rust (`src-tauri/`) spawns and supervises the `orchestra-daemon` Bun
process as its one child; the UI talks to it directly over a token-authenticated `fetch()`,
no relay through Rust.

Run from the repo root: `bun run cockpit:dev` (the real Tauri window) or
`bun run cockpit:web` (this app's UI alone, in a browser tab, no Tauri window).

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
