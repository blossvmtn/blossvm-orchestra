// Lane-based git-graph layout — adapted from Terax (crynta/terax-ai,
// src/modules/git-history/lib/graph.ts), Apache-2.0. See repo NOTICE.
//
// Input: commits newest-first, each with parent SHAs. Output: one row per
// commit with the vertical rail's edges. Lanes are fixed columns; a finished
// branch's column is nulled (not shifted), which is what keeps the rails
// straight instead of sweeping.

export type GraphCommit = { sha: string; parents: string[] };
export type LaneColor = string;

// Warm, painterly lane palette (Ghibli-leaning) — stable per slot index so
// colors don't shift as more commits load.
export const LANE_COLORS: LaneColor[] = [
  "#9aa0a2", // sage-grey (lane 0 ≈ main — neutral, calm)
  "#79b7bd", // dusty teal
  "#9a9fd4", // faded periwinkle
  "#dd9fb0", // dusty rose
  "#8fbf9f", // sage green
  "#d4a75a", // muted gold
  "#c79ac0", // dusty plum
  "#9ab0c8", // faded sky
];

export function laneColor(index: number): LaneColor {
  return LANE_COLORS[index % LANE_COLORS.length] ?? "#dd9fb0";
}

export type GraphEdge =
  | { kind: "straight"; lane: number; color: LaneColor }
  | { kind: "merge"; fromLane: number; toLane: number; color: LaneColor }
  | { kind: "branch"; fromLane: number; toLane: number; color: LaneColor };

export type GraphRow = {
  sha: string;
  lane: number;
  nodeColor: LaneColor;
  laneCount: number;
  topEdges: GraphEdge[];
  bottomEdges: GraphEdge[];
};

export type GraphState = { lanes: (string | null)[] };
export const EMPTY_GRAPH_STATE: GraphState = { lanes: [] };

function trimTrailing(lanes: (string | null)[]): (string | null)[] {
  let end = lanes.length;
  while (end > 0 && lanes[end - 1] === null) end--;
  return end === lanes.length ? lanes : lanes.slice(0, end);
}

function firstFreeSlot(lanes: (string | null)[]): number {
  for (let i = 0; i < lanes.length; i++) if (lanes[i] === null) return i;
  return lanes.length;
}

export function layoutGraph(
  commits: readonly GraphCommit[],
  previous: GraphState = EMPTY_GRAPH_STATE,
): { rows: GraphRow[]; state: GraphState } {
  const lanes: (string | null)[] = previous.lanes.slice();
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    const claiming: number[] = [];
    for (let i = 0; i < lanes.length; i++) if (lanes[i] === commit.sha) claiming.push(i);

    let lane: number;
    if (claiming.length > 0) {
      lane = claiming[0] ?? firstFreeSlot(lanes);
    } else {
      lane = firstFreeSlot(lanes);
      if (lane === lanes.length) lanes.push(null);
    }

    const lanesBefore = lanes.slice();
    const topEdges: GraphEdge[] = [];
    for (let i = 0; i < lanesBefore.length; i++) {
      const v = lanesBefore[i];
      if (v == null) continue;
      if (v === commit.sha && i !== lane) {
        topEdges.push({ kind: "merge", fromLane: i, toLane: lane, color: laneColor(i) });
      } else {
        topEdges.push({ kind: "straight", lane: i, color: laneColor(i) });
      }
    }

    for (const idx of claiming) lanes[idx] = null;
    if (claiming.length === 0) lanes[lane] = null;

    const parents = commit.parents;
    const bottomEdges: GraphEdge[] = [];
    if (parents.length > 0) {
      lanes[lane] = parents[0] ?? null;
      for (let p = 1; p < parents.length; p++) {
        const parentSha = parents[p];
        if (!parentSha) continue;
        let parentLane = lanes.indexOf(parentSha);
        if (parentLane === -1) {
          parentLane = firstFreeSlot(lanes);
          if (parentLane === lanes.length) lanes.push(null);
          lanes[parentLane] = parentSha;
        }
        if (parentLane !== lane) {
          bottomEdges.push({ kind: "branch", fromLane: lane, toLane: parentLane, color: laneColor(parentLane) });
        }
      }
    }

    const branchTargets = new Set(
      bottomEdges
        .filter((e): e is Extract<GraphEdge, { kind: "branch" }> => e.kind === "branch")
        .map((e) => e.toLane),
    );
    for (let i = 0; i < lanes.length; i++) {
      const v = lanes[i];
      if (v == null) continue;
      if (branchTargets.has(i)) continue;
      bottomEdges.push({ kind: "straight", lane: i, color: laneColor(i) });
    }

    const trimmed = trimTrailing(lanes);
    if (trimmed.length !== lanes.length) lanes.length = trimmed.length;

    rows.push({
      sha: commit.sha,
      lane,
      nodeColor: laneColor(lane),
      laneCount: Math.max(lanesBefore.length, lanes.length, lane + 1),
      topEdges,
      bottomEdges,
    });
  }

  return { rows, state: { lanes: lanes.slice() } };
}
