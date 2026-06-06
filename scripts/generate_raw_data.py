#!/usr/bin/env python3
"""Generate synthetic hackathon source files (Gilde, Yuki, Exact, GL mapping, WIP, weather)."""

from __future__ import annotations

import csv
import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

OPCOS = ["Dakwerk Noord", "Dakwerk Zuid", "Dakwerk West", "Dakwerk Oost"]
PROJECTS = [
    ("PRJ-001", "Rotterdam Warehousing", "Dakwerk Zuid", 850_000, "large"),
    ("PRJ-002", "Utrecht Office Park", "Dakwerk West", 620_000, "large"),
    ("PRJ-003", "Amsterdam Housing Block", "Dakwerk Noord", 480_000, "small"),
    ("PRJ-004", "Eindhoven Logistics Hub", "Dakwerk Zuid", 720_000, "large"),
    ("PRJ-005", "Groningen School Roof", "Dakwerk Oost", 310_000, "small"),
    ("PRJ-006", "Haarlem Retail Centre", "Dakwerk West", 390_000, "small"),
    ("PRJ-007", "Den Bosch Industrial", "Dakwerk Zuid", 540_000, "large"),
    ("PRJ-008", "Arnhem Apartment Complex", "Dakwerk Oost", 410_000, "small"),
]

GL_MAPPING = [
    ("4000", "materials", "Roofing materials purchases"),
    ("4010", "materials", "Membrane and insulation"),
    ("4020", "materials", "Fixings and flashings"),
    ("5000", "subcontractors", "Subcontractor labour"),
    ("5010", "subcontractors", "Specialist membrane crews"),
    ("8000", "billing", "Milestone billing revenue"),
    ("8010", "billing", "Progress billing"),
    ("9000", "overhead", "General overhead"),
    ("9010", "overhead", "Vehicle and equipment"),
    ("9999", "unmapped", "Legacy suspense account"),
]

START = date(2026, 6, 2)


def week_of(d: date) -> int:
    return min(13, max(1, (d - START).days // 7 + 1))


def write_csv(path: Path, headers: list[str], rows: list[list]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        w.writerows(rows)


def generate_gilde() -> None:
    rows = []
    for i, (pid, name, opco, value, _seg) in enumerate(PROJECTS):
        for w in range(1, 6):
            d = START + timedelta(days=(w - 1) * 7 + i)
            rows.append([d.isoformat(), "4000", -(8000 + w * 1200 + i * 300), f"Materials order {name}", opco, pid, "Gilde"])
            rows.append([d.isoformat(), "5000", -(5000 + w * 800), f"Subcontractor {name}", opco, pid, "Gilde"])
            if w >= 2:
                rows.append([(d + timedelta(days=14)).isoformat(), "8000", 42000 + w * 5000, f"Milestone billing {name}", opco, pid, "Gilde"])
    write_csv(RAW / "gilde_export.csv", ["date", "gl_account", "amount", "description", "opco", "project_id", "source_system"], rows)


def generate_yuki() -> None:
    rows = []
    for i, (pid, name, opco, _value, _seg) in enumerate(PROJECTS):
        for w in range(1, 7):
            d = START + timedelta(days=(w - 1) * 7 + 2)
            rows.append([d.strftime("%d-%m-%Y"), "4010", f"{-(6500 + w * 900):.2f}", f"Yuki materials {name}", opco.replace(" ", "_"), pid])
            rows.append([d.strftime("%d-%m-%Y"), "5010", f"{-(4200 + w * 600):.2f}", f"Yuki subbie {name}", opco.replace(" ", "_"), pid])
            if w >= 3:
                rows.append([(d + timedelta(days=10)).strftime("%d-%m-%Y"), "8010", f"{38000 + w * 4000:.2f}", f"Yuki billing {name}", opco.replace(" ", "_"), pid])
    write_csv(RAW / "yuki_export.csv", ["Boekingsdatum", "Grootboek", "Bedrag", "Omschrijving", "Kostenplaats", "Project"], rows)


def generate_exact() -> None:
    rows = []
    for i, (pid, name, opco, _value, _seg) in enumerate(PROJECTS):
        for w in range(1, 5):
            d = START + timedelta(days=(w - 1) * 7 + 3)
            rows.append([d.isoformat(), "4020", -(7200 + w * 1100), f"Exact materials {name}", opco, pid])
            rows.append([d.isoformat(), "5000", -(4800 + w * 700), f"Exact subcontractor {name}", opco, pid])
            if w >= 2:
                rows.append([(d + timedelta(days=21)).isoformat(), "8000", 35000 + w * 4500, f"Exact milestone {name}", opco, pid])
    write_csv(RAW / "exact_export.csv", ["transaction_date", "account_code", "value", "memo", "business_unit", "project_ref"], rows)


def generate_gl_mapping() -> None:
    rows = [[gl, cat, desc] for gl, cat, desc in GL_MAPPING]
    write_csv(RAW / "gl_account_mapping.csv", ["gl_account", "category", "description"], rows)


def generate_wip() -> None:
    rows = []
    milestones = [
        ("Membrane install", 0.30, 85000),
        ("Insulation complete", 0.55, 120000),
        ("Handover", 1.00, 95000),
    ]
    for pid, name, opco, contract, seg in PROJECTS:
        pct = 0.15 + (int(pid.split("-")[1]) % 5) * 0.12
        wip = round(contract * pct)
        start_w = 1 + int(pid.split("-")[1]) % 3
        for idx, (mname, mpct, mval) in enumerate(milestones):
            rows.append([
                pid, name, opco, contract, wip, round(pct * 100, 1),
                mname, mpct, mval, start_w + idx * 2, seg,
            ])
    write_csv(
        RAW / "projects_wip.csv",
        ["project_id", "project_name", "opco", "contract_value", "wip_to_date", "pct_complete",
         "milestone_name", "milestone_pct", "milestone_billing", "scheduled_week", "customer_segment"],
        rows,
    )


def generate_weather() -> None:
    rows = []
    cities = ["Rotterdam", "Utrecht", "Amsterdam", "Eindhoven", "Groningen"]
    rain_by_week = [3, 12, 18, 8, 4, 22, 6, 2, 15, 5, 3, 9, 7]
    for w in range(1, 14):
        for city in cities:
            rain = rain_by_week[w - 1] + (hash(city) % 4)
            temp_min = -1 if w in (2, 3, 6) else 3
            rows.append([START + timedelta(days=(w - 1) * 7), city, w, rain, temp_min, 12 + rain * 0.3])
    write_csv(RAW / "weather.csv", ["date", "city", "week", "rainfall_mm", "temp_min_c", "temp_max_c"], rows)


def generate_covenant() -> None:
    covenant = {
        "headroom_threshold_eur": 500_000,
        "interest_coverage_minimum": 2.0,
        "current_interest_coverage": 2.4,
        "net_debt_eur": 4_200_000,
        "ebitda_annual_eur": 1_800_000,
        "formula": "headroom = headroom_threshold_eur - projected_net_debt_increase",
    }
    (RAW / "covenant_terms.json").write_text(json.dumps(covenant, indent=2), encoding="utf-8")


def main() -> None:
    generate_gl_mapping()
    generate_gilde()
    generate_yuki()
    generate_exact()
    generate_wip()
    generate_weather()
    generate_covenant()
    print(f"Generated synthetic raw data in {RAW}")


if __name__ == "__main__":
    main()
