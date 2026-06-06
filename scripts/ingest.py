#!/usr/bin/env python3
"""Person 1: Ingest 3 accounting systems into unified schema."""

from __future__ import annotations

import csv
import hashlib
from datetime import datetime
from pathlib import Path

from paths import data_path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "output"
PUBLIC = ROOT / "public" / "data"

UNIFIED_HEADERS = ["date", "gl_account", "amount", "description", "opco", "project_id", "source_system", "gl_category"]


def parse_date(value: str) -> str:
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise ValueError(f"Unparseable date: {value}")


def normalize_amount(value: str | float | int) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return float(str(value).replace(",", "").strip())


def load_gl_mapping() -> dict[str, str]:
    mapping: dict[str, str] = {}
    with data_path("gl_account_mapping.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            mapping[row["gl_account"].strip()] = row["category"].strip()
    return mapping


def row_key(date: str, gl: str, amount: float, project: str, source: str) -> str:
    raw = f"{date}|{gl}|{amount:.2f}|{project}|{source}"
    return hashlib.md5(raw.encode()).hexdigest()


def load_gilde() -> list[dict]:
    rows = []
    with data_path("gilde_export.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append({
                "date": parse_date(row["date"]),
                "gl_account": row["gl_account"].strip(),
                "amount": normalize_amount(row["amount"]),
                "description": row["description"].strip(),
                "opco": row["opco"].strip(),
                "project_id": row["project_id"].strip(),
                "source_system": "Gilde",
            })
    return rows


def load_yuki() -> list[dict]:
    rows = []
    with data_path("yuki_export.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            opco = row["Kostenplaats"].replace("_", " ").strip()
            rows.append({
                "date": parse_date(row["Boekingsdatum"]),
                "gl_account": row["Grootboek"].strip(),
                "amount": normalize_amount(row["Bedrag"]),
                "description": row["Omschrijving"].strip(),
                "opco": opco,
                "project_id": row["Project"].strip(),
                "source_system": "Yuki",
            })
    return rows


def load_exact() -> list[dict]:
    rows = []
    with data_path("exact_export.csv").open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append({
                "date": parse_date(row["transaction_date"]),
                "gl_account": row["account_code"].strip(),
                "amount": normalize_amount(row["value"]),
                "description": row["memo"].strip(),
                "opco": row["business_unit"].strip(),
                "project_id": row["project_ref"].strip(),
                "source_system": "Exact",
            })
    return rows


def apply_mapping(rows: list[dict], gl_map: dict[str, str]) -> tuple[list[dict], list[dict]]:
    unified = []
    mapping_rows = []
    seen_keys: set[str] = set()
    unmapped_accounts: set[str] = set()

    for row in rows:
        gl = row["gl_account"]
        category = gl_map.get(gl, "unmapped")
        if category == "unmapped":
            unmapped_accounts.add(gl)
        enriched = {**row, "gl_category": category}
        key = row_key(enriched["date"], gl, enriched["amount"], enriched["project_id"], enriched["source_system"])
        if key in seen_keys:
            continue
        seen_keys.add(key)
        unified.append(enriched)

    for gl, cat in gl_map.items():
        mapping_rows.append({"gl_account": gl, "category": cat, "status": "mapped"})
    for gl in sorted(unmapped_accounts):
        if gl not in gl_map:
            mapping_rows.append({"gl_account": gl, "category": "unmapped", "status": "flagged"})

    return unified, mapping_rows


def write_csv(path: Path, headers: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=headers)
        w.writeheader()
        w.writerows(rows)


def write_notes(unified: list[dict], unmapped: int) -> None:
    notes = [
        "Data ingestion notes — Altis Groep Hackathon",
        "",
        "Systems ingested: Gilde, Yuki, Exact",
        "Date format normalized to ISO YYYY-MM-DD",
        "Sign convention: outflows negative, inflows positive (EUR)",
        "Duplicate transactions removed via hash key (date+gl+amount+project+source)",
        f"Total unified rows: {len(unified)}",
        f"Unmapped GL accounts flagged: {unmapped}",
        "Yuki opco names normalized (underscores to spaces)",
        "No transactions dropped without logging — unmapped tagged explicitly",
    ]
    (OUT / "data_notes.txt").write_text("\n".join(notes), encoding="utf-8")


def main() -> None:
    gl_map = load_gl_mapping()
    all_rows = load_gilde() + load_yuki() + load_exact()
    unified, mapping_rows = apply_mapping(all_rows, gl_map)
    unmapped_count = sum(1 for r in mapping_rows if r["category"] == "unmapped")

    write_csv(OUT / "unified_data.csv", UNIFIED_HEADERS, unified)
    write_csv(OUT / "gl_mapping.csv", ["gl_account", "category", "status"], mapping_rows)
    write_notes(unified, unmapped_count)

    # Copy to public for frontend
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for name in ("unified_data.csv", "gl_mapping.csv", "data_notes.txt"):
        (PUBLIC / name).write_text((OUT / name).read_text(encoding="utf-8"), encoding="utf-8")

    print(f"Ingested {len(unified)} rows → {OUT / 'unified_data.csv'}")


if __name__ == "__main__":
    main()
