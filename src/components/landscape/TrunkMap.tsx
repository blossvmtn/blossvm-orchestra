import type { TrunkLane, TrunkScanSnapshot } from "~/server/orchestra/schemas";
import { NODE_STATUS_COLORS } from "~/server/orchestra/schemas";

type Props = {
  snapshot: TrunkScanSnapshot;
};

type LayoutLane = TrunkLane & {
  x: number;
  side: "up" | "down";
};

function layoutLanes(lanes: TrunkLane[]): LayoutLane[] {
  const usable = lanes.slice(0, 8);
  const n = Math.max(usable.length, 1);
  return usable.map((lane, i) => ({
    ...lane,
    x: 140 + ((i + 1) / (n + 1)) * 920,
    side: i % 2 === 0 ? "up" : "down",
  }));
}

function branchPath(x: number, side: "up" | "down"): string {
  const y1 = 160;
  const y2 = side === "up" ? 72 : 248;
  const bend = side === "up" ? -48 : 48;
  return `M ${x} ${y1} C ${x} ${y1 + bend}, ${x + 36} ${y2}, ${x + 70} ${y2}`;
}

export function TrunkMap({ snapshot }: Props) {
  const lanes = layoutLanes(snapshot.lanes);

  return (
    <section
      aria-label="Main trunk"
      className="relative overflow-hidden border-b border-white/10"
      style={{ minHeight: 320 }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(11,15,20,0.55), rgba(11,15,20,0.82)), url(/theme/cinematic-frame.png)",
          backgroundSize: "cover",
          backgroundPosition: "center 35%",
          filter: "saturate(0.85) contrast(1.05)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse at 20% 30%, rgba(243,196,208,0.22), transparent 45%), radial-gradient(ellipse at 80% 20%, rgba(196,165,116,0.12), transparent 40%)",
          animation: "mist-shift 18s linear infinite alternate",
          backgroundSize: "200% 200%",
        }}
      />

      <header className="relative z-10 flex items-end justify-between px-6 pt-5 pb-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-[11px] tracking-[0.35em] text-[color:var(--color-petal)] uppercase">
            blossvm-orchestra
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-medium tracking-tight text-white/95 md:text-4xl">
            {snapshot.displayName}
          </h1>
        </div>
        <div className="text-right text-[11px] tracking-wide text-[color:var(--color-fog)]">
          <div>main branch · {snapshot.baseBranch}</div>
          <div className="text-white/40">
            checked {new Date(snapshot.scannedAt).toLocaleTimeString()}
          </div>
        </div>
      </header>

      <svg
        viewBox="0 0 1200 320"
        className="relative z-10 h-[240px] w-full md:h-[280px]"
        role="img"
        aria-label={`Trunk map with ${lanes.length} lanes on ${snapshot.baseBranch}`}
      >
        <defs>
          <linearGradient id="railGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#d7dde5" stopOpacity="0.15" />
            <stop offset="35%" stopColor="#f3c4d0" stopOpacity="0.85" />
            <stop offset="70%" stopColor="#c4a574" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#d7dde5" stopOpacity="0.2" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Endless backbone */}
        <line
          x1="40"
          y1="160"
          x2="1160"
          y2="160"
          stroke="url(#railGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ animation: "rail-breathe 4.5s ease-in-out infinite" }}
        />

        {/* Timeline ticks inspired by cinematic frame */}
        {Array.from({ length: 24 }).map((_, i) => {
          const x = 80 + i * 44;
          const tall = i % 4 === 0;
          return (
            <line
              key={x}
              x1={x}
              y1={tall ? 148 : 154}
              x2={x}
              y2={tall ? 172 : 166}
              stroke="rgba(215,221,229,0.28)"
              strokeWidth="1"
            />
          );
        })}

        <text
          x="48"
          y="152"
          fill="rgba(243,196,208,0.75)"
          fontSize="11"
          fontFamily="var(--font-mono)"
          letterSpacing="0.2em"
        >
          {snapshot.baseBranch.toUpperCase()}
        </text>

        {lanes.map((lane) => {
          const color = NODE_STATUS_COLORS[lane.status];
          const labelY = lane.side === "up" ? 58 : 268;
          return (
            <g key={lane.id}>
              <path
                d={branchPath(lane.x, lane.side)}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeOpacity="0.85"
                filter="url(#softGlow)"
              />
              <circle
                cx={lane.x}
                cy={160}
                r="5"
                fill={color}
                stroke="rgba(11,15,20,0.9)"
                strokeWidth="2"
              />
              <circle
                cx={lane.x + 70}
                cy={lane.side === "up" ? 72 : 248}
                r="8"
                fill={color}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="1.5"
              />
              {lane.status === "pr_open" ? (
                <text
                  x={lane.x + 70}
                  y={lane.side === "up" ? 76 : 252}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="700"
                  fill="#0b0f14"
                >
                  PR
                </text>
              ) : null}
              <text
                x={lane.x + 86}
                y={labelY}
                fill="rgba(232,237,242,0.92)"
                fontSize="12"
                fontFamily="var(--font-sans)"
              >
                {lane.slug}
              </text>
              <text
                x={lane.x + 86}
                y={labelY + 14}
                fill="rgba(138,150,163,0.9)"
                fontSize="10"
                fontFamily="var(--font-sans)"
              >
                {lane.plainStatus ??
                  (lane.status === "pr_open"
                    ? "pull request open"
                    : lane.status === "active"
                      ? "working"
                      : lane.status === "merged"
                        ? "merged"
                        : lane.status === "orphaned"
                          ? "missing"
                          : lane.status === "stashed"
                            ? "parked"
                            : lane.status)}
              </text>
              {(lane.commitsAhead ?? 0) > 0 ? (
                <text
                  x={lane.x + 86}
                  y={labelY + 28}
                  fill="rgba(196,165,116,0.95)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {lane.shortSha} · +{lane.commitsAhead} commit
                  {lane.commitsAhead === 1 ? "" : "s"}
                </text>
              ) : (
                <text
                  x={lane.x + 86}
                  y={labelY + 28}
                  fill="rgba(138,150,163,0.7)"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                >
                  {lane.shortSha}
                </text>
              )}
            </g>
          );
        })}

        {lanes.length === 0 ? (
          <text
            x="600"
            y="200"
            textAnchor="middle"
            fill="rgba(243,196,208,0.7)"
            fontSize="14"
            fontFamily="var(--font-display)"
          >
            No branches yet. Pick a project, then hit “Start worker”.
          </text>
        ) : null}
      </svg>

      {/* Falling petal hints */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="absolute block h-2 w-2 rounded-full bg-[color:var(--color-petal)]"
            style={{
              left: `${12 + i * 18}%`,
              top: "-10%",
              opacity: 0.45,
              animation: `petal-drift ${9 + i * 1.4}s linear ${i * 1.1}s infinite`,
              filter: "blur(0.4px)",
            }}
          />
        ))}
      </div>
    </section>
  );
}
