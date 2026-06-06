import type {
  CashEvent,
  CashWeek,
  Company,
  DataBundle,
  ForecastModel,
  ForecastSummary,
  Project,
  ProjectRiskOutput,
  RiskLevel,
  ScenarioId,
  WeatherForecast,
  WeatherRiskScore,
} from "../types";

export const SCENARIOS: Record<
  ScenarioId,
  {
    id: ScenarioId;
    label: string;
    shortLabel: string;
    description: string;
    penaltyMultiplier: number;
    delayMultiplier: number;
    idleCostMultiplier: number;
    mitigationSavingsPct: number;
    paymentLagDays: number;
  }
> = {
  base: {
    id: "base",
    label: "Base scenario",
    shortLabel: "Base",
    description: "Current weather forecast and normal billing assumptions.",
    penaltyMultiplier: 1,
    delayMultiplier: 1,
    idleCostMultiplier: 1,
    mitigationSavingsPct: 0,
    paymentLagDays: 0,
  },
  wet: {
    id: "wet",
    label: "Wet scenario",
    shortLabel: "Wet",
    description: "Heavy rain and wind delay site work and push billing receipts later.",
    penaltyMultiplier: 1.35,
    delayMultiplier: 1.4,
    idleCostMultiplier: 1.25,
    mitigationSavingsPct: 0,
    paymentLagDays: 5,
  },
  dry: {
    id: "dry",
    label: "Dry scenario",
    shortLabel: "Dry",
    description: "Favourable weather keeps crews productive and billing on schedule.",
    penaltyMultiplier: 0.72,
    delayMultiplier: 0.75,
    idleCostMultiplier: 0.85,
    mitigationSavingsPct: 0.15,
    paymentLagDays: 0,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCurrency(value: number) {
  return Math.round(value / 100) * 100;
}

function signedAmount(event: CashEvent) {
  return event.type === "inflow" ? event.amount : -event.amount;
}

function riskLevel(score: number, exposure: number): RiskLevel {
  if (score < 42 || exposure > 650_000) return "Critical";
  if (score < 58 || exposure > 380_000) return "High";
  if (score < 74 || exposure > 180_000) return "Medium";
  return "Low";
}

export function calculateWeatherRisk(
  weather: WeatherForecast,
  scenario: ScenarioId = "base",
): WeatherRiskScore {
  const config = SCENARIOS[scenario];
  const reasons: string[] = [];
  const rainPenalty =
    Math.max(0, weather.rainMm - 8) * 1.15 +
    Math.max(0, weather.precipProbability - 62) * 0.32;
  const windPenalty = Math.max(0, weather.windGustKmh - 38) * 1.42;
  const heatPenalty = Math.max(0, weather.maxTempC - 29) * 4.15;
  const coldPenalty = Math.max(0, 2 - weather.minTempC) * 5;
  const totalPenalty =
    (rainPenalty + windPenalty + heatPenalty + coldPenalty) * config.penaltyMultiplier;
  const workabilityScore = Math.round(clamp(100 - totalPenalty, 5, 100));

  if (weather.rainMm >= 25 || weather.precipProbability >= 75) {
    reasons.push("heavy rain exposure");
  }
  if (weather.windGustKmh >= 55) {
    reasons.push("unsafe wind gusts");
  }
  if (weather.maxTempC >= 32) {
    reasons.push("heat-stress protocol");
  }
  if (weather.minTempC <= 1) {
    reasons.push("cold curing risk");
  }
  if (reasons.length === 0) {
    reasons.push("normal roofing conditions");
  }

  const rawLostDays =
    workabilityScore >= 82
      ? 0
      : workabilityScore >= 68
        ? 1
        : workabilityScore >= 52
          ? 2
          : workabilityScore >= 36
            ? 3
            : 4;
  const extremeDay = weather.rainMm >= 55 || weather.windGustKmh >= 72 ? 1 : 0;
  const lostDays = Math.round(clamp((rawLostDays + extremeDay) * config.delayMultiplier, 0, 5));

  return {
    week: weather.week,
    workabilityScore,
    lostDays,
    weather,
    reasons,
  };
}

function getWeatherForProject(project: Project, weatherForecast: WeatherForecast[]) {
  return weatherForecast
    .filter((weather) => weather.city === project.city)
    .sort((a, b) => a.week - b.week);
}

function projectInActiveWeek(project: Project, week: number) {
  return week >= project.startWeek && week <= project.startWeek + project.durationWeeks;
}

function recommendationFor(risk: {
  riskLevel: RiskLevel;
  project: Project;
  worstWeek: WeatherRiskScore;
  delayDays: number;
  cashAtRisk: number;
  scenario: ScenarioId;
}) {
  const mainReason = risk.worstWeek.reasons[0];

  if (risk.scenario === "dry") {
    return `Maintain schedule in week ${risk.worstWeek.week}; dry conditions support on-time billing for ${risk.project.phase.toLowerCase()} work.`;
  }

  if (risk.riskLevel === "Critical") {
    return `Escalate by Friday: split ${risk.project.phase.toLowerCase()} scope, pre-stage materials, and renegotiate invoice gate tied to ${mainReason}.`;
  }

  if (risk.riskLevel === "High") {
    return `Pull indoor/prep tasks forward and reserve a recovery crew for week ${risk.worstWeek.week}; ${mainReason} drives the delay.`;
  }

  if (risk.delayDays > 0) {
    return `Monitor daily and batch procurement; likely ${risk.delayDays} lost day${risk.delayDays === 1 ? "" : "s"} from ${mainReason}.`;
  }

  return "Keep schedule as planned; no intervention required beyond normal site safety checks.";
}

export function buildProjectRisks(data: DataBundle, scenario: ScenarioId): ProjectRiskOutput[] {
  const companyById = new Map(data.companies.map((company) => [company.id, company]));
  const cashEventsByProject = new Map<string, CashEvent[]>();

  data.cashEvents.forEach((event) => {
    const events = cashEventsByProject.get(event.projectId) ?? [];
    events.push(event);
    cashEventsByProject.set(event.projectId, events);
  });

  return data.projects.map((project) => {
    const company = companyById.get(project.companyId) ?? data.companies[0];
    const relevantWeather = getWeatherForProject(project, data.weatherForecast);
    const weeklyScores = relevantWeather.map((weather) => calculateWeatherRisk(weather, scenario));
    const activeScores = weeklyScores.filter((score) => projectInActiveWeek(project, score.week));
    const consideredScores = activeScores.length > 0 ? activeScores : weeklyScores.slice(0, 3);
    const worstWeek = consideredScores.reduce((worst, score) =>
      score.workabilityScore < worst.workabilityScore ? score : worst,
    );
    const delayDays = consideredScores.reduce((total, score) => total + score.lostDays, 0);
    const delayWeeks = Math.min(4, Math.ceil(delayDays / 5));
    const projectEvents = cashEventsByProject.get(project.id) ?? [];
    const inflows = projectEvents.filter((event) => event.type === "inflow");
    const nearTermInflow = inflows
      .filter((event) => event.week <= Math.min(13, project.startWeek + project.durationWeeks + 1))
      .reduce((total, event) => total + event.amount, 0);
    const delayedInflow = inflows
      .filter((event) => delayWeeks > 0 && event.week + delayWeeks > event.week)
      .reduce((total, event) => total + event.amount * Math.min(0.72, delayDays / 16), 0);
    const crewIntensity = clamp(project.crewDaysRemaining / Math.max(1, project.durationWeeks * 5), 0.7, 1.7);
    const config = SCENARIOS[scenario];
    const idleCost = roundCurrency(
      delayDays *
        company.laborCostPerDay *
        crewIntensity *
        (project.priority === "Strategic" ? 1.18 : project.priority === "High" ? 1.08 : 0.95) *
        config.idleCostMultiplier,
    );
    const mitigationDiscount = 1 - config.mitigationSavingsPct;
    const cashAtRisk = roundCurrency(
      nearTermInflow * Math.min(0.68, delayDays / 14) * mitigationDiscount,
    );
    const totalExposure = roundCurrency(cashAtRisk + idleCost);
    const level = riskLevel(worstWeek.workabilityScore, totalExposure);

    return {
      project,
      company,
      weeklyScores,
      worstWeek,
      delayDays,
      delayWeeks,
      cashAtRisk,
      delayedInflow: roundCurrency(delayedInflow * mitigationDiscount),
      idleCost,
      totalExposure,
      riskLevel: level,
      recommendation: recommendationFor({
        riskLevel: level,
        project,
        worstWeek,
        delayDays,
        cashAtRisk,
        scenario,
      }),
      privacySafeContext: `${project.city} ${project.phase} project, ${level.toLowerCase()} risk, ${delayDays} modeled lost days.`,
    };
  });
}

export function buildCashWeeks(
  data: DataBundle,
  risks: ProjectRiskOutput[],
  scenario: ScenarioId = "base",
): CashWeek[] {
  const startingCash = data.companies.reduce((total, company) => total + company.cashReserve, 0);
  const covenantFloor = data.companies.reduce((total, company) => total + company.covenantMinimumCash, 0);
  const paymentLagWeeks = Math.ceil(SCENARIOS[scenario].paymentLagDays / 7);
  const riskByProjectId = new Map(risks.map((risk) => [risk.project.id, risk]));
  const weeks: CashWeek[] = Array.from({ length: 13 }, (_, index) => ({
    week: index + 1,
    label: `W${index + 1}`,
    baseline: 0,
    adjusted: 0,
    baselineCash: startingCash,
    adjustedCash: startingCash,
    delayedInflow: 0,
    idleCost: 0,
    delta: 0,
    materialsOut: 0,
    subcontractorsOut: 0,
    billingIn: 0,
    covenantFloor,
    headroom: startingCash - covenantFloor,
  }));

  data.cashEvents.forEach((event) => {
    const baselineWeek = weeks[event.week - 1];
    if (!baselineWeek) return;
    baselineWeek.baseline += signedAmount(event);

    const risk = riskByProjectId.get(event.projectId);
    const weatherShift = event.type === "inflow" ? risk?.delayWeeks ?? 0 : 0;
    const paymentShift =
      event.type === "inflow" && event.driver === "billing" ? paymentLagWeeks : 0;
    const shift = weatherShift + paymentShift;
    const adjustedWeekIndex = Math.min(12, Math.max(0, event.week + shift - 1));
    const adjustedWeek = weeks[adjustedWeekIndex];
    adjustedWeek.adjusted += signedAmount(event);

    if (event.driver === "materials") baselineWeek.materialsOut += event.amount;
    else if (event.driver === "subcontractors") baselineWeek.subcontractorsOut += event.amount;
    else if (event.driver === "billing") baselineWeek.billingIn += event.amount;

    if (shift > 0 && event.type === "inflow") {
      baselineWeek.delayedInflow += event.amount;
    }
  });

  risks.forEach((risk) => {
    if (risk.idleCost <= 0) return;
    const weekIndex = Math.min(12, Math.max(0, risk.worstWeek.week - 1));
    weeks[weekIndex].adjusted -= risk.idleCost;
    weeks[weekIndex].idleCost += risk.idleCost;
  });

  let baselineCash = startingCash;
  let adjustedCash = startingCash;
  weeks.forEach((week) => {
    baselineCash += week.baseline;
    adjustedCash += week.adjusted;
    week.baselineCash = baselineCash;
    week.adjustedCash = adjustedCash;
    week.delta = adjustedCash - baselineCash;
    week.headroom = adjustedCash - covenantFloor;
  });

  return weeks.map((week) => ({
    ...week,
    baseline: roundCurrency(week.baseline),
    adjusted: roundCurrency(week.adjusted),
    baselineCash: roundCurrency(week.baselineCash),
    adjustedCash: roundCurrency(week.adjustedCash),
    delayedInflow: roundCurrency(week.delayedInflow),
    idleCost: roundCurrency(week.idleCost),
    delta: roundCurrency(week.delta),
    materialsOut: roundCurrency(week.materialsOut),
    subcontractorsOut: roundCurrency(week.subcontractorsOut),
    billingIn: roundCurrency(week.billingIn),
    covenantFloor: roundCurrency(week.covenantFloor),
    headroom: roundCurrency(week.headroom),
  }));
}

export function summarizeForecast(data: DataBundle, risks: ProjectRiskOutput[], cashWeeks: CashWeek[]): ForecastSummary {
  const startingCash = data.companies.reduce((total, company) => total + company.cashReserve, 0);
  const covenantFloor = data.companies.reduce((total, company) => total + company.covenantMinimumCash, 0);
  const cashAtRisk = risks.reduce((total, risk) => total + risk.cashAtRisk, 0);
  const delayedInflow = risks.reduce((total, risk) => total + risk.delayedInflow, 0);
  const idleCost = risks.reduce((total, risk) => total + risk.idleCost, 0);
  const allScores = risks.flatMap((risk) => risk.weeklyScores.map((score) => score.workabilityScore));
  const averageWorkability =
    allScores.length > 0
      ? Math.round(allScores.reduce((total, score) => total + score, 0) / allScores.length)
      : 100;
  const worstWeek =
    cashWeeks.reduce((worst, week) => (week.delta < worst.delta ? week : worst), cashWeeks[0])?.week ?? 1;
  const lowestAdjustedCash = Math.min(...cashWeeks.map((week) => week.adjustedCash));
  const criticalProjects = risks.filter((risk) => risk.riskLevel === "Critical").length;
  const bufferNeeded = Math.max(0, startingCash * 0.18 - lowestAdjustedCash);
  const minHeadroom = Math.min(...cashWeeks.map((week) => week.headroom));
  const breachWeek = cashWeeks.find((week) => week.headroom < 0)?.week ?? null;
  const totalWeatherDelayDays = risks.reduce((total, risk) => total + risk.delayDays, 0);
  const projectedEndCash = cashWeeks[cashWeeks.length - 1]?.adjustedCash ?? startingCash;

  return {
    startingCash: roundCurrency(startingCash),
    cashAtRisk: roundCurrency(cashAtRisk),
    delayedInflow: roundCurrency(delayedInflow),
    idleCost: roundCurrency(idleCost),
    bufferNeeded: roundCurrency(bufferNeeded),
    averageWorkability,
    criticalProjects,
    worstWeek,
    lowestAdjustedCash: roundCurrency(lowestAdjustedCash),
    covenantFloor: roundCurrency(covenantFloor),
    minHeadroom: roundCurrency(minHeadroom),
    breachWeek,
    totalWeatherDelayDays,
    projectedEndCash: roundCurrency(projectedEndCash),
  };
}

export function buildForecastModel(data: DataBundle, scenario: ScenarioId): ForecastModel {
  const risks = buildProjectRisks(data, scenario).sort((a, b) => b.totalExposure - a.totalExposure);
  const cashWeeks = buildCashWeeks(data, risks, scenario);
  const summary = summarizeForecast(data, risks, cashWeeks);

  return {
    scenario,
    risks,
    cashWeeks,
    summary,
  };
}

export function getAnalystBrief(model: ForecastModel) {
  const topRisks = model.risks.slice(0, 5);
  const topReasons = Array.from(
    new Set(topRisks.flatMap((risk) => risk.worstWeek.reasons).filter((reason) => reason !== "normal roofing conditions")),
  );
  const exposureByCompany = topRisks.reduce<Record<string, number>>((acc, risk) => {
    acc[risk.company.name] = (acc[risk.company.name] ?? 0) + risk.totalExposure;
    return acc;
  }, {});
  const companyPressure = Object.entries(exposureByCompany).sort((a, b) => b[1] - a[1])[0];
  const actions = topRisks.map((risk, index) => ({
    rank: index + 1,
    title: `${risk.project.city}: ${risk.project.phase} intervention`,
    body: risk.recommendation,
    impact: risk.totalExposure,
  }));
  const draftMessage = `Team — week ${model.summary.worstWeek} is our cash pinch point. Please review the top weather-sensitive sites, lock safety calls 24h ahead, and confirm which invoice gates can be protected with prep work or crew swaps. No schedule changes should be made without project-manager approval.`;

  return {
    headline: `${topRisks.length} priority projects explain most of the weather-adjusted cash gap.`,
    diagnosis:
      topReasons.length > 0
        ? `Primary drivers: ${topReasons.join(", ")}. ${companyPressure?.[0] ?? "The portfolio"} carries the highest near-term exposure.`
        : "No severe weather pattern is detected; preserve cash discipline and keep normal safety checks active.",
    actions,
    draftMessage,
    agentTrail: [
      "Read aggregated project and cash-event data",
      "Scored weather workability by project week",
      "Shifted affected milestone cash receipts",
      "Ranked mitigations by cash exposure and safety risk",
      "Prepared approval-required operations message",
    ],
  };
}
