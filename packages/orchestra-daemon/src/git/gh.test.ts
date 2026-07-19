import { describe, expect, test } from "bun:test";
import path from "node:path";
import { GhError, ghStdout, viewPrForBranch } from "./gh";

// Real `gh` invocations against this actual repo, not mocked execFile — same
// "verified empirically" convention git.test.ts uses, scoped to read-only
// calls only (Phase 2 spec §3 step 2: createPullRequest's real side effect
// — opening a real PR — is exercised only in the live acceptance walk).
// packages/orchestra-daemon/src/git/ -> repo root is four levels up.
const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");

describe("gh/ghStdout", () => {
  test("runs a real gh command and returns trimmed stdout", async () => {
    const out = await ghStdout(REPO_ROOT, ["repo", "view", "--json", "name", "-q", ".name"]);
    expect(out).toBe("blossvm-orchestra");
  });

  test("throws a GhError with args/stderr/code on a real failure", async () => {
    await expect(ghStdout(REPO_ROOT, ["not-a-real-gh-command"])).rejects.toThrow(GhError);
  });
});

describe("viewPrForBranch", () => {
  test("returns null for a branch with no open PR against it (real network call)", async () => {
    // main never has a PR opened against itself.
    const result = await viewPrForBranch(REPO_ROOT, "main");
    expect(result).toBeNull();
  });
});
