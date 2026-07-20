import type { CSSProperties } from "react";
import type { HealthState } from "../../hooks/useSystemHealth";
import type { HealthStatus } from "../../lib/daemonClient";

// Ported 1:1 from the Paper "System (instruments)" board (FD-0) via
// design-to-code: the "Instruments · local checks" list is bound to the
// daemon's real /system/health checks; "Runtime targets" is the declared
// roadmap (MacBook connected, Fedora + Spark planned).

const SANS = "var(--font-sans)";
const MONO = "var(--font-mono)";
const DISPLAY = "var(--font-display)";

/** status → dot, glow, and status-word color, matching the board's palette. */
const STATUS_STYLE: Record<HealthStatus, { dot: string; glow: string; word: string }> = {
  ok: { dot: "#6FC28C", glow: "0 0 7px rgba(111,194,140,0.55)", word: "#84C79B" },
  degraded: { dot: "#D9A24A", glow: "0 0 7px rgba(217,162,74,0.5)", word: "#E0B968" },
  unavailable: { dot: "#C77A7A", glow: "0 0 7px rgba(199,122,122,0.5)", word: "#D89090" },
};

const eyebrow: CSSProperties = {
  fontFamily: SANS,
  fontWeight: 500,
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#8A9088",
};

type Target = {
  name: string;
  spec: string;
  note: string;
  chip: string;
  chipColor: string;
  chipBg?: string;
  chipBorder: string;
  dotColor?: string;
  border: string;
  bg: string;
  titleColor: string;
  specColor: string;
  noteColor: string;
};

// Roadmap, not measured — declared exactly as the board states it.
const TARGETS: Target[] = [
  {
    name: "This MacBook", spec: "Apple M5 · 48 GB", note: "Cockpit + interim clerk host.",
    chip: "connected", chipColor: "#7FD6E3", chipBg: "#123038", chipBorder: "#1E4E56", dotColor: "#4FC3D6",
    border: "#2E3A52", bg: "rgba(21,27,35,0.82)", titleColor: "#E9E4DA", specColor: "#7A8290", noteColor: "#9BA6B2",
  },
  {
    name: "Fedora KDE", spec: "workstation", note: "Cockpit + cloud worker agents. Not connected yet.",
    chip: "planned", chipColor: "#6B7686", chipBorder: "#33404C",
    border: "#33404C", bg: "rgba(16,20,26,0.55)", titleColor: "#AEB6BF", specColor: "#5A6472", noteColor: "#6F7885",
  },
  {
    name: "DGX Spark", spec: "128 GB · CUDA · private overlay", note: "Hermes-4-70B clerk. Gateway swaps here when online.",
    chip: "planned · P4+", chipColor: "#9A8CC8", chipBorder: "#3A3550",
    border: "#3A3550", bg: "rgba(16,20,26,0.55)", titleColor: "#AEB6BF", specColor: "#5A6472", noteColor: "#6F7885",
  },
];

export function SystemView({ health, error, loading }: HealthState) {
  const checks = health?.checks ?? [];
  const degraded = checks.filter((c) => c.status !== "ok").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {/* Instruments · local checks */}
      <section style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={eyebrow}>Instruments · local checks</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            {error && health ? (
              <span style={{ fontFamily: MONO, fontSize: 11, color: "#E0B968" }} title={error}>stale — retrying</span>
            ) : null}
            <span style={{ fontFamily: MONO, fontSize: 11, color: degraded ? "#E0B968" : "#7FD6E3" }}>
              {loading && !health
                ? "probing…"
                : `${checks.length - degraded} green · ${degraded} degraded`}
            </span>
          </div>
        </div>

        {error && !health ? (
          <div className="empty err">health probe failed — {error}</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 11 }}>
            {checks.map((c) => {
              const s = STATUS_STYLE[c.status];
              return (
                <div
                  key={c.name}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    flex: "1 1 420px", minWidth: 320,
                    padding: "14px 16px", borderRadius: 11,
                    background: "rgba(21,27,35,0.82)", border: "1px solid #232B36",
                  }}
                >
                  <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", background: s.dot, boxShadow: s.glow }} />
                  <span style={{ flex: 1, fontFamily: SANS, fontWeight: 500, fontSize: 13, color: "#E9E4DA" }}>{c.name}</span>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: s.word }}>{c.status}</span>
                  <span style={{ width: 168, flexShrink: 0, textAlign: "right", fontFamily: MONO, fontSize: 11, color: "#7A8290", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.detail ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Runtime targets */}
      <section style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={eyebrow}>Runtime targets</span>
          <span style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 15, color: "#8A9088" }}>
            the studio, as it will grow
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 13 }}>
          {TARGETS.map((t) => (
            <div
              key={t.name}
              style={{
                display: "flex", flexDirection: "column", gap: 9,
                flex: "1 1 300px", minWidth: 260,
                padding: 16, borderRadius: 12,
                background: t.bg,
                border: `1px ${t.dotColor ? "solid" : "dashed"} ${t.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 13.5, color: t.titleColor }}>{t.name}</span>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "3px 9px", borderRadius: 6,
                  background: t.chipBg ?? "transparent", border: `1px solid ${t.chipBorder}`,
                }}>
                  {t.dotColor ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.dotColor }} /> : null}
                  <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: 10.5, color: t.chipColor }}>{t.chip}</span>
                </span>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.specColor }}>{t.spec}</span>
              <span style={{ fontFamily: SANS, fontSize: 12, lineHeight: "140%", color: t.noteColor }}>{t.note}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
