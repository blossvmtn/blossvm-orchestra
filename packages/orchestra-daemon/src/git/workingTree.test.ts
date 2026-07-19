import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { git } from "./git";
import { isMeaningfulDirty } from "./workingTree";

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await mkdtemp(path.join(tmpdir(), "orchestra-workingtree-test-"));
  await git(repoRoot, ["init", "-b", "main"]);
  await git(repoRoot, ["config", "user.email", "test@example.com"]);
  await git(repoRoot, ["config", "user.name", "Orchestra Test"]);
  await Bun.write(path.join(repoRoot, "README.md"), "test\n");
  await git(repoRoot, ["add", "README.md"]);
  await git(repoRoot, ["commit", "-m", "initial commit"]);
});

afterEach(async () => {
  await rm(repoRoot, { recursive: true, force: true });
});

describe("isMeaningfulDirty", () => {
  test("a clean repo is not dirty", async () => {
    expect(await isMeaningfulDirty(repoRoot)).toBe(false);
  });

  test("a real file change is dirty", async () => {
    await Bun.write(path.join(repoRoot, "real-change.ts"), "content\n");
    expect(await isMeaningfulDirty(repoRoot)).toBe(true);
  });

  test("only a .cursor/ file changed does not count as dirty (Orchestra fence noise)", async () => {
    await mkdir(path.join(repoRoot, ".cursor"), { recursive: true });
    await Bun.write(path.join(repoRoot, ".cursor", "rules.md"), "fence\n");
    expect(await isMeaningfulDirty(repoRoot)).toBe(false);
  });

  test("a real change alongside a .cursor/ change is still dirty", async () => {
    await mkdir(path.join(repoRoot, ".cursor"), { recursive: true });
    await Bun.write(path.join(repoRoot, ".cursor", "rules.md"), "fence\n");
    await Bun.write(path.join(repoRoot, "real-change.ts"), "content\n");
    expect(await isMeaningfulDirty(repoRoot)).toBe(true);
  });
});
