import type { WeatherInsights } from "../../types";

interface Props {
  insights: WeatherInsights | null;
}

export function WeatherBarsWidget({ insights }: Props) {
  if (!insights?.cities.length) {
    return (
      <div className="dashboard-card p-6 animate-fade-up stagger-3">
        <p className="text-sm text-text-muted">No weather data loaded</p>
      </div>
    );
  }

  const totalStoppage = insights.cities.reduce((s, c) => s + c.totalStoppageDays, 0);
  const maxStoppage = Math.max(...insights.cities.map((c) => c.totalStoppageDays), 1);

  return (
    <div className="dashboard-card p-6 animate-fade-up stagger-3">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted">Weather stoppage days</p>
          <p className="text-3xl font-semibold text-white">{totalStoppage}</p>
        </div>
        <span className="text-sm font-medium text-accent-amber">
          {insights.cities.length} opcos
        </span>
      </div>

      <div className="flex h-16 items-end gap-1">
        {insights.cities.map((city) => (
          <div key={city.city} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-sm bg-white/90 transition-all"
              style={{ height: `${Math.max(8, (city.totalStoppageDays / maxStoppage) * 100)}%` }}
              title={`${city.city}: ${city.totalStoppageDays} days`}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-between text-[10px] text-text-subtle">
        {insights.cities.map((c) => (
          <span key={c.city}>{c.city.slice(0, 3)}</span>
        ))}
      </div>

      <div className="mt-4 flex gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-white" /> Stoppage
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-text-subtle" /> Open-Meteo
        </span>
      </div>
    </div>
  );
}
