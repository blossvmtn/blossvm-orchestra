import fs from "node:fs/promises";
import path from "node:path";

import type { FenceSpec } from "~/server/orchestra/schemas";
import { fencePath } from "~/server/orchestra/paths";

/**
 * FenceSpec in state.json is SoT (OD2).
 * Emit Cursor rule into each worktree — no parallel fence.json.
 */
export function renderFenceMdc(spec: FenceSpec, workerSlug: string): string {
  const allowed =
    spec.allowedPaths.length > 0
      ? spec.allowedPaths.map((p) => `- \`${p}\``).join("\n")
      : "- *(none listed)*";
  const forbidden =
    spec.forbiddenPaths.length > 0
      ? spec.forbiddenPaths.map((p) => `- \`${p}\``).join("\n")
      : "- *(none listed)*";

  return `---
description: Orchestra fence for worker ${workerSlug}
alwaysApply: true
---

# Orchestra Fence

This worktree is physically isolated by Orchestra. Stay inside the fence.

## ALLOWED

You MAY edit files matching these path patterns:

${allowed}

## FORBIDDEN

You MUST NOT edit files matching these path patterns:

${forbidden}

## Rules

1. Do not expand scope beyond ALLOWED paths.
2. Do not touch FORBIDDEN paths even if "helpful."
3. If blocked by the fence, report via WORKTREE-SYNC-LOG — do not invent workarounds.
`;
}

export async function writeFenceFile(
  worktreeRoot: string,
  spec: FenceSpec,
  workerSlug: string,
): Promise<string> {
  const target = fencePath(worktreeRoot);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, renderFenceMdc(spec, workerSlug), "utf8");
  return target;
}
