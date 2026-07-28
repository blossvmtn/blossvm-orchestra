import {
  FILE_ATLAS_ANYWHERE_CATEGORIES,
  FILE_ATLAS_THIS_MAC_CATEGORIES,
  FileAtlasSnapshotSchema,
  type FileAtlasIssueReason,
  type FileAtlasSnapshot,
} from "@orchestra/core";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  readFile,
  readdir,
  stat,
  statfs,
} from "node:fs/promises";
import path from "node:path";
import type { OrchestraDb } from "../db/db";
import { repos } from "../db/schema";
import type { FileAtlasSnapshotProvider } from "./fileAtlas";

const THIS_MAC_CATEGORIES: FileAtlasSnapshot["surfaces"]["thisMac"]["categories"] = [
  ...FILE_ATLAS_THIS_MAC_CATEGORIES,
];
const ANYWHERE_CATEGORIES: FileAtlasSnapshot["surfaces"]["anywhere"]["categories"] = [
  ...FILE_ATLAS_ANYWHERE_CATEGORIES,
];
const GIT_TIMEOUT_MS = 600;
const SOURCE_TIMEOUT_MS = 1_800;
const STORAGE_ATTENTION_BYTES = 64 * 1024 ** 3;

type RepositoryObservation = {
  dirty: boolean;
  ahead: boolean;
  detached: boolean;
};

type LiveFileAtlasOptions = {
  homeDir?: string;
  platform?: "macos" | "linux";
  now?: () => Date;
  inspectRepository?: (rootPath: string) => Promise<RepositoryObservation>;
  readAvailableBytes?: (rootPath: string) => Promise<number>;
};

type SanitizedIssue = FileAtlasSnapshot["issues"][number];

class ObservationError extends Error {
  constructor(readonly reasonCode: FileAtlasIssueReason) {
    super(reasonCode);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = SOURCE_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ObservationError("timeout")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function reasonForError(error: unknown): FileAtlasIssueReason {
  if (error instanceof ObservationError) return error.reasonCode;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const code = String(error.code);
    if (code === "ENOENT" || code === "ENOTDIR") return "not_found";
    if (code === "EACCES" || code === "EPERM") return "permission_denied";
  }
  return "read_failed";
}

function execGit(rootPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = execFile(
      "git",
      args,
      {
        cwd: rootPath,
        encoding: "utf8",
        env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(new ObservationError("read_failed"));
          return;
        }
        resolve(stdout);
      },
    );
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new ObservationError("timeout"));
    }, GIT_TIMEOUT_MS);
  });
}

async function indexDigest(rootPath: string): Promise<string> {
  const gitPath = (await execGit(rootPath, ["rev-parse", "--git-path", "index"])).trim();
  if (!gitPath) throw new ObservationError("read_failed");
  const indexPath = path.isAbsolute(gitPath) ? gitPath : path.join(rootPath, gitPath);
  try {
    const contents = await readFile(indexPath);
    return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
  } catch (error) {
    if (reasonForError(error) === "not_found") return "missing-index";
    throw error;
  }
}

export async function inspectRegisteredRepository(
  rootPath: string,
): Promise<RepositoryObservation> {
  const before = await indexDigest(rootPath);
  const status = await execGit(rootPath, [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=normal",
  ]);
  const after = await indexDigest(rootPath);
  if (before !== after) throw new ObservationError("stale_evidence");

  let ahead = false;
  let detached = false;
  let dirty = false;
  for (const line of status.split("\n")) {
    if (line.startsWith("# branch.ab ")) {
      const match = /\+(\d+)/.exec(line);
      ahead = Number(match?.[1] ?? 0) > 0;
    } else if (line === "# branch.head (detached)") {
      detached = true;
    } else if (line && !line.startsWith("#")) {
      dirty = true;
    }
  }
  return { dirty, ahead, detached };
}

type SurfaceResult<Categories extends string[]> = {
  surface: {
    status: FileAtlasSnapshot["status"];
    categories: Categories;
    inbox: FileAtlasSnapshot["surfaces"]["thisMac"]["inbox"];
  };
  issue?: SanitizedIssue;
};

async function inspectSurface<Categories extends string[]>(
  rootPath: string,
  categories: Categories,
  source: "this_mac" | "anywhere",
): Promise<SurfaceResult<Categories>> {
  try {
    const approvedPaths = [
      rootPath,
      ...categories.map((category) => path.join(rootPath, category)),
    ];
    const before = await Promise.all(approvedPaths.map(async (approvedPath) => {
      const metadata = await stat(approvedPath);
      if (!metadata.isDirectory()) throw new ObservationError("not_found");
      return `${metadata.dev}:${metadata.ino}:${metadata.mode}:directory`;
    }));
    const entries = await readdir(path.join(rootPath, "Inbox"));
    const after = await Promise.all(approvedPaths.map(async (approvedPath) => {
      const metadata = await stat(approvedPath);
      if (!metadata.isDirectory()) throw new ObservationError("not_found");
      return `${metadata.dev}:${metadata.ino}:${metadata.mode}:directory`;
    }));
    if (before.some((identity, index) => identity !== after[index])) {
      throw new ObservationError("stale_evidence");
    }
    return {
      surface: {
        status: "healthy",
        categories,
        inbox: {
          state: entries.length === 0 ? "empty" : "items_waiting",
          directEntries: entries.length,
        },
      },
    };
  } catch (error) {
    return {
      surface: {
        status: "unknown",
        categories,
        inbox: { state: "unknown", directEntries: 0 },
      },
      issue: { source, reasonCode: reasonForError(error) },
    };
  }
}

type ReceiptObservation = {
  state: "verified" | "unverified" | "unknown";
  reasonCode?: FileAtlasIssueReason;
};

async function observeSanitizedReceipt(
  inventoryRoot: string,
  directoryPrefix: string,
  receiptPrefix: string,
  verificationMarkers: string[],
): Promise<ReceiptObservation> {
  try {
    const entries = await readdir(inventoryRoot, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(directoryPrefix))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const candidate of candidates) {
      const candidateRoot = path.join(inventoryRoot, candidate);
      const candidateEntries = await readdir(candidateRoot, { withFileTypes: true });
      const receipt = candidateEntries.find(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(receiptPrefix) &&
          entry.name.endsWith(".md"),
      );
      if (!receipt) continue;
      const contents = await readFile(path.join(candidateRoot, receipt.name), "utf8");
      if (verificationMarkers.every((marker) => contents.includes(marker))) {
        return { state: "verified" };
      }
      return { state: "unverified", reasonCode: "stale_evidence" };
    }
    return { state: "unknown", reasonCode: "not_found" };
  } catch (error) {
    return { state: "unknown", reasonCode: reasonForError(error) };
  }
}

async function defaultAvailableBytes(rootPath: string): Promise<number> {
  const filesystem = await statfs(rootPath);
  return filesystem.bavail * filesystem.bsize;
}

function unknownSurface<Categories extends string[]>(
  categories: Categories,
  source: "this_mac" | "anywhere",
  error: unknown,
): SurfaceResult<Categories> & { issue: SanitizedIssue } {
  return {
    surface: {
      status: "unknown",
      categories,
      inbox: { state: "unknown", directEntries: 0 },
    },
    issue: { source, reasonCode: reasonForError(error) },
  };
}

export function createLiveFileAtlasProvider(
  db: OrchestraDb,
  options: LiveFileAtlasOptions = {},
): FileAtlasSnapshotProvider {
  const homeDir = options.homeDir ?? process.env.HOME;
  if (!homeDir) throw new Error("HOME is required for the File Atlas provider");
  const platform = options.platform ?? (process.platform === "darwin" ? "macos" : "linux");
  const now = options.now ?? (() => new Date());
  const inspectRepository = options.inspectRepository ?? inspectRegisteredRepository;
  const readAvailableBytes = options.readAvailableBytes ?? defaultAvailableBytes;

  return {
    async getSnapshot() {
      const issues: SanitizedIssue[] = [];
      const thisMacRoot = path.join(homeDir, "Files");
      const anywhereRoot = path.join(
        homeDir,
        "Library",
        "Mobile Documents",
        "com~apple~CloudDocs",
        "Anywhere",
      );
      const workstationRoot = path.join(homeDir, "dev", "workstation");
      const inventoryRoot = path.join(workstationRoot, "inventory");

      const surfacePromise = Promise.all([
        withTimeout(inspectSurface(thisMacRoot, THIS_MAC_CATEGORIES, "this_mac"))
          .catch((error) => unknownSurface(THIS_MAC_CATEGORIES, "this_mac", error)),
        withTimeout(inspectSurface(anywhereRoot, ANYWHERE_CATEGORIES, "anywhere"))
          .catch((error) => unknownSurface(ANYWHERE_CATEGORIES, "anywhere", error)),
      ]);

      const repositoryPromise = (async () => {
        let registered: Array<typeof repos.$inferSelect> = [];
        let readFailed = false;
        try {
          registered = await withTimeout(db.select().from(repos));
        } catch {
          readFailed = true;
        }
        const results = await Promise.all(
          registered.map(async (repo) => {
            try {
              return {
                observation: await withTimeout(inspectRepository(repo.rootPath)),
              };
            } catch (error) {
              return { reasonCode: reasonForError(error) };
            }
          }),
        );
        return { registered, readFailed, results };
      })();

      const recoveryPromise = withTimeout(
        Promise.all([
          observeSanitizedReceipt(
            inventoryRoot,
            "r6-r9-overhaul-",
            "R6-R9-WORKSTATION-OVERHAUL-FINAL-RECEIPT-",
            [
              "The R4 checksum manifest was re-run after R7 and every listed artifact returned",
              "`OK`.",
            ],
          ),
          observeSanitizedReceipt(
            inventoryRoot,
            "r5b-encrypted-egress-",
            "R5B-ENCRYPTED-EGRESS-RECEIPT-",
            [
              "## Outcome\n\nPASS",
              "All six downloaded ciphertext archives matched the local ciphertext SHA-256",
              "R4 checksum verification after remote recovery: PASS",
            ],
          ),
        ]),
      ).catch((error) => {
        const reasonCode = reasonForError(error);
        return [
          { state: "unknown" as const, reasonCode },
          { state: "unknown" as const, reasonCode },
        ] as const;
      });

      const workstationPromise = withTimeout((async () => {
        const bootstrapPath = path.join(workstationRoot, "bootstrap", "workstation");
        const localContents = await readFile(bootstrapPath);
        const committedContents = await execGit(workstationRoot, [
          "show",
          "HEAD:bootstrap/workstation",
        ]);
        const localDigest = createHash("sha256").update(localContents).digest("hex");
        const committedDigest = createHash("sha256").update(committedContents).digest("hex");
        if (localDigest !== committedDigest) {
          return {
            value: "configuration_present" as const,
            status: "attention" as const,
            issue: {
              source: "workstation" as const,
              reasonCode: "stale_evidence" as const,
            },
          };
        }
        return {
          value: "configuration_present" as const,
          status: "healthy" as const,
        };
      })())
        .catch((error) => {
          const reasonCode = reasonForError(error);
          const configurationMissing = reasonCode === "not_found";
          return {
            value: configurationMissing
              ? "configuration_missing" as const
              : "unknown" as const,
            status: configurationMissing ? "attention" as const : "unknown" as const,
            issue: {
              source: "workstation" as const,
              reasonCode,
            },
          };
        });

      const storagePromise = withTimeout(readAvailableBytes(homeDir))
        .then((availableBytes) => ({
          availableBytes,
          status:
            availableBytes < STORAGE_ATTENTION_BYTES
              ? "attention" as const
              : "healthy" as const,
        }))
        .catch((error) => ({
          availableBytes: 0,
          status: "unknown" as const,
          issue: {
            source: "storage" as const,
            reasonCode: reasonForError(error),
          },
        }));

      const [
        [thisMacResult, anywhereResult],
        repositoryResult,
        [localVaultObservation, encryptedCustodyObservation],
        workstationResult,
        storageResult,
      ] = await Promise.all([
        surfacePromise,
        repositoryPromise,
        recoveryPromise,
        workstationPromise,
        storagePromise,
      ]);

      if (thisMacResult.issue) issues.push(thisMacResult.issue);
      if (anywhereResult.issue) issues.push(anywhereResult.issue);

      const failedRepositories = repositoryResult.results.filter(
        (result) => "reasonCode" in result,
      );
      if (repositoryResult.readFailed || failedRepositories.length > 0) {
        issues.push({
          source: "repositories",
          reasonCode: repositoryResult.readFailed
            ? "read_failed"
            : failedRepositories[0]?.reasonCode ?? "read_failed",
        });
      }
      const observations = repositoryResult.results.flatMap((result) =>
        "observation" in result && result.observation ? [result.observation] : [],
      );

      if (
        localVaultObservation.state !== "verified" ||
        encryptedCustodyObservation.state !== "verified"
      ) {
        issues.push({
          source: "recovery",
          reasonCode:
            localVaultObservation.reasonCode ??
            encryptedCustodyObservation.reasonCode ??
            "stale_evidence",
        });
      }
      if ("issue" in workstationResult) issues.push(workstationResult.issue);
      if ("issue" in storageResult) issues.push(storageResult.issue);

      const companyAvailability =
        encryptedCustodyObservation.state === "verified" ? "available" : "unknown";
      if (companyAvailability === "unknown") {
        issues.push({
          source: "company_documents",
          reasonCode: encryptedCustodyObservation.reasonCode ?? "stale_evidence",
        });
      }

      const snapshot: FileAtlasSnapshot = {
        schema: "workstation.file_atlas_snapshot.v1",
        generatedAt: now().toISOString(),
        platform,
        status:
          issues.length > 0 ||
          storageResult.status === "attention" ||
          workstationResult.status === "attention"
            ? "attention"
            : "healthy",
        surfaces: {
          thisMac: thisMacResult.surface,
          anywhere: anywhereResult.surface,
        },
        repositories: {
          root: "$HOME/dev",
          status:
            repositoryResult.readFailed || failedRepositories.length > 0
              ? "unknown"
              : "healthy",
          trackingBasis: "existing-refs-only",
          counts: {
            registered: repositoryResult.registered.length,
            dirty: observations.filter((observation) => observation.dirty).length,
            ahead: observations.filter((observation) => observation.ahead).length,
            detached: observations.filter((observation) => observation.detached).length,
          },
        },
        recovery: {
          status:
            localVaultObservation.state === "unknown" ||
            encryptedCustodyObservation.state === "unknown"
              ? "unknown"
              : localVaultObservation.state === "verified" &&
                  encryptedCustodyObservation.state === "verified"
                ? "healthy"
                : "attention",
          localVaultReceipt: localVaultObservation.state,
          encryptedCustodyReceipt: encryptedCustodyObservation.state,
        },
        companyDocuments: {
          status: companyAvailability === "unknown" ? "unknown" : "healthy",
          availability: companyAvailability,
        },
        workstation: {
          status: workstationResult.status,
          bootstrap: workstationResult.value,
        },
        storage: {
          status: storageResult.status,
          availableBytes: storageResult.availableBytes,
        },
        issues,
      };
      return FileAtlasSnapshotSchema.parse(snapshot);
    },
  };
}
