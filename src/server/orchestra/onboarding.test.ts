import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compilePrBriefForNode } from "~/server/orchestra/brief";
import { detectEnvironment, mcpCards } from "~/server/orchestra/detect";
import { git } from "~/server/orchestra/git";
import {
  completeOnboarding,
  loadOnboardingState,
  pinHermesClerk,
} from "~/server/orchestra/onboarding";
import { parsePacket } from "~/server/orchestra/packets";
import { addRegistryEntry } from "~/server/orchestra/registry";
import { hermesLiaise } from "~/server/orchestra/hermes";
import { upsertWorktreeNode } from "~/server/orchestra/state";
import { createWorktree } from "~/server/orchestra/worktrees";

/**
 * P5 exit: detect → pin Hermes → anchor → override/PR-BRIEF packets valid.
 * (Manifest→PR without terminal is covered by P2 stackedAction + P4 dispatch.)
 */
describe("P5 onboarding + polish", () => {
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

  it("detect finds git (and reports gh/ollama honestly)", async () => {
    const d = await detectEnvironment();
    expect(d.git.ok).toBe(true);
    expect(d.git.version).toBeTruthy();
    expect(typeof d.gh.ok).toBe("boolean");
    expect(typeof d.ollama.ok).toBe("boolean");
    expect(d.ollama.pinned).toBe("gemma4:31b");
    expect(d.readyForOnboarding).toBe(d.git.ok && d.gh.ok);
  });

  it("pin Hermes + complete onboarding writes flags", async () => {
    const pinned = await pinHermesClerk();
    expect(pinned.defaults.ollamaModel).toBe("gemma4:31b");
    expect(pinned.skipped).toBe(false);

    const pinFile = await fs.readFile(
      path.join(orchestraHome, "hermes", "pin.json"),
      "utf8",
    );
    expect(pinFile).toContain("gemma4:31b");

    const done = await completeOnboarding();
    expect(done.completedAt).toBeTruthy();
    expect(done.hermesPinned).toBe(true);

    const state = await loadOnboardingState();
    expect(state.completedAt).toBe(done.completedAt);
  });

  it("anchor + override broadcast + PR-BRIEF are valid packets", async () => {
    await pinHermesClerk();
    const entry = await addRegistryEntry({ rootPath: disposableRepo });

    const override = await hermesLiaise({
      repoId: entry.id,
      intent: "draft_override",
      instruction: "Stay in fence",
    });
    expect(parsePacket(override.markdown).kind).toBe("override");

    const node = await createWorktree({
      repoId: entry.id,
      slug: "brief-lane",
      branch: "orch/brief-lane",
      allowedPaths: ["README.md"],
      forbiddenPaths: [],
    });
    await upsertWorktreeNode(entry.rootPath, entry.id, {
      ...node,
      status: "pr_open",
      prUrl: "https://github.com/example/repo/pull/99",
    });

    const { markdown, brief } = await compilePrBriefForNode({
      repoId: entry.id,
      nodeId: node.id,
      title: "Brief test",
    });
    expect(brief.prUrl).toContain("/pull/99");
    expect(parsePacket(markdown).kind).toBe("pr_brief");
  });

  it("MCP cards are copy/reveal only", () => {
    const cards = mcpCards();
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards.every((c) => c.copyText.length > 10)).toBe(true);
    expect(randomUUID()).toBeTruthy(); // sanity uuid available for plans
  });
});
