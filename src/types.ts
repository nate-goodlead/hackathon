export type ScenarioId = "base" | "wet" | "dry";

export type CashEventType = "inflow" | "outflow";

export type CashDriver = "materials" | "subcontractors" | "billing" | "other";

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type SourceSystem = "seed" | "exact" | "csv" | "gilde" | "yuki" | "snelstart";

export interface Company {
  id: string;
  name: string;
  region: string;
  cashReserve: number;
  laborCostPerDay: number;
  crewCount: number;
  covenantMinimumCash: number;
  color: string;
}

export interface Project {
  id: string;
  companyId: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  phase: string;
  contractValue: number;
  startWeek: number;
  durationWeeks: number;
  startDate: string;
  endDate: string;
  crewDaysRemaining: number;
  marginPct: number;
  priority: "Standard" | "High" | "Strategic";
}

export interface CashEvent {
  id: string;
  projectId: string;
  week: number;
  type: CashEventType;
  driver: CashDriver;
  label: string;
  amount: number;
  sourceSystem: SourceSystem;
  sourceFile: string;
  sourceRow: number;
  accountCode: string;
  accountName: string;
  traceId: string;
}

export interface WeatherForecast {
  city: string;
  week: number;
  rainMm: number;
  windGustKmh: number;
  maxTempC: number;
  minTempC: number;
  precipProbability: number;
  source: "seed" | "csv" | "open-meteo";
}

export interface DataBundle {
  companies: Company[];
  projects: Project[];
  cashEvents: CashEvent[];
  weatherForecast: WeatherForecast[];
}

export interface WeatherLoadState {
  status: "idle" | "loading" | "live" | "fallback";
  lastUpdated: string | null;
  citiesLoaded: number;
  message: string;
}

export interface WeatherRiskScore {
  week: number;
  workabilityScore: number;
  lostDays: number;
  weather: WeatherForecast;
  reasons: string[];
}

export interface ProjectRiskOutput {
  project: Project;
  company: Company;
  weeklyScores: WeatherRiskScore[];
  worstWeek: WeatherRiskScore;
  delayDays: number;
  delayWeeks: number;
  cashAtRisk: number;
  delayedInflow: number;
  idleCost: number;
  totalExposure: number;
  riskLevel: RiskLevel;
  recommendation: string;
  privacySafeContext: string;
}

export interface CashWeek {
  week: number;
  label: string;
  baseline: number;
  adjusted: number;
  baselineCash: number;
  adjustedCash: number;
  delayedInflow: number;
  idleCost: number;
  delta: number;
  materialsOut: number;
  subcontractorsOut: number;
  billingIn: number;
  covenantFloor: number;
  headroom: number;
}

export interface ForecastSummary {
  startingCash: number;
  cashAtRisk: number;
  delayedInflow: number;
  idleCost: number;
  bufferNeeded: number;
  averageWorkability: number;
  criticalProjects: number;
  worstWeek: number;
  lowestAdjustedCash: number;
  covenantFloor: number;
  minHeadroom: number;
  breachWeek: number | null;
  totalWeatherDelayDays: number;
  projectedEndCash: number;
}

export interface ForecastModel {
  scenario: ScenarioId;
  risks: ProjectRiskOutput[];
  cashWeeks: CashWeek[];
  summary: ForecastSummary;
}

export interface TraceContext {
  scenario: ScenarioId;
  scenarioLabel: string;
  weatherSource: string;
  paymentLagDays: number;
}
