import { Sparkles } from "lucide-react";
import type { WeatherInsights } from "../../types";

interface Props {
  insights: WeatherInsights | null;
  scenarioLabel: string;
}

export function InsightCard({ insights, scenarioLabel }: Props) {
  const highlight =
    insights?.topHighlights[0] ??
    `Running ${scenarioLabel} scenario — weather delays shift milestone billing across the 13-week window.`;

  return (
    <div className="dashboard-card p-6 animate-fade-up stagger-3">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Sparkles className="h-4 w-4 text-accent-teal" aria-hidden />
          Weather insight
        </div>
        <button
          type="button"
          className="rounded-full border border-border px-3 py-1 text-xs text-text-muted hover:text-white"
        >
          Ask AI
        </button>
      </div>
      <p className="text-lg leading-relaxed text-white">
        {highlight.split(/(\d+\.?\d*%|\€[\d,K]+)/).map((part, i) =>
          /\d|€/.test(part) ? (
            <strong key={i} className="font-semibold text-white">
              {part}
            </strong>
          ) : (
            part
          ),
        )}
      </p>
      {insights?.summary && (
        <p className="mt-3 text-xs text-text-subtle">{insights.summary}</p>
      )}
    </div>
  );
}
