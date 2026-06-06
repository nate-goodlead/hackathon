import { Wallet } from "lucide-react";
import { formatEuro, headroomStatus } from "../../lib/format";
import type { CovenantSummary, ScenarioId } from "../../types";

interface Props {
  covenant: CovenantSummary;
  scenario: ScenarioId;
}

export function CovenantGauge({ covenant, scenario }: Props) {
  const headroom = covenant.headroomByScenario[scenario] ?? covenant.headroomThresholdEur;
  const pct = Math.min(100, Math.max(0, (headroom / covenant.headroomThresholdEur) * 100));
  const status = headroomStatus(headroom, covenant.headroomThresholdEur);

  const strokeColor =
    status === "danger" ? "#f87171" : status === "warning" ? "#fbbf24" : "#34d399";

  // Semi-circle gauge: 180 degrees, ticks
  const ticks = 36;
  const activeTicks = Math.round((pct / 100) * ticks);

  return (
    <div className="dashboard-card flex flex-col items-center p-6 animate-fade-up stagger-2">
      <div className="relative mx-auto h-[140px] w-full max-w-[240px]">
        <svg viewBox="0 0 200 110" className="h-full w-full" aria-hidden>
          {Array.from({ length: ticks }).map((_, i) => {
            const angle = Math.PI + (i / (ticks - 1)) * Math.PI;
            const x1 = 100 + 72 * Math.cos(angle);
            const y1 = 100 + 72 * Math.sin(angle);
            const x2 = 100 + 88 * Math.cos(angle);
            const y2 = 100 + 88 * Math.sin(angle);
            const active = i < activeTicks;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={active ? strokeColor : "rgba(255,255,255,0.12)"}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center text-center">
          <Wallet className="mb-1 h-5 w-5 text-text-muted" aria-hidden />
          <p className="text-xs text-text-muted">Covenant headroom</p>
          <p className="text-xl font-semibold text-white" style={{ color: strokeColor }}>
            {formatEuro(headroom)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex w-full gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white" /> Headroom
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-text-subtle" /> Threshold{" "}
          {formatEuro(covenant.headroomThresholdEur)}
        </span>
      </div>

      <div className="mt-4 w-full border-t border-border pt-4 text-center">
        <p className="text-xs text-text-muted">Interest coverage</p>
        <p className="font-mono text-lg text-white">
          {covenant.interestCoverageRatio.toFixed(1)}×{" "}
          <span className="text-sm text-text-subtle">
            (min {covenant.interestCoverageMinimum.toFixed(1)}×)
          </span>
        </p>
      </div>

      <button
        type="button"
        className="mt-4 w-full rounded-xl border border-border bg-bg-elevated py-2.5 text-sm text-text-muted transition hover:text-white"
      >
        View covenant detail →
      </button>
    </div>
  );
}
