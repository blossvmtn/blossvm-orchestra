import type { FileAtlasSnapshot } from "@orchestra/core";

function inboxLabel(
  inbox: FileAtlasSnapshot["surfaces"]["thisMac"]["inbox"],
): string {
  if (inbox.state === "unknown") return "Unknown";
  if (inbox.state === "empty") return "Empty";
  return `${inbox.directEntries} ${inbox.directEntries === 1 ? "item" : "items"} waiting`;
}

function gibibytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB available`;
}

function receiptLabel(
  state: FileAtlasSnapshot["recovery"]["localVaultReceipt"],
): string {
  if (state === "verified") return "Verified";
  if (state === "unverified") return "Present, verification stale";
  return "Unknown";
}

export function buildFileAtlasViewModel(snapshot: FileAtlasSnapshot) {
  const counts = snapshot.repositories.counts;
  return {
    repositorySummary:
      `${counts.registered} registered · ${counts.dirty} dirty · ` +
      `${counts.ahead} ahead · ${counts.detached} detached`,
    localInbox: inboxLabel(snapshot.surfaces.thisMac.inbox),
    mobileInbox: inboxLabel(snapshot.surfaces.anywhere.inbox),
    storage:
      snapshot.storage.status === "unknown"
        ? "Unknown"
        : gibibytes(snapshot.storage.availableBytes),
    localRecovery: receiptLabel(snapshot.recovery.localVaultReceipt),
    encryptedRecovery: receiptLabel(snapshot.recovery.encryptedCustodyReceipt),
    issueSummary:
      snapshot.issues.length === 0
        ? "All sources readable"
        : `${snapshot.issues.length} ${
            snapshot.issues.length === 1 ? "source needs" : "sources need"
          } attention`,
  };
}
