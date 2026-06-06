import { useEffect, useState } from "react";
import type { CovenantSummary, ForecastData, TraceRecord, WeatherInsights, WipProject } from "../types";

interface AppData {
  forecast: ForecastData;
  traces: TraceRecord[];
  wip: WipProject[];
  covenant: CovenantSummary;
  weatherInsights: WeatherInsights | null;
  loading: boolean;
  error: string | null;
}

export function useAppData(): AppData {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [wip, setWip] = useState<WipProject[]>([]);
  const [covenant, setCovenant] = useState<CovenantSummary | null>(null);
  const [weatherInsights, setWeatherInsights] = useState<WeatherInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [f, t, w, c, wi] = await Promise.all([
          fetch("/data/forecast.json").then((r) => r.json()),
          fetch("/data/trace_data.json").then((r) => r.json()),
          fetch("/data/wip_data.json").then((r) => r.json()),
          fetch("/data/covenant_summary.json").then((r) => r.json()),
          fetch("/data/weather_insights.json").then((r) => (r.ok ? r.json() : null)),
        ]);
        setForecast(f);
        setTraces(t);
        setWip(w);
        setCovenant(c);
        setWeatherInsights(wi);
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
    loading,
    error,
  };
}
