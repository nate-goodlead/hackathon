#!/usr/bin/env python3
"""Person 2: Five-driver 13-week forecast with base/wet/dry scenarios."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from paths import data_path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "output"
PUBLIC = ROOT / "public" / "data"

START = date.today() - timedelta(days=date.today().weekday())
WEEKS = 13
MATERIALS_LAG_DAYS = 30
PAYMENT_LAG = {"small": 30, "large": 45}
RAIN_THRESHOLD = 5.0
FROST_THRESHOLD = 0.0


@dataclass
class Milestone:
    project_id: str
    project_name: str
    opco: str
    city: str
    milestone_name: str
    billing: float
    scheduled_week: int
    customer_segment: str
    pct: float


@dataclass
class TraceRecord:
    week: int
    driver: str
    amount: float
    scenario: str
    source_system: str
    gl_account: str
    project_id: str
    project_name: str
    assumption: str


def load_unified() -> list[dict]:
    rows = []
    with (OUT / "unified_data.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            row["amount"] = float(row["amount"])
            row["week"] = min(WEEKS, max(1, (date.fromisoformat(row["date"]) - START).days // 7 + 1))
            rows.append(row)
    return rows


def load_milestones() -> list[Milestone]:
    milestones = []
    with data_path("projects_wip.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            milestones.append(Milestone(
                project_id=row["project_id"],
                project_name=row["project_name"],
                opco=row["opco"],
                city=row.get("city", "Heeze"),
                milestone_name=row["milestone_name"],
                billing=float(row["milestone_billing"]),
                scheduled_week=int(row["scheduled_week"]),
                customer_segment=row["customer_segment"],
                pct=float(row["milestone_pct"]),
            ))
    return milestones


def load_weather_by_city() -> dict[str, dict[int, float]]:
    """Delay days per city per week from Open-Meteo weather.csv."""
    by_city_week: dict[str, dict[int, list[float]]] = defaultdict(lambda: defaultdict(list))
    with data_path("weather.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            city = row["city"]
            w = int(row["week"])
            if row.get("delay_days"):
                delay = float(row["delay_days"])
            elif row.get("stoppage_days"):
                delay = float(row["stoppage_days"])
            else:
                rain = float(row["rainfall_mm"])
                temp_min = float(row["temp_min_c"])
                delay = 0.0
                if rain > RAIN_THRESHOLD:
                    delay += 1
                if temp_min < FROST_THRESHOLD:
                    delay += 1
            by_city_week[city][w].append(delay)
    return {
        city: {w: sum(v) / len(v) for w, v in weeks.items()}
        for city, weeks in by_city_week.items()
    }


def load_weather() -> dict[int, float]:
    """Fallback: average delay days per week across all cities."""
    by_city = load_weather_by_city()
    by_week: dict[int, list[float]] = defaultdict(list)
    for city_delays in by_city.values():
        for w, d in city_delays.items():
            by_week[w].append(d)
    return {w: sum(v) / len(v) for w, v in by_week.items()}


def load_covenant() -> dict:
    return json.loads(data_path("covenant_terms.json").read_text(encoding="utf-8"))


def shift_week(week: int, delay_days: int) -> int:
    delay_weeks = delay_days // 5 + (1 if delay_days % 5 else 0)
    return min(WEEKS, max(1, week + delay_weeks))


def scenario_rain_multiplier(scenario: str) -> float:
    if scenario == "wet":
        return 2.0
    if scenario == "dry":
        return 0.5
    return 1.0


def empty_weeks() -> list[dict]:
    return [{
        "week": w,
        "label": f"W{w}",
        "materials": 0.0,
        "subcontractors": 0.0,
        "milestoneBilling": 0.0,
        "paymentLag": 0.0,
        "weatherImpact": 0.0,
        "net": 0.0,
    } for w in range(1, WEEKS + 1)]


def build_materials(unified: list[dict], weeks: list[dict], traces: list[TraceRecord], scenario: str) -> None:
    for row in unified:
        if row["gl_category"] != "materials":
            continue
        order_date = date.fromisoformat(row["date"])
        cash_date = order_date + timedelta(days=MATERIALS_LAG_DAYS)
        w = min(WEEKS, max(1, (cash_date - START).days // 7 + 1))
        weeks[w - 1]["materials"] += row["amount"]
        traces.append(TraceRecord(
            week=w, driver="materials", amount=row["amount"], scenario=scenario,
            source_system=row["source_system"], gl_account=row["gl_account"],
            project_id=row["project_id"], project_name=row["description"],
            assumption=f"net-{MATERIALS_LAG_DAYS} payment lag on materials order",
        ))


def build_subcontractors(unified: list[dict], milestones: list[Milestone], weeks: list[dict], traces: list[TraceRecord], scenario: str) -> None:
    sub_by_project = defaultdict(list)
    for row in unified:
        if row["gl_category"] == "subcontractors":
            sub_by_project[row["project_id"]].append(row)

    for ms in milestones:
        events = sub_by_project.get(ms.project_id, [])
        if not events:
            continue
        amount = sum(e["amount"] for e in events) / len(events)
        w = ms.scheduled_week
        weeks[w - 1]["subcontractors"] += amount
        src = events[0]
        traces.append(TraceRecord(
            week=w, driver="subcontractors", amount=amount, scenario=scenario,
            source_system=src["source_system"], gl_account=src["gl_account"],
            project_id=ms.project_id, project_name=ms.project_name,
            assumption=f"Released at {ms.milestone_name} milestone ({ms.pct:.0%} complete)",
        ))


def build_billing_and_weather(
    milestones: list[Milestone],
    weather_by_city: dict[str, dict[int, float]],
    base_delay: dict[int, float],
    scenario: str,
    weeks: list[dict],
    traces: list[TraceRecord],
) -> None:
    for ms in milestones:
        city_delay = weather_by_city.get(ms.city, base_delay)
        base_delay_val = city_delay.get(ms.scheduled_week, base_delay.get(ms.scheduled_week, 0))
        if scenario == "wet":
            delay_days = int(round(base_delay_val * 2)) + (1 if ms.scheduled_week <= 6 else 0)
        elif scenario == "dry":
            delay_days = max(0, int(round(base_delay_val * 0.5)) - 1)
        else:
            delay_days = int(round(base_delay_val))
        base_week = ms.scheduled_week
        adjusted_week = shift_week(base_week, delay_days)

        weeks[adjusted_week - 1]["milestoneBilling"] += ms.billing
        traces.append(TraceRecord(
            week=adjusted_week, driver="milestoneBilling", amount=ms.billing, scenario=scenario,
            source_system="WIP", gl_account="8000",
            project_id=ms.project_id, project_name=ms.project_name,
            assumption=f"Milestone {ms.milestone_name} invoiceable W{adjusted_week} (scheduled W{base_week})",
        ))

        if adjusted_week > base_week:
            gap = -ms.billing
            weeks[base_week - 1]["weatherImpact"] += gap
            traces.append(TraceRecord(
                week=base_week, driver="weatherImpact", amount=gap, scenario=scenario,
                source_system="Weather", gl_account="—",
                project_id=ms.project_id, project_name=ms.project_name,
                assumption=f"Rain/frost in {ms.city} delay {delay_days}d → billing shifted W{base_week}→W{adjusted_week} ({scenario})",
            ))


def build_payment_lag(
    milestones: list[Milestone],
    weather_by_city: dict[str, dict[int, float]],
    base_delay: dict[int, float],
    scenario: str,
    weeks: list[dict],
    traces: list[TraceRecord],
) -> None:
    for ms in milestones:
        city_delay = weather_by_city.get(ms.city, base_delay)
        base_delay_val = city_delay.get(ms.scheduled_week, base_delay.get(ms.scheduled_week, 0))
        if scenario == "wet":
            delay_days = int(round(base_delay_val * 2)) + (1 if ms.scheduled_week <= 6 else 0)
        elif scenario == "dry":
            delay_days = max(0, int(round(base_delay_val * 0.5)) - 1)
        else:
            delay_days = int(round(base_delay_val))
        billing_week = shift_week(ms.scheduled_week, delay_days)
        lag_days = PAYMENT_LAG[ms.customer_segment]
        cash_week = shift_week(billing_week, lag_days)
        lag_effect = -ms.billing * 0.15
        weeks[cash_week - 1]["paymentLag"] += lag_effect
        traces.append(TraceRecord(
            week=cash_week, driver="paymentLag", amount=lag_effect, scenario=scenario,
            source_system="Assumption", gl_account="—",
            project_id=ms.project_id, project_name=ms.project_name,
            assumption=f"{lag_days}-day customer payment lag ({ms.customer_segment} customer)",
        ))


def finalize_net(weeks: list[dict]) -> None:
    for w in weeks:
        w["net"] = round(
            w["materials"] + w["subcontractors"] + w["milestoneBilling"] + w["paymentLag"] + w["weatherImpact"]
        )
        for k in ("materials", "subcontractors", "milestoneBilling", "paymentLag", "weatherImpact", "net"):
            w[k] = round(w[k])


def build_scenario(
    unified: list[dict],
    milestones: list[Milestone],
    weather_by_city: dict[str, dict[int, float]],
    base_delay: dict[int, float],
    scenario: str,
) -> tuple[list[dict], list[TraceRecord]]:
    weeks = empty_weeks()
    traces: list[TraceRecord] = []
    build_materials(unified, weeks, traces, scenario)
    build_subcontractors(unified, milestones, weeks, traces, scenario)
    build_billing_and_weather(milestones, weather_by_city, base_delay, scenario, weeks, traces)
    build_payment_lag(milestones, weather_by_city, base_delay, scenario, weeks, traces)
    finalize_net(weeks)
    return weeks, traces


def build_wip_status(milestones: list[Milestone], weather_by_city: dict[str, dict[int, float]], base_delay: dict[int, float]) -> list[dict]:
    by_project: dict[str, dict] = {}
    for ms in milestones:
        city_delay = weather_by_city.get(ms.city, base_delay)
        delay = int(city_delay.get(ms.scheduled_week, base_delay.get(ms.scheduled_week, 0)))
        status = "On Track"
        if delay >= 2:
            status = "At Risk"
        if delay >= 3:
            status = "Delayed"

        existing = by_project.get(ms.project_id)
        entry = {
            "projectId": ms.project_id,
            "project": ms.project_name,
            "opco": ms.opco,
            "contractValue": max(400_000, round(ms.billing * 4)),
            "wipToDate": round(ms.billing * ms.pct * 2),
            "pctComplete": round(ms.pct * 100, 1),
            "nextMilestone": ms.milestone_name,
            "status": status,
            "weatherRisk": delay >= 1,
            "riskReason": (
                f"Rain in {ms.city} W{ms.scheduled_week} pushed {ms.milestone_name} milestone"
                if delay >= 1 else ""
            ),
            "materialsCommitted": round(ms.billing * 0.35),
            "subcontractorWeek": ms.scheduled_week,
            "actionNeeded": (
                f"Review {ms.milestone_name} schedule in {ms.city}"
                if status in ("At Risk", "Delayed") else ""
            ),
        }
        if not existing or ms.scheduled_week >= existing.get("_week", 0):
            entry["_week"] = ms.scheduled_week
            by_project[ms.project_id] = entry

    result = []
    for v in by_project.values():
        v.pop("_week", None)
        result.append(v)
    return result


def build_covenant_summary(forecast: dict, covenant: dict) -> dict:
    base = forecast["base"]
    wet = forecast["wet"]
    dry = forecast["dry"]
    headroom_by_scenario = {}
    for key, weeks in forecast.items():
        cumulative = sum(w["net"] for w in weeks)
        projected_increase = max(0, -cumulative * 0.08)
        headroom = covenant["headroom_threshold_eur"] - projected_increase
        if key == "wet":
            headroom *= 0.85
        elif key == "dry":
            headroom *= 1.08
        headroom_by_scenario[key] = round(headroom)

    wet_early = sum(w["net"] for w in wet[:4])
    base_early = sum(w["net"] for w in base[:4])
    dry_early = sum(w["net"] for w in dry[:4])

    return {
        "headroomThresholdEur": covenant["headroom_threshold_eur"],
        "interestCoverageRatio": covenant["current_interest_coverage"],
        "interestCoverageMinimum": covenant["interest_coverage_minimum"],
        "headroomByScenario": headroom_by_scenario,
        "wetQuarterEarlyWeeksWorse": wet_early < base_early,
        "dryQuarterEarlyWeeksBetter": dry_early > base_early,
    }


def trace_to_dict(t: TraceRecord) -> dict:
    return {
        "week": t.week,
        "driver": t.driver,
        "amount": t.amount,
        "scenario": t.scenario,
        "sourceSystem": t.source_system,
        "glAccount": t.gl_account,
        "projectId": t.project_id,
        "projectName": t.project_name,
        "assumption": t.assumption,
    }


def main() -> None:
    unified = load_unified()
    milestones = load_milestones()
    weather_by_city = load_weather_by_city()
    base_delay = load_weather()
    covenant = load_covenant()

    forecast: dict[str, list] = {}
    all_traces: list[dict] = []

    for scenario in ("base", "wet", "dry"):
        weeks, traces = build_scenario(unified, milestones, weather_by_city, base_delay, scenario)
        forecast[scenario] = weeks
        all_traces.extend(trace_to_dict(t) for t in traces)

    wip = build_wip_status(milestones, weather_by_city, base_delay)
    covenant_summary = build_covenant_summary(forecast, covenant)

    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    payload = {"base": forecast["base"], "wet": forecast["wet"], "dry": forecast["dry"]}
    (OUT / "forecast.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (OUT / "trace_data.json").write_text(json.dumps(all_traces, indent=2), encoding="utf-8")
    (OUT / "wip_data.json").write_text(json.dumps(wip, indent=2), encoding="utf-8")
    (OUT / "covenant_summary.json").write_text(json.dumps(covenant_summary, indent=2), encoding="utf-8")

    for name in ("forecast.json", "trace_data.json", "wip_data.json", "covenant_summary.json"):
        (PUBLIC / name).write_text((OUT / name).read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Forecast built: base net={sum(w['net'] for w in forecast['base']):,.0f} EUR")


if __name__ == "__main__":
    main()
