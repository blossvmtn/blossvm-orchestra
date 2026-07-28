import { z } from "zod";

export const FILE_ATLAS_THIS_MAC_CATEGORIES = [
  "Now",
  "Projects",
  "Library",
  "Studio",
  "Inbox",
  "Recovery",
  "Storage",
  "Archive",
] as const;

export const FILE_ATLAS_ANYWHERE_CATEGORIES = [
  "Now",
  "Library",
  "Inbox",
] as const;

export const FileAtlasStatusSchema = z.enum(["healthy", "attention", "unknown"]);
export type FileAtlasStatus = z.infer<typeof FileAtlasStatusSchema>;

export const FileAtlasIssueReasonSchema = z.enum([
  "not_found",
  "stale_evidence",
  "unsupported",
  "permission_denied",
  "timeout",
  "read_failed",
]);
export type FileAtlasIssueReason = z.infer<typeof FileAtlasIssueReasonSchema>;

const InboxSchema = z
  .object({
    state: z.enum(["empty", "items_waiting", "unknown"]),
    directEntries: z.number().int().nonnegative(),
  })
  .strict();

const ThisMacSurfaceSchema = z
  .object({
    status: FileAtlasStatusSchema,
    categories: z.tuple([
      z.literal(FILE_ATLAS_THIS_MAC_CATEGORIES[0]),
      z.literal(FILE_ATLAS_THIS_MAC_CATEGORIES[1]),
      z.literal(FILE_ATLAS_THIS_MAC_CATEGORIES[2]),
      z.literal(FILE_ATLAS_THIS_MAC_CATEGORIES[3]),
      z.literal(FILE_ATLAS_THIS_MAC_CATEGORIES[4]),
      z.literal(FILE_ATLAS_THIS_MAC_CATEGORIES[5]),
      z.literal(FILE_ATLAS_THIS_MAC_CATEGORIES[6]),
      z.literal(FILE_ATLAS_THIS_MAC_CATEGORIES[7]),
    ]),
    inbox: InboxSchema,
  })
  .strict();

const AnywhereSurfaceSchema = z
  .object({
    status: FileAtlasStatusSchema,
    categories: z.tuple([
      z.literal(FILE_ATLAS_ANYWHERE_CATEGORIES[0]),
      z.literal(FILE_ATLAS_ANYWHERE_CATEGORIES[1]),
      z.literal(FILE_ATLAS_ANYWHERE_CATEGORIES[2]),
    ]),
    inbox: InboxSchema,
  })
  .strict();

const ReceiptStateSchema = z.enum(["verified", "unverified", "unknown"]);

export const FileAtlasSnapshotSchema = z
  .object({
    schema: z.literal("workstation.file_atlas_snapshot.v1"),
    generatedAt: z.string().datetime({ offset: true }),
    platform: z.enum(["macos", "linux"]),
    status: FileAtlasStatusSchema,
    surfaces: z
      .object({
        thisMac: ThisMacSurfaceSchema,
        anywhere: AnywhereSurfaceSchema,
      })
      .strict(),
    repositories: z
      .object({
        root: z.literal("$HOME/dev"),
        status: FileAtlasStatusSchema,
        trackingBasis: z.literal("existing-refs-only"),
        counts: z
          .object({
            registered: z.number().int().nonnegative(),
            dirty: z.number().int().nonnegative(),
            ahead: z.number().int().nonnegative(),
            detached: z.number().int().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    recovery: z
      .object({
        status: FileAtlasStatusSchema,
        localVaultReceipt: ReceiptStateSchema,
        encryptedCustodyReceipt: ReceiptStateSchema,
      })
      .strict(),
    companyDocuments: z
      .object({
        status: FileAtlasStatusSchema,
        availability: z.enum(["available", "unavailable", "unknown"]),
      })
      .strict(),
    workstation: z
      .object({
        status: FileAtlasStatusSchema,
        bootstrap: z.enum(["configuration_present", "configuration_missing", "unknown"]),
      })
      .strict(),
    storage: z
      .object({
        status: FileAtlasStatusSchema,
        availableBytes: z.number().int().nonnegative(),
      })
      .strict(),
    issues: z.array(
      z
        .object({
          source: z.enum([
            "this_mac",
            "anywhere",
            "repositories",
            "recovery",
            "company_documents",
            "workstation",
            "storage",
          ]),
          reasonCode: FileAtlasIssueReasonSchema,
        })
        .strict(),
    ),
  })
  .strict();

export type FileAtlasSnapshot = z.infer<typeof FileAtlasSnapshotSchema>;
