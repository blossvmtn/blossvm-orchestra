import {
  FILE_ATLAS_ANYWHERE_CATEGORIES,
  FILE_ATLAS_THIS_MAC_CATEGORIES,
  FileAtlasSnapshotSchema,
  type FileAtlasSnapshot,
} from "@orchestra/core";

export type FileAtlasSnapshotProvider = {
  getSnapshot: () => Promise<FileAtlasSnapshot>;
};

export function createFixtureFileAtlasProvider(
  generatedAt = new Date().toISOString(),
): FileAtlasSnapshotProvider {
  return {
    async getSnapshot() {
      return FileAtlasSnapshotSchema.parse({
        schema: "workstation.file_atlas_snapshot.v1",
        generatedAt,
        platform: "macos",
        status: "healthy",
        surfaces: {
          thisMac: {
            status: "healthy",
            categories: [...FILE_ATLAS_THIS_MAC_CATEGORIES],
            inbox: { state: "empty", directEntries: 0 },
          },
          anywhere: {
            status: "healthy",
            categories: [...FILE_ATLAS_ANYWHERE_CATEGORIES],
            inbox: { state: "empty", directEntries: 0 },
          },
        },
        repositories: {
          root: "$HOME/dev",
          status: "healthy",
          trackingBasis: "existing-refs-only",
          counts: { registered: 0, dirty: 0, ahead: 0, detached: 0 },
        },
        recovery: {
          status: "healthy",
          localVaultReceipt: "verified",
          encryptedCustodyReceipt: "verified",
        },
        companyDocuments: {
          status: "healthy",
          availability: "available",
        },
        workstation: {
          status: "healthy",
          bootstrap: "configuration_present",
        },
        storage: {
          status: "healthy",
          availableBytes: 412_000_000_000,
        },
        issues: [],
      });
    },
  };
}

export function createUnavailableFileAtlasSnapshot(
  generatedAt = new Date().toISOString(),
): FileAtlasSnapshot {
  return FileAtlasSnapshotSchema.parse({
    schema: "workstation.file_atlas_snapshot.v1",
    generatedAt,
    platform: process.platform === "darwin" ? "macos" : "linux",
    status: "unknown",
    surfaces: {
      thisMac: {
        status: "unknown",
        categories: [...FILE_ATLAS_THIS_MAC_CATEGORIES],
        inbox: { state: "unknown", directEntries: 0 },
      },
      anywhere: {
        status: "unknown",
        categories: [...FILE_ATLAS_ANYWHERE_CATEGORIES],
        inbox: { state: "unknown", directEntries: 0 },
      },
    },
    repositories: {
      root: "$HOME/dev",
      status: "unknown",
      trackingBasis: "existing-refs-only",
      counts: { registered: 0, dirty: 0, ahead: 0, detached: 0 },
    },
    recovery: {
      status: "unknown",
      localVaultReceipt: "unknown",
      encryptedCustodyReceipt: "unknown",
    },
    companyDocuments: {
      status: "unknown",
      availability: "unknown",
    },
    workstation: {
      status: "unknown",
      bootstrap: "unknown",
    },
    storage: {
      status: "unknown",
      availableBytes: 0,
    },
    issues: [
      { source: "this_mac", reasonCode: "read_failed" },
      { source: "anywhere", reasonCode: "read_failed" },
      { source: "repositories", reasonCode: "read_failed" },
      { source: "recovery", reasonCode: "read_failed" },
      { source: "company_documents", reasonCode: "read_failed" },
      { source: "workstation", reasonCode: "read_failed" },
      { source: "storage", reasonCode: "read_failed" },
    ],
  });
}
