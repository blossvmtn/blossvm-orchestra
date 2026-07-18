import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import os from "node:os";

import {
  DEFAULT_REGISTRY_DEFAULTS,
  OrchestraRegistrySchema,
  type OrchestraRegistry,
  type OrchestraRegistryEntry,
} from "~/server/orchestra/schemas";
import { getOrchestraHome, registryPath, repoOrchestraDir } from "~/server/orchestra/paths";
import { isGitRepo } from "~/server/orchestra/git";
import { ensureRepoState } from "~/server/orchestra/state";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "repo"
  );
}

/** Expand ~, GitHub slugs (owner/repo), and try ~/dev/<name> candidates. */
export async function resolveGitRoot(rawPath: string): Promise<string> {
  let trimmed = rawPath.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) {
    throw new Error("Repo path is empty.");
  }

  // Normalize GitHub URL / SSH / owner/repo → local clone name candidates
  const githubSlug = parseGithubSlug(trimmed);
  if (githubSlug) {
    trimmed = githubSlug.repo;
  }

  const expanded = trimmed.startsWith("~/")
    ? path.join(os.homedir(), trimmed.slice(2))
    : trimmed === "~"
      ? os.homedir()
      : trimmed;

  const candidates: string[] = [];
  if (path.isAbsolute(expanded)) {
    candidates.push(expanded);
  } else {
    const base = path.basename(expanded);
    candidates.push(path.resolve(expanded));
    candidates.push(path.join(os.homedir(), "dev", expanded));
    candidates.push(path.join(os.homedir(), "dev", base));
    // Common typo: tenj-os → tenjo-os
    if (base.includes("tenj-os") && !base.includes("tenjo-os")) {
      candidates.push(path.join(os.homedir(), "dev", base.replace("tenj-os", "tenjo-os")));
    }
  }

  const tried: string[] = [];
  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (tried.includes(normalized)) continue;
    tried.push(normalized);
    try {
      await fs.access(normalized);
    } catch {
      continue;
    }
    if (await isGitRepo(normalized)) {
      return fs.realpath(normalized);
    }
  }

  const hint = githubSlug
    ? ` GitHub slug ${githubSlug.owner}/${githubSlug.repo} maps to a local clone (e.g. ~/dev/${githubSlug.repo}).`
    : "";
  throw new Error(
    `Not a git repository. Tried: ${tried.join(" · ")}.${hint} Example: blossvmtn/tenjo-os or /Users/jeffersonadams/dev/tenjo-os`,
  );
}

function parseGithubSlug(
  input: string,
): { owner: string; repo: string } | null {
  const cleaned = input
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");

  const m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(cleaned);
  if (!m?.[1] || !m[2]) return null;
  // Avoid treating absolute-ish Windows junk as slugs; require no leading slash
  if (cleaned.startsWith("/") || cleaned.includes(":\\")) return null;
  return { owner: m[1], repo: m[2] };
}

export async function ensureOrchestraHome(): Promise<void> {
  await fs.mkdir(getOrchestraHome(), { recursive: true });
}

export function emptyRegistry(): OrchestraRegistry {
  return {
    version: 1,
    entries: [],
    defaults: { ...DEFAULT_REGISTRY_DEFAULTS },
  };
}

export async function loadRegistry(): Promise<OrchestraRegistry> {
  await ensureOrchestraHome();
  const file = registryPath();
  try {
    const raw = await fs.readFile(file, "utf8");
    return OrchestraRegistrySchema.parse(JSON.parse(raw) as unknown);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      const registry = emptyRegistry();
      await saveRegistry(registry);
      return registry;
    }
    throw err;
  }
}

export async function saveRegistry(registry: OrchestraRegistry): Promise<void> {
  await ensureOrchestraHome();
  const file = registryPath();
  const tmp = `${file}.tmp`;
  const parsed = OrchestraRegistrySchema.parse(registry);
  await fs.writeFile(tmp, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

export async function listRegistry(): Promise<OrchestraRegistry> {
  return loadRegistry();
}

export async function addRegistryEntry(input: {
  rootPath: string;
  displayName?: string;
}): Promise<OrchestraRegistryEntry> {
  const rootPath = await resolveGitRoot(input.rootPath);

  const registry = await loadRegistry();
  const existing = registry.entries.find((e) => e.rootPath === rootPath);
  if (existing) {
    existing.lastOpenedAt = new Date().toISOString();
    await saveRegistry(registry);
    await ensureRepoState(rootPath, existing.id);
    return existing;
  }

  const baseName = path.basename(rootPath);
  let slug = slugify(baseName);
  const taken = new Set(registry.entries.map((e) => e.slug));
  if (taken.has(slug)) {
    let i = 2;
    while (taken.has(`${slug}-${i}`)) i += 1;
    slug = `${slug}-${i}`;
  }

  const entry: OrchestraRegistryEntry = {
    id: randomUUID(),
    slug,
    rootPath,
    displayName: input.displayName ?? baseName,
    addedAt: new Date().toISOString(),
    lastOpenedAt: null,
  };

  registry.entries.push(entry);
  await saveRegistry(registry);
  await fs.mkdir(repoOrchestraDir(rootPath), { recursive: true });
  await ensureRepoState(rootPath, entry.id);
  return entry;
}

export async function getRegistryEntry(
  repoId: string,
): Promise<OrchestraRegistryEntry> {
  const registry = await loadRegistry();
  const entry = registry.entries.find((e) => e.id === repoId);
  if (!entry) {
    throw new Error(`Registry entry not found: ${repoId}`);
  }
  return entry;
}
