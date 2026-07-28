import { describe, expect, test } from "bun:test";
import type { FileAtlasSnapshot } from "@orchestra/core";
import { buildFileAtlasViewModel } from "../src/features/files/fileAtlasViewModel";

const snapshot: FileAtlasSnapshot = {
  schema: "workstation.file_atlas_snapshot.v1",
  generatedAt: "2026-07-28T17:00:00.000Z",
  platform: "macos",
  status: "attention",
  surfaces: {
    thisMac: {
      status: "healthy",
      categories: ["Now", "Projects", "Library", "Studio", "Inbox", "Recovery", "Storage", "Archive"],
      inbox: { state: "items_waiting", directEntries: 2 },
    },
    anywhere: {
      status: "unknown",
      categories: ["Now", "Library", "Inbox"],
      inbox: { state: "unknown", directEntries: 0 },
    },
  },
  repositories: {
    root: "$HOME/dev",
    status: "healthy",
    trackingBasis: "existing-refs-only",
    counts: { registered: 5, dirty: 2, ahead: 1, detached: 0 },
  },
  recovery: {
    status: "healthy",
    localVaultReceipt: "verified",
    encryptedCustodyReceipt: "verified",
  },
  companyDocuments: { status: "unknown", availability: "unknown" },
  workstation: { status: "healthy", bootstrap: "configuration_present" },
  storage: { status: "healthy", availableBytes: 402_653_184_000 },
  issues: [{ source: "company_documents", reasonCode: "stale_evidence" }],
};

describe("File Atlas view model", () => {
  test("turns the sanitized contract into plain-language attention signals", () => {
    const model = buildFileAtlasViewModel(snapshot);

    expect(model.repositorySummary).toBe("5 registered · 2 dirty · 1 ahead · 0 detached");
    expect(model.localInbox).toBe("2 items waiting");
    expect(model.mobileInbox).toBe("Unknown");
    expect(model.storage).toBe("375.0 GiB available");
    expect(model.localRecovery).toBe("Verified");
    expect(model.encryptedRecovery).toBe("Verified");
    expect(model.issueSummary).toBe("1 source needs attention");
  });
});
