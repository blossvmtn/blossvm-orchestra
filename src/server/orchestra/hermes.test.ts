import { describe, expect, it } from "vitest";

import { hermesLiaise } from "~/server/orchestra/hermes";
import {
  assertValidClipboardMarkdown,
  compileManifest,
  compileOverride,
  compilePrBrief,
  parseManifest,
  parseOverride,
  parsePacket,
  parsePrBrief,
} from "~/server/orchestra/packets";
import { randomUUID } from "node:crypto";

describe("P4 Hermes + packets", () => {
  it("liaise summarize_lanes packages fixture lanes into valid clipboard MD", async () => {
    const result = await hermesLiaise({
      useFixture: true,
      intent: "summarize_lanes",
    });

    expect(result.markdown).toContain("[WORKTREE-SYNC-LOG]");
    expect(result.markdown.length).toBeGreaterThan(100);

    const parsed = assertValidClipboardMarkdown(result.markdown);
    expect(parsed.kind).toBe("sync_log");
    if (parsed.kind === "sync_log") {
      expect(parsed.payload.schema).toBe("orchestra.sync_log.v1");
      expect(parsed.payload.workerSlug.length).toBeGreaterThan(0);
    }
  }, 200_000);

  it("liaise draft_override emits valid CONDUCTOR-OVERRIDE", async () => {
    const result = await hermesLiaise({
      useFixture: true,
      intent: "draft_override",
      instruction: "Freeze UI paths; auth only.",
    });
    expect(result.markdown).toContain("[CONDUCTOR-OVERRIDE]");
    const parsed = parsePacket(result.markdown);
    expect(parsed.kind).toBe("override");
  }, 200_000);

  it("round-trips manifest / override / pr_brief packets", () => {
    const planId = randomUUID();
    const manifestMd = compileManifest({
      schema: "orchestra.manifest.v1",
      planId,
      repoSlug: "fixture-repo",
      intent: "Sanitize auth helpers",
      workers: [
        {
          slug: "security-sanitize",
          branch: "orch/security-sanitize",
          role: "Security",
          modelHint: "cursor-sonnet",
          allowedPaths: ["src/lib/auth/**"],
          forbiddenPaths: ["src/components/**"],
          acceptance: ["no UI layout edits"],
        },
      ],
    });
    expect(parseManifest(manifestMd).workers).toHaveLength(1);

    const overrideMd = compileOverride({
      schema: "orchestra.override.v1",
      planId,
      repoSlug: "fixture-repo",
      target: "all",
      priority: "high",
      instruction: "Stay in fence",
      issuedAt: new Date().toISOString(),
    });
    expect(parseOverride(overrideMd).priority).toBe("high");

    const briefMd = compilePrBrief({
      schema: "orchestra.pr_brief.v1",
      repoSlug: "fixture-repo",
      branch: "orch/security-sanitize",
      prUrl: "https://github.com/example/repo/pull/1",
      title: "Sanitize auth",
      summary: "Fence-safe auth cleanup",
    });
    expect(parsePrBrief(briefMd).prUrl).toContain("/pull/1");
  });
});
