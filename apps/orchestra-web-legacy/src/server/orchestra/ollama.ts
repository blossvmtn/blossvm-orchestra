import { loadRegistry } from "~/server/orchestra/registry";
import { DEFAULT_REGISTRY_DEFAULTS } from "~/server/orchestra/schemas";

export class OllamaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatResult = {
  content: string;
  model: string;
};

type OllamaTags = {
  models?: Array<{ name: string }>;
};

function modelBaseName(name: string): string {
  return name.split(":")[0] ?? name;
}

/** List local Ollama model tags (no API key). */
export async function listOllamaModels(
  baseUrl = DEFAULT_REGISTRY_DEFAULTS.ollamaBaseUrl,
): Promise<string[]> {
  const root = baseUrl.replace(/\/v1\/?$/, "");
  const res = await fetch(`${root}/api/tags`, {
    method: "GET",
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) {
    throw new OllamaError(`Ollama tags failed: HTTP ${res.status}`, res.status);
  }
  const body = (await res.json()) as OllamaTags;
  return (body.models ?? []).map((m) => m.name);
}

/**
 * OD1: prefer pinned gemma4:31b; spare qwen only if pin missing.
 * Returns the concrete tag string Ollama expects.
 */
export async function resolveClerkModel(opts?: {
  baseUrl?: string;
  pinned?: string;
  spare?: string[];
}): Promise<{ model: string; warnings: string[] }> {
  const registry = await loadRegistry().catch(() => null);
  const defaults = registry?.defaults ?? DEFAULT_REGISTRY_DEFAULTS;
  const baseUrl = opts?.baseUrl ?? defaults.ollamaBaseUrl;
  const pinned = opts?.pinned ?? defaults.ollamaModel;
  const spare = opts?.spare ?? defaults.spareModels;
  const warnings: string[] = [];

  const available = await listOllamaModels(baseUrl);
  const exact = (want: string) =>
    available.find((a) => a === want || modelBaseName(a) === modelBaseName(want));

  const pinHit = exact(pinned);
  if (pinHit) {
    return { model: pinHit, warnings };
  }

  for (const s of spare) {
    const hit = exact(s);
    if (hit) {
      warnings.push(
        `Pinned clerk model "${pinned}" not found locally; using spare "${hit}". Pull gemma4:31b to satisfy OD1.`,
      );
      return { model: hit, warnings };
    }
  }

  if (available[0]) {
    warnings.push(
      `Neither pin "${pinned}" nor spares available; using first local model "${available[0]}".`,
    );
    return { model: available[0], warnings };
  }

  throw new OllamaError(
    `No Ollama models found at ${baseUrl}. Pull gemma4:31b (OD1 pin).`,
  );
}

/** OpenAI-compatible chat completions against local Ollama. */
export async function ollamaChat(input: {
  baseUrl?: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}): Promise<ChatResult> {
  const registry = await loadRegistry().catch(() => null);
  const baseUrl =
    input.baseUrl ??
    registry?.defaults.ollamaBaseUrl ??
    DEFAULT_REGISTRY_DEFAULTS.ollamaBaseUrl;

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      stream: false,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OllamaError(
      `Ollama chat failed: HTTP ${res.status} ${text.slice(0, 200)}`,
      res.status,
    );
  }

  const body = (await res.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new OllamaError("Ollama returned empty chat content");
  }
  return { content, model: body.model ?? input.model };
}
