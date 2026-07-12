import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { git, gitStdout } from "~/server/orchestra/git";
import { addRegistryEntry } from "~/server/orchestra/registry";
import {
  createWorktree,
  removeWorktree,
} from "~/server/orchestra/worktrees";
import { loadRepoState } from "~/server/orchestra/state";
import {
  runStackedAction,
  StackedActionError,
} from "~/server/orchestra/stacked";

/**
 * P2 exit tests: OD3 dirty-tree + stacked commit → push → pr.
 */
describe("P2 stackedAction OD3 + stack", () => {
  let orchestraHome: string;
  let disposableRepo: string;
  let bareRemote: string;
  const prevHome = process.env.ORCHESTRA_HOME;

  beforeEach(async () => {
    orchestraHome = await fs.mkdtemp(path.join(os.tmpdir(), "orch-home-"));
    disposableRepo = await fs.mkdtemp(path.join(os.tmpdir(), "orch-repo-"));
    bareRemote = await fs.mkdtemp(path.join(os.tmpdir(), "orch-remote-"));
    process.env.ORCHESTRA_HOME = orchestraHome;

    await git(disposableRepo, ["init", "-b", "main"]);
    await git(disposableRepo, ["config", "user.email", "orchestra@test.local"]);
    await git(disposableRepo, ["config", "user.name", "Orchestra Test"]);
    await fs.writeFile(
      path.join(disposableRepo, "README.md"),
      "# disposable\n",
      "utf8",
    );
    await git(disposableRepo, ["add", "."]);
    await git(disposableRepo, ["commit", "-m", "init"]);

    // Bare remote so push works without GitHub
    await git(bareRemote, ["init", "--bare", "-b", "main"]);
    await git(disposableRepo, ["remote", "add", "origin", bareRemote]);
    await git(disposableRepo, ["push", "-u", "origin", "main"]);
  });

  afterEach(async () => {
    if (prevHome === undefined) {
      delete process.env.ORCHESTRA_HOME;
    } else {
      process.env.ORCHESTRA_HOME = prevHome;
    }
    await fs.rm(orchestraHome, { recursive: true, force: true });
    await fs.rm(disposableRepo, { recursive: true, force: true });
    await fs.rm(bareRemote, { recursive: true, force: true });
  });

  async function setupLane() {
    const entry = await addRegistryEntry({ rootPath: disposableRepo });
    const node = await createWorktree({
      repoId: entry.id,
      slug: "lane-a",
      branch: "orch/lane-a",
      allowedPaths: ["README.md", "feature.txt"],
      forbiddenPaths: [],
    });
    // Fence writer dirties the tree — commit so OD3 tests control dirtiness.
    const porcelain = await gitStdout(node.path, ["status", "--porcelain"]);
    if (porcelain.length > 0) {
      await git(node.path, ["add", "-A"]);
      await git(node.path, ["commit", "-m", "chore: orchestra fence"]);
    }
    return { entry, node };
  }

  it("OD3: bare pr + dirty → refuse", async () => {
    const { entry, node } = await setupLane();
    await fs.writeFile(path.join(node.path, "feature.txt"), "dirty\n", "utf8");

    await expect(
      runStackedAction(
        {
          repoId: entry.id,
          nodeId: node.id,
          steps: ["pr"],
          prTitle: "should fail",
        },
        {
          viewPrForBranch: vi.fn().mockResolvedValue(null),
          createPullRequest: vi.fn(),
        },
      ),
    ).rejects.toThrow(StackedActionError);

    await expect(
      runStackedAction(
        {
          repoId: entry.id,
          nodeId: node.id,
          steps: ["pr"],
        },
        {
          viewPrForBranch: vi.fn().mockResolvedValue(null),
          createPullRequest: vi.fn(),
        },
      ),
    ).rejects.toThrow(/uncommitted file changes/i);
  });

  it("fence-only .cursor dirt does not block bare pr", async () => {
    const { entry, node } = await setupLane();
    await fs.mkdir(path.join(node.path, ".cursor", "rules"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(node.path, ".cursor", "rules", "extra.mdc"),
      "# noise\n",
      "utf8",
    );

    const createPullRequest = vi
      .fn()
      .mockResolvedValue("https://example.test/pull/42");

    const result = await runStackedAction(
      {
        repoId: entry.id,
        nodeId: node.id,
        steps: ["pr"],
        prTitle: "fence noise ok",
      },
      {
        viewPrForBranch: vi.fn().mockResolvedValue(null),
        createPullRequest,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.prUrl).toBe("https://example.test/pull/42");
    expect(createPullRequest).toHaveBeenCalled();
  });

  it("OD3: bare push + dirty → push commits only, warn", async () => {
    const { entry, node } = await setupLane();

    // Commit once so there is something to push, then dirty the tree
    await fs.writeFile(path.join(node.path, "feature.txt"), "v1\n", "utf8");
    await git(node.path, ["add", "."]);
    await git(node.path, ["commit", "-m", "feat: v1"]);
    await fs.writeFile(path.join(node.path, "feature.txt"), "v2 dirty\n", "utf8");

    const result = await runStackedAction(
      {
        repoId: entry.id,
        nodeId: node.id,
        steps: ["push"],
      },
      {
        viewPrForBranch: vi.fn().mockResolvedValue(null),
        createPullRequest: vi.fn(),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.pushed).toBe(true);
    expect(result.committed).toBeFalsy();
    expect(result.warnings.some((w) => /dirty/i.test(w))).toBe(true);

    // Uncommitted changes still present
    const porcelain = await gitStdout(node.path, ["status", "--porcelain"]);
    expect(porcelain).toMatch(/feature\.txt/);

    // Commit is on remote
    const remoteHeads = await gitStdout(bareRemote, ["branch", "-a"]);
    expect(remoteHeads).toMatch(/orch\/lane-a/);
  });

  it("OD3: dirty + commit in stack → commit then continue to pr", async () => {
    const { entry, node } = await setupLane();
    await fs.writeFile(path.join(node.path, "feature.txt"), "ship it\n", "utf8");

    const createPr = vi.fn().mockResolvedValue(
      "https://github.com/example/repo/pull/42",
    );
    const viewPr = vi.fn().mockResolvedValue(null);

    const result = await runStackedAction(
      {
        repoId: entry.id,
        nodeId: node.id,
        steps: ["commit", "push", "pr"],
        message: "feat: ship it",
        prTitle: "Ship it",
        prBody: "from orchestra test",
      },
      {
        viewPrForBranch: viewPr,
        createPullRequest: createPr,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.committed).toBe(true);
    expect(result.pushed).toBe(true);
    expect(result.prUrl).toBe("https://github.com/example/repo/pull/42");

    const porcelain = await gitStdout(node.path, ["status", "--porcelain"]);
    expect(porcelain).toBe("");

    expect(createPr).toHaveBeenCalledWith(
      node.path,
      expect.objectContaining({
        title: "Ship it",
        body: "from orchestra test",
        head: "orch/lane-a",
      }),
    );

    const state = await loadRepoState(disposableRepo);
    const saved = state?.nodes.find((n) => n.id === node.id);
    expect(saved?.status).toBe("pr_open");
    expect(saved?.prUrl).toBe("https://github.com/example/repo/pull/42");

    await removeWorktree({
      repoId: entry.id,
      nodeId: node.id,
      mode: "delete-branch",
    });
  });

  it("reuses existing open PR instead of creating another", async () => {
    const { entry, node } = await setupLane();
    const createPr = vi.fn();
    const viewPr = vi.fn().mockResolvedValue({
      number: 7,
      title: "Existing",
      url: "https://github.com/example/repo/pull/7",
      state: "OPEN",
      mergedAt: null,
    });

    const result = await runStackedAction(
      {
        repoId: entry.id,
        nodeId: node.id,
        steps: ["pr"],
      },
      {
        viewPrForBranch: viewPr,
        createPullRequest: createPr,
      },
    );

    expect(result.prUrl).toBe("https://github.com/example/repo/pull/7");
    expect(createPr).not.toHaveBeenCalled();
    expect(result.warnings.some((w) => /already open/i.test(w))).toBe(true);
  });
});
