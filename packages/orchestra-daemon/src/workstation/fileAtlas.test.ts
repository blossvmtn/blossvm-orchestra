import { describe, expect, test } from "bun:test";
import { createFixtureFileAtlasProvider } from "./fileAtlas";

describe("fixture File Atlas provider", () => {
  test("returns the approved sanitized snapshot without live filesystem access", async () => {
    const provider = createFixtureFileAtlasProvider("2026-07-28T15:30:00.000Z");
    const snapshot = await provider.getSnapshot();

    expect(snapshot.schema).toBe("workstation.file_atlas_snapshot.v1");
    expect(snapshot.generatedAt).toBe("2026-07-28T15:30:00.000Z");
    expect(snapshot.surfaces.thisMac.categories).toEqual([
      "Now",
      "Projects",
      "Library",
      "Studio",
      "Inbox",
      "Recovery",
      "Storage",
      "Archive",
    ]);
    expect(snapshot.surfaces.anywhere.categories).toEqual(["Now", "Library", "Inbox"]);
    expect(snapshot.repositories.trackingBasis).toBe("existing-refs-only");
    expect(snapshot.issues).toEqual([]);
  });
});
