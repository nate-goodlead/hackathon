import { CloudRain, Snowflake, Sun, AlertTriangle } from "lucide-react";
import type { WeatherInsights } from "../types";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionHeader } from "./ui/Panel";

interface Props {
  insights: WeatherInsights;
}

export function WeatherInsightsPanel({ insights }: Props) {
  return (
    <Panel className="p-5 animate-fade-up stagger-4">
      <SectionHeader
        eyebrow="Location Weather"
        title="Open-Meteo by Opco"
        action={<Badge variant="secondary">Live API</Badge>}
      />
      <p className="-mt-2 mb-4 text-xs text-text-muted">
        {insights.summary} · 13-week window from {insights.weekStart}
      </p>

      {insights.topHighlights.length > 0 && (
        <div className="mb-5 space-y-2">
          {insights.topHighlights.map((h) => (
            <div
              key={h}
              className="flex items-start gap-2 rounded-lg border border-accent-amber/20 bg-accent-amber/5 px-3 py-2.5 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" aria-hidden />
              <span>{h}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {insights.cities.map((city) => (
          <article
            key={city.city}
            className="rounded-lg border border-border bg-bg-elevated/40 p-4 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-text-primary">{city.city}</h3>
                <p className="text-xs text-text-muted">{city.opco}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg text-accent-copper">{city.totalStoppageDays}</p>
                <p className="text-xs text-text-muted">stoppage days</p>
              </div>
            </div>

            <div className="mt-3 flex gap-1" role="img" aria-label={`Weekly stoppage heatmap for ${city.city}`}>
              {city.weekly.map((w) => (
                <div
                  key={w.week}
                  title={`${w.label}: ${w.rainfallMm}mm, ${w.stoppageDays} stoppage days`}
                  className={`h-8 flex-1 rounded-sm transition-opacity hover:opacity-80 ${
                    w.stoppageDays >= 3
                      ? "bg-accent-red/70"
                      : w.stoppageDays >= 1
                        ? "bg-accent-amber/60"
                        : "bg-accent-green/40"
                  }`}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-text-muted">
              <span>W1</span>
              <span>W13</span>
            </div>

            {city.transactionMatches.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-muted">
                  Cash × weather matches
                </p>
                <ul className="space-y-2">
                  {city.transactionMatches.slice(0, 3).map((m) => (
                    <li key={`${m.date}-${m.amount}`} className="text-xs">
                      <div className="flex items-center gap-1.5 text-text-muted">
                        {m.stoppageReasons.includes("rain") && (
                          <CloudRain className="h-3 w-3 text-accent-blue" aria-hidden />
                        )}
                        {m.stoppageReasons.includes("frost") && (
                          <Snowflake className="h-3 w-3 text-accent-blue" aria-hidden />
                        )}
                        {!m.stoppageReasons.length && <Sun className="h-3 w-3" aria-hidden />}
                        <span className="font-mono">{m.date}</span>
                      </div>
                      <p className="mt-0.5 text-text-primary">{m.insight}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}
