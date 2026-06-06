import { formatEuro, headroomStatus } from "../lib/format";
import type { CovenantSummary, ScenarioId } from "../types";
import { Panel } from "./ui/Panel";

interface Props {
  covenant: CovenantSummary;
  scenario: ScenarioId;
}

export function CovenantMeter({ covenant, scenario }: Props) {
  const headroom = covenant.headroomByScenario[scenario] ?? covenant.headroomThresholdEur;
  const status = headroomStatus(headroom, covenant.headroomThresholdEur);
  const pct = Math.min(100, Math.max(0, (headroom / covenant.headroomThresholdEur) * 100));

  const valueColor =
    status === "danger" ? "text-accent-red" : status === "warning" ? "text-accent-amber" : "text-accent-green";
  const barColor =
    status === "danger" ? "bg-accent-red" : status === "warning" ? "bg-accent-amber" : "bg-accent-green";

  return (
    <Panel className="p-4" accent>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Covenant Headroom</p>
      <p className={`mt-2 font-mono text-2xl font-semibold ${valueColor}`}>{formatEuro(headroom)}</p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-bg-tertiary"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Covenant headroom percentage"
      >
        <div className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Threshold: <span className="font-mono text-text-primary">{formatEuro(covenant.headroomThresholdEur)}</span>
      </p>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[11px] uppercase tracking-wider text-text-muted">Interest Coverage Ratio</p>
        <p className="font-mono text-lg text-text-primary">
          {covenant.interestCoverageRatio.toFixed(1)}x{" "}
          <span className="text-sm text-text-muted">(min {covenant.interestCoverageMinimum.toFixed(1)}x)</span>
        </p>
      </div>
    </Panel>
  );
}
