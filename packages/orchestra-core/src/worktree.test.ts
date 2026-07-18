import { describe, expect, test } from "bun:test";
import { WorktreeSchema } from "./worktree";

const valid = {
  id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  taskSpecId: "d290f1ee-6c54-4b01-90e6-d701748f0852",
  path: "/repo/.orchestra/worktrees/security-sanitize",
  branch: "orch/security-sanitize",
  anchorSha: "abcdef0123456789",
  status: "active",
  createdAt: "2026-07-18T16:00:00.000Z",
};

describe("WorktreeSchema", () => {
  test("accepts a valid worktree without lastSyncAt", () => {
    expect(WorktreeSchema.safeParse(valid).success).toBe(true);
  });

  test("accepts a valid worktree with lastSyncAt set", () => {
    const result = WorktreeSchema.safeParse({
      ...valid,
      lastSyncAt: "2026-07-18T16:05:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  test("rejects an invalid status", () => {
    const result = WorktreeSchema.safeParse({ ...valid, status: "deleted" });
    expect(result.success).toBe(false);
  });

  test("rejects a missing taskSpecId (the 1:1 link)", () => {
    const { taskSpecId: _drop, ...withoutLink } = valid;
    const result = WorktreeSchema.safeParse(withoutLink);
    expect(result.success).toBe(false);
  });
});
