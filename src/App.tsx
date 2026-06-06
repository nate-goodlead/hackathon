import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentPanel } from "./agent/AgentPanel";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { seedData } from "./data/seedData";
import { rowsToExactAccountingEvents } from "./lib/accounting";
import { parseCsv } from "./lib/csv";
import { buildForecastModel, SCENARIOS } from "./lib/forecast";
import {
  buildWeatherStatus,
  fetchLiveWeatherForProjects,
  mergeWeather,
} from "./lib/weather";
import type {
  CashEvent,
  DataBundle,
  ForecastModel,
  ScenarioId,
  TraceContext,
  WeatherLoadState,
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

type SectionId = "overview" | "forecast" | "drivers" | "weather" | "data";

const NAV: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "forecast", label: "13-Week Forecast" },
  { id: "drivers", label: "Drivers" },
  { id: "weather", label: "Weather Impact" },
  { id: "data", label: "Source Data" },
];

function formatCurrency(value: number, compact = false) {
  return compact ? compactCurrency.format(value) : currency.format(value);
}

function signalTone(
  kind: "headroom" | "risk" | "delay",
  summary: ForecastModel["summary"],
): "good" | "warning" | "danger" {
  if (kind === "headroom") {
    if (summary.breachWeek !== null) return "danger";
    if (summary.minHeadroom < summary.covenantFloor * 0.15) return "warning";
    return "good";
  }
  if (kind === "risk") {
    if (summary.cashAtRisk > 500_000) return "danger";
    if (summary.cashAtRisk > 200_000) return "warning";
    return "good";
  }
  if (summary.totalWeatherDelayDays > 40) return "danger";
  if (summary.totalWeatherDelayDays > 15) return "warning";
  return "good";
}

async function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function KpiCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warning" | "danger" | "neutral";
}) {
  return (
    <article className={`kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function App() {
  const [data, setData] = useState<DataBundle>(seedData);
  const [scenario, setScenario] = useState<ScenarioId>("base");
  const [section, setSection] = useState<SectionId>("forecast");
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [importStatus, setImportStatus] = useState("Demo portfolio loaded from seed data.");
  const [weatherLoad, setWeatherLoad] = useState<WeatherLoadState>({
    status: "idle",
    lastUpdated: null,
    citiesLoaded: 0,
    message: "Weather will refresh on load.",
  });

  const model = useMemo(() => buildForecastModel(data, scenario), [data, scenario]);
  const weatherStatus = useMemo(
    () => buildWeatherStatus(data.weatherForecast, weatherLoad),
    [data.weatherForecast, weatherLoad],
  );

  const traceContext: TraceContext = useMemo(
    () => ({
      scenario,
      scenarioLabel: SCENARIOS[scenario].label,
      weatherSource: data.weatherForecast.some((row) => row.source === "open-meteo")
        ? "Open-Meteo live + seed fallback"
        : "Seed weather",
      paymentLagDays: SCENARIOS[scenario].paymentLagDays,
    }),
    [scenario, data.weatherForecast],
  );

  const chartWeeks = model.cashWeeks.map((week) => ({
    label: week.label,
    baselineCashM: week.baselineCash / 1_000_000,
    adjustedCashM: week.adjustedCash / 1_000_000,
    covenantFloorM: week.covenantFloor / 1_000_000,
  }));

  const driverWeeks = model.cashWeeks.map((week) => ({
    label: week.label,
    billingK: week.billingIn / 1_000,
    materialsK: week.materialsOut / 1_000,
    subcontractorsK: week.subcontractorsOut / 1_000,
  }));

  const weekEvents = useMemo(() => {
    if (selectedWeek === null) return [];
    return data.cashEvents
      .filter((event) => event.week === selectedWeek)
      .sort((a, b) => b.amount - a.amount);
  }, [data.cashEvents, selectedWeek]);

  const refreshWeather = useCallback(async () => {
    setWeatherLoad((current) => ({
      ...current,
      status: "loading",
      message: "Fetching Open-Meteo forecasts…",
    }));

    try {
      const { weather, citiesLoaded } = await fetchLiveWeatherForProjects(data.projects);
      setData((current) => ({
        ...current,
        weatherForecast: mergeWeather(current.weatherForecast, weather),
      }));
      const updatedAt = new Date().toLocaleString("nl-NL");
      setWeatherLoad({
        status: "live",
        lastUpdated: updatedAt,
        citiesLoaded,
        message: `Live Weather Active · ${citiesLoaded} cities`,
      });
    } catch (error) {
      setWeatherLoad({
        status: "fallback",
        lastUpdated: null,
        citiesLoaded: 0,
        message:
          error instanceof Error
            ? `Fallback to seed weather (${error.message})`
            : "Fallback to seed weather",
      });
    }
  }, [data.projects]);

  useEffect(() => {
    void refreshWeather();
  }, [refreshWeather]);

  async function importExactCsv(file: File) {
    try {
      const text = await readFile(file);
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setImportStatus(`No usable rows in ${file.name}.`);
        return;
      }
      const events = rowsToExactAccountingEvents(
        rows,
        file.name,
        data.projects.map((project) => ({ id: project.id, name: project.name })),
      );
      if (events.length === 0) {
        setImportStatus(`Could not map any accounting rows from ${file.name}.`);
        return;
      }
      setData((current) => ({
        ...current,
        cashEvents: [...current.cashEvents.filter((event) => event.sourceSystem !== "exact"), ...events],
      }));
      setImportStatus(
        `Exact CSV Import: ${events.length} traceable cash event${events.length === 1 ? "" : "s"} from ${file.name}.`,
      );
      setSection("data");
    } catch (error) {
      setImportStatus(
        `Exact import failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  function renderOverview() {
    const headroomTone = signalTone("headroom", model.summary);
    const riskTone = signalTone("risk", model.summary);
    const delayTone = signalTone("delay", model.summary);

    return (
      <section className="kpi-grid">
        <KpiCard
          label="Projected Cash"
          value={formatCurrency(model.summary.projectedEndCash, true)}
          detail={`Week 13 closing balance · ${SCENARIOS[scenario].shortLabel} scenario`}
          tone="neutral"
        />
        <KpiCard
          label="Covenant Headroom"
          value={formatCurrency(model.summary.minHeadroom, true)}
          detail={
            model.summary.breachWeek !== null
              ? `Breach in week ${model.summary.breachWeek}`
              : `Above ${formatCurrency(model.summary.covenantFloor, true)} floor`
          }
          tone={headroomTone}
        />
        <KpiCard
          label="Cash at Risk"
          value={formatCurrency(model.summary.cashAtRisk, true)}
          detail="Weather-exposed billing receipts"
          tone={riskTone}
        />
        <KpiCard
          label="Weather Delay Days"
          value={String(model.summary.totalWeatherDelayDays)}
          detail={`${model.summary.averageWorkability}% average workability`}
          tone={delayTone}
        />
      </section>
    );
  }

  function renderForecast() {
    return (
      <>
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>13-week cash forecast</h2>
              <p>Baseline plan vs weather-adjusted cash with covenant floor</p>
            </div>
            <span className={`badge ${signalTone("headroom", model.summary)}`}>
              Covenant {signalTone("headroom", model.summary)}
            </span>
          </header>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartWeeks} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#6b7280" />
              <YAxis tickLine={false} axisLine={false} stroke="#6b7280" tickFormatter={(v) => `€${v}M`} />
              <Tooltip formatter={(value: number, name: string) => [`€${value.toFixed(2)}M`, name]} />
              <Legend />
              <ReferenceLine
                y={model.summary.covenantFloor / 1_000_000}
                stroke="#dc2626"
                strokeDasharray="5 5"
                label={{ value: "Covenant floor", position: "insideTopRight", fill: "#dc2626", fontSize: 11 }}
              />
              <Line type="monotone" dataKey="baselineCashM" name="Baseline" stroke="#111827" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="adjustedCashM" name="Weather adjusted" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Week-by-week ledger</h2>
              <p>Click a week to trace figures back to source rows</p>
            </div>
          </header>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="num">Billing</th>
                  <th className="num">Materials</th>
                  <th className="num">Subcontractors</th>
                  <th className="num">Adjusted cash</th>
                  <th className="num">Headroom</th>
                </tr>
              </thead>
              <tbody>
                {model.cashWeeks.map((week) => {
                  const tone = week.headroom < 0 ? "danger" : week.headroom < week.covenantFloor * 0.15 ? "warning" : "good";
                  return (
                    <tr
                      key={week.week}
                      className={selectedWeek === week.week ? "selected" : tone}
                      onClick={() => setSelectedWeek(week.week)}
                    >
                      <td>{week.label}</td>
                      <td className="num positive">{week.billingIn ? formatCurrency(week.billingIn, true) : "–"}</td>
                      <td className="num negative">{week.materialsOut ? `-${formatCurrency(week.materialsOut, true)}` : "–"}</td>
                      <td className="num negative">{week.subcontractorsOut ? `-${formatCurrency(week.subcontractorsOut, true)}` : "–"}</td>
                      <td className="num">{formatCurrency(week.adjustedCash, true)}</td>
                      <td className={`num signal-${tone}`}>{formatCurrency(week.headroom, true)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedWeek !== null && (
            <div className="trace-panel">
              <header>
                <strong>Traceability · Week {selectedWeek}</strong>
                <span>
                  {traceContext.scenarioLabel} · {traceContext.weatherSource}
                  {traceContext.paymentLagDays > 0 ? ` · ${traceContext.paymentLagDays}d payment lag` : ""}
                </span>
              </header>
              <p className="trace-copy">
                Weather lowers site workability, pushing billing inflows later. Under the{" "}
                <strong>{traceContext.scenarioLabel}</strong> scenario, billing receipts include weather delay weeks
                {traceContext.paymentLagDays > 0 ? ` plus ${traceContext.paymentLagDays} payment-lag days` : ""}.
              </p>
              <div className="table-wrap">
                <table className="data-table compact">
                  <thead>
                    <tr>
                      <th>Trace ID</th>
                      <th>Source</th>
                      <th>Account</th>
                      <th>Driver</th>
                      <th>Project</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekEvents.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No direct cash events scheduled this week.</td>
                      </tr>
                    ) : (
                      weekEvents.map((event) => (
                        <TraceRow key={event.id} event={event} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </>
    );
  }

  function renderDrivers() {
    return (
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Cash drivers by week</h2>
            <p>Materials, subcontractors, and billing separated for CFO review</p>
          </div>
        </header>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={driverWeeks} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="#6b7280" />
            <YAxis tickLine={false} axisLine={false} stroke="#6b7280" tickFormatter={(v) => `€${v}k`} />
            <Tooltip formatter={(value: number, name: string) => [`€${value.toFixed(0)}k`, name]} />
            <Legend />
            <Bar dataKey="billingK" name="Billing" stackId="a" fill="#16a34a" />
            <Bar dataKey="materialsK" name="Materials" stackId="a" fill="#ea580c" />
            <Bar dataKey="subcontractorsK" name="Subcontractors" stackId="a" fill="#9ca3af" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    );
  }

  function renderWeather() {
    return (
      <>
        <section className="weather-status-bar">
          <div>
            <strong>
              {weatherStatus.status === "live"
                ? "Live Weather Active"
                : weatherStatus.status === "loading"
                  ? "Refreshing weather…"
                  : "Seed weather fallback"}
            </strong>
            <span>{weatherStatus.message}</span>
          </div>
          <div className="weather-meta">
            {weatherStatus.lastUpdated && <span>Last updated: {weatherStatus.lastUpdated}</span>}
            <button type="button" onClick={() => void refreshWeather()}>
              Refresh now
            </button>
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>How weather shifts billing</h2>
              <p>
                Lost work days push milestone invoices later. Wet scenario adds{" "}
                {SCENARIOS.wet.paymentLagDays} payment-lag days on top of site delays.
              </p>
            </div>
          </header>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>City</th>
                  <th>Risk</th>
                  <th className="num">Delay days</th>
                  <th className="num">Billing exposure</th>
                  <th>Worst week</th>
                </tr>
              </thead>
              <tbody>
                {model.risks.slice(0, 12).map((risk) => (
                  <tr key={risk.project.id}>
                    <td>{risk.project.name}</td>
                    <td>{risk.project.city}</td>
                    <td>
                      <span className={`badge ${risk.riskLevel === "Critical" || risk.riskLevel === "High" ? "danger" : risk.riskLevel === "Medium" ? "warning" : "good"}`}>
                        {risk.riskLevel}
                      </span>
                    </td>
                    <td className="num">{risk.delayDays}</td>
                    <td className="num">{formatCurrency(risk.cashAtRisk, true)}</td>
                    <td>W{risk.worstWeek.week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  function renderData() {
    return (
      <>
        <section className="import-row">
          <label className="import-card">
            <strong>Exact CSV Import</strong>
            <span>account_code, account_name, amount, date, project_reference</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importExactCsv(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <div className="status-box">{importStatus}</div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Source cash events</h2>
              <p>Every forecast figure traces back to these accounting rows</p>
            </div>
            <span>{data.cashEvents.length} rows</span>
          </header>
          <div className="table-wrap tall">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Trace ID</th>
                  <th>System</th>
                  <th>File</th>
                  <th className="num">Row</th>
                  <th>Account</th>
                  <th>Driver</th>
                  <th className="num">Week</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.cashEvents
                  .slice()
                  .sort((a, b) => a.week - b.week || a.traceId.localeCompare(b.traceId))
                  .map((event) => (
                    <TraceRow key={event.id} event={event} showFile />
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="eyebrow">Tier 1 · CFO Dashboard</p>
          <h1>RoofFlow Radar</h1>
        </div>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "active" : ""}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="scenario-toggle" aria-label="Scenario controls">
            {Object.values(SCENARIOS).map((item) => (
              <button
                key={item.id}
                type="button"
                className={scenario === item.id ? "active" : ""}
                onClick={() => setScenario(item.id)}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>
          <div className="topbar-meta">
            <span className={`weather-pill ${weatherStatus.status}`}>
              {weatherStatus.status === "live" ? "Live Weather Active" : weatherStatus.status}
            </span>
            {weatherStatus.lastUpdated && <span>Updated {weatherStatus.lastUpdated}</span>}
          </div>
        </header>

        <main className="content">
          {section === "overview" && renderOverview()}
          {section === "forecast" && renderForecast()}
          {section === "drivers" && renderDrivers()}
          {section === "weather" && renderWeather()}
          {section === "data" && renderData()}
        </main>
      </div>

      <AgentPanel model={model} onSetScenario={setScenario} onRefreshWeather={refreshWeather} />
    </div>
  );
}

function TraceRow({ event, showFile = false }: { event: CashEvent; showFile?: boolean }) {
  if (showFile) {
    return (
      <tr>
        <td>{event.traceId}</td>
        <td>{event.sourceSystem}</td>
        <td>{event.sourceFile}</td>
        <td className="num">{event.sourceRow}</td>
        <td>
          {event.accountCode} · {event.accountName}
        </td>
        <td>
          <span className={`driver driver-${event.driver}`}>{event.driver}</span>
        </td>
        <td className="num">W{event.week}</td>
        <td className={`num ${event.type === "inflow" ? "positive" : "negative"}`}>
          {event.type === "outflow" ? "-" : "+"}
          {formatCurrency(event.amount)}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{event.traceId}</td>
      <td>
        {event.sourceSystem} · {event.sourceFile} row {event.sourceRow}
      </td>
      <td>
        {event.accountCode} · {event.accountName}
      </td>
      <td>
        <span className={`driver driver-${event.driver}`}>{event.driver}</span>
      </td>
      <td>{event.projectId}</td>
      <td className={`num ${event.type === "inflow" ? "positive" : "negative"}`}>
        {event.type === "outflow" ? "-" : "+"}
        {formatCurrency(event.amount)}
      </td>
    </tr>
  );
}
