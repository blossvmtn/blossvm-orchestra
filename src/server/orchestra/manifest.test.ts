import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { git } from "~/server/orchestra/git";
import {
  dispatchManifest,
  parseManifestMarkdown,
} from "~/server/orchestra/manifest";
import { compileManifest } from "~/server/orchestra/packets";
import { addRegistryEntry } from "~/server/orchestra/registry";
import { listWorktreeNodes } from "~/server/orchestra/worktrees";

describe("P4 manifest dispatch", () => {
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
    await fs.mkdir(path.join(disposableRepo, "src", "lib", "auth"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(disposableRepo, "src", "lib", "auth", "index.ts"),
      "export {}\n",
      "utf8",
    );
    await git(disposableRepo, ["add", "."]);
    await git(disposableRepo, ["commit", "-m", "init"]);
  });

  afterEach(async () => {
    if (prevHome === undefined) delete process.env.ORCHESTRA_HOME;
    else process.env.ORCHESTRA_HOME = prevHome;
    await fs.rm(orchestraHome, { recursive: true, force: true });
    await fs.rm(disposableRepo, { recursive: true, force: true });
  });

  it("parse + dispatch creates fenced worktrees", async () => {
    const entry = await addRegistryEntry({ rootPath: disposableRepo });
    const md = compileManifest({
      schema: "orchestra.manifest.v1",
      planId: randomUUID(),
      repoSlug: entry.slug,
      intent: "Ship auth sanitize lane",
      workers: [
        {
          slug: "security-sanitize",
          branch: "orch/security-sanitize",
          role: "Security",
          allowedPaths: ["src/lib/auth/**"],
          forbiddenPaths: ["src/components/**"],
          acceptance: ["no UI layout edits"],
        },
      ],
    });

    const manifest = parseManifestMarkdown(md);
    const { nodes, warnings } = await dispatchManifest(manifest);
    expect(warnings).toEqual([]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.slug).toBe("security-sanitize");

    const listed = await listWorktreeNodes(entry.id);
    expect(listed.some((n) => n.slug === "security-sanitize")).toBe(true);
  });
});
