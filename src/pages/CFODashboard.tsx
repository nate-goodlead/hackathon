import { Dashboard6 } from "../components/blocks/dashboard-6";
import type {
  CovenantSummary,
  ForecastData,
  ScenarioId,
  TraceRecord,
  TraceSelection,
  WeatherInsights,
  WipProject,
} from "../types";

interface Props {
  forecast: ForecastData;
  covenant: CovenantSummary;
  traces: TraceRecord[];
  weatherInsights: WeatherInsights | null;
  wip: WipProject[];
  scenario: ScenarioId;
  onScenarioChange: (s: ScenarioId) => void;
  traceSelection: TraceSelection | null;
  onTraceSelect: (s: TraceSelection) => void;
  onTraceClose: () => void;
}

export function CFODashboard(props: Props) {
  return <Dashboard6 {...props} />;
}
