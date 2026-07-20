import type { View } from "../app/AppShell";
import type { SystemHealth } from "../lib/daemonClient";

type Props = {
  view: View;
  onView: (v: View) => void;
  repos: { slug: string }[];
  scope: string | null;
  onScope: (slug: string) => void;
  health: SystemHealth | null;
  laneCount: number;
};

const NAV: { id: View; label: string }[] = [
  { id: "desk", label: "Desk" },
  { id: "lanes", label: "Lanes" },
  { id: "repositories", label: "Repositories" },
  { id: "review", label: "Review" },
  { id: "system", label: "System" },
];

function Blossom() {
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg className="rail-mark" viewBox="0 0 30 30" aria-hidden>
      {petals.map((a) => (
        <ellipse key={a} cx="15" cy="8.4" rx="4" ry="6" fill="#e3a9b6" transform={`rotate(${a} 15 15)`} />
      ))}
      <circle cx="15" cy="15" r="2.6" fill="#c98b95" />
    </svg>
  );
}

export function LeftRail({ view, onView, repos, scope, onScope, health, laneCount }: Props) {
  const daemon = health?.checks.find((c) => c.name === "Daemon");
  const greenCount = health?.checks.filter((c) => c.status === "ok").length ?? 0;
  const healthy = daemon?.status === "ok";

  const count = (id: View): number | null =>
    id === "lanes" ? laneCount : id === "repositories" ? repos.length : null;

  return (
    <nav className="rail" aria-label="Primary">
      <div className="rail-identity">
        <Blossom />
        <div>
          <div className="rail-name">Orchestra</div>
          <div className="rail-sub">conductor · v0.3.0</div>
        </div>
      </div>

      <div className="rail-nav">
        {NAV.map((item) => {
          const c = count(item.id);
          return (
            <button
              key={item.id}
              className="nav-item"
              aria-current={view === item.id}
              onClick={() => onView(item.id)}
            >
              <span>{item.label}</span>
              {c !== null ? <span className="nav-count">{c}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="rail-spacer" />

      <div className="rail-block">
        <label className="rail-label" htmlFor="scope">
          Scope
        </label>
        <select
          id="scope"
          className="scope-select"
          value={scope ?? ""}
          onChange={(e) => onScope(e.target.value)}
          disabled={repos.length === 0}
        >
          {repos.length === 0 ? <option value="">no repos</option> : null}
          {repos.map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.slug}
            </option>
          ))}
        </select>
      </div>

      <div className="rail-health">
        <span className={`dot ${healthy ? "dot-ok" : health ? "dot-warn" : "dot-bad"}`} />
        <div>
          <div className="rail-health-title">
            {healthy ? "daemon reachable" : health ? "daemon degraded" : "daemon unreachable"}
          </div>
          <div className="rail-health-sub">
            {health ? `127.0.0.1 · ${greenCount} checks green` : "connecting…"}
          </div>
        </div>
      </div>
    </nav>
  );
}
