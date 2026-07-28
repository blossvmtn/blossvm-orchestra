import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb } from "../db/db";
import { repos } from "../db/schema";
import {
  createLiveFileAtlasProvider,
  inspectRegisteredRepository,
} from "./liveFileAtlas";

const THIS_MAC_CATEGORIES = [
  "Now",
  "Projects",
  "Library",
  "Studio",
  "Inbox",
  "Recovery",
  "Storage",
  "Archive",
];

async function makeSurface(root: string, categories: string[]) {
  for (const category of categories) {
    await mkdir(path.join(root, category), { recursive: true });
  }
}

async function runGit(root: string, args: string[]) {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(await new Response(proc.stderr).text());
}

describe("live File Atlas provider", () => {
  test("returns partial sanitized evidence when one provider is unavailable", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "orchestra-file-atlas-"));
    await makeSurface(path.join(homeDir, "Files"), THIS_MAC_CATEGORIES);
    await writeFile(path.join(homeDir, "Files", "Inbox", "waiting.txt"), "fixture");
    await mkdir(path.join(homeDir, "dev", "workstation", "bootstrap"), { recursive: true });
    const workstationRoot = path.join(homeDir, "dev", "workstation");
    await writeFile(path.join(workstationRoot, "bootstrap", "workstation"), "#!/bin/sh\n");
    await runGit(workstationRoot, ["init", "-b", "main"]);
    await runGit(workstationRoot, ["config", "user.email", "fixture@example.invalid"]);
    await runGit(workstationRoot, ["config", "user.name", "Fixture"]);
    await runGit(workstationRoot, ["add", "bootstrap/workstation"]);
    await runGit(workstationRoot, ["commit", "-m", "fixture"]);

    await mkdir(path.join(workstationRoot, "inventory", "r6-r9-overhaul-fixture"), {
      recursive: true,
    });
    await writeFile(
      path.join(
        workstationRoot,
        "inventory",
        "r6-r9-overhaul-fixture",
        "R6-R9-WORKSTATION-OVERHAUL-FINAL-RECEIPT-fixture.md",
      ),
      "The R4 checksum manifest was re-run after R7 and every listed artifact returned\n`OK`.\n",
    );

    const db = createDb(":memory:");
    const provider = createLiveFileAtlasProvider(db, {
      homeDir,
      platform: "macos",
      now: () => new Date("2026-07-28T16:00:00.000Z"),
      readAvailableBytes: async () => 123_456,
    });

    const snapshot = await provider.getSnapshot();

    expect(snapshot.generatedAt).toBe("2026-07-28T16:00:00.000Z");
    expect(snapshot.status).toBe("attention");
    expect(snapshot.surfaces.thisMac.inbox).toEqual({
      state: "items_waiting",
      directEntries: 1,
    });
    expect(snapshot.surfaces.anywhere.status).toBe("unknown");
    expect(snapshot.recovery.localVaultReceipt).toBe("verified");
    expect(snapshot.recovery.encryptedCustodyReceipt).toBe("unknown");
    expect(snapshot.companyDocuments.availability).toBe("unknown");
    expect(snapshot.workstation.bootstrap).toBe("configuration_present");
    expect(snapshot.storage.availableBytes).toBe(123_456);
    expect(snapshot.issues).toEqual(
      expect.arrayContaining([
        { source: "anywhere", reasonCode: "not_found" },
        { source: "recovery", reasonCode: "not_found" },
        { source: "company_documents", reasonCode: "not_found" },
      ]),
    );
    expect(JSON.stringify(snapshot)).not.toContain(homeDir);
    expect(JSON.stringify(snapshot)).not.toContain("waiting.txt");
  });

  test("aggregates only explicitly registered repositories", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "orchestra-file-atlas-"));
    const db = createDb(":memory:");
    db.insert(repos)
      .values({
        id: "repo-1",
        slug: "fixture",
        rootPath: path.join(homeDir, "fixture"),
        registeredAt: "2026-07-28T16:00:00.000Z",
      })
      .run();

    const provider = createLiveFileAtlasProvider(db, {
      homeDir,
      inspectRepository: async () => ({
        dirty: true,
        ahead: true,
        detached: false,
      }),
      readAvailableBytes: async () => 1,
    });

    const snapshot = await provider.getSnapshot();

    expect(snapshot.repositories.counts).toEqual({
      registered: 1,
      dirty: 1,
      ahead: 1,
      detached: 0,
    });
    expect(snapshot.repositories.trackingBasis).toBe("existing-refs-only");
    expect(snapshot.storage.status).toBe("attention");
  });

  test("uses sanitized verification markers for recovery and company availability", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "orchestra-file-atlas-"));
    const inventoryRoot = path.join(homeDir, "dev", "workstation", "inventory");
    const localReceiptRoot = path.join(inventoryRoot, "r6-r9-overhaul-fixture");
    const encryptedReceiptRoot = path.join(inventoryRoot, "r5b-encrypted-egress-fixture");
    await mkdir(localReceiptRoot, { recursive: true });
    await mkdir(encryptedReceiptRoot, { recursive: true });
    await writeFile(
      path.join(localReceiptRoot, "R6-R9-WORKSTATION-OVERHAUL-FINAL-RECEIPT-fixture.md"),
      "The R4 checksum manifest was re-run after R7 and every listed artifact returned\n`OK`.\n",
    );
    await writeFile(
      path.join(encryptedReceiptRoot, "R5B-ENCRYPTED-EGRESS-RECEIPT-fixture.md"),
      [
        "## Outcome",
        "",
        "PASS",
        "All six downloaded ciphertext archives matched the local ciphertext SHA-256",
        "R4 checksum verification after remote recovery: PASS",
      ].join("\n"),
    );

    const provider = createLiveFileAtlasProvider(createDb(":memory:"), {
      homeDir,
      readAvailableBytes: async () => 1,
    });
    const snapshot = await provider.getSnapshot();

    expect(snapshot.recovery).toEqual({
      status: "healthy",
      localVaultReceipt: "verified",
      encryptedCustodyReceipt: "verified",
    });
    expect(snapshot.companyDocuments).toEqual({
      status: "healthy",
      availability: "available",
    });
    expect(snapshot.issues).not.toContainEqual(
      expect.objectContaining({ source: "recovery" }),
    );
  });

  test("returns a partial snapshot when a source exceeds the local time budget", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "orchestra-file-atlas-"));
    const db = createDb(":memory:");
    const provider = createLiveFileAtlasProvider(db, {
      homeDir,
      readAvailableBytes: () => new Promise(() => undefined),
    });
    const startedAt = performance.now();

    const snapshot = await provider.getSnapshot();

    expect(performance.now() - startedAt).toBeLessThan(2_200);
    expect(snapshot.storage).toEqual({ status: "unknown", availableBytes: 0 });
    expect(snapshot.issues).toContainEqual({
      source: "storage",
      reasonCode: "timeout",
    });
  });
});

describe("registered repository inspection", () => {
  test("uses existing refs and leaves the Git index byte-for-byte unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "orchestra-file-atlas-git-"));
    await runGit(root, ["init", "-b", "main"]);
    await runGit(root, ["config", "user.email", "fixture@example.invalid"]);
    await runGit(root, ["config", "user.name", "Fixture"]);
    await writeFile(path.join(root, "tracked.txt"), "before\n");
    await runGit(root, ["add", "tracked.txt"]);
    await runGit(root, ["commit", "-m", "fixture"]);
    await writeFile(path.join(root, "tracked.txt"), "after\n");

    const indexPath = path.join(root, ".git", "index");
    const before = await Bun.file(indexPath).arrayBuffer();
    const observation = await inspectRegisteredRepository(root);
    const after = await Bun.file(indexPath).arrayBuffer();

    expect(observation).toEqual({ dirty: true, ahead: false, detached: false });
    expect(Buffer.compare(Buffer.from(before), Buffer.from(after))).toBe(0);
  });
});
