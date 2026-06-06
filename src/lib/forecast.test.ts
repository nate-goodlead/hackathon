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

  it("models more cash risk under the severe-weather scenario", () => {
    const expected = buildForecastModel(seedData, "expected");
    const severe = buildForecastModel(seedData, "severe");

    expect(severe.summary.cashAtRisk).toBeGreaterThan(expected.summary.cashAtRisk);
    expect(severe.summary.idleCost).toBeGreaterThan(expected.summary.idleCost);
  });

  it("reduces modeled exposure when crew reallocation is applied", () => {
    const expected = buildForecastModel(seedData, "expected");
    const crew = buildForecastModel(seedData, "crew");

    expect(crew.summary.cashAtRisk).toBeLessThan(expected.summary.cashAtRisk);
    expect(crew.summary.averageWorkability).toBe(expected.summary.averageWorkability);
  });
});
