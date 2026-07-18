import {
  ConductorOverrideSchema,
  OrchestraManifestSchema,
  PACKET_TAGS,
  PrBriefSchema,
  SyncLogSchema,
  type ConductorOverride,
  type OrchestraManifest,
  type PacketKind,
  type PrBrief,
  type SyncLog,
} from "~/server/orchestra/schemas";

export class PacketParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PacketParseError";
  }
}

function extractJsonAfterTag(raw: string, tag: string): string {
  const idx = raw.indexOf(tag);
  if (idx < 0) {
    throw new PacketParseError(`Missing packet tag ${tag}`);
  }
  const after = raw.slice(idx + tag.length);

  const fence = /```(?:json)?\s*([\s\S]*?)```/m.exec(after);
  if (fence?.[1]) {
    return fence[1].trim();
  }

  const start = after.indexOf("{");
  if (start < 0) {
    throw new PacketParseError(`No JSON object after ${tag}`);
  }
  let depth = 0;
  for (let i = start; i < after.length; i++) {
    const ch = after[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return after.slice(start, i + 1);
      }
    }
  }
  throw new PacketParseError(`Unbalanced JSON after ${tag}`);
}

function parseJsonObject(raw: string, tag: string): unknown {
  const jsonText = extractJsonAfterTag(raw, tag);
  try {
    return JSON.parse(jsonText) as unknown;
  } catch {
    throw new PacketParseError(`Invalid JSON after ${tag}`);
  }
}

function compileTagged(tag: string, payload: unknown): string {
  return [tag, "", "```json", JSON.stringify(payload, null, 2), "```", ""].join(
    "\n",
  );
}

export function parseSyncLog(rawMarkdown: string): SyncLog {
  return SyncLogSchema.parse(
    parseJsonObject(rawMarkdown, PACKET_TAGS.sync_log),
  );
}

export function compileSyncLog(payload: SyncLog): string {
  return compileTagged(PACKET_TAGS.sync_log, SyncLogSchema.parse(payload));
}

export function parseManifest(rawMarkdown: string): OrchestraManifest {
  return OrchestraManifestSchema.parse(
    parseJsonObject(rawMarkdown, PACKET_TAGS.manifest),
  );
}

export function compileManifest(payload: OrchestraManifest): string {
  return compileTagged(
    PACKET_TAGS.manifest,
    OrchestraManifestSchema.parse(payload),
  );
}

export function parseOverride(rawMarkdown: string): ConductorOverride {
  return ConductorOverrideSchema.parse(
    parseJsonObject(rawMarkdown, PACKET_TAGS.override),
  );
}

export function compileOverride(payload: ConductorOverride): string {
  return compileTagged(
    PACKET_TAGS.override,
    ConductorOverrideSchema.parse(payload),
  );
}

export function parsePrBrief(rawMarkdown: string): PrBrief {
  return PrBriefSchema.parse(
    parseJsonObject(rawMarkdown, PACKET_TAGS.pr_brief),
  );
}

export function compilePrBrief(payload: PrBrief): string {
  return compileTagged(PACKET_TAGS.pr_brief, PrBriefSchema.parse(payload));
}

export function compilePacket(kind: PacketKind, payload: unknown): string {
  switch (kind) {
    case "sync_log":
      return compileSyncLog(SyncLogSchema.parse(payload));
    case "manifest":
      return compileManifest(OrchestraManifestSchema.parse(payload));
    case "override":
      return compileOverride(ConductorOverrideSchema.parse(payload));
    case "pr_brief":
      return compilePrBrief(PrBriefSchema.parse(payload));
    default: {
      const _exhaustive: never = kind;
      throw new PacketParseError(`Unknown packet kind: ${String(_exhaustive)}`);
    }
  }
}

export type ParsedPacket =
  | { kind: "sync_log"; payload: SyncLog }
  | { kind: "manifest"; payload: OrchestraManifest }
  | { kind: "override"; payload: ConductorOverride }
  | { kind: "pr_brief"; payload: PrBrief };

export function parsePacket(rawMarkdown: string): ParsedPacket {
  if (rawMarkdown.includes(PACKET_TAGS.sync_log)) {
    return { kind: "sync_log", payload: parseSyncLog(rawMarkdown) };
  }
  if (rawMarkdown.includes(PACKET_TAGS.manifest)) {
    return { kind: "manifest", payload: parseManifest(rawMarkdown) };
  }
  if (rawMarkdown.includes(PACKET_TAGS.override)) {
    return { kind: "override", payload: parseOverride(rawMarkdown) };
  }
  if (rawMarkdown.includes(PACKET_TAGS.pr_brief)) {
    return { kind: "pr_brief", payload: parsePrBrief(rawMarkdown) };
  }
  throw new PacketParseError(
    "No supported packet tag found (SYNC-LOG / MANIFEST / OVERRIDE / PR-BRIEF)",
  );
}

/** True when markdown contains at least one Orchestra wire tag + parseable JSON. */
export function assertValidClipboardMarkdown(markdown: string): ParsedPacket {
  return parsePacket(markdown);
}
