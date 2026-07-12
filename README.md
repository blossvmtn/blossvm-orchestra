# blossvm-orchestra

Local desk for parallel Cursor workers on one (or more) git projects.

You start a worker → it gets its own folder and branch → you open that folder in Cursor → the desk shows commits → you open the pull request from the desk.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000

1. Add a project (folder path or `owner/repo` if it lives under `~/dev`)
2. Start a worker
3. Copy the folder path and open it in Cursor
4. When commits show on the desk, open the pull request there

```bash
npm test
```

## Notes

- Worker folders live at `<repo>/.orchestra/worktrees/<name>/`
- Needs local `git` and `gh` (signed in)
- Optional: Ollama for the desk chat / helper
- Product rules: `docs/ORCHESTRA-CONSTITUTION-v2.md`
- T3 Code MIT attribution: `NOTICE`
