import type { ScenarioId } from "../types";
import { SCENARIO_LABELS } from "../types";

interface Props {
  scenario: ScenarioId;
  onChange: (s: ScenarioId) => void;
}

const SCENARIOS: ScenarioId[] = ["base", "wet", "dry"];

export function ScenarioToggle({ scenario, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">Scenario</span>
      <div className="flex flex-col gap-1" role="radiogroup" aria-label="Forecast scenario">
        {SCENARIOS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={scenario === s}
            onClick={() => onChange(s)}
            className={`min-h-11 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors duration-200 ${
              scenario === s
                ? "bg-accent-copper/20 text-accent-copper ring-1 ring-accent-copper/40"
                : "bg-bg-elevated text-text-muted hover:text-text-primary"
            }`}
          >
            {SCENARIO_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
