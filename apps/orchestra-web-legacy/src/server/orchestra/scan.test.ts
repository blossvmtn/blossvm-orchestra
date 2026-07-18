import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { git } from "~/server/orchestra/git";
import { addRegistryEntry } from "~/server/orchestra/registry";
import { scanTrunk } from "~/server/orchestra/scan";
import { createWorktree } from "~/server/orchestra/worktrees";

describe("P3 scan.trunk live", () => {
  let orchestraHome: string;
  let disposableRepo: string;
  const prevHome = process.env.ORCHESTRA_HOME;

  beforeEach(async () => {
    orchestraHome = await fs.mkdtemp(path.join(os.tmpdir(), "orch-home-"));
    disposableRepo = await fs.mkdtemp(path.join(os.tmpdir(), "orch-repo-"));
    process.env.ORCHESTRA_HOME = orchestraHome;

    await git(disposableRepo, ["init", "-b", "main"]);
    await git(disposableRepo, ["config", "user.email", "orchestra@test.local"]);
    await git(disposableRepo, ["config", "user.name", "Orchestra Test"]);
    await fs.writeFile(path.join(disposableRepo, "README.md"), "# x\n", "utf8");
    await git(disposableRepo, ["add", "."]);
    await git(disposableRepo, ["commit", "-m", "init"]);
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.ORCHESTRA_HOME;
    else process.env.ORCHESTRA_HOME = prevHome;
    await fs.rm(orchestraHome, { recursive: true, force: true });
    await fs.rm(disposableRepo, { recursive: true, force: true });
  });

  it("scan.trunk returns lanes from worktrees", async () => {
    const entry = await addRegistryEntry({ rootPath: disposableRepo });
    await createWorktree({
      repoId: entry.id,
      slug: "lane-scan",
      branch: "orch/lane-scan",
      allowedPaths: ["README.md"],
      forbiddenPaths: [],
    });

    const snap = await scanTrunk(entry.id);
    expect(snap.schema).toBe("orchestra.trunk_scan.v1");
    expect(snap.baseBranch).toBe("main");
    expect(snap.lanes.some((l) => l.slug === "lane-scan")).toBe(true);
    expect(snap.lanes[0]?.shortSha.length).toBe(7);
    expect(snap.lanes[0]?.plainStatus).toBeTruthy();
    expect(snap.lanes[0]?.nextStep).toBeTruthy();
  });

  it("scan.trunk shows new commits after worker commits", async () => {
    const entry = await addRegistryEntry({ rootPath: disposableRepo });
    const node = await createWorktree({
      repoId: entry.id,
      slug: "lane-activity",
      branch: "orch/lane-activity",
      allowedPaths: ["README.md"],
      forbiddenPaths: [],
    });

    await fs.writeFile(path.join(node.path, "README.md"), "# changed\n", "utf8");
    await git(node.path, ["add", "README.md"]);
    await git(node.path, ["commit", "-m", "worker did a thing"]);

    const snap = await scanTrunk(entry.id);
    const lane = snap.lanes.find((l) => l.slug === "lane-activity");
    expect(lane?.commitsAhead).toBeGreaterThanOrEqual(1);
    expect(lane?.lastCommitMessage).toBe("worker did a thing");
    expect(lane?.plainStatus?.toLowerCase()).toContain("commit");
  });
});
