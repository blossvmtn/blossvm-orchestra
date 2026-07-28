import { describe, expect, test } from "bun:test";
import { FileAtlasSnapshotSchema } from "./fileAtlas";

const snapshot = {
  schema: "workstation.file_atlas_snapshot.v1",
  generatedAt: "2026-07-28T15:30:00.000Z",
  platform: "macos",
  status: "healthy",
  surfaces: {
    thisMac: {
      status: "healthy",
      categories: ["Now", "Projects", "Library", "Studio", "Inbox", "Recovery", "Storage", "Archive"],
      inbox: { state: "empty", directEntries: 0 },
    },
    anywhere: {
      status: "healthy",
      categories: ["Now", "Library", "Inbox"],
      inbox: { state: "empty", directEntries: 0 },
    },
  },
  repositories: {
    root: "$HOME/dev",
    status: "healthy",
    trackingBasis: "existing-refs-only",
    counts: { registered: 2, dirty: 1, ahead: 0, detached: 0 },
  },
  recovery: {
    status: "healthy",
    localVaultReceipt: "verified",
    encryptedCustodyReceipt: "verified",
  },
  companyDocuments: { status: "healthy", availability: "available" },
  workstation: { status: "healthy", bootstrap: "configuration_present" },
  storage: { status: "healthy", availableBytes: 412_000_000_000 },
  issues: [],
} as const;

describe("FileAtlasSnapshotSchema", () => {
  test("accepts the sanitized workstation snapshot contract", () => {
    expect(FileAtlasSnapshotSchema.parse(snapshot)).toEqual(
      JSON.parse(JSON.stringify(snapshot)),
    );
  });

  test("rejects private paths and raw error detail in projected issues", () => {
    expect(() =>
      FileAtlasSnapshotSchema.parse({
        ...snapshot,
        status: "attention",
        issues: [
          {
            source: "repositories",
            reasonCode: "read_failed",
            path: "/Users/operator/private-repo",
            message: "git failed with a private filename",
          },
        ],
      }),
    ).toThrow();
  });

  test("rejects a stale category contract or non-ISO observation time", () => {
    expect(() =>
      FileAtlasSnapshotSchema.parse({
        ...snapshot,
        generatedAt: "today",
        surfaces: {
          ...snapshot.surfaces,
          anywhere: {
            ...snapshot.surfaces.anywhere,
            categories: ["Now", "Inbox"],
          },
        },
      }),
    ).toThrow();
  });
});
