/**
 * One-shot P2 exit: open a real PR on blossvmtn/orchestra-p2-throwaway.
 * Usage: ORCHESTRA_P2_REPO=/path/to/clone ORCHESTRA_HOME=/tmp/... npx tsx scripts/p2-live-exit.ts
 */
import fs from "node:fs/promises";
import path from "node:path";

import { git } from "../src/server/orchestra/git";
import { addRegistryEntry } from "../src/server/orchestra/registry";
import { runStackedAction } from "../src/server/orchestra/stacked";
import { createWorktree } from "../src/server/orchestra/worktrees";

async function main() {
  const repoRoot = process.env.ORCHESTRA_P2_REPO;
  if (!repoRoot) {
    throw new Error("Set ORCHESTRA_P2_REPO to a clone of blossvmtn/orchestra-p2-throwaway");
  }

  const entry = await addRegistryEntry({ rootPath: repoRoot });
  const node = await createWorktree({
    repoId: entry.id,
    slug: "p2-exit",
    branch: "orch/p2-exit",
    allowedPaths: ["p2-exit.txt"],
    forbiddenPaths: [],
  });

  const porcelain = await git(node.path, ["status", "--porcelain"]);
  if (porcelain.stdout.trim().length > 0) {
    await git(node.path, ["add", "-A"]);
    await git(node.path, ["commit", "-m", "chore: orchestra fence"]);
  }

  await fs.writeFile(
    path.join(node.path, "p2-exit.txt"),
    "p2 exit fixture\n",
    "utf8",
  );

  const result = await runStackedAction({
    repoId: entry.id,
    nodeId: node.id,
    steps: ["commit", "push", "pr"],
    message: "chore: blossvm-orchestra P2 exit fixture",
    prTitle: "P2 exit: stackedAction throwaway",
    prBody:
      "Opened by blossvm-orchestra runStackedAction (P2 exit verification). Safe to close/delete with blossvmtn/orchestra-p2-throwaway.",
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
