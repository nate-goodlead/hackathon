"""Shared unified data schema, deduplication, and persistence."""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "output"
PUBLIC = ROOT / "public" / "data"
UPLOADS = ROOT / "data" / "uploads"

UNIFIED_HEADERS = [
    "date",
    "gl_account",
    "amount",
    "description",
    "opco",
    "project_id",
    "source_system",
    "gl_category",
    "city",
]

GL_CATEGORIES = (
    "materials",
    "subcontractors",
    "billing",
    "payment_lag",
    "overhead",
    "unmapped",
)

# Known GL → category (extend via upload review)
DEFAULT_GL_MAP: dict[str, str] = {
    "4000": "materials",
    "4010": "materials",
    "4020": "materials",
    "5000": "subcontractors",
    "5010": "subcontractors",
    "8000": "billing",
    "8001": "billing",
    "8002": "billing",
    "8004": "billing",
    "8005": "billing",
    "80000": "billing",
    "80020": "billing",
    "9000": "overhead",
    "9010": "overhead",
}


def gl_category(gl: str, gl_map: dict[str, str] | None = None) -> str:
    gl = str(gl).strip()
    mapping = gl_map or DEFAULT_GL_MAP
    if gl in mapping:
        return mapping[gl]
    if gl.startswith("4"):
        return "materials"
    if gl.startswith("5"):
        return "subcontractors"
    if gl.startswith("8"):
        return "billing"
    if gl.startswith("9"):
        return "overhead"
    return "unmapped"


def row_key(date: str, gl: str, amount: float, project: str, source: str) -> str:
    raw = f"{date}|{gl}|{amount:.2f}|{project}|{source}"
    return hashlib.md5(raw.encode()).hexdigest()


def parse_date(value: str) -> str:
    value = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise ValueError(f"Unparseable date: {value}")


def normalize_amount(value: str | float | int) -> float:
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    cleaned = str(value).replace("€", "").replace(",", "").strip()
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    return round(float(cleaned), 2)


def load_gl_mapping_file() -> dict[str, str]:
    """Load approved GL mapping from output or raw."""
    mapping = dict(DEFAULT_GL_MAP)
    for path in (OUT / "gl_mapping.csv", ROOT / "data" / "raw" / "gl_account_mapping.csv"):
        if not path.exists():
            continue
        with path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                gl = row.get("gl_account", "").strip()
                cat = row.get("category", "").strip()
                if gl and cat and cat != "unmapped":
                    mapping[gl] = cat
    return mapping


def read_unified() -> list[dict]:
    path = OUT / "unified_data.csv"
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def merge_rows(new_rows: list[dict], gl_map: dict[str, str]) -> tuple[list[dict], int]:
    """Merge new rows into existing unified dataset; return (merged, added_count)."""
    existing = read_unified()
    seen = {row_key(r["date"], r["gl_account"], float(r["amount"]), r["project_id"], r["source_system"]) for r in existing}
    added = 0
    for row in new_rows:
        row["gl_category"] = gl_category(row["gl_account"], gl_map)
        key = row_key(row["date"], row["gl_account"], float(row["amount"]), row["project_id"], row["source_system"])
        if key in seen:
            continue
        seen.add(key)
        existing.append(row)
        added += 1
    return existing, added


def write_unified(rows: list[dict], gl_map: dict[str, str], notes_extra: list[str] | None = None) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)

    for r in rows:
        r["gl_category"] = gl_category(r["gl_account"], gl_map)

    with (OUT / "unified_data.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=UNIFIED_HEADERS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    discovered = {r["gl_account"] for r in rows}
    mapping_rows = []
    for gl in sorted(discovered, key=lambda x: (len(x), x)):
        cat = gl_category(gl, gl_map)
        status = "mapped" if cat != "unmapped" else "flagged"
        mapping_rows.append({"gl_account": gl, "category": cat, "status": status})

    with (OUT / "gl_mapping.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["gl_account", "category", "status"])
        w.writeheader()
        w.writerows(mapping_rows)

    unmapped = sum(1 for r in mapping_rows if r["category"] == "unmapped")
    notes = [
        "Unified data — Altis Groep Cash Flow",
        "",
        f"Total rows: {len(rows)}",
        f"Opcos: {len({r['opco'] for r in rows})}",
        f"Unmapped GL accounts: {unmapped}",
        "Sign convention: outflows negative, inflows positive (EUR)",
        "Duplicates removed via hash key (date+gl+amount+project+source)",
    ]
    if notes_extra:
        notes.extend(["", *notes_extra])
    (OUT / "data_notes.txt").write_text("\n".join(notes), encoding="utf-8")

    for name in ("unified_data.csv", "gl_mapping.csv", "data_notes.txt"):
        (PUBLIC / name).write_text((OUT / name).read_text(encoding="utf-8"), encoding="utf-8")


def save_upload_meta(upload_id: str, meta: dict) -> None:
    folder = UPLOADS / upload_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
