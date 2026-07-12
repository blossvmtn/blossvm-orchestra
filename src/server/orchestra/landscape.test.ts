import { describe, expect, it } from "vitest";

import {
  compileSyncLog,
  parsePacket,
  parseSyncLog,
} from "~/server/orchestra/packets";
import { fixtureSyncLog, fixtureTrunkScan } from "~/server/orchestra/fixtures";
import {
  NODE_STATUS_COLORS,
  TrunkScanSnapshotSchema,
} from "~/server/orchestra/schemas";

describe("P3 landscape fixtures", () => {
  it("fixture trunk scan paints all status colors", () => {
    const snap = fixtureTrunkScan();
    expect(TrunkScanSnapshotSchema.parse(snap).schema).toBe(
      "orchestra.trunk_scan.v1",
    );
    expect(snap.lanes.length).toBeGreaterThanOrEqual(5);

    const statuses = new Set(snap.lanes.map((l) => l.status));
    expect(statuses.has("active")).toBe(true);
    expect(statuses.has("merged")).toBe(true);
    expect(statuses.has("stashed")).toBe(true);
    expect(statuses.has("orphaned")).toBe(true);
    expect(statuses.has("pr_open")).toBe(true);

    for (const lane of snap.lanes) {
      expect(NODE_STATUS_COLORS[lane.status]).toMatch(/^#/);
    }

    const prLane = snap.lanes.find((l) => l.status === "pr_open");
    expect(prLane?.prUrl).toMatch(/^https:\/\//);
  });

  it("desk round-trips a SYNC-LOG (parse → compile → parse)", () => {
    const original = fixtureSyncLog({
      summary: "Fence checks green; ready to open PR.",
      status: "ready_for_review",
    });
    const markdown = compileSyncLog(original);
    expect(markdown).toContain("[WORKTREE-SYNC-LOG]");
    expect(markdown).toContain("```json");

    const parsed = parseSyncLog(markdown);
    expect(parsed).toEqual(original);

    const viaPacket = parsePacket(markdown);
    expect(viaPacket.kind).toBe("sync_log");
    if (viaPacket.kind === "sync_log") {
      expect(viaPacket.payload.workerSlug).toBe("security-sanitize");
    }

    const again = compileSyncLog(parsed);
    expect(parseSyncLog(again).summary).toBe(original.summary);
  });

  it("accepts tag + raw JSON without fences", () => {
    const log = fixtureSyncLog();
    const raw = `[WORKTREE-SYNC-LOG]\n${JSON.stringify(log)}`;
    expect(parseSyncLog(raw).planId).toBe(log.planId);
  });
});
