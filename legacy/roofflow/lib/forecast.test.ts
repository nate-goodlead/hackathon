import { describe, expect, it } from "vitest";
import { seedData } from "../data/seedData";
import { buildForecastModel, calculateWeatherRisk } from "./forecast";

describe("forecast engine", () => {
  it("lowers workability when rain and wind become unsafe", () => {
    const calm = calculateWeatherRisk({
      city: "Amsterdam",
      week: 1,
      rainMm: 2,
      windGustKmh: 24,
      maxTempC: 22,
      minTempC: 11,
      precipProbability: 20,
      source: "seed",
    });

    const storm = calculateWeatherRisk({
      city: "Amsterdam",
      week: 1,
      rainMm: 58,
      windGustKmh: 78,
      maxTempC: 22,
      minTempC: 11,
      precipProbability: 92,
      source: "seed",
    });

    expect(storm.workabilityScore).toBeLessThan(calm.workabilityScore);
    expect(storm.lostDays).toBeGreaterThan(calm.lostDays);
  });

  it("models more cash risk under the wet scenario", () => {
    const base = buildForecastModel(seedData, "base");
    const wet = buildForecastModel(seedData, "wet");

    expect(wet.summary.cashAtRisk).toBeGreaterThan(base.summary.cashAtRisk);
    expect(wet.summary.idleCost).toBeGreaterThan(base.summary.idleCost);
    expect(wet.summary.totalWeatherDelayDays).toBeGreaterThanOrEqual(base.summary.totalWeatherDelayDays);
  });

  it("reduces modeled exposure under the dry scenario", () => {
    const base = buildForecastModel(seedData, "base");
    const dry = buildForecastModel(seedData, "dry");

    expect(dry.summary.cashAtRisk).toBeLessThan(base.summary.cashAtRisk);
    expect(dry.summary.averageWorkability).toBeGreaterThanOrEqual(base.summary.averageWorkability);
  });

  it("tracks covenant headroom and weather delay days", () => {
    const model = buildForecastModel(seedData, "base");

    expect(model.summary.covenantFloor).toBeGreaterThan(0);
    expect(model.summary.totalWeatherDelayDays).toBeGreaterThan(0);
    expect(model.cashWeeks).toHaveLength(13);
    expect(model.cashWeeks[0].materialsOut).toBeGreaterThanOrEqual(0);
  });
});
