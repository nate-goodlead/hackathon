import type { CashEvent, Company, Project, WeatherForecast } from "../types";

type CsvRow = Record<string, string>;

function normalizeKey(key: string) {
  return key.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(normalizeKey);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function get(row: CsvRow, keys: string[], fallback = "") {
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (row[normalized] !== undefined && row[normalized] !== "") {
      return row[normalized];
    }
  }
  return fallback;
}

function num(row: CsvRow, keys: string[], fallback = 0) {
  const value = Number(get(row, keys, String(fallback)).replace(/[€_\s]/g, ""));
  return Number.isFinite(value) ? value : fallback;
}

function priority(value: string): Project["priority"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("strategic")) return "Strategic";
  if (normalized.includes("high")) return "High";
  return "Standard";
}

export function rowsToCompanies(rows: CsvRow[]): Company[] {
  const companies = rows.map((row, index) => ({
    id: get(row, ["id", "company_id"], `company-${index + 1}`),
    name: get(row, ["name", "company_name"], `Imported Company ${index + 1}`),
    region: get(row, ["region", "area"], "Imported portfolio"),
    cashReserve: num(row, ["cash_reserve", "cash", "reserve"], 500_000),
    laborCostPerDay: num(row, ["labor_cost_per_day", "daily_labor_cost"], 5_000),
    crewCount: num(row, ["crew_count", "crews"], 5),
    color: get(row, ["color"], ["#3b82f6", "#06b6d4", "#22c55e", "#f59e0b"][index % 4]),
  }));

  return companies.filter((company) => company.id && company.name);
}

export function rowsToProjects(rows: CsvRow[], fallbackCompanyId: string): Project[] {
  const projects = rows.map((row, index) => {
    const startWeek = Math.max(1, Math.min(13, num(row, ["start_week", "start"], 1)));
    const durationWeeks = Math.max(1, Math.min(13, num(row, ["duration_weeks", "duration"], 5)));

    return {
      id: get(row, ["id", "project_id"], `imported-project-${index + 1}`),
      companyId: get(row, ["company_id", "company"], fallbackCompanyId),
      name: get(row, ["name", "project_name"], `Imported Project ${index + 1}`),
      city: get(row, ["city", "location"], "Amsterdam"),
      lat: num(row, ["lat", "latitude"], 52.3676),
      lng: num(row, ["lng", "lon", "longitude"], 4.9041),
      phase: get(row, ["phase", "stage"], "Waterproofing"),
      contractValue: num(row, ["contract_value", "value", "contract"], 250_000),
      startWeek,
      durationWeeks,
      startDate: get(row, ["start_date"], "2026-06-08"),
      endDate: get(row, ["end_date"], "2026-08-31"),
      crewDaysRemaining: num(row, ["crew_days_remaining", "crew_days"], 25),
      marginPct: num(row, ["margin_pct", "margin"], 16),
      priority: priority(get(row, ["priority"], "Standard")),
    };
  });

  return projects.filter((project) => project.id && project.companyId && Number.isFinite(project.lat));
}

export function rowsToCashEvents(rows: CsvRow[]): CashEvent[] {
  return rows
    .map((row, index) => ({
      id: get(row, ["id"], `cash-event-${index + 1}`),
      projectId: get(row, ["project_id", "project"], ""),
      week: Math.max(1, Math.min(13, num(row, ["week", "due_week"], 1))),
      type: get(row, ["type"], "inflow").toLowerCase().includes("out") ? ("outflow" as const) : ("inflow" as const),
      label: get(row, ["label", "description"], "Imported cash event"),
      amount: Math.abs(num(row, ["amount", "value"], 0)),
    }))
    .filter((event) => event.projectId && event.amount > 0);
}

export function rowsToWeather(rows: CsvRow[]): WeatherForecast[] {
  return rows
    .map((row) => ({
      city: get(row, ["city", "location"], ""),
      week: Math.max(1, Math.min(13, num(row, ["week"], 1))),
      rainMm: num(row, ["rain_mm", "precipitation_sum", "rain"], 0),
      windGustKmh: num(row, ["wind_gust_kmh", "wind_gusts", "wind"], 30),
      maxTempC: num(row, ["max_temp_c", "temperature_2m_max", "max_temp"], 22),
      minTempC: num(row, ["min_temp_c", "temperature_2m_min", "min_temp"], 10),
      precipProbability: num(row, ["precip_probability", "precipitation_probability"], 45),
      source: "csv" as const,
    }))
    .filter((weather) => weather.city);
}
