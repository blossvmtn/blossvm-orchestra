import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { listOllamaModels } from "~/server/orchestra/ollama";
import { loadRegistry } from "~/server/orchestra/registry";
import { DEFAULT_REGISTRY_DEFAULTS } from "~/server/orchestra/schemas";

const execFileAsync = promisify(execFile);

export type DetectResult = {
  git: { ok: boolean; version: string | null };
  gh: { ok: boolean; version: string | null; authenticated: boolean };
  cursor: { ok: boolean; path: string | null };
  ollama: {
    ok: boolean;
    baseUrl: string;
    models: string[];
    pinPresent: boolean;
    pinned: string;
  };
  readyForOnboarding: boolean;
};

async function whichVersion(bin: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(bin, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    return stdout.trim().split("\n")[0] ?? null;
  } catch {
    return null;
  }
}

async function ghAuthenticated(): Promise<boolean> {
  try {
    await execFileAsync("gh", ["auth", "status"], {
      encoding: "utf8",
      timeout: 8_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function detectCursorPath(): Promise<string | null> {
  const candidates = [
    "/Applications/Cursor.app",
    path.join(os.homedir(), "Applications", "Cursor.app"),
    process.env.CURSOR_PATH,
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // continue
    }
  }

  try {
    const { stdout } = await execFileAsync("which", ["cursor"], {
      encoding: "utf8",
      timeout: 3_000,
    });
    const hit = stdout.trim();
    return hit.length > 0 ? hit : null;
  } catch {
    return null;
  }
}

/** P5 step 1 — detect git, gh, Cursor, Ollama (no API keys). */
export async function detectEnvironment(): Promise<DetectResult> {
  const registry = await loadRegistry().catch(() => null);
  const pinned =
    registry?.defaults.ollamaModel ?? DEFAULT_REGISTRY_DEFAULTS.ollamaModel;
  const baseUrl =
    registry?.defaults.ollamaBaseUrl ?? DEFAULT_REGISTRY_DEFAULTS.ollamaBaseUrl;

  const [gitVer, ghVer, cursorPath, auth] = await Promise.all([
    whichVersion("git"),
    whichVersion("gh"),
    detectCursorPath(),
    ghAuthenticated(),
  ]);

  let models: string[] = [];
  let ollamaOk = false;
  try {
    models = await listOllamaModels(baseUrl);
    ollamaOk = true;
  } catch {
    ollamaOk = false;
  }

  const pinPresent = models.some(
    (m) => m === pinned || m.split(":")[0] === pinned.split(":")[0],
  );

  const gitOk = Boolean(gitVer);
  const ghOk = Boolean(ghVer);

  return {
    git: { ok: gitOk, version: gitVer },
    gh: { ok: ghOk, version: ghVer, authenticated: auth },
    cursor: { ok: Boolean(cursorPath), path: cursorPath },
    ollama: {
      ok: ollamaOk,
      baseUrl,
      models,
      pinPresent,
      pinned,
    },
    readyForOnboarding: gitOk && ghOk,
  };
}

export type McpCard = {
  id: string;
  title: string;
  blurb: string;
  copyText: string;
};

/** P5 step 4 — MCP enablement via copy/reveal (no raw JSON editing). */
export function mcpCards(): McpCard[] {
  return [
    {
      id: "filesystem",
      title: "File access for workers",
      blurb: "Workers should only touch files in their own branch folder.",
      copyText: [
        "Give each worker access only to its own folder:",
        "<repo>/.orchestra/worktrees/<worker-name>/",
        "Do not give access to the whole repo.",
      ].join("\n"),
    },
    {
      id: "git",
      title: "Git tip",
      blurb: "This desk can open pull requests for you. Workers stay on their branch.",
      copyText: [
        "Workers stay on their own branch.",
        "Use the desk when you want to open or update a pull request.",
      ].join("\n"),
    },
  ];
}
