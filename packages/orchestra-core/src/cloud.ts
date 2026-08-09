import { z } from "zod";
import { AgentRunSchema } from "./agentRun";
import { ReceiptSchema } from "./receipt";
import { TaskSpecSchema } from "./taskSpec";

export const GitShaSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const IdempotencyKeySchema = z.string().min(8).max(200);
export const RequestFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const ReplayBindingSchema = z.object({
  schemaVersion: z.string().regex(/^[a-z][a-z0-9_.-]*\.v[1-9][0-9]*$/),
  fingerprint: RequestFingerprintSchema,
});

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
  requestBinding: ReplayBindingSchema,
  currentRunId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CloudTaskSpecSchema = TaskSpecSchema.extend({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  repository: RepositoryRefSchema,
  idempotencyKey: IdempotencyKeySchema,
  requestBinding: ReplayBindingSchema,
});

export const CloudAgentRunSchema = AgentRunSchema.extend({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  authority: z.enum(["provider", "orchestra_cloud"]),
  repository: RepositoryRefSchema,
  requestedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  costUsd: z.number().finite().nonnegative().optional(),
});

export const RunTreeRelationshipSchema = z.enum([
  "root",
  "delegated",
  "retry",
  "follow_up",
]);

export const RunTreeLimitsSchema = z.object({
  maxNodes: z.number().int().positive().max(64),
  maxDepth: z.number().int().positive().max(8),
  maxRetriesPerRun: z.number().int().nonnegative().max(10),
  maxCostUsd: z.number().finite().positive(),
});

export const RunTreeNodeSchema = z.object({
  runId: z.string().uuid(),
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  parentRunId: z.string().uuid().optional(),
  relationship: RunTreeRelationshipSchema,
  costUsd: z.number().finite().nonnegative(),
  createdAt: z.string().datetime(),
});

export const RunTreeSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    taskId: z.string().uuid(),
    rootRunId: z.string().uuid(),
    limits: RunTreeLimitsSchema,
    nodes: z.array(RunTreeNodeSchema).min(1).max(64),
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

    if (tree.nodes.length > tree.limits.maxNodes) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "run tree exceeds its node limit",
        path: ["nodes"],
      });
    }

    const totalCostUsd = tree.nodes.reduce(
      (total, node) => total + node.costUsd,
      0,
    );
    if (totalCostUsd > tree.limits.maxCostUsd) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "run tree exceeds its cost limit",
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
      if (
        node.organizationId !== tree.organizationId ||
        node.taskId !== tree.taskId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "every run must remain in the tree tenant and task",
          path: ["nodes", index],
        });
      }

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
      let depth = 0;

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
        depth += 1;
      }

      if (cursor !== tree.rootRunId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "every run must descend from rootRunId",
          path: ["nodes", index],
        });
      }

      if (depth > tree.limits.maxDepth) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "run tree exceeds its depth limit",
          path: ["nodes", index],
        });
      }
    });

    const retryCountByParent = new Map<string, number>();
    tree.nodes.forEach((node) => {
      if (node.relationship !== "retry" || !node.parentRunId) return;
      retryCountByParent.set(
        node.parentRunId,
        (retryCountByParent.get(node.parentRunId) ?? 0) + 1,
      );
    });
    if (
      [...retryCountByParent.values()].some(
        (retryCount) => retryCount > tree.limits.maxRetriesPerRun,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "run tree exceeds its per-run retry limit",
        path: ["nodes"],
      });
    }
  });

export const RunTreeExecutionSchema = z
  .object({
    tree: RunTreeSchema,
    runs: z.array(CloudAgentRunSchema).min(1).max(64),
  })
  .superRefine(({ runs, tree }, context) => {
    const runById = new Map(runs.map((run) => [run.id, run]));
    const nodeIds = new Set(tree.nodes.map((node) => node.runId));

    if (runById.size !== runs.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "run tree execution records must have unique run ids",
        path: ["runs"],
      });
    }

    if (
      runs.length !== tree.nodes.length ||
      runs.some((run) => !nodeIds.has(run.id))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "run tree nodes and execution records must identify the same runs",
        path: ["runs"],
      });
    }

    tree.nodes.forEach((node, index) => {
      const run = runById.get(node.runId);
      if (!run) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "every run tree node requires its actual execution record",
          path: ["tree", "nodes", index, "runId"],
        });
        return;
      }

      if (
        run.organizationId !== tree.organizationId ||
        run.taskId !== tree.taskId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "actual run records must remain in the tree tenant and task",
          path: ["runs", runs.indexOf(run)],
        });
      }

      if (run.costUsd !== undefined && run.costUsd !== node.costUsd) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "run tree cost must match the actual run record",
          path: ["tree", "nodes", index, "costUsd"],
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

export const ApprovalTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("dispatch"),
    taskSpecId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("follow_up"),
    agentRunId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("promotion"),
    repository: RepositoryRefSchema,
    headSha: GitShaSchema,
    branch: z.string().min(1),
    pullRequestNumber: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal("destructive_action"),
    operation: z.string().min(1),
    resourceType: z.string().min(1),
    resourceId: z.string().min(1),
  }),
  z.object({
    type: z.literal("budget_exception"),
    currency: z.literal("USD"),
    amountUsd: z.number().finite().positive(),
  }),
  z.object({
    type: z.literal("secret_access"),
    secretName: z.string().min(1),
    operation: z.enum(["use", "rotate"]),
  }),
]);

export const ApprovalSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    taskId: z.string().uuid(),
    requestedByActorId: z.string().uuid(),
    kind: ApprovalKindSchema,
    status: ApprovalStatusSchema,
    target: ApprovalTargetSchema,
    decidedByActorId: z.string().uuid().optional(),
    decidedByActorKind: z.literal("human").optional(),
    decidedByOrganizationId: z.string().uuid().optional(),
    decisionMembershipId: z.string().uuid().optional(),
    requestedAt: z.string().datetime(),
    decidedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime().optional(),
    consumptionId: z.string().uuid().optional(),
    consumedByCommandId: z.string().uuid().optional(),
    consumedAt: z.string().datetime().optional(),
  })
  .superRefine((approval, context) => {
    if (approval.kind !== approval.target.type) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval kind must match its structured target",
        path: ["target", "type"],
      });
    }

    if (
      approval.decidedByActorId &&
      approval.decidedByActorId === approval.requestedByActorId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval decision actor must differ from requester",
        path: ["decidedByActorId"],
      });
    }

    const isPending = approval.status === "pending";
    const decisionFields = [
      approval.decidedAt,
      approval.decidedByActorId,
      approval.decidedByActorKind,
      approval.decidedByOrganizationId,
      approval.decisionMembershipId,
    ];
    if (isPending && decisionFields.some(Boolean)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "pending approvals cannot contain a decision",
        path: ["status"],
      });
    }
    if (!isPending && decisionFields.some((field) => !field)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "resolved approvals require a current human membership decision",
        path: ["status"],
      });
    }
    if (
      approval.decidedByOrganizationId &&
      approval.decidedByOrganizationId !== approval.organizationId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval decision actor must belong to the same organization",
        path: ["decidedByOrganizationId"],
      });
    }

    const requestedAt = Date.parse(approval.requestedAt);
    const decidedAt = approval.decidedAt
      ? Date.parse(approval.decidedAt)
      : undefined;
    const expiresAt = approval.expiresAt
      ? Date.parse(approval.expiresAt)
      : undefined;
    if (decidedAt !== undefined && decidedAt < requestedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval decision cannot precede its request",
        path: ["decidedAt"],
      });
    }
    if (expiresAt !== undefined && expiresAt <= requestedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval expiry must follow its request",
        path: ["expiresAt"],
      });
    }
    if (
      decidedAt !== undefined &&
      expiresAt !== undefined &&
      decidedAt > expiresAt
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval decision cannot follow its expiry",
        path: ["decidedAt"],
      });
    }

    const consumptionFields = [
      approval.consumptionId,
      approval.consumedByCommandId,
      approval.consumedAt,
    ];
    const consumptionFieldCount = consumptionFields.filter(Boolean).length;
    if (
      consumptionFieldCount > 0 &&
      consumptionFieldCount < consumptionFields.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "approval consumption requires one id, command, and timestamp",
        path: ["consumptionId"],
      });
    }
    if (consumptionFieldCount === consumptionFields.length) {
      if (approval.status !== "approved") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "only an approved request may be consumed",
          path: ["status"],
        });
      }
      if (
        approval.decidedAt &&
        approval.consumedAt &&
        Date.parse(approval.consumedAt) < Date.parse(approval.decidedAt)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "approval consumption cannot precede its decision",
          path: ["consumedAt"],
        });
      }
      if (
        approval.expiresAt &&
        approval.consumedAt &&
        Date.parse(approval.consumedAt) > Date.parse(approval.expiresAt)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "approval consumption cannot follow its expiry",
          path: ["consumedAt"],
        });
      }
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
    revocation: z
      .object({
        revokedAt: z.string().datetime(),
        revokedByActorId: z.string().uuid(),
        reason: z.string().min(1).max(500),
      })
      .optional(),
  })
  .superRefine((grant, context) => {
    const createdAt = Date.parse(grant.createdAt);
    const expiresAt = Date.parse(grant.expiresAt);
    if (expiresAt <= createdAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "artifact grant must expire after it is created",
        path: ["expiresAt"],
      });
    }

    if (grant.revocation) {
      const revokedAt = Date.parse(grant.revocation.revokedAt);
      if (revokedAt < createdAt || revokedAt > expiresAt) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "artifact revocation must occur within the grant lifetime",
          path: ["revocation", "revokedAt"],
        });
      }
    }
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
export const ProjectionConnectionStatusSchema = z.enum([
  "online",
  "offline",
  "unknown",
]);
const ProjectionReadTimeSchema = z.string().datetime();

export const LocalProjectionSchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    machineId: z.string().uuid(),
    resourceType: z.string().min(1),
    resourceId: z.string().min(1),
    authority: z.literal("local_daemon"),
    connectionStatus: ProjectionConnectionStatusSchema,
    observedAt: z.string().datetime(),
    staleAfter: z.string().datetime(),
    payload: z.record(z.unknown()),
  })
  .refine(
    (projection) =>
      Date.parse(projection.staleAfter) > Date.parse(projection.observedAt),
    {
      message: "projection must become stale after it was observed",
      path: ["staleAfter"],
    },
  );

export function deriveProjectionFreshness(
  projection: z.infer<typeof LocalProjectionSchema>,
  asOf: string,
): z.infer<typeof ProjectionFreshnessSchema> {
  const readTime = ProjectionReadTimeSchema.parse(asOf);
  if (projection.connectionStatus !== "online") {
    return projection.connectionStatus;
  }
  return Date.parse(readTime) >= Date.parse(projection.staleAfter)
    ? "stale"
    : "fresh";
}

export const CommandEnvelopeSchema = z.object({
  commandId: z.string().uuid(),
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  actorId: z.string().uuid(),
  idempotencyKey: IdempotencyKeySchema,
  requestBinding: ReplayBindingSchema,
  commandType: z.string().min(1),
  issuedAt: z.string().datetime(),
});

export const EvidenceSchema = z.object({
  kind: z.enum([
    "commit",
    "branch",
    "pull_request",
    "check",
    "artifact",
    "log",
  ]),
  label: z.string().min(1),
  url: z.string().url().optional(),
  sha: GitShaSchema.optional(),
});

export const GitVerificationSchema = z.object({
  baseSha: GitShaSchema,
  headSha: GitShaSchema,
  ancestry: z.literal("verified"),
  checks: z.enum(["passed", "not_required"]),
  verifiedAt: z.string().datetime(),
});

export const FailureEvidenceSchema = z.object({
  type: z.enum([
    "provider_error",
    "capability_error",
    "auth_error",
    "validation_error",
    "budget_exhausted",
    "internal_error",
  ]),
  code: z.string().min(1),
  summary: z.string().min(1),
  retryable: z.boolean(),
  observedAt: z.string().datetime(),
});

export const CancellationEvidenceSchema = z.object({
  requestedByActorId: z.string().uuid(),
  reason: z.string().min(1),
  providerStatus: z.string().min(1),
  observedAt: z.string().datetime(),
});

const CloudReceiptCommonSchema = ReceiptSchema.omit({
  baseSha: true,
  branch: true,
  commitSha: true,
  outcome: true,
  providerRunId: true,
}).extend({
  organizationId: z.string().uuid(),
  taskId: z.string().uuid(),
  baseSha: GitShaSchema,
  commandId: z.string().uuid(),
  idempotencyKey: IdempotencyKeySchema,
  requestBinding: ReplayBindingSchema,
  repository: RepositoryRefSchema,
  evidence: z.array(EvidenceSchema).min(1),
});

const CloudSucceededReceiptSchema = CloudReceiptCommonSchema.extend({
  outcome: z.literal("succeeded"),
  providerRunId: z.string().min(1),
  commitSha: GitShaSchema,
  branch: z.string().min(1),
  gitVerification: GitVerificationSchema,
  failure: z.never().optional(),
  cancellation: z.never().optional(),
});

const CloudFailedReceiptSchema = CloudReceiptCommonSchema.extend({
  outcome: z.literal("failed"),
  providerRunId: z.string().min(1).optional(),
  commitSha: z.never().optional(),
  branch: z.never().optional(),
  gitVerification: z.never().optional(),
  failure: FailureEvidenceSchema,
  cancellation: z.never().optional(),
});

const CloudCancelledReceiptSchema = CloudReceiptCommonSchema.extend({
  outcome: z.literal("cancelled"),
  providerRunId: z.string().min(1).optional(),
  commitSha: z.never().optional(),
  branch: z.never().optional(),
  gitVerification: z.never().optional(),
  failure: z.never().optional(),
  cancellation: CancellationEvidenceSchema,
});

export const CloudReceiptSchema = z
  .discriminatedUnion("outcome", [
    CloudSucceededReceiptSchema,
    CloudFailedReceiptSchema,
    CloudCancelledReceiptSchema,
  ])
  .superRefine((receipt, context) => {
    if (receipt.baseSha !== receipt.repository.baseSha) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "receipt baseSha must match the requested repository baseSha",
        path: ["baseSha"],
      });
    }

    if (receipt.outcome !== "succeeded") return;

    if (
      receipt.gitVerification.baseSha !== receipt.baseSha ||
      receipt.gitVerification.headSha !== receipt.commitSha
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "successful cloud work requires matching ancestry and check verification",
        path: ["gitVerification"],
      });
    }

    if (
      !receipt.evidence.some(
        (evidence) =>
          evidence.kind === "commit" && evidence.sha === receipt.commitSha,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "successful cloud work requires evidence for its returned commit",
        path: ["evidence"],
      });
    }

    if (!receipt.evidence.some((evidence) => evidence.kind === "check")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "successful cloud work requires check evidence",
        path: ["evidence"],
      });
    }
  });

export const CloudExecutionChainSchema = z
  .object({
    task: TaskSchema,
    taskSpec: CloudTaskSpecSchema,
    command: CommandEnvelopeSchema,
    run: CloudAgentRunSchema,
    receipt: CloudReceiptSchema,
  })
  .superRefine((chain, context) => {
    const organizationId = chain.task.organizationId;
    const organizationIds = [
      chain.taskSpec.organizationId,
      chain.command.organizationId,
      chain.run.organizationId,
      chain.receipt.organizationId,
    ];
    if (organizationIds.some((value) => value !== organizationId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "execution chain must remain inside one organization",
        path: ["task", "organizationId"],
      });
    }

    const taskIds = [
      chain.taskSpec.taskId,
      chain.command.taskId,
      chain.run.taskId,
      chain.receipt.taskId,
    ];
    if (taskIds.some((value) => value !== chain.task.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "execution chain records must identify the same task",
        path: ["task", "id"],
      });
    }

    if (
      chain.run.taskSpecId !== chain.taskSpec.id ||
      chain.receipt.taskSpecId !== chain.taskSpec.id ||
      chain.receipt.agentRunId !== chain.run.id ||
      chain.receipt.commandId !== chain.command.commandId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "execution chain entity references must remain correlated",
        path: ["receipt"],
      });
    }

    if (chain.task.currentRunId && chain.task.currentRunId !== chain.run.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "execution chain run must match the task's current run",
        path: ["task", "currentRunId"],
      });
    }
    if (
      chain.receipt.providerRunId &&
      chain.run.providerRunId !== chain.receipt.providerRunId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "execution chain provider run identifiers must match",
        path: ["receipt", "providerRunId"],
      });
    }

    if (
      chain.taskSpec.idempotencyKey !== chain.task.idempotencyKey ||
      chain.taskSpec.requestBinding.schemaVersion !==
        chain.task.requestBinding.schemaVersion ||
      chain.taskSpec.requestBinding.fingerprint !==
        chain.task.requestBinding.fingerprint
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "task specification must bind the task creation request",
        path: ["taskSpec", "requestBinding"],
      });
    }

    if (
      chain.receipt.idempotencyKey !== chain.command.idempotencyKey ||
      chain.receipt.requestBinding.schemaVersion !==
        chain.command.requestBinding.schemaVersion ||
      chain.receipt.requestBinding.fingerprint !==
        chain.command.requestBinding.fingerprint
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "command receipt must bind the command replay request",
        path: ["receipt", "requestBinding"],
      });
    }

    const repositoryRefs = [chain.run.repository, chain.receipt.repository];
    if (
      repositoryRefs.some(
        (value) =>
          value.owner !== chain.taskSpec.repository.owner ||
          value.name !== chain.taskSpec.repository.name ||
          value.baseSha !== chain.taskSpec.repository.baseSha,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "execution chain must stay pinned to one repository base",
        path: ["taskSpec", "repository"],
      });
    }
  });

export type GitSha = z.infer<typeof GitShaSchema>;
export type RequestFingerprint = z.infer<typeof RequestFingerprintSchema>;
export type ReplayBinding = z.infer<typeof ReplayBindingSchema>;
export type RepositoryRef = z.infer<typeof RepositoryRefSchema>;
export type Organization = z.infer<typeof OrganizationSchema>;
export type ActorKind = z.infer<typeof ActorKindSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type CloudTaskSpec = z.infer<typeof CloudTaskSpecSchema>;
export type CloudAgentRun = z.infer<typeof CloudAgentRunSchema>;
export type RunTreeLimits = z.infer<typeof RunTreeLimitsSchema>;
export type RunTreeNode = z.infer<typeof RunTreeNodeSchema>;
export type RunTree = z.infer<typeof RunTreeSchema>;
export type RunTreeExecution = z.infer<typeof RunTreeExecutionSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type ApprovalTarget = z.infer<typeof ApprovalTargetSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type ArtifactGrant = z.infer<typeof ArtifactGrantSchema>;
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;
export type ProjectionConnectionStatus = z.infer<
  typeof ProjectionConnectionStatusSchema
>;
export type LocalProjection = z.infer<typeof LocalProjectionSchema>;
export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type GitVerification = z.infer<typeof GitVerificationSchema>;
export type FailureEvidence = z.infer<typeof FailureEvidenceSchema>;
export type CancellationEvidence = z.infer<typeof CancellationEvidenceSchema>;
export type CloudReceipt = z.infer<typeof CloudReceiptSchema>;
export type CloudExecutionChain = z.infer<typeof CloudExecutionChainSchema>;
