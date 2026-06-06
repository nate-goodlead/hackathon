import type { Project, WeatherForecast, WeatherLoadState } from "../types";

export function mergeWeather(base: WeatherForecast[], incoming: WeatherForecast[]): WeatherForecast[] {
  const key = (weather: WeatherForecast) => `${weather.city.toLowerCase()}-${weather.week}`;
  const merged = new Map(base.map((weather) => [key(weather), weather]));
  incoming.forEach((weather) => merged.set(key(weather), weather));
  return Array.from(merged.values()).sort((a, b) => a.city.localeCompare(b.city) || a.week - b.week);
}

export async function fetchLiveWeatherForProjects(
  projects: Project[],
  maxCities = 18,
): Promise<{ weather: WeatherForecast[]; citiesLoaded: number }> {
  const cityProjects = Array.from(
    projects
      .reduce<Map<string, Project>>((map, project) => {
        if (!map.has(project.city)) map.set(project.city, project);
        return map;
      }, new Map())
      .values(),
  ).slice(0, maxCities);

  const liveWeatherGroups = await Promise.all(
    cityProjects.map(async (project) => {
      const params = new URLSearchParams({
        latitude: String(project.lat),
        longitude: String(project.lng),
        daily:
          "precipitation_sum,precipitation_probability_max,temperature_2m_max,temperature_2m_min,wind_gusts_10m_max",
        forecast_days: "14",
        timezone: "Europe/Amsterdam",
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
      if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
      const payload = (await response.json()) as {
        daily: {
          precipitation_sum: number[];
          precipitation_probability_max: number[];
          temperature_2m_max: number[];
          temperature_2m_min: number[];
          wind_gusts_10m_max: number[];
        };
      };

      return Array.from({ length: 13 }, (_, weekIndex) => {
        const start = weekIndex * 7;
        const end = start + 7;
        const rain = payload.daily.precipitation_sum.slice(start, end);
        const gusts = payload.daily.wind_gusts_10m_max.slice(start, end);
        const maxTemps = payload.daily.temperature_2m_max.slice(start, end);
        const minTemps = payload.daily.temperature_2m_min.slice(start, end);
        const probs = payload.daily.precipitation_probability_max.slice(start, end);

        return {
          city: project.city,
          week: weekIndex + 1,
          rainMm: Math.round(rain.reduce((total, value) => total + (value ?? 0), 0)),
          windGustKmh: Math.round(Math.max(...gusts.filter(Number.isFinite), 30)),
          maxTempC: Math.round(Math.max(...maxTemps.filter(Number.isFinite), 22)),
          minTempC: Math.round(Math.min(...minTemps.filter(Number.isFinite), 10)),
          precipProbability: Math.round(Math.max(...probs.filter(Number.isFinite), 40)),
          source: "open-meteo" as const,
        };
      });
    }),
  );

  return {
    weather: liveWeatherGroups.flat(),
    citiesLoaded: cityProjects.length,
  };
}

export function buildWeatherStatus(
  weatherForecast: WeatherForecast[],
  loadState: Pick<WeatherLoadState, "status" | "lastUpdated" | "citiesLoaded" | "message">,
): WeatherLoadState {
  const liveRows = weatherForecast.filter((row) => row.source === "open-meteo").length;
  if (loadState.status === "loading") return loadState;
  if (loadState.status === "live" && liveRows > 0) {
    return {
      ...loadState,
      message: `Live Weather Active · ${loadState.citiesLoaded} cities · ${liveRows} forecast rows`,
    };
  }
  if (loadState.status === "fallback") {
    return {
      ...loadState,
      message: loadState.message || "Using seeded weather fallback",
    };
  }
  return loadState;
}
