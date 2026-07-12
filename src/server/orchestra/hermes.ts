import { randomUUID } from "node:crypto";

import { fixtureTrunkScan } from "~/server/orchestra/fixtures";
import {
  compileOverride,
  compilePacket,
  parsePacket,
} from "~/server/orchestra/packets";
import {
  ollamaChat,
  resolveClerkModel,
  type ChatMessage,
} from "~/server/orchestra/ollama";
import { loadRegistry } from "~/server/orchestra/registry";
import { scanTrunk } from "~/server/orchestra/scan";
import type {
  ConductorOverride,
  HermesIntent,
  HermesMessage,
  TrunkScanSnapshot,
} from "~/server/orchestra/schemas";
import {
  ConductorOverrideSchema,
  DEFAULT_REGISTRY_DEFAULTS,
} from "~/server/orchestra/schemas";

export type HermesChatResult = {
  content: string;
  model: string;
  warnings: string[];
};

export type HermesLiaiseResult = {
  markdown: string;
  model: string | null;
  warnings: string[];
  deterministic: boolean;
};

/** Used when packaging clipboard notes for workers (not the open chat). */
const CLERK_SYSTEM = `You are Hermes, the local Orchestra clerk (Hermes Agent runtime + local Ollama).
You liaise between the human orchestrator and subscription workers in fenced git worktrees.
Never invent git/gh commands for the human to run when a packet will do.
When asked to package lane state, reply with markdown that includes Orchestra wire tags
([WORKTREE-SYNC-LOG], [CONDUCTOR-OVERRIDE], [PR-BRIEF], or [ORCHESTRA-MANIFEST]) and a JSON fence.
Keep summaries ≤280 chars. No cloud API keys. You do not replace the human orchestrator.`;

/** Used for the open "Talk here" chat on the desk. */
const CHAT_SYSTEM = `You are the local helper inside blossvm-orchestra.
Speak in very plain English. Short sentences. No jargon. No buzzwords.
Help the human understand their project, branches, and workers.
This runs only on their Mac. Never ask for cloud API keys.
If they need a note to copy to workers, say that simply and keep it short.
Do not invent complicated git steps when a simple next action will do.
You do not replace the human — you assist.`;

export async function hermesChat(input: {
  messages: HermesMessage[];
  model?: string;
}): Promise<HermesChatResult> {
  const warnings: string[] = [];
  let model = input.model;
  if (!model) {
    const resolved = await resolveClerkModel();
    model = resolved.model;
    warnings.push(...resolved.warnings);
  }
  const messages: ChatMessage[] = [
    { role: "system", content: CHAT_SYSTEM },
    ...input.messages,
  ];
  const result = await ollamaChat({
    model,
    messages,
  });
  return {
    content: result.content,
    model: result.model,
    warnings,
  };
}

function deterministicLaneRelay(snapshot: TrunkScanSnapshot): string {
  const planId = randomUUID();
  const blocks = snapshot.lanes.map((lane) => {
    const status =
      lane.status === "pr_open"
        ? "ready_for_review"
        : lane.status === "merged"
          ? "done"
          : lane.status === "orphaned"
            ? "blocked"
            : "progress";
    return compilePacket("sync_log", {
      schema: "orchestra.sync_log.v1",
      planId,
      workerSlug: lane.slug,
      repoSlug: snapshot.repoSlug,
      branch: lane.branch,
      status,
      summary: `Lane ${lane.slug} is ${lane.status} at ${lane.shortSha}${lane.prUrl ? ` (${lane.prUrl})` : ""}.`,
      commits: [lane.shortSha],
      filesTouched: [],
      blockers: lane.status === "orphaned" ? ["worktree missing on disk"] : [],
      nextAction:
        lane.status === "pr_open"
          ? "Review open PR"
          : lane.status === "active"
            ? "Continue work inside fence"
            : "",
      recordedAt: snapshot.scannedAt,
    });
  });

  const header = [
    `# Orchestra lane package`,
    ``,
    `Repo: **${snapshot.displayName}** (\`${snapshot.repoSlug}\`) · base \`${snapshot.baseBranch}\``,
    `Scanned: ${snapshot.scannedAt}`,
    `Lanes: ${snapshot.lanes.length}`,
    ``,
    `---`,
    ``,
  ].join("\n");

  return header + blocks.join("\n");
}

function deterministicOverride(
  snapshot: TrunkScanSnapshot,
  instruction?: string,
): string {
  const payload: ConductorOverride = ConductorOverrideSchema.parse({
    schema: "orchestra.override.v1",
    planId: randomUUID(),
    repoSlug: snapshot.repoSlug,
    target: "all",
    priority: "normal",
    instruction:
      instruction?.trim() ||
      `Hold fences. Package status for ${snapshot.lanes.length} lanes on ${snapshot.baseBranch}; no scope creep.`,
    issuedAt: new Date().toISOString(),
  });
  return compileOverride(payload);
}

async function loadSnapshot(input: {
  repoId?: string;
  useFixture?: boolean;
}): Promise<TrunkScanSnapshot> {
  if (input.useFixture || !input.repoId) {
    return fixtureTrunkScan();
  }
  return scanTrunk(input.repoId);
}

/**
 * Package lane state for clipboard. Prefer Ollama enrichment when available;
 * always fall back to deterministic valid Orchestra markdown (P4 exit safety).
 */
export async function hermesLiaise(input: {
  repoId?: string;
  useFixture?: boolean;
  intent: HermesIntent;
  instruction?: string;
}): Promise<HermesLiaiseResult> {
  const snapshot = await loadSnapshot(input);
  const warnings: string[] = [];

  let deterministicMd: string;
  if (input.intent === "draft_override") {
    deterministicMd = deterministicOverride(snapshot, input.instruction);
  } else {
    // summarize_lanes + draft_relay → lane package
    deterministicMd = deterministicLaneRelay(snapshot);
  }

  // Tests / offline CI: skip Ollama and return valid deterministic packets.
  if (process.env.ORCHESTRA_HERMES_DETERMINISTIC === "1") {
    return {
      markdown: deterministicMd,
      model: null,
      warnings: ["ORCHESTRA_HERMES_DETERMINISTIC=1"],
      deterministic: true,
    };
  }

  try {
    const resolved = await resolveClerkModel();
    warnings.push(...resolved.warnings);

    const registry = await loadRegistry().catch(() => null);
    const pinned =
      registry?.defaults.ollamaModel ?? DEFAULT_REGISTRY_DEFAULTS.ollamaModel;
    const pinBase = pinned.split(":")[0] ?? pinned;
    const activeBase = resolved.model.split(":")[0] ?? resolved.model;

    // OD1: only enrich with the pinned brain. Spare is for chat/manual; packaging
    // stays deterministic so the desk never blocks on a 27B spare pull.
    if (activeBase !== pinBase) {
      warnings.push(
        `Pin "${pinned}" not loaded — packaged deterministically. Pull gemma4:31b for clerk-enriched packets.`,
      );
      return {
        markdown: deterministicMd,
        model: resolved.model,
        warnings,
        deterministic: true,
      };
    }

    const userPrompt =
      input.intent === "draft_override"
        ? `Draft a [CONDUCTOR-OVERRIDE] packet for repo ${snapshot.repoSlug}. Lanes:\n${JSON.stringify(snapshot.lanes, null, 2)}\nInstruction hint: ${input.instruction ?? "keep fences tight"}`
        : `Package current lane state for clipboard relay. Emit one or more [WORKTREE-SYNC-LOG] JSON fences covering these lanes:\n${JSON.stringify(snapshot, null, 2)}`;

    const chat = await ollamaChat({
      model: resolved.model,
      messages: [
        { role: "system", content: CLERK_SYSTEM },
        { role: "user", content: userPrompt },
      ],
    });

    // Accept LLM output only if it parses as a valid Orchestra packet.
    try {
      parsePacket(chat.content);
      return {
        markdown: chat.content,
        model: chat.model,
        warnings,
        deterministic: false,
      };
    } catch {
      warnings.push(
        "Clerk reply was not a valid Orchestra packet; using deterministic package.",
      );
      return {
        markdown: deterministicMd,
        model: chat.model,
        warnings,
        deterministic: true,
      };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Ollama unavailable (${msg}); deterministic package used.`);
    return {
      markdown: deterministicMd,
      model: null,
      warnings,
      deterministic: true,
    };
  }
}

export async function hermesStatus(): Promise<{
  reachable: boolean;
  model: string | null;
  warnings: string[];
  pinned: string;
}> {
  const registry = await loadRegistry();
  const pinned = registry.defaults.ollamaModel;
  try {
    const resolved = await resolveClerkModel();
    return {
      reachable: true,
      model: resolved.model,
      warnings: resolved.warnings,
      pinned,
    };
  } catch {
    return {
      reachable: false,
      model: null,
      warnings: [`Ollama not reachable; pin held as ${pinned}`],
      pinned,
    };
  }
}
