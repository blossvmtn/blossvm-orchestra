import { describe, expect, test } from "bun:test";
import { TaskSpecSchema } from "./taskSpec";

const valid = {
  id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  workIntentId: "d290f1ee-6c54-4b01-90e6-d701748f0852",
  slug: "security-sanitize",
  branch: "orch/security-sanitize",
  role: "Security",
  allowedPaths: ["src/lib/auth/**"],
  forbiddenPaths: ["src/components/**"],
  acceptance: ["no UI layout edits"],
  createdAt: "2026-07-18T16:00:00.000Z",
};

describe("TaskSpecSchema", () => {
  test("accepts a valid task spec without a risk tier set", () => {
    expect(TaskSpecSchema.safeParse(valid).success).toBe(true);
  });

  test("accepts a valid task spec with a risk tier set", () => {
    const result = TaskSpecSchema.safeParse({ ...valid, riskTier: "R2" });
    expect(result.success).toBe(true);
  });

  test("rejects an out-of-range risk tier", () => {
    const result = TaskSpecSchema.safeParse({ ...valid, riskTier: "R9" });
    expect(result.success).toBe(false);
  });

  test("rejects a missing workIntentId (the 1:N fan-out link)", () => {
    const { workIntentId: _drop, ...withoutLink } = valid;
    const result = TaskSpecSchema.safeParse(withoutLink);
    expect(result.success).toBe(false);
  });

  test("two task specs may share one workIntentId — cardinality is not a schema constraint", () => {
    const a = TaskSpecSchema.parse({ ...valid, id: "d290f1ee-6c54-4b01-90e6-d701748f0853" });
    const b = TaskSpecSchema.parse({
      ...valid,
      id: "d290f1ee-6c54-4b01-90e6-d701748f0854",
      slug: "ui-polish",
    });
    expect(a.workIntentId).toBe(b.workIntentId);
    expect(a.id).not.toBe(b.id);
  });
});
