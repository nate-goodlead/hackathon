import { AlertTriangle } from "lucide-react";
import type { CovenantSummary, ScenarioId } from "../types";

interface Props {
  scenario: ScenarioId;
  covenant: CovenantSummary;
}

export function CovenantBanner({ scenario, covenant }: Props) {
  const headroom = covenant.headroomByScenario[scenario] ?? 0;
  const ratio = headroom / covenant.headroomThresholdEur;
  if (scenario !== "wet" || ratio >= 0.2) return null;

  const isDanger = ratio < 0.1;

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 mb-6 animate-fade-up ${
        isDanger
          ? "border-accent-red/30 bg-accent-red/10 text-accent-red"
          : "border-accent-amber/30 bg-accent-amber/10 text-accent-amber"
      }`}
    >
      <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
      <p className="text-sm font-medium">
        Wet quarter scenario approaches covenant threshold — review W2 to W4 liquidity
      </p>
    </div>
  );
}
