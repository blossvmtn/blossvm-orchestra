import fs from "node:fs/promises";
import path from "node:path";

import { loadRegistry, saveRegistry } from "~/server/orchestra/registry";
import {
  DEFAULT_REGISTRY_DEFAULTS,
  type OrchestraRegistryDefaults,
} from "~/server/orchestra/schemas";
import { getOrchestraHome } from "~/server/orchestra/paths";

const ONBOARDING_FLAG = "onboarding-complete.json";

export type OnboardingState = {
  completedAt: string | null;
  skippedClerk: boolean;
  hermesPinned: boolean;
};

function flagPath(): string {
  return path.join(getOrchestraHome(), ONBOARDING_FLAG);
}

export async function loadOnboardingState(): Promise<OnboardingState> {
  try {
    const raw = await fs.readFile(flagPath(), "utf8");
    const parsed = JSON.parse(raw) as OnboardingState;
    return {
      completedAt: parsed.completedAt ?? null,
      skippedClerk: Boolean(parsed.skippedClerk),
      hermesPinned: Boolean(parsed.hermesPinned),
    };
  } catch {
    return { completedAt: null, skippedClerk: false, hermesPinned: false };
  }
}

export async function saveOnboardingState(
  state: OnboardingState,
): Promise<OnboardingState> {
  await fs.mkdir(getOrchestraHome(), { recursive: true });
  const file = flagPath();
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
  return state;
}

/** P5 step 2 — freeze OD1 pin in registry defaults (+ optional ~/.hermes note). */
export async function pinHermesClerk(opts?: {
  model?: string;
  baseUrl?: string;
  skip?: boolean;
}): Promise<{
  defaults: OrchestraRegistryDefaults;
  hermesNotePath: string;
  skipped: boolean;
}> {
  const registry = await loadRegistry();
  if (!opts?.skip) {
    registry.defaults = {
      ...registry.defaults,
      ollamaModel: opts?.model ?? DEFAULT_REGISTRY_DEFAULTS.ollamaModel,
      ollamaBaseUrl: opts?.baseUrl ?? DEFAULT_REGISTRY_DEFAULTS.ollamaBaseUrl,
      ollamaContextTokens: DEFAULT_REGISTRY_DEFAULTS.ollamaContextTokens,
      hermesRuntime: DEFAULT_REGISTRY_DEFAULTS.hermesRuntime,
    };
    await saveRegistry(registry);
  }

  const hermesDir = path.join(getOrchestraHome(), "hermes");
  await fs.mkdir(hermesDir, { recursive: true });
  const hermesNotePath = path.join(hermesDir, "pin.json");
  await fs.writeFile(
    hermesNotePath,
    `${JSON.stringify(
      {
        pinnedModel: registry.defaults.ollamaModel,
        baseUrl: registry.defaults.ollamaBaseUrl,
        contextTokens: registry.defaults.ollamaContextTokens,
        runtime: registry.defaults.hermesRuntime,
        skipped: Boolean(opts?.skip),
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await saveOnboardingState({
    completedAt: null,
    skippedClerk: Boolean(opts?.skip),
    hermesPinned: !opts?.skip,
  });

  return {
    defaults: registry.defaults,
    hermesNotePath,
    skipped: Boolean(opts?.skip),
  };
}

export async function completeOnboarding(input?: {
  skippedClerk?: boolean;
}): Promise<OnboardingState> {
  const prev = await loadOnboardingState();
  return saveOnboardingState({
    completedAt: new Date().toISOString(),
    skippedClerk: input?.skippedClerk ?? prev.skippedClerk,
    hermesPinned: prev.hermesPinned || !input?.skippedClerk,
  });
}
