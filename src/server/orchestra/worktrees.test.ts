import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { git, gitStdout } from "~/server/orchestra/git";
import { addRegistryEntry, listRegistry } from "~/server/orchestra/registry";
import { fencePath, repoStatePath, worktreePath } from "~/server/orchestra/paths";
import {
  createWorktree,
  listWorktreeNodes,
  removeWorktree,
} from "~/server/orchestra/worktrees";
import { OrchestraRepoStateSchema } from "~/server/orchestra/schemas";

/**
 * P1 exit test: disposable repo round-trip CRUD + fence present.
 */
describe("P1 worktree CRUD exit", () => {
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
    await fs.writeFile(
      path.join(disposableRepo, "README.md"),
      "# disposable\n",
      "utf8",
    );
    await fs.mkdir(path.join(disposableRepo, "src", "lib", "auth"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(disposableRepo, "src", "lib", "auth", "index.ts"),
      "export const auth = true;\n",
      "utf8",
    );
    await git(disposableRepo, ["add", "."]);
    await git(disposableRepo, ["commit", "-m", "init"]);
  });

  afterEach(async () => {
    if (prevHome === undefined) {
      delete process.env.ORCHESTRA_HOME;
    } else {
      process.env.ORCHESTRA_HOME = prevHome;
    }
    await fs.rm(orchestraHome, { recursive: true, force: true });
    await fs.rm(disposableRepo, { recursive: true, force: true });
  });

  it("registry.add → create → list → fence → remove (delete-branch)", async () => {
    const registryBefore = await listRegistry();
    expect(registryBefore.version).toBe(1);
    expect(registryBefore.defaults.ollamaModel).toBe("gemma4:31b");
    expect(registryBefore.entries).toHaveLength(0);

    const entry = await addRegistryEntry({ rootPath: disposableRepo });
    expect(entry.rootPath).toBe(await fs.realpath(disposableRepo));

    const stateFile = repoStatePath(disposableRepo);
    await expect(fs.access(stateFile)).resolves.toBeUndefined();

    const node = await createWorktree({
      repoId: entry.id,
      slug: "security-sanitize",
      branch: "orch/security-sanitize",
      allowedPaths: ["src/lib/auth/**"],
      forbiddenPaths: ["src/components/**"],
      modelHint: "cursor-sonnet",
    });

    expect(node.status).toBe("active");
    const expectedPath = await fs.realpath(
      worktreePath(disposableRepo, "security-sanitize"),
    );
    expect(node.path).toBe(expectedPath);
    await expect(fs.access(node.path)).resolves.toBeUndefined();

    const fence = fencePath(node.path);
    const fenceBody = await fs.readFile(fence, "utf8");
    expect(fenceBody).toContain("## ALLOWED");
    expect(fenceBody).toContain("src/lib/auth/**");
    expect(fenceBody).toContain("## FORBIDDEN");
    expect(fenceBody).toContain("src/components/**");

    const rawState = JSON.parse(await fs.readFile(stateFile, "utf8")) as unknown;
    const state = OrchestraRepoStateSchema.parse(rawState);
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]?.status).toBe("active");
    expect(state.nodes[0]?.slug).toBe("security-sanitize");

    const listed = await listWorktreeNodes(entry.id);
    expect(listed.some((n) => n.id === node.id && n.status === "active")).toBe(
      true,
    );

    // Fail-soft: create again attaches/repairs instead of crashing
    const repaired = await createWorktree({
      repoId: entry.id,
      slug: "security-sanitize",
      branch: "orch/security-sanitize",
      allowedPaths: ["src/lib/auth/**"],
      forbiddenPaths: ["README.md"],
      modelHint: "cursor-sonnet",
    });
    expect(repaired.id).toBe(node.id);
    const repairedFence = await fs.readFile(fence, "utf8");
    expect(repairedFence).toContain("README.md");

    await removeWorktree({
      repoId: entry.id,
      nodeId: node.id,
      mode: "delete-branch",
    });

    await expect(fs.access(node.path)).rejects.toThrow();
    const after = await listWorktreeNodes(entry.id);
    expect(after.find((n) => n.id === node.id)).toBeUndefined();

    const branches = await gitStdout(disposableRepo, ["branch", "--list"]);
    expect(branches).not.toMatch(/orch\/security-sanitize/);
  });

  it("remove keep-branch leaves the branch", async () => {
    const entry = await addRegistryEntry({ rootPath: disposableRepo });
    const node = await createWorktree({
      repoId: entry.id,
      slug: "keep-me",
      branch: "orch/keep-me",
      allowedPaths: ["README.md"],
      forbiddenPaths: [],
    });

    await removeWorktree({
      repoId: entry.id,
      nodeId: node.id,
      mode: "keep-branch",
    });

    const branches = await gitStdout(disposableRepo, ["branch", "--list"]);
    expect(branches).toMatch(/orch\/keep-me/);
  });
});
