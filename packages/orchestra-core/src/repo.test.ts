import { describe, expect, test } from "bun:test";
import { RepoSchema } from "./repo";

const valid = {
  id: "d290f1ee-6c54-4b01-90e6-d701748f0851",
  slug: "blossvm-orchestra",
  rootPath: "/Users/jeffersonadams/dev/blossvm-orchestra",
  registeredAt: "2026-07-18T16:00:00.000Z",
};

describe("RepoSchema", () => {
  test("accepts a valid repo", () => {
    expect(RepoSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects an empty slug", () => {
    const result = RepoSchema.safeParse({ ...valid, slug: "" });
    expect(result.success).toBe(false);
  });

  test("rejects an empty rootPath", () => {
    const result = RepoSchema.safeParse({ ...valid, rootPath: "" });
    expect(result.success).toBe(false);
  });
});
