import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { seedData } from "./data/seedData";
import { getAnalystBrief, buildForecastModel, SCENARIOS } from "./lib/forecast";
import {
  parseCsv,
  rowsToCashEvents,
  rowsToCompanies,
  rowsToProjects,
  rowsToWeather,
} from "./lib/csv";
import type {
  CashEvent,
  Company,
  DataBundle,
  ForecastModel,
  Project,
  ProjectRiskOutput,
  ScenarioId,
  WeatherForecast,
} from "./types";

const currency = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 1,
  notation: "compact",
});

const numberFormat = new Intl.NumberFormat("nl-NL", {
  maximumFractionDigits: 0,
});

function formatCurrency(value: number, compact = false) {
  return compact ? compactCurrency.format(value) : currency.format(value);
}

function riskColor(level: ProjectRiskOutput["riskLevel"]) {
  if (level === "Critical") return "#ef4444";
  if (level === "High") return "#f97316";
  if (level === "Medium") return "#eab308";
  return "#22c55e";
}

function mergeWeather(base: WeatherForecast[], incoming: WeatherForecast[]) {
  const key = (weather: WeatherForecast) => `${weather.city.toLowerCase()}-${weather.week}`;
  const merged = new Map(base.map((weather) => [key(weather), weather]));
  incoming.forEach((weather) => merged.set(key(weather), weather));
  return Array.from(merged.values()).sort((a, b) => a.city.localeCompare(b.city) || a.week - b.week);
}

async function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function ProjectRiskMap({
  risks,
  selectedId,
  onSelect,
}: {
  risks: ProjectRiskOutput[];
  selectedId?: string;
  onSelect: (projectId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [52.1, 5.25],
      zoom: 7,
      scrollWheelZoom: false,
      zoomControl: false,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    setTimeout(() => map.invalidateSize(), 100);
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;

    layerRef.current.clearLayers();
    risks.forEach((risk) => {
      const radius = Math.max(8, Math.min(28, 8 + risk.totalExposure / 55_000));
      const selected = risk.project.id === selectedId;
      const marker = L.circleMarker([risk.project.lat, risk.project.lng], {
        radius: selected ? radius + 4 : radius,
        color: selected ? "#f8fafc" : riskColor(risk.riskLevel),
        weight: selected ? 4 : 2,
        fillColor: riskColor(risk.riskLevel),
        fillOpacity: selected ? 0.92 : 0.72,
      });

      marker.bindTooltip(
        `<strong>${risk.project.city}</strong><br/>${risk.project.name}<br/>Exposure: ${formatCurrency(
          risk.totalExposure,
          true,
        )}<br/>Worst week: W${risk.worstWeek.week}`,
      );
      marker.on("click", () => onSelect(risk.project.id));
      marker.addTo(layerRef.current!);
    });
  }, [risks, selectedId, onSelect]);

  return <div className="map" ref={containerRef} />;
}

function CsvImportCard({
  title,
  description,
  onImport,
}: {
  title: string;
  description: string;
  onImport: (file: File) => void;
}) {
  return (
    <label className="import-card">
      <span>{title}</span>
      <small>{description}</small>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImport(file);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "danger" | "good" | "warning";
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ProjectDetail({ risk, cashEvents }: { risk: ProjectRiskOutput; cashEvents: CashEvent[] }) {
  const projectCashEvents = cashEvents
    .filter((event) => event.projectId === risk.project.id)
    .sort((a, b) => a.week - b.week);

  return (
    <section className="panel project-detail">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project Drilldown</p>
          <h2>{risk.project.name}</h2>
        </div>
        <span className="risk-pill" style={{ color: riskColor(risk.riskLevel), borderColor: riskColor(risk.riskLevel) }}>
          {risk.riskLevel}
        </span>
      </div>
      <div className="detail-grid">
        <div>
          <span>Company</span>
          <strong>{risk.company.name}</strong>
        </div>
        <div>
          <span>Phase</span>
          <strong>{risk.project.phase}</strong>
        </div>
        <div>
          <span>Worst week</span>
          <strong>W{risk.worstWeek.week}</strong>
        </div>
        <div>
          <span>Modeled delay</span>
          <strong>{risk.delayDays} days</strong>
        </div>
      </div>
      <div className="weather-strip" aria-label="13 week workability scores">
        {risk.weeklyScores.map((score) => (
          <div
            key={score.week}
            className="weather-bar"
            title={`Week ${score.week}: ${score.workabilityScore}% workability`}
          >
            <span style={{ height: `${score.workabilityScore}%`, background: score.workabilityScore < 50 ? "#ef4444" : score.workabilityScore < 70 ? "#f59e0b" : "#22c55e" }} />
            <small>W{score.week}</small>
          </div>
        ))}
      </div>
      <div className="recommendation">
        <strong>Recommended action</strong>
        <p>{risk.recommendation}</p>
      </div>
      <div className="cash-event-list">
        {projectCashEvents.map((event) => (
          <div key={event.id}>
            <span>
              W{event.week} · {event.label}
            </span>
            <strong className={event.type === "inflow" ? "positive" : "negative"}>
              {event.type === "outflow" ? "-" : "+"}
              {formatCurrency(event.amount)}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalystPanel({ model }: { model: ForecastModel }) {
  const brief = useMemo(() => getAnalystBrief(model), [model]);

  return (
    <section className="panel analyst-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Weather Cash Analyst</p>
          <h2>Agentic mitigation plan</h2>
        </div>
        <span className="privacy-badge">Aggregated context only</span>
      </div>
      <p className="analyst-headline">{brief.headline}</p>
      <p className="muted">{brief.diagnosis}</p>
      <div className="agent-trail">
        {brief.agentTrail.map((step, index) => (
          <div key={step}>
            <span>{index + 1}</span>
            {step}
          </div>
        ))}
      </div>
      <div className="action-list">
        {brief.actions.map((action) => (
          <article key={action.rank}>
            <span>#{action.rank}</span>
            <div>
              <strong>{action.title}</strong>
              <p>{action.body}</p>
            </div>
            <em>{formatCurrency(action.impact, true)}</em>
          </article>
        ))}
      </div>
      <div className="draft-message">
        <strong>Draft ops message</strong>
        <p>{brief.draftMessage}</p>
      </div>
    </section>
  );
}

export default function App() {
  const [data, setData] = useState<DataBundle>(seedData);
  const [scenario, setScenario] = useState<ScenarioId>("expected");
  const [selectedProjectId, setSelectedProjectId] = useState(seedData.projects[0].id);
  const [importStatus, setImportStatus] = useState("Seeded demo portfolio loaded.");
  const [liveStatus, setLiveStatus] = useState("Open-Meteo live refresh is optional for demo mode.");

  const model = useMemo(() => buildForecastModel(data, scenario), [data, scenario]);
  const selectedRisk =
    model.risks.find((risk) => risk.project.id === selectedProjectId) ?? model.risks[0];

  const chartWeeks = model.cashWeeks.map((week) => ({
    ...week,
    baselineCashM: week.baselineCash / 1_000_000,
    adjustedCashM: week.adjustedCash / 1_000_000,
    delayedInflowK: week.delayedInflow / 1_000,
    idleCostK: week.idleCost / 1_000,
  }));

  const waterfall = [
    { name: "Delayed inflow", value: -model.summary.delayedInflow / 1_000 },
    { name: "Idle labor", value: -model.summary.idleCost / 1_000 },
    { name: "Cash at risk", value: -model.summary.cashAtRisk / 1_000 },
    { name: "Buffer need", value: -model.summary.bufferNeeded / 1_000 },
  ];

  async function importCsv(kind: "companies" | "projects" | "cash" | "weather", file: File) {
    try {
      const text = await readFile(file);
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setImportStatus(`No usable rows found in ${file.name}; keeping current data.`);
        return;
      }

      setData((current) => {
        if (kind === "companies") {
          const companies = rowsToCompanies(rows);
          if (companies.length === 0) return current;
          return { ...current, companies };
        }
        if (kind === "projects") {
          const projects = rowsToProjects(rows, current.companies[0]?.id ?? "company-1");
          if (projects.length === 0) return current;
          return { ...current, projects };
        }
        if (kind === "cash") {
          const cashEvents = rowsToCashEvents(rows);
          if (cashEvents.length === 0) return current;
          return { ...current, cashEvents };
        }
        const weatherForecast = rowsToWeather(rows);
        if (weatherForecast.length === 0) return current;
        return { ...current, weatherForecast: mergeWeather(current.weatherForecast, weatherForecast) };
      });
      setImportStatus(`Imported ${rows.length} ${kind} row${rows.length === 1 ? "" : "s"} from ${file.name}.`);
    } catch (error) {
      setImportStatus(`Could not import ${file.name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

  async function fetchLiveWeather() {
    setLiveStatus("Fetching Open-Meteo forecasts for active project cities…");
    const cityProjects = Array.from(
      data.projects
        .reduce<Map<string, Project>>((map, project) => {
          if (!map.has(project.city)) map.set(project.city, project);
          return map;
        }, new Map())
        .values(),
    ).slice(0, 18);

    try {
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

          return [0, 1].map((weekOffset) => {
            const start = weekOffset * 7;
            const end = start + 7;
            const rain = payload.daily.precipitation_sum.slice(start, end);
            const gusts = payload.daily.wind_gusts_10m_max.slice(start, end);
            const maxTemps = payload.daily.temperature_2m_max.slice(start, end);
            const minTemps = payload.daily.temperature_2m_min.slice(start, end);
            const probs = payload.daily.precipitation_probability_max.slice(start, end);

            return {
              city: project.city,
              week: weekOffset + 1,
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

      const liveWeather = liveWeatherGroups.flat();
      setData((current) => ({
        ...current,
        weatherForecast: mergeWeather(current.weatherForecast, liveWeather),
      }));
      setLiveStatus(`Live weather refreshed for ${cityProjects.length} cities via Open-Meteo.`);
    } catch (error) {
      setLiveStatus(
        `Live refresh failed (${error instanceof Error ? error.message : "unknown error"}). Seeded weather remains active.`,
      );
    }
  }

  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Altis Group Hackathon MVP</p>
          <h1>RoofFlow Radar</h1>
          <p className="hero-copy">
            A weather-aware cash-flow control tower for roofing acquisition portfolios:
            forecast disruption, quantify cash impact, and trigger safe mitigation before
            crews sit idle.
          </p>
          <div className="hero-actions">
            <button onClick={fetchLiveWeather}>Refresh live weather</button>
            <button className="secondary" onClick={() => setData(seedData)}>
              Reset demo data
            </button>
          </div>
        </div>
        <div className="hero-card">
          <span>13-week weather-adjusted cash gap</span>
          <strong>{formatCurrency(model.summary.cashAtRisk + model.summary.idleCost, true)}</strong>
          <small>
            Worst pressure in week {model.summary.worstWeek}; average workability{" "}
            {model.summary.averageWorkability}%
          </small>
        </div>
      </section>

      <section className="scenario-bar" aria-label="Scenario controls">
        {Object.values(SCENARIOS).map((item) => (
          <button
            key={item.id}
            className={scenario === item.id ? "active" : ""}
            onClick={() => setScenario(item.id)}
          >
            <strong>{item.shortLabel}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </section>

      <section className="status-grid">
        <div className="status-card">{importStatus}</div>
        <div className="status-card">{liveStatus}</div>
        <div className="status-card">Privacy: AI analyst sees aggregated risk outputs, not raw contracts.</div>
      </section>

      <section className="import-grid">
        <CsvImportCard
          title="Import companies"
          description="id, name, cash_reserve, labor_cost_per_day"
          onImport={(file) => importCsv("companies", file)}
        />
        <CsvImportCard
          title="Import projects"
          description="project_id, company_id, city, contract_value"
          onImport={(file) => importCsv("projects", file)}
        />
        <CsvImportCard
          title="Import cash events"
          description="project_id, week, type, amount"
          onImport={(file) => importCsv("cash", file)}
        />
        <CsvImportCard
          title="Import weather"
          description="city, week, rain_mm, wind_gust_kmh"
          onImport={(file) => importCsv("weather", file)}
        />
      </section>

      <section className="kpi-grid">
        <KpiCard
          label="Cash at risk"
          value={formatCurrency(model.summary.cashAtRisk, true)}
          detail="Delayed or exposed milestone receipts"
          tone="danger"
        />
        <KpiCard
          label="Idle labor cost"
          value={formatCurrency(model.summary.idleCost, true)}
          detail="Modeled weather downtime across crews"
          tone="warning"
        />
        <KpiCard
          label="Buffer needed"
          value={formatCurrency(model.summary.bufferNeeded, true)}
          detail="Extra liquidity to preserve safety margin"
          tone={model.summary.bufferNeeded > 0 ? "danger" : "good"}
        />
        <KpiCard
          label="Critical projects"
          value={String(model.summary.criticalProjects)}
          detail={`${data.projects.length} active projects in the portfolio`}
          tone={model.summary.criticalProjects > 0 ? "danger" : "good"}
        />
      </section>

      <section className="dashboard-grid">
        <article className="panel cash-chart">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CFO View</p>
              <h2>Baseline vs weather-adjusted cash</h2>
            </div>
            <span>{SCENARIOS[scenario].label}</span>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <ComposedChart data={chartWeeks} margin={{ left: 12, right: 18, top: 12, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#94a3b8" />
              <YAxis
                tickLine={false}
                axisLine={false}
                stroke="#94a3b8"
                tickFormatter={(value) => `€${value}M`}
              />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid rgba(148, 163, 184, 0.25)", borderRadius: 16 }}
                formatter={(value: number, name: string) => [
                  name.includes("Cash") ? `€${value.toFixed(2)}M` : `€${value.toFixed(0)}k`,
                  name,
                ]}
              />
              <Legend />
              <Bar dataKey="delayedInflowK" name="Delayed inflow (€k)" fill="#f97316" radius={[8, 8, 0, 0]} />
              <Bar dataKey="idleCostK" name="Idle cost (€k)" fill="#ef4444" radius={[8, 8, 0, 0]} />
              <Line
                type="monotone"
                dataKey="baselineCashM"
                name="Baseline Cash (€M)"
                stroke="#60a5fa"
                strokeWidth={3}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="adjustedCashM"
                name="Weather Adjusted Cash (€M)"
                stroke="#f8fafc"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </article>

        <article className="panel waterfall">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Risk Waterfall</p>
              <h2>What creates the cash gap?</h2>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={waterfall} margin={{ left: 4, right: 14, top: 12, bottom: 12 }}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="#94a3b8" />
              <YAxis tickLine={false} axisLine={false} stroke="#94a3b8" tickFormatter={(value) => `€${value}k`} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid rgba(148, 163, 184, 0.25)", borderRadius: 16 }}
                formatter={(value: number) => [`€${Math.abs(value).toFixed(0)}k`, "impact"]}
              />
              <Bar dataKey="value" fill="#fb7185" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
      </section>

      <section className="map-risk-grid">
        <article className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Portfolio Map</p>
              <h2>Where weather hits cash</h2>
            </div>
            <span>{data.weatherForecast.filter((weather) => weather.source === "open-meteo").length > 0 ? "Live + seed" : "Seed forecast"}</span>
          </div>
          <ProjectRiskMap
            risks={model.risks}
            selectedId={selectedRisk.project.id}
            onSelect={setSelectedProjectId}
          />
        </article>

        <article className="panel top-risks">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Top Exposure</p>
              <h2>Projects to manage now</h2>
            </div>
          </div>
          <div className="risk-table">
            {model.risks.slice(0, 8).map((risk) => (
              <button
                key={risk.project.id}
                className={risk.project.id === selectedRisk.project.id ? "selected" : ""}
                onClick={() => setSelectedProjectId(risk.project.id)}
              >
                <span className="risk-dot" style={{ background: riskColor(risk.riskLevel) }} />
                <div>
                  <strong>{risk.project.city}</strong>
                  <small>{risk.project.name}</small>
                </div>
                <em>{formatCurrency(risk.totalExposure, true)}</em>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="lower-grid">
        <ProjectDetail risk={selectedRisk} cashEvents={data.cashEvents} />
        <AnalystPanel model={model} />
      </section>

      <section className="safety-strip">
        <article>
          <strong>No autonomous schedule changes</strong>
          <span>Every recommendation requires PM/CFO approval before action.</span>
        </article>
        <article>
          <strong>Privacy-safe AI context</strong>
          <span>Analyst uses aggregated risk outputs, not raw contract exports.</span>
        </article>
        <article>
          <strong>Explainable model</strong>
          <span>Weather thresholds convert directly into workability and cash shifts.</span>
        </article>
      </section>

      <footer>
        <span>
          Demo portfolio: {numberFormat.format(data.companies.length)} companies ·{" "}
          {numberFormat.format(data.projects.length)} projects · 13-week horizon.
        </span>
        <span>
          Weather data can refresh from{" "}
          <a href="https://open-meteo.com/en/docs" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
          ; production path can add KNMI open data attribution.
        </span>
      </footer>
    </main>
  );
}
