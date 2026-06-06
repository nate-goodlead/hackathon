import { useEffect, useState } from "react";
import type { CovenantSummary, ForecastData, TraceRecord, WeatherInsights, WipProject } from "../types";
import type { SubsidiaryCompany } from "../data/altisPortfolio";

interface AppData {
  forecast: ForecastData;
  traces: TraceRecord[];
  wip: WipProject[];
  covenant: CovenantSummary;
  weatherInsights: WeatherInsights | null;
  portfolio: SubsidiaryCompany[];
  loading: boolean;
  error: string | null;
}

async function fetchJson<T>(path: string, fallbackPath?: string): Promise<T> {
  try {
    const r = await fetch(path);
    if (r.ok) return r.json() as Promise<T>;
  } catch {
    /* try fallback */
  }
  if (fallbackPath) {
    const r = await fetch(fallbackPath);
    if (r.ok) return r.json() as Promise<T>;
  }
  throw new Error(`Failed to load ${path}`);
}

export function useAppData(): AppData {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [wip, setWip] = useState<WipProject[]>([]);
  const [covenant, setCovenant] = useState<CovenantSummary | null>(null);
  const [weatherInsights, setWeatherInsights] = useState<WeatherInsights | null>(null);
  const [portfolio, setPortfolio] = useState<SubsidiaryCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [f, t, w, c, wi, ps] = await Promise.all([
          fetchJson<ForecastData>("/api/data/forecast", "/data/forecast.json"),
          fetchJson<TraceRecord[]>("/api/data/traces", "/data/trace_data.json"),
          fetchJson<WipProject[]>("/api/data/wip", "/data/wip_data.json"),
          fetchJson<CovenantSummary>("/api/data/covenant", "/data/covenant_summary.json"),
          fetch("/api/data/weather-insights")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() =>
              fetch("/data/weather_insights.json").then((r) => (r.ok ? r.json() : null)),
            ),
          fetchJson<{ companies: SubsidiaryCompany[] }>("/api/data/portfolio", "/data/portfolio_stats.json"),
        ]);
        setForecast(f);
        setTraces(t);
        setWip(w);
        setCovenant(c);
        setWeatherInsights(wi);
        setPortfolio(ps.companies ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return {
    forecast: forecast ?? { base: [], wet: [], dry: [] },
    traces,
    wip,
    covenant: covenant ?? {
      headroomThresholdEur: 500_000,
      interestCoverageRatio: 2.4,
      interestCoverageMinimum: 2.0,
      headroomByScenario: { base: 500_000, wet: 400_000, dry: 550_000 },
      wetQuarterEarlyWeeksWorse: true,
    },
    weatherInsights,
    portfolio,
    loading,
    error,
  };
}
