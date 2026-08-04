import { describe, expect, test } from "bun:test";
import {
  ApprovalSchema,
  ArtifactGrantSchema,
  CloudAgentRunSchema,
  CloudReceiptSchema,
  CloudTaskSpecSchema,
  LocalProjectionSchema,
  ProviderCapabilitySchema,
  RunTreeSchema,
  TaskSchema,
} from "./cloud";

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
};

const NOW = "2026-08-04T22:00:00.000Z";
const BASE_SHA = "2699856d571e96bd38ea967de4ce34556bf93791";
const HEAD_SHA = "f7887da31fe8ad58279749548d2aef19eb45dfaa";
const IDEMPOTENCY_KEY = "task:create:phone:01K1XQ2V4QNFVD24PW2H";
const repository = {
  owner: "blossvmtn",
  name: "blossvm-orchestra",
  baseSha: BASE_SHA,
};

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
        createdAt: NOW,
        updatedAt: NOW,
      }).success,
    ).toBe(true);
  });

  test("requires an exact canonical Git SHA for cloud task specs", () => {
    const spec = {
      id: IDS.taskSpec,
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
});

describe("cloud run and receipt contracts", () => {
  test("normalizes a Cursor cloud run without giving the provider cloud authority", () => {
    expect(
      CloudAgentRunSchema.safeParse({
        id: IDS.run,
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
      agentRunId: IDS.run,
      taskSpecId: IDS.taskSpec,
      commandId: IDS.command,
      idempotencyKey: IDEMPOTENCY_KEY,
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
      createdAt: NOW,
    };

    expect(CloudReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(
      CloudReceiptSchema.safeParse({ ...receipt, baseSha: HEAD_SHA }).success,
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
        nodes: [
          { runId: IDS.run, relationship: "root", createdAt: NOW },
          {
            runId: IDS.childRun,
            parentRunId: IDS.run,
            relationship: "delegated",
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
        nodes: [
          { runId: IDS.run, relationship: "root", createdAt: NOW },
          {
            runId: IDS.childRun,
            parentRunId: IDS.actor,
            relationship: "delegated",
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
        nodes: [
          { runId: IDS.run, relationship: "root", createdAt: NOW },
          {
            runId: IDS.childRun,
            parentRunId: IDS.receipt,
            relationship: "delegated",
            createdAt: NOW,
          },
          {
            runId: IDS.receipt,
            parentRunId: IDS.childRun,
            relationship: "retry",
            createdAt: NOW,
          },
        ],
      }).success,
    ).toBe(false);
  });

  test("rejects a resolved approval without a deciding human record", () => {
    const approval = {
      id: IDS.grant,
      organizationId: IDS.organization,
      taskId: IDS.task,
      requestedByActorId: IDS.actor,
      kind: "promotion",
      status: "approved",
      scope: `promote ${HEAD_SHA}`,
      requestedAt: NOW,
    };

    expect(ApprovalSchema.safeParse(approval).success).toBe(false);
    expect(
      ApprovalSchema.safeParse({
        ...approval,
        decidedByActorId: IDS.actor,
        decidedAt: NOW,
      }).success,
    ).toBe(true);
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
        freshness: "offline",
        observedAt: NOW,
        staleAfter: "2026-08-04T22:05:00.000Z",
        payload: { branch: "main", dirty: false },
      }).success,
    ).toBe(true);
  });
});
