import { describe, expect, test } from "bun:test";
import {
  ApprovalSchema,
  ArtifactGrantSchema,
  CloudAgentRunSchema,
  CloudExecutionChainSchema,
  CloudReceiptSchema,
  CloudTaskSpecSchema,
  CommandEnvelopeSchema,
  deriveProjectionFreshness,
  LocalProjectionSchema,
  ProviderCapabilitySchema,
  RunTreeExecutionSchema,
  RunTreeSchema,
  TaskSchema,
  type CloudAgentRun,
  type CloudReceipt,
} from "./cloud";

function receiptOutcomeEvidence(receipt: CloudReceipt): string {
  switch (receipt.outcome) {
    case "succeeded":
      return `${receipt.providerRunId}:${receipt.gitVerification.headSha}`;
    case "failed":
      return receipt.failure.code;
    case "cancelled":
      return receipt.cancellation.reason;
  }
}

const IDS = {
  organization: "d290f1ee-6c54-4b01-90e6-d701748f0801",
  actor: "d290f1ee-6c54-4b01-90e6-d701748f0802",
  task: "d290f1ee-6c54-4b01-90e6-d701748f0803",
  taskSpec: "d290f1ee-6c54-4b01-90e6-d701748f0804",
  workIntent: "d290f1ee-6c54-4b01-90e6-d701748f0805",
  run: "d290f1ee-6c54-4b01-90e6-d701748f0806",
  childRun: "d290f1ee-6c54-4b01-90e6-d701748f0807",
  receipt: "d290f1ee-6c54-4b01-90e6-d701748f0808",
  command: "d290f1ee-6c54-4b01-90e6-d701748f0809",
  artifact: "d290f1ee-6c54-4b01-90e6-d701748f0810",
  grant: "d290f1ee-6c54-4b01-90e6-d701748f0811",
  machine: "d290f1ee-6c54-4b01-90e6-d701748f0812",
  runTree: "d290f1ee-6c54-4b01-90e6-d701748f0813",
  providerActor: "d290f1ee-6c54-4b01-90e6-d701748f0814",
  approver: "d290f1ee-6c54-4b01-90e6-d701748f0815",
  membership: "d290f1ee-6c54-4b01-90e6-d701748f0816",
  consumption: "d290f1ee-6c54-4b01-90e6-d701748f0817",
};

const NOW = "2026-08-04T22:00:00.000Z";
const BASE_SHA = "2699856d571e96bd38ea967de4ce34556bf93791";
const HEAD_SHA = "f7887da31fe8ad58279749548d2aef19eb45dfaa";
const IDEMPOTENCY_KEY = "task:create:phone:01K1XQ2V4QNFVD24PW2H";
const TASK_REQUEST_FINGERPRINT = "b".repeat(64);
const TASK_REQUEST_BINDING = {
  schemaVersion: "cloud.task.v1",
  fingerprint: TASK_REQUEST_FINGERPRINT,
} as const;
const COMMAND_IDEMPOTENCY_KEY = "command:provider.dispatch:01K1XQ2V4QNFVD24PW2J";
const COMMAND_REQUEST_BINDING = {
  schemaVersion: "cloud.command.v1",
  fingerprint: "c".repeat(64),
} as const;
const repository = {
  owner: "blossvmtn",
  name: "blossvm-orchestra",
  baseSha: BASE_SHA,
};
const RUN_LIMITS = {
  maxNodes: 8,
  maxDepth: 3,
  maxRetriesPerRun: 1,
  maxCostUsd: 25,
} as const;

function cloudRun(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: IDS.run,
    organizationId: IDS.organization,
    taskSpecId: IDS.taskSpec,
    taskId: IDS.task,
    provider: "cursor-cloud",
    providerRunId: "bc_abc123",
    status: "running",
    authority: "provider",
    repository,
    startedAt: NOW,
    requestedAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("cloud task contracts", () => {
  test("accepts a cloud-owned task with a stable idempotency key", () => {
    expect(
      TaskSchema.safeParse({
        id: IDS.task,
        organizationId: IDS.organization,
        createdByActorId: IDS.actor,
        title: "Create the first phone-originated cloud task",
        status: "draft",
        authority: "cloud",
        idempotencyKey: IDEMPOTENCY_KEY,
        requestBinding: {
          schemaVersion: "cloud.task.v1",
          fingerprint: TASK_REQUEST_FINGERPRINT,
        },
        createdAt: NOW,
        updatedAt: NOW,
      }).success,
    ).toBe(true);
  });

  test("rejects a cloud task without a canonical replay fingerprint", () => {
    expect(
      TaskSchema.safeParse({
        id: IDS.task,
        organizationId: IDS.organization,
        createdByActorId: IDS.actor,
        title: "Create the first phone-originated cloud task",
        status: "draft",
        authority: "cloud",
        idempotencyKey: IDEMPOTENCY_KEY,
        createdAt: NOW,
        updatedAt: NOW,
      }).success,
    ).toBe(false);
  });

  test("requires an exact canonical Git SHA for cloud task specs", () => {
    const spec = {
      id: IDS.taskSpec,
      organizationId: IDS.organization,
      workIntentId: IDS.workIntent,
      taskId: IDS.task,
      slug: "cloud-task-contracts",
      branch: "agent/cloud-task-contracts",
      role: "Architecture",
      allowedPaths: ["packages/orchestra-core/**"],
      forbiddenPaths: ["apps/orchestra-cockpit/src-tauri/**"],
      acceptance: ["all core tests pass"],
      repository,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestBinding: {
        schemaVersion: "cloud.task.v1",
        fingerprint: TASK_REQUEST_FINGERPRINT,
      },
      createdAt: NOW,
    };

    expect(CloudTaskSpecSchema.safeParse(spec).success).toBe(true);
    expect(
      CloudTaskSpecSchema.safeParse({
        ...spec,
        repository: { ...repository, baseSha: "main" },
      }).success,
    ).toBe(false);
  });

  test("rejects a cloud task spec without the task replay binding", () => {
    expect(
      CloudTaskSpecSchema.safeParse({
        id: IDS.taskSpec,
        organizationId: IDS.organization,
        workIntentId: IDS.workIntent,
        taskId: IDS.task,
        slug: "cloud-task-contracts",
        branch: "agent/cloud-task-contracts",
        role: "Architecture",
        allowedPaths: ["packages/orchestra-core/**"],
        forbiddenPaths: [],
        acceptance: ["all core tests pass"],
        repository,
        idempotencyKey: IDEMPOTENCY_KEY,
        createdAt: NOW,
      }).success,
    ).toBe(false);
  });

  test("rejects cloud-owned records that omit tenant identity", () => {
    const taskSpec = {
      id: IDS.taskSpec,
      workIntentId: IDS.workIntent,
      taskId: IDS.task,
      slug: "cloud-task-contracts",
      branch: "agent/cloud-task-contracts",
      role: "Architecture",
      allowedPaths: ["packages/orchestra-core/**"],
      forbiddenPaths: [],
      acceptance: ["all core tests pass"],
      repository,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestBinding: TASK_REQUEST_BINDING,
      createdAt: NOW,
    };

    expect(CloudTaskSpecSchema.safeParse(taskSpec).success).toBe(false);
    expect(
      CloudAgentRunSchema.safeParse({
        id: IDS.run,
        taskSpecId: IDS.taskSpec,
        taskId: IDS.task,
        provider: "cursor-cloud",
        providerRunId: "bc_abc123",
        status: "running",
        authority: "provider",
        repository,
        startedAt: NOW,
        requestedAt: NOW,
        updatedAt: NOW,
      }).success,
    ).toBe(false);
    expect(
      CloudReceiptSchema.safeParse({
        id: IDS.receipt,
        agentRunId: IDS.run,
        taskId: IDS.task,
        taskSpecId: IDS.taskSpec,
        commandId: IDS.command,
        idempotencyKey: IDEMPOTENCY_KEY,
        requestBinding: TASK_REQUEST_BINDING,
        outcome: "failed",
        summary: "Provider rejected the request",
        verification: "none",
        repository,
        baseSha: BASE_SHA,
        evidence: [{ kind: "log", label: "Provider failure" }],
        failure: {
          type: "provider_error",
          code: "invalid_request",
          summary: "Provider rejected the request",
          retryable: false,
          observedAt: NOW,
        },
        createdAt: NOW,
      }).success,
    ).toBe(false);
  });
});

describe("cloud run and receipt contracts", () => {
  test("rejects tenant or replay drift across one execution chain", () => {
    const task = {
      id: IDS.task,
      organizationId: IDS.organization,
      createdByActorId: IDS.actor,
      title: "Create the first phone-originated cloud task",
      status: "running",
      authority: "cloud",
      idempotencyKey: IDEMPOTENCY_KEY,
      requestBinding: TASK_REQUEST_BINDING,
      currentRunId: IDS.run,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const taskSpec = {
      id: IDS.taskSpec,
      organizationId: IDS.organization,
      workIntentId: IDS.workIntent,
      taskId: IDS.task,
      slug: "cloud-task-contracts",
      branch: "agent/cloud-task-contracts",
      role: "Architecture",
      allowedPaths: ["packages/orchestra-core/**"],
      forbiddenPaths: [],
      acceptance: ["all core tests pass"],
      repository,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestBinding: TASK_REQUEST_BINDING,
      createdAt: NOW,
    };
    const command = {
      commandId: IDS.command,
      organizationId: IDS.organization,
      taskId: IDS.task,
      actorId: IDS.actor,
      idempotencyKey: COMMAND_IDEMPOTENCY_KEY,
      requestBinding: COMMAND_REQUEST_BINDING,
      commandType: "provider.dispatch",
      issuedAt: NOW,
    };
    const run = {
      id: IDS.run,
      organizationId: IDS.organization,
      taskSpecId: IDS.taskSpec,
      taskId: IDS.task,
      provider: "cursor-cloud",
      providerRunId: "bc_abc123",
      status: "running",
      authority: "provider",
      repository,
      startedAt: NOW,
      requestedAt: NOW,
      updatedAt: NOW,
    };
    const receipt = {
      id: IDS.receipt,
      organizationId: IDS.organization,
      agentRunId: IDS.run,
      taskId: IDS.task,
      taskSpecId: IDS.taskSpec,
      commandId: IDS.command,
      idempotencyKey: COMMAND_IDEMPOTENCY_KEY,
      requestBinding: COMMAND_REQUEST_BINDING,
      outcome: "succeeded",
      summary: "Provider returned a verified commit",
      verification: "none",
      providerRunId: "bc_abc123",
      repository,
      baseSha: BASE_SHA,
      commitSha: HEAD_SHA,
      branch: "cursor/cloud-task-contracts-1234",
      evidence: [
        { kind: "commit", label: "Provider commit", sha: HEAD_SHA },
        { kind: "check", label: "GitHub checks passed" },
      ],
      gitVerification: {
        baseSha: BASE_SHA,
        headSha: HEAD_SHA,
        ancestry: "verified",
        checks: "passed",
        verifiedAt: NOW,
      },
      createdAt: NOW,
    };
    const chain = { task, taskSpec, command, run, receipt };

    expect(CloudExecutionChainSchema.safeParse(chain).success).toBe(true);
    expect(
      CloudExecutionChainSchema.safeParse({
        ...chain,
        taskSpec: { ...taskSpec, organizationId: IDS.providerActor },
      }).success,
    ).toBe(false);
    expect(
      CloudExecutionChainSchema.safeParse({
        ...chain,
        task: { ...task, currentRunId: IDS.childRun },
      }).success,
    ).toBe(false);
    expect(
      CloudExecutionChainSchema.safeParse({
        ...chain,
        receipt: { ...receipt, providerRunId: "bc_different" },
      }).success,
    ).toBe(false);
    expect(
      CloudExecutionChainSchema.safeParse({
        ...chain,
        receipt: {
          ...receipt,
          requestBinding: {
            ...COMMAND_REQUEST_BINDING,
            fingerprint: "d".repeat(64),
          },
        },
      }).success,
    ).toBe(false);
  });

  test("requires commands to bind retries to canonical request bytes", () => {
    const command = {
      commandId: IDS.command,
      organizationId: IDS.organization,
      taskId: IDS.task,
      actorId: IDS.actor,
      idempotencyKey: IDEMPOTENCY_KEY,
      commandType: "provider.dispatch",
      issuedAt: NOW,
    };

    expect(CommandEnvelopeSchema.safeParse(command).success).toBe(false);
    expect(
      CommandEnvelopeSchema.safeParse({
        ...command,
        requestBinding: {
          schemaVersion: "cloud.task.v1",
          fingerprint: TASK_REQUEST_FINGERPRINT,
        },
      }).success,
    ).toBe(true);
  });

  test("normalizes a Cursor cloud run without giving the provider cloud authority", () => {
    expect(
      CloudAgentRunSchema.safeParse({
        id: IDS.run,
        organizationId: IDS.organization,
        taskSpecId: IDS.taskSpec,
        taskId: IDS.task,
        provider: "cursor-cloud",
        providerRunId: "bc_abc123",
        status: "waiting_for_input",
        authority: "provider",
        repository,
        startedAt: NOW,
        requestedAt: NOW,
        updatedAt: NOW,
      }).success,
    ).toBe(true);
  });

  test("requires command correlation and repository evidence on a cloud receipt", () => {
    const receipt = {
      id: IDS.receipt,
      organizationId: IDS.organization,
      agentRunId: IDS.run,
      taskId: IDS.task,
      taskSpecId: IDS.taskSpec,
      commandId: IDS.command,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestBinding: TASK_REQUEST_BINDING,
      outcome: "succeeded",
      summary: "Cursor returned an inspectable commit without opening a PR",
      verification: "none",
      providerRunId: "bc_abc123",
      repository,
      baseSha: BASE_SHA,
      commitSha: HEAD_SHA,
      branch: "cursor/cloud-task-contracts-1234",
      evidence: [
        { kind: "commit", label: "Provider commit", sha: HEAD_SHA },
        {
          kind: "branch",
          label: "Provider branch",
          url: "https://github.com/blossvmtn/blossvm-orchestra/tree/cursor/cloud-task-contracts-1234",
        },
      ],
      gitVerification: {
        baseSha: BASE_SHA,
        headSha: HEAD_SHA,
        ancestry: "verified",
        checks: "passed",
        verifiedAt: NOW,
      },
      createdAt: NOW,
    };

    expect(CloudReceiptSchema.safeParse(receipt).success).toBe(false);
    const receiptWithChecks = {
      ...receipt,
      evidence: [
        ...receipt.evidence,
        {
          kind: "check",
          label: "GitHub checks passed",
          url: "https://github.com/blossvmtn/blossvm-orchestra/actions/runs/32",
        },
      ],
    };
    const succeeded = CloudReceiptSchema.parse(receiptWithChecks);
    expect(receiptOutcomeEvidence(succeeded)).toBe(`bc_abc123:${HEAD_SHA}`);
    expect(
      CloudReceiptSchema.safeParse({ ...receiptWithChecks, baseSha: HEAD_SHA })
        .success,
    ).toBe(false);
    expect(
      CloudReceiptSchema.safeParse({
        ...receiptWithChecks,
        providerRunId: undefined,
        commitSha: undefined,
        branch: undefined,
        evidence: [],
      }).success,
    ).toBe(false);
    expect(
      CloudReceiptSchema.safeParse({
        ...receiptWithChecks,
        evidence: receipt.evidence,
        gitVerification: {
          ...receiptWithChecks.gitVerification,
          checks: "not_required",
        },
      }).success,
    ).toBe(true);
  });

  test("requires failed cloud receipts to carry structured failure evidence", () => {
    const receipt = {
      id: IDS.receipt,
      organizationId: IDS.organization,
      agentRunId: IDS.run,
      taskId: IDS.task,
      taskSpecId: IDS.taskSpec,
      commandId: IDS.command,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestBinding: TASK_REQUEST_BINDING,
      outcome: "failed",
      summary: "Provider rejected the request",
      verification: "none",
      repository,
      baseSha: BASE_SHA,
      evidence: [{ kind: "log", label: "Provider failure" }],
      createdAt: NOW,
    };

    expect(CloudReceiptSchema.safeParse(receipt).success).toBe(false);
    const failed = CloudReceiptSchema.parse({
      ...receipt,
      failure: {
        type: "provider_error",
        code: "invalid_request",
        summary: "Provider rejected the request",
        retryable: false,
        observedAt: NOW,
      },
    });
    expect(receiptOutcomeEvidence(failed)).toBe("invalid_request");
  });

  test("requires cancelled cloud receipts to identify the human cancellation request", () => {
    const receipt = {
      id: IDS.receipt,
      organizationId: IDS.organization,
      agentRunId: IDS.run,
      taskId: IDS.task,
      taskSpecId: IDS.taskSpec,
      commandId: IDS.command,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestBinding: TASK_REQUEST_BINDING,
      outcome: "cancelled",
      summary: "Owner cancelled the provider run",
      verification: "none",
      providerRunId: "bc_abc123",
      repository,
      baseSha: BASE_SHA,
      evidence: [{ kind: "log", label: "Provider cancellation" }],
      createdAt: NOW,
    };

    expect(CloudReceiptSchema.safeParse(receipt).success).toBe(false);
    const cancelled = CloudReceiptSchema.parse({
      ...receipt,
      cancellation: {
        requestedByActorId: IDS.approver,
        reason: "Run no longer matches the approved task",
        providerStatus: "cancelled",
        observedAt: NOW,
      },
    });
    expect(receiptOutcomeEvidence(cancelled)).toBe(
      "Run no longer matches the approved task",
    );
  });

  test("rejects evidence fields from a different receipt outcome", () => {
    const failure = {
      type: "provider_error",
      code: "invalid_request",
      summary: "Provider rejected the request",
      retryable: false,
      observedAt: NOW,
    } as const;
    const cancellation = {
      requestedByActorId: IDS.approver,
      reason: "Owner stopped the run",
      providerStatus: "cancelled",
      observedAt: NOW,
    };
    const receipt = {
      id: IDS.receipt,
      organizationId: IDS.organization,
      agentRunId: IDS.run,
      taskId: IDS.task,
      taskSpecId: IDS.taskSpec,
      commandId: IDS.command,
      idempotencyKey: IDEMPOTENCY_KEY,
      requestBinding: TASK_REQUEST_BINDING,
      summary: "Provider ended without a code result",
      verification: "none",
      repository,
      baseSha: BASE_SHA,
      evidence: [{ kind: "log", label: "Provider terminal status" }],
      createdAt: NOW,
    };

    expect(
      CloudReceiptSchema.safeParse({
        outcome: "failed",
        failure,
        cancellation,
        ...receipt,
      }).success,
    ).toBe(false);
    expect(
      CloudReceiptSchema.safeParse({
        outcome: "cancelled",
        cancellation,
        failure,
        ...receipt,
      }).success,
    ).toBe(false);
  });

  test("rejects a cloud receipt that is not bound to the command request bytes", () => {
    expect(
      CloudReceiptSchema.safeParse({
        id: IDS.receipt,
        organizationId: IDS.organization,
        agentRunId: IDS.run,
        taskId: IDS.task,
        taskSpecId: IDS.taskSpec,
        commandId: IDS.command,
        idempotencyKey: IDEMPOTENCY_KEY,
        outcome: "failed",
        summary: "Provider rejected the request",
        verification: "none",
        repository,
        baseSha: BASE_SHA,
        evidence: [{ kind: "log", label: "Provider failure" }],
        failure: {
          type: "provider_error",
          code: "invalid_request",
          summary: "Provider rejected the request",
          retryable: false,
          observedAt: NOW,
        },
        createdAt: NOW,
      }).success,
    ).toBe(false);
  });
});

describe("run trees and human authority", () => {
  test("accepts a bounded run tree", () => {
    expect(
      RunTreeSchema.safeParse({
        id: IDS.runTree,
        organizationId: IDS.organization,
        taskId: IDS.task,
        rootRunId: IDS.run,
        limits: RUN_LIMITS,
        nodes: [
          {
            runId: IDS.run,
            organizationId: IDS.organization,
            taskId: IDS.task,
            relationship: "root",
            costUsd: 2,
            createdAt: NOW,
          },
          {
            runId: IDS.childRun,
            organizationId: IDS.organization,
            taskId: IDS.task,
            parentRunId: IDS.run,
            relationship: "delegated",
            costUsd: 3,
            createdAt: NOW,
          },
        ],
      }).success,
    ).toBe(true);
  });

  test("rejects a child whose parent is outside the bounded tree", () => {
    expect(
      RunTreeSchema.safeParse({
        id: IDS.runTree,
        organizationId: IDS.organization,
        taskId: IDS.task,
        rootRunId: IDS.run,
        limits: RUN_LIMITS,
        nodes: [
          {
            runId: IDS.run,
            organizationId: IDS.organization,
            taskId: IDS.task,
            relationship: "root",
            costUsd: 2,
            createdAt: NOW,
          },
          {
            runId: IDS.childRun,
            organizationId: IDS.organization,
            taskId: IDS.task,
            parentRunId: IDS.actor,
            relationship: "delegated",
            costUsd: 3,
            createdAt: NOW,
          },
        ],
      }).success,
    ).toBe(false);
  });

  test("rejects cycles disconnected from the authorized root", () => {
    expect(
      RunTreeSchema.safeParse({
        id: IDS.runTree,
        organizationId: IDS.organization,
        taskId: IDS.task,
        rootRunId: IDS.run,
        limits: RUN_LIMITS,
        nodes: [
          {
            runId: IDS.run,
            organizationId: IDS.organization,
            taskId: IDS.task,
            relationship: "root",
            costUsd: 2,
            createdAt: NOW,
          },
          {
            runId: IDS.childRun,
            organizationId: IDS.organization,
            taskId: IDS.task,
            parentRunId: IDS.receipt,
            relationship: "delegated",
            costUsd: 3,
            createdAt: NOW,
          },
          {
            runId: IDS.receipt,
            organizationId: IDS.organization,
            taskId: IDS.task,
            parentRunId: IDS.childRun,
            relationship: "retry",
            costUsd: 3,
            createdAt: NOW,
          },
        ],
      }).success,
    ).toBe(false);
  });

  test("rejects run trees that cross tenant or task boundaries", () => {
    expect(
      RunTreeSchema.safeParse({
        id: IDS.runTree,
        organizationId: IDS.organization,
        taskId: IDS.task,
        rootRunId: IDS.run,
        limits: RUN_LIMITS,
        nodes: [
          {
            runId: IDS.run,
            organizationId: IDS.organization,
            taskId: IDS.task,
            relationship: "root",
            costUsd: 2,
            createdAt: NOW,
          },
          {
            runId: IDS.childRun,
            organizationId: IDS.actor,
            taskId: IDS.taskSpec,
            parentRunId: IDS.run,
            relationship: "delegated",
            costUsd: 3,
            createdAt: NOW,
          },
        ],
      }).success,
    ).toBe(false);
  });

  test("binds run-tree nodes to the tenant and task on actual run records", () => {
    const tree = {
      id: IDS.runTree,
      organizationId: IDS.organization,
      taskId: IDS.task,
      rootRunId: IDS.run,
      limits: RUN_LIMITS,
      nodes: [
        {
          runId: IDS.run,
          organizationId: IDS.organization,
          taskId: IDS.task,
          relationship: "root",
          costUsd: 2,
          createdAt: NOW,
        },
      ],
    } as const;

    expect(
      RunTreeExecutionSchema.safeParse({ tree, runs: [cloudRun()] }).success,
    ).toBe(true);
    expect(
      RunTreeExecutionSchema.safeParse({
        tree,
        runs: [cloudRun({ organizationId: IDS.providerActor })],
      }).success,
    ).toBe(false);
    expect(
      RunTreeExecutionSchema.safeParse({
        tree,
        runs: [cloudRun({ costUsd: 1_000 })],
      }).success,
    ).toBe(false);
    expect(RunTreeExecutionSchema.safeParse({ tree, runs: [] }).success).toBe(
      false,
    );
  });

  test("rejects run trees that exceed retry or cost limits", () => {
    const nodes = [
      {
        runId: IDS.run,
        organizationId: IDS.organization,
        taskId: IDS.task,
        relationship: "root",
        costUsd: 6,
        createdAt: NOW,
      },
      {
        runId: IDS.childRun,
        organizationId: IDS.organization,
        taskId: IDS.task,
        parentRunId: IDS.run,
        relationship: "retry",
        costUsd: 6,
        createdAt: NOW,
      },
      {
        runId: IDS.receipt,
        organizationId: IDS.organization,
        taskId: IDS.task,
        parentRunId: IDS.run,
        relationship: "retry",
        costUsd: 6,
        createdAt: NOW,
      },
    ];

    expect(
      RunTreeSchema.safeParse({
        id: IDS.runTree,
        organizationId: IDS.organization,
        taskId: IDS.task,
        rootRunId: IDS.run,
        limits: {
          ...RUN_LIMITS,
          maxDepth: 1,
          maxRetriesPerRun: 1,
          maxCostUsd: 10,
        },
        nodes,
      }).success,
    ).toBe(false);
    expect(
      RunTreeSchema.safeParse({
        id: IDS.runTree,
        organizationId: IDS.organization,
        taskId: IDS.task,
        rootRunId: IDS.run,
        limits: { ...RUN_LIMITS, maxCostUsd: Number.POSITIVE_INFINITY },
        nodes: [nodes[0]],
      }).success,
    ).toBe(false);
  });

  test("rejects run trees that exceed node or depth limits", () => {
    const nodes = [
      {
        runId: IDS.run,
        organizationId: IDS.organization,
        taskId: IDS.task,
        relationship: "root",
        costUsd: 1,
        createdAt: NOW,
      },
      {
        runId: IDS.childRun,
        organizationId: IDS.organization,
        taskId: IDS.task,
        parentRunId: IDS.run,
        relationship: "delegated",
        costUsd: 1,
        createdAt: NOW,
      },
      {
        runId: IDS.receipt,
        organizationId: IDS.organization,
        taskId: IDS.task,
        parentRunId: IDS.childRun,
        relationship: "follow_up",
        costUsd: 1,
        createdAt: NOW,
      },
    ];

    expect(
      RunTreeSchema.safeParse({
        id: IDS.runTree,
        organizationId: IDS.organization,
        taskId: IDS.task,
        rootRunId: IDS.run,
        limits: { ...RUN_LIMITS, maxNodes: 2, maxDepth: 1 },
        nodes,
      }).success,
    ).toBe(false);
  });

  test("rejects resolved approvals without an independent decision actor", () => {
    const approval = {
      id: IDS.grant,
      organizationId: IDS.organization,
      taskId: IDS.task,
      requestedByActorId: IDS.actor,
      kind: "promotion",
      status: "approved",
      target: {
        type: "promotion",
        repository,
        headSha: HEAD_SHA,
        branch: "cursor/cloud-task-contracts-1234",
      },
      requestedAt: NOW,
    };

    expect(ApprovalSchema.safeParse(approval).success).toBe(false);
    expect(
      ApprovalSchema.safeParse({
        ...approval,
        decidedByActorId: IDS.actor,
        decidedByActorKind: "human",
        decidedByOrganizationId: IDS.organization,
        decisionMembershipId: IDS.membership,
        decidedAt: NOW,
      }).success,
    ).toBe(false);
  });

  test("distinguishes system expiry from accountable human revocation", () => {
    const approval = {
      id: IDS.grant,
      organizationId: IDS.organization,
      taskId: IDS.task,
      requestedByActorId: IDS.actor,
      kind: "dispatch",
      target: { type: "dispatch", taskSpecId: IDS.taskSpec },
      requestedAt: NOW,
    };

    expect(
      ApprovalSchema.safeParse({
        ...approval,
        status: "expired",
        expiresAt: "2026-08-04T23:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      ApprovalSchema.safeParse({ ...approval, status: "expired" }).success,
    ).toBe(false);
    expect(
      ApprovalSchema.safeParse({ ...approval, status: "revoked" }).success,
    ).toBe(false);
    expect(
      ApprovalSchema.safeParse({
        ...approval,
        status: "revoked",
        revokedByActorId: IDS.approver,
        revokedByActorKind: "human",
        revokedByOrganizationId: IDS.organization,
        revocationMembershipId: IDS.membership,
        revokedAt: "2026-08-04T22:30:00.000Z",
        revocationReason: "Owner withdrew dispatch authority",
      }).success,
    ).toBe(true);
  });

  test("accepts a human promotion approval bound to exact Git evidence", () => {
    expect(
      ApprovalSchema.safeParse({
        id: IDS.grant,
        organizationId: IDS.organization,
        taskId: IDS.task,
        requestedByActorId: IDS.actor,
        kind: "promotion",
        status: "approved",
        target: {
          type: "promotion",
          repository,
          headSha: HEAD_SHA,
          branch: "cursor/cloud-task-contracts-1234",
          pullRequestNumber: 11,
        },
        decidedByActorId: IDS.approver,
        decidedByActorKind: "human",
        decidedByOrganizationId: IDS.organization,
        decisionMembershipId: IDS.membership,
        requestedAt: NOW,
        decidedAt: NOW,
      }).success,
    ).toBe(true);
  });

  test("requires approval consumption to be a complete one-time command binding", () => {
    const approval = {
      id: IDS.grant,
      organizationId: IDS.organization,
      taskId: IDS.task,
      requestedByActorId: IDS.actor,
      kind: "promotion",
      status: "approved",
      target: {
        type: "promotion",
        repository,
        headSha: HEAD_SHA,
        branch: "cursor/cloud-task-contracts-1234",
      },
      decidedByActorId: IDS.approver,
      decidedByActorKind: "human",
      decidedByOrganizationId: IDS.organization,
      decisionMembershipId: IDS.membership,
      requestedAt: NOW,
      decidedAt: NOW,
    };

    expect(
      ApprovalSchema.safeParse({
        ...approval,
        consumptionId: IDS.consumption,
      }).success,
    ).toBe(false);
    expect(
      ApprovalSchema.safeParse({
        ...approval,
        consumptionId: IDS.consumption,
        consumedByCommandId: IDS.command,
        consumedAt: "2026-08-04T22:01:00.000Z",
      }).success,
    ).toBe(true);
  });

  test("rejects an approval whose kind or deciding organization drifts", () => {
    const approval = {
      id: IDS.receipt,
      organizationId: IDS.organization,
      taskId: IDS.task,
      requestedByActorId: IDS.actor,
      kind: "promotion",
      status: "approved",
      target: {
        type: "promotion",
        repository,
        headSha: HEAD_SHA,
        branch: "agent/cloud-task-contracts",
      },
      decidedByActorId: IDS.approver,
      decidedByActorKind: "human",
      decidedByOrganizationId: IDS.organization,
      decisionMembershipId: IDS.membership,
      requestedAt: NOW,
      decidedAt: "2026-08-04T22:00:30.000Z",
    } as const;

    expect(
      ApprovalSchema.safeParse({ ...approval, kind: "dispatch" }).success,
    ).toBe(false);
    expect(
      ApprovalSchema.safeParse({
        ...approval,
        decidedByOrganizationId: IDS.providerActor,
      }).success,
    ).toBe(false);
  });

  test("orders approval decision, expiry, and consumption instants", () => {
    const approval = {
      id: IDS.receipt,
      organizationId: IDS.organization,
      taskId: IDS.task,
      requestedByActorId: IDS.actor,
      kind: "promotion",
      status: "approved",
      target: {
        type: "promotion",
        repository,
        headSha: HEAD_SHA,
        branch: "agent/cloud-task-contracts",
      },
      decidedByActorId: IDS.approver,
      decidedByActorKind: "human",
      decidedByOrganizationId: IDS.organization,
      decisionMembershipId: IDS.membership,
      requestedAt: "2026-08-04T22:00:00.000Z",
      decidedAt: "2026-08-04T22:01:00.000Z",
      expiresAt: "2026-08-04T22:02:00.000Z",
    } as const;

    expect(ApprovalSchema.safeParse(approval).success).toBe(true);
    expect(
      ApprovalSchema.safeParse({
        ...approval,
        decidedAt: "2026-08-04T21:59:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      ApprovalSchema.safeParse({
        ...approval,
        expiresAt: "2026-08-04T21:59:00.000Z",
      }).success,
    ).toBe(false);
  });

  test("rejects an unbounded budget exception", () => {
    expect(
      ApprovalSchema.safeParse({
        id: IDS.grant,
        organizationId: IDS.organization,
        taskId: IDS.task,
        requestedByActorId: IDS.actor,
        kind: "budget_exception",
        status: "pending",
        target: {
          type: "budget_exception",
          currency: "USD",
          amountUsd: Number.POSITIVE_INFINITY,
        },
        requestedAt: NOW,
      }).success,
    ).toBe(false);
  });
});

describe("grants, capabilities, and freshness", () => {
  test("represents an expiring task-scoped artifact grant", () => {
    expect(
      ArtifactGrantSchema.safeParse({
        id: IDS.grant,
        organizationId: IDS.organization,
        taskId: IDS.task,
        artifactId: IDS.artifact,
        grantedByActorId: IDS.actor,
        grantedToActorId: IDS.providerActor,
        operations: ["read", "download"],
        storageKey: `${IDS.organization}/${IDS.task}/${IDS.artifact}`,
        sha256: "a".repeat(64),
        mediaType: "text/markdown",
        sizeBytes: 2048,
        createdAt: NOW,
        expiresAt: "2026-08-05T22:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  test("orders artifact grant instants instead of ISO string precision", () => {
    expect(
      ArtifactGrantSchema.safeParse({
        id: IDS.grant,
        organizationId: IDS.organization,
        taskId: IDS.task,
        artifactId: IDS.artifact,
        grantedByActorId: IDS.actor,
        grantedToActorId: IDS.providerActor,
        operations: ["read"],
        storageKey: `${IDS.organization}/${IDS.task}/${IDS.artifact}`,
        sha256: "a".repeat(64),
        mediaType: "text/markdown",
        sizeBytes: 2048,
        createdAt: "2026-08-04T22:00:00Z",
        expiresAt: "2026-08-04T22:00:00.001Z",
      }).success,
    ).toBe(true);
  });

  test("records accountable artifact revocation inside the grant lifetime", () => {
    const grant = {
      id: IDS.grant,
      organizationId: IDS.organization,
      taskId: IDS.task,
      artifactId: IDS.artifact,
      grantedByActorId: IDS.actor,
      grantedToActorId: IDS.providerActor,
      operations: ["read"],
      storageKey: `${IDS.organization}/${IDS.task}/${IDS.artifact}`,
      sha256: "a".repeat(64),
      mediaType: "text/markdown",
      sizeBytes: 2048,
      createdAt: NOW,
      expiresAt: "2026-08-04T23:00:00.000Z",
      revocation: {
        revokedAt: "2026-08-04T22:30:00.000Z",
        revokedByActorId: IDS.actor,
        reason: "Provider access no longer required",
      },
    };

    expect(ArtifactGrantSchema.safeParse(grant).success).toBe(true);
    expect(
      ArtifactGrantSchema.safeParse({
        ...grant,
        revocation: {
          ...grant.revocation,
          revokedAt: "2026-08-05T00:00:00.000Z",
        },
      }).success,
    ).toBe(false);
  });

  test("records Cursor capabilities as verified facts rather than assumptions", () => {
    expect(
      ProviderCapabilitySchema.safeParse({
        provider: "cursor-cloud",
        authModels: ["user_api_key", "service_account"],
        constraints: [
          "Service accounts require Cursor Enterprise; the first slice uses an owner-held user API key.",
        ],
        launch: "beta",
        exactBaseSha: "beta",
        followUp: "beta",
        cancellation: "beta",
        statusPolling: "beta",
        eventStream: "beta",
        webhooks: "unsupported",
        artifacts: "beta",
        usage: "beta",
        pullRequests: "beta",
        structuredOutput: "unknown",
        userQuestions: "beta",
        approvals: "unknown",
        verifiedAt: NOW,
        sourceUrl: "https://cursor.com/docs/cloud-agent/api/endpoints",
      }).success,
    ).toBe(true);
  });

  test("labels offline local truth without claiming cloud mutation authority", () => {
    expect(
      LocalProjectionSchema.safeParse({
        id: IDS.receipt,
        organizationId: IDS.organization,
        machineId: IDS.machine,
        resourceType: "repository",
        resourceId: "blossvmtn/blossvm-orchestra",
        authority: "local_daemon",
        connectionStatus: "offline",
        observedAt: NOW,
        staleAfter: "2026-08-04T22:05:00.000Z",
        payload: { branch: "main", dirty: false },
      }).success,
    ).toBe(true);
  });

  test("derives projection freshness at read time", () => {
    const projection = LocalProjectionSchema.parse({
      id: IDS.receipt,
      organizationId: IDS.organization,
      machineId: IDS.machine,
      resourceType: "repository",
      resourceId: "blossvmtn/blossvm-orchestra",
      authority: "local_daemon",
      connectionStatus: "online",
      observedAt: NOW,
      staleAfter: "2026-08-04T22:05:00.000Z",
      payload: { branch: "main", dirty: false },
    });

    expect(
      deriveProjectionFreshness(projection, "2026-08-04T22:04:00.000Z"),
    ).toBe("fresh");
    expect(
      deriveProjectionFreshness(projection, "2026-08-04T22:06:00.000Z"),
    ).toBe("stale");
    expect(
      deriveProjectionFreshness(
        { ...projection, connectionStatus: "offline" },
        NOW,
      ),
    ).toBe("offline");
    expect(
      deriveProjectionFreshness(
        { ...projection, connectionStatus: "unknown" },
        NOW,
      ),
    ).toBe("unknown");
    expect(() => deriveProjectionFreshness(projection, "not-a-time")).toThrow();
  });
});
