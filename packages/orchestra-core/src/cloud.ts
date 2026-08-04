import { z } from "zod";
import { AgentRunSchema } from "./agentRun";
import { ReceiptSchema } from "./receipt";
import { TaskSpecSchema } from "./taskSpec";

export const GitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const IdempotencyKeySchema = z.string().min(8).max(200);

export const RepositoryRefSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  baseSha: GitShaSchema,
});

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const ActorKindSchema = z.enum([
  "human",
  "service",
  "provider",
  "local_daemon",
]);

export const ActorSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  kind: ActorKindSchema,
  displayName: z.string().min(1),
  externalSubject: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
});

export const TaskStatusSchema = z.enum([
  "draft",
  "queued",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "succeeded",
  "failed",
  "cancelled",
]);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdByActorId: z.string().uuid(),
  title: z.string().min(1).max(200),
  status: TaskStatusSchema,
  authority: z.literal("cloud"),
  idempotencyKey: IdempotencyKeySchema,
  currentRunId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CloudTaskSpecSchema = TaskSpecSchema.extend({
  taskId: z.string().uuid(),
  repository: RepositoryRefSchema,
  idempotencyKey: IdempotencyKeySchema,
});

export const CloudAgentRunSchema = AgentRunSchema.extend({
  taskId: z.string().uuid(),
  authority: z.enum(["provider", "orchestra_cloud"]),
  repository: RepositoryRefSchema,
  requestedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const RunTreeRelationshipSchema = z.enum([
  "root",
  "delegated",
  "retry",
  "follow_up",
]);

export const RunTreeNodeSchema = z.object({
  runId: z.string().uuid(),
  parentRunId: z.string().uuid().optional(),
  relationship: RunTreeRelationshipSchema,
  createdAt: z.string().datetime(),
});

export const RunTreeSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    taskId: z.string().uuid(),
    rootRunId: z.string().uuid(),
    nodes: z.array(RunTreeNodeSchema).min(1),
  })
  .superRefine((tree, context) => {
    const ids = new Set(tree.nodes.map((node) => node.runId));

    if (ids.size !== tree.nodes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "run tree nodes must have unique run ids",
        path: ["nodes"],
      });
    }

    const root = tree.nodes.find((node) => node.runId === tree.rootRunId);
    if (!root || root.parentRunId || root.relationship !== "root") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rootRunId must identify the parentless root node",
        path: ["rootRunId"],
      });
    }

    tree.nodes.forEach((node, index) => {
      if (node.parentRunId && !ids.has(node.parentRunId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "parentRunId must refer to a node in the same tree",
          path: ["nodes", index, "parentRunId"],
        });
      }

      if (node.runId !== tree.rootRunId && !node.parentRunId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "every non-root run must identify its parent",
          path: ["nodes", index, "parentRunId"],
        });
      }

      if (node.runId !== tree.rootRunId && node.relationship === "root") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "only rootRunId may use the root relationship",
          path: ["nodes", index, "relationship"],
        });
      }
    });

    const parentByRunId = new Map(
      tree.nodes.map((node) => [node.runId, node.parentRunId]),
    );
    tree.nodes.forEach((node, index) => {
      const visited = new Set<string>();
      let cursor: string | undefined = node.runId;

      while (cursor && cursor !== tree.rootRunId) {
        if (visited.has(cursor)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "run tree cannot contain a cycle",
            path: ["nodes", index],
          });
          return;
        }
        visited.add(cursor);
        cursor = parentByRunId.get(cursor);
      }

      if (cursor !== tree.rootRunId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "every run must descend from rootRunId",
          path: ["nodes", index],
        });
      }
    });
  });

export const DecisionKindSchema = z.enum([
  "architecture",
  "provider_selection",
  "answer",
  "acceptance",
  "rejection",
]);

export const DecisionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  actorId: z.string().uuid(),
  kind: DecisionKindSchema,
  summary: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const ApprovalKindSchema = z.enum([
  "dispatch",
  "follow_up",
  "promotion",
  "destructive_action",
  "budget_exception",
  "secret_access",
]);
export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "expired",
  "revoked",
]);

export const ApprovalSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    taskId: z.string().uuid(),
    requestedByActorId: z.string().uuid(),
    kind: ApprovalKindSchema,
    status: ApprovalStatusSchema,
    scope: z.string().min(1),
    decidedByActorId: z.string().uuid().optional(),
    requestedAt: z.string().datetime(),
    decidedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((approval, context) => {
    const isPending = approval.status === "pending";
    if (isPending && (approval.decidedAt || approval.decidedByActorId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pending approvals cannot contain a decision",
        path: ["status"],
      });
    }
    if (!isPending && (!approval.decidedAt || !approval.decidedByActorId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolved approvals require decision actor and time",
        path: ["status"],
      });
    }
  });

export const ArtifactOperationSchema = z.enum(["read", "write", "download"]);

export const ArtifactGrantSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    taskId: z.string().uuid(),
    artifactId: z.string().uuid(),
    grantedByActorId: z.string().uuid(),
    grantedToActorId: z.string().uuid(),
    operations: z.array(ArtifactOperationSchema).min(1),
    storageKey: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mediaType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    revokedAt: z.string().datetime().optional(),
  })
  .refine((grant) => grant.expiresAt > grant.createdAt, {
    message: "artifact grant must expire after it is created",
    path: ["expiresAt"],
  });

export const ProviderSupportSchema = z.enum([
  "stable",
  "beta",
  "unsupported",
  "unknown",
]);
export const ProviderAuthModelSchema = z.enum([
  "user_api_key",
  "service_account",
  "oauth",
  "workload_identity",
  "local_subscription",
]);

export const ProviderCapabilitySchema = z.object({
  provider: z.string().min(1),
  authModels: z.array(ProviderAuthModelSchema).min(1),
  constraints: z.array(z.string().min(1)),
  launch: ProviderSupportSchema,
  exactBaseSha: ProviderSupportSchema,
  followUp: ProviderSupportSchema,
  cancellation: ProviderSupportSchema,
  statusPolling: ProviderSupportSchema,
  eventStream: ProviderSupportSchema,
  webhooks: ProviderSupportSchema,
  artifacts: ProviderSupportSchema,
  usage: ProviderSupportSchema,
  pullRequests: ProviderSupportSchema,
  structuredOutput: ProviderSupportSchema,
  userQuestions: ProviderSupportSchema,
  approvals: ProviderSupportSchema,
  verifiedAt: z.string().datetime(),
  sourceUrl: z.string().url(),
});

export const ProjectionFreshnessSchema = z.enum([
  "fresh",
  "stale",
  "offline",
  "unknown",
]);

export const LocalProjectionSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    machineId: z.string().uuid(),
    resourceType: z.string().min(1),
    resourceId: z.string().min(1),
    authority: z.literal("local_daemon"),
    freshness: ProjectionFreshnessSchema,
    observedAt: z.string().datetime(),
    staleAfter: z.string().datetime(),
    payload: z.record(z.unknown()),
  })
  .refine((projection) => projection.staleAfter > projection.observedAt, {
    message: "projection must become stale after it was observed",
    path: ["staleAfter"],
  });

export const CommandEnvelopeSchema = z.object({
  commandId: z.string().uuid(),
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  actorId: z.string().uuid(),
  idempotencyKey: IdempotencyKeySchema,
  commandType: z.string().min(1),
  issuedAt: z.string().datetime(),
});

export const EvidenceSchema = z.object({
  kind: z.enum(["commit", "branch", "pull_request", "check", "artifact", "log"]),
  label: z.string().min(1),
  url: z.string().url().optional(),
  sha: GitShaSchema.optional(),
});

export const CloudReceiptSchema = ReceiptSchema.extend({
  commandId: z.string().uuid(),
  idempotencyKey: IdempotencyKeySchema,
  repository: RepositoryRefSchema,
  evidence: z.array(EvidenceSchema),
}).refine(
  (receipt) => !receipt.baseSha || receipt.baseSha === receipt.repository.baseSha,
  {
    message: "receipt baseSha must match the requested repository baseSha",
    path: ["baseSha"],
  },
);

export type GitSha = z.infer<typeof GitShaSchema>;
export type RepositoryRef = z.infer<typeof RepositoryRefSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type ActorKind = z.infer<typeof ActorKindSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CloudTaskSpec = z.infer<typeof CloudTaskSpecSchema>;
export type CloudAgentRun = z.infer<typeof CloudAgentRunSchema>;
export type RunTree = z.infer<typeof RunTreeSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type ArtifactGrant = z.infer<typeof ArtifactGrantSchema>;
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;
export type LocalProjection = z.infer<typeof LocalProjectionSchema>;
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type CloudReceipt = z.infer<typeof CloudReceiptSchema>;
