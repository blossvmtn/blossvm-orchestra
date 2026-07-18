import { z } from "zod";

export const NodeStatusSchema = z.enum([
  "active",
  "merged",
  "stashed",
  "orphaned",
  "pr_open",
]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const FenceSpecSchema = z.object({
  allowedPaths: z.array(z.string()),
  forbiddenPaths: z.array(z.string()),
});
export type FenceSpec = z.infer<typeof FenceSpecSchema>;

export const WorktreeNodeSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  branch: z.string().min(1),
  path: z.string().min(1),
  status: NodeStatusSchema,
  anchorSha: z.string().min(1),
  fence: FenceSpecSchema,
  modelHint: z.string().nullable(),
  prUrl: z.string().url().nullable().optional(),
  createdAt: z.string().datetime(),
  lastSyncAt: z.string().datetime().nullable(),
});
export type WorktreeNode = z.infer<typeof WorktreeNodeSchema>;

export const OrchestraRepoStateSchema = z.object({
  version: z.literal(1),
  repoId: z.string().uuid(),
  nodes: z.array(WorktreeNodeSchema),
  updatedAt: z.string().datetime(),
});
export type OrchestraRepoState = z.infer<typeof OrchestraRepoStateSchema>;

export const OrchestraRegistryDefaultsSchema = z.object({
  worktreeRoot: z.string(),
  pollMsFocused: z.number().int().positive(),
  pollMsBlurred: z.number().int().positive(),
  ollamaBaseUrl: z.string().url(),
  ollamaModel: z.string(),
  ollamaContextTokens: z.number().int().positive(),
  hermesRuntime: z.string(),
  spareModels: z.array(z.string()),
});
export type OrchestraRegistryDefaults = z.infer<
  typeof OrchestraRegistryDefaultsSchema
>;

export const OrchestraRegistryEntrySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  rootPath: z.string().min(1),
  displayName: z.string().min(1),
  addedAt: z.string().datetime(),
  lastOpenedAt: z.string().datetime().nullable(),
});
export type OrchestraRegistryEntry = z.infer<
  typeof OrchestraRegistryEntrySchema
>;

export const OrchestraRegistrySchema = z.object({
  version: z.literal(1),
  entries: z.array(OrchestraRegistryEntrySchema),
  defaults: OrchestraRegistryDefaultsSchema,
});
export type OrchestraRegistry = z.infer<typeof OrchestraRegistrySchema>;

export const DEFAULT_REGISTRY_DEFAULTS: OrchestraRegistryDefaults = {
  worktreeRoot: "<repo>/.orchestra/worktrees",
  pollMsFocused: 3000,
  pollMsBlurred: 10000,
  ollamaBaseUrl: "http://127.0.0.1:11434/v1",
  ollamaModel: "gemma4:31b",
  ollamaContextTokens: 64000,
  hermesRuntime: "hermes-agent",
  spareModels: ["qwen3.6"],
};

export const RemoveModeSchema = z.enum(["keep-branch", "delete-branch"]);
export type RemoveMode = z.infer<typeof RemoveModeSchema>;

export const StackedStepSchema = z.enum(["commit", "push", "pr"]);
export type StackedStep = z.infer<typeof StackedStepSchema>;

export const StackedActionInputSchema = z.object({
  repoId: z.string().uuid(),
  nodeId: z.string().uuid(),
  steps: z.array(StackedStepSchema).min(1),
  message: z.string().min(1).optional(),
  prTitle: z.string().min(1).optional(),
  prBody: z.string().optional(),
});
export type StackedActionInput = z.infer<typeof StackedActionInputSchema>;

export const StackedActionResultSchema = z.object({
  ok: z.literal(true),
  prUrl: z.string().url().nullable().optional(),
  warnings: z.array(z.string()),
  committed: z.boolean().optional(),
  pushed: z.boolean().optional(),
});
export type StackedActionResult = z.infer<typeof StackedActionResultSchema>;

/** Constitution status colors (Module B paints from these keys). */
export const NODE_STATUS_COLORS = {
  active: "#3b82f6",
  merged: "#22a06b",
  stashed: "#e07830",
  orphaned: "#d94040",
  pr_open: "#3b82f6",
} as const satisfies Record<NodeStatus, string>;

export const TrunkLaneSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  branch: z.string().min(1),
  status: NodeStatusSchema,
  anchorSha: z.string().min(1),
  shortSha: z.string().min(1),
  prUrl: z.string().url().nullable(),
  modelHint: z.string().nullable(),
  lastSyncAt: z.string().datetime().nullable(),
  /** Live facts from the worker folder (refreshed on each trunk poll). */
  path: z.string().min(1).optional(),
  commitsAhead: z.number().int().nonnegative().optional(),
  dirty: z.boolean().optional(),
  lastCommitMessage: z.string().nullable().optional(),
  hasUpstream: z.boolean().optional(),
  unpushedCommits: z.number().int().nonnegative().optional(),
  plainStatus: z.string().optional(),
  nextStep: z.string().optional(),
});
export type TrunkLane = z.infer<typeof TrunkLaneSchema>;

export const TrunkScanSnapshotSchema = z.object({
  schema: z.literal("orchestra.trunk_scan.v1"),
  repoId: z.string().uuid(),
  repoSlug: z.string().min(1),
  displayName: z.string().min(1),
  baseBranch: z.string().min(1),
  scannedAt: z.string().datetime(),
  lanes: z.array(TrunkLaneSchema),
});
export type TrunkScanSnapshot = z.infer<typeof TrunkScanSnapshotSchema>;

export const SyncLogStatusSchema = z.enum([
  "progress",
  "blocked",
  "ready_for_review",
  "done",
]);
export type SyncLogStatus = z.infer<typeof SyncLogStatusSchema>;

export const SyncLogSchema = z.object({
  schema: z.literal("orchestra.sync_log.v1"),
  planId: z.string().uuid(),
  workerSlug: z.string().min(1),
  repoSlug: z.string().min(1),
  branch: z.string().min(1),
  status: SyncLogStatusSchema,
  summary: z.string().max(280),
  commits: z.array(z.string()),
  filesTouched: z.array(z.string()),
  blockers: z.array(z.string()),
  nextAction: z.string(),
  recordedAt: z.string().datetime(),
});
export type SyncLog = z.infer<typeof SyncLogSchema>;

export const PacketKindSchema = z.enum([
  "sync_log",
  "manifest",
  "override",
  "pr_brief",
]);
export type PacketKind = z.infer<typeof PacketKindSchema>;

export const PACKET_TAGS = {
  sync_log: "[WORKTREE-SYNC-LOG]",
  manifest: "[ORCHESTRA-MANIFEST]",
  override: "[CONDUCTOR-OVERRIDE]",
  pr_brief: "[PR-BRIEF]",
} as const satisfies Record<PacketKind, string>;

export const ManifestWorkerSchema = z.object({
  slug: z.string().min(1),
  branch: z.string().min(1),
  role: z.string().min(1),
  modelHint: z.string().nullable().optional(),
  allowedPaths: z.array(z.string()),
  forbiddenPaths: z.array(z.string()),
  acceptance: z.array(z.string()),
});
export type ManifestWorker = z.infer<typeof ManifestWorkerSchema>;

export const OrchestraManifestSchema = z.object({
  schema: z.literal("orchestra.manifest.v1"),
  planId: z.string().uuid(),
  repoSlug: z.string().min(1),
  intent: z.string().min(1),
  workers: z.array(ManifestWorkerSchema).min(1),
});
export type OrchestraManifest = z.infer<typeof OrchestraManifestSchema>;

export const ConductorOverrideSchema = z.object({
  schema: z.literal("orchestra.override.v1"),
  planId: z.string().uuid(),
  repoSlug: z.string().min(1),
  target: z.union([z.literal("all"), z.string().min(1)]),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  instruction: z.string().min(1),
  issuedAt: z.string().datetime(),
});
export type ConductorOverride = z.infer<typeof ConductorOverrideSchema>;

export const PrBriefSchema = z.object({
  schema: z.literal("orchestra.pr_brief.v1"),
  repoSlug: z.string().min(1),
  branch: z.string().min(1),
  prUrl: z.string().url(),
  title: z.string(),
  summary: z.string(),
});
export type PrBrief = z.infer<typeof PrBriefSchema>;

export const HermesIntentSchema = z.enum([
  "summarize_lanes",
  "draft_override",
  "draft_relay",
]);
export type HermesIntent = z.infer<typeof HermesIntentSchema>;

export const HermesMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});
export type HermesMessage = z.infer<typeof HermesMessageSchema>;
