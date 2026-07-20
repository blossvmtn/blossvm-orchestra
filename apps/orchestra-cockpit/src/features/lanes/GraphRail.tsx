import { memo, type ReactElement } from "react";
import type { GraphEdge, GraphRow } from "../../lib/gitGraph";

// Adapted from Terax (crynta/terax-ai, src/modules/git-history/GraphRail.tsx),
// Apache-2.0. One small SVG rail per commit row — straight verticals for
// passthrough/first-parent, short rounded béziers for merge/branch.
const LANE_WIDTH = 15;
const RAIL_PADDING_X = 10;
const MAX_VISIBLE_LANES = 6;
const STROKE_W = 1.6;
const NODE_STROKE = "#151b1a";
const ACTIVE_RING = "#dd9fb0";

function laneX(lane: number): number {
  return RAIL_PADDING_X + lane * LANE_WIDTH;
}

export function railWidth(maxLane: number): number {
  const visible = Math.min(maxLane, MAX_VISIBLE_LANES);
  return RAIL_PADDING_X * 2 + Math.max(0, visible - 1) * LANE_WIDTH + 6;
}

function topEdge(edge: GraphEdge, midY: number, key: string): ReactElement | null {
  if (edge.kind === "straight") {
    const x = laneX(edge.lane);
    return <line key={key} x1={x} y1={0} x2={x} y2={midY} stroke={edge.color} strokeWidth={STROKE_W} strokeLinecap="round" />;
  }
  if (edge.kind === "merge") {
    const xF = laneX(edge.fromLane);
    const xT = laneX(edge.toLane);
    const c = midY * 0.55;
    return <path key={key} d={`M ${xF} 0 C ${xF} ${c}, ${xT} ${c}, ${xT} ${midY}`} fill="none" stroke={edge.color} strokeWidth={STROKE_W} strokeLinecap="round" />;
  }
  return null;
}

function bottomEdge(edge: GraphEdge, midY: number, bottomY: number, key: string): ReactElement | null {
  if (edge.kind === "straight") {
    const x = laneX(edge.lane);
    return <line key={key} x1={x} y1={midY} x2={x} y2={bottomY} stroke={edge.color} strokeWidth={STROKE_W} strokeLinecap="round" />;
  }
  if (edge.kind === "branch") {
    const xF = laneX(edge.fromLane);
    const xT = laneX(edge.toLane);
    const c = midY + (bottomY - midY) * 0.45;
    return <path key={key} d={`M ${xF} ${midY} C ${xF} ${c}, ${xT} ${c}, ${xT} ${bottomY}`} fill="none" stroke={edge.color} strokeWidth={STROKE_W} strokeLinecap="round" />;
  }
  return null;
}

type Props = { row: GraphRow; rowHeight: number; maxLaneCount: number; active?: boolean };

export const GraphRail = memo(function GraphRail({ row, rowHeight, maxLaneCount, active }: Props) {
  const width = railWidth(maxLaneCount);
  const midY = Math.round(rowHeight / 2);
  const nodeX = laneX(row.lane);
  const visible = Math.min(maxLaneCount, MAX_VISIBLE_LANES);
  const overflow = row.laneCount > visible;

  return (
    <svg width={width} height={rowHeight} viewBox={`0 0 ${width} ${rowHeight}`} aria-hidden style={{ flexShrink: 0, overflow: "visible" }}>
      {row.topEdges.map((e, i) => topEdge(e, midY, `t${i}`))}
      {row.bottomEdges.map((e, i) => bottomEdge(e, midY, rowHeight, `b${i}`))}
      <circle cx={nodeX} cy={midY} r={active ? 9 : 7} fill={row.nodeColor} opacity={0.15} />
      {active ? <circle cx={nodeX} cy={midY} r={7} fill="none" stroke={ACTIVE_RING} strokeWidth={1.4} strokeOpacity={0.85} /> : null}
      <circle cx={nodeX} cy={midY} r={active ? 4.6 : 3.6} fill={row.nodeColor} stroke={NODE_STROKE} strokeWidth={1.6} />
      {overflow ? (
        <text x={width - 4} y={midY + 3} textAnchor="end" fill="#7c8a80" style={{ fontSize: 8 }}>
          +{row.laneCount - visible}
        </text>
      ) : null}
    </svg>
  );
});
