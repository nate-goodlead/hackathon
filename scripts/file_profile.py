"""Full-file statistics for AI upload analysis (all rows, not just a sample)."""

from __future__ import annotations

import json
from collections import Counter
from typing import Any

from csv_analyzer import detect_columns, detect_system
from data_stores import DATA_STORES
from unified_schema import UNIFIED_HEADERS, GL_CATEGORIES, parse_date


def _stratified_samples(rows: list[dict], per_section: int = 6) -> dict[str, list[dict]]:
    n = len(rows)
    if n == 0:
        return {"first": [], "middle": [], "last": []}
    mid = max(0, n // 2 - per_section // 2)
    return {
        "first": rows[:per_section],
        "middle": rows[mid : mid + per_section],
        "last": rows[max(0, n - per_section) :],
    }


def _parse_amount(raw: str) -> float | None:
    if not raw or not str(raw).strip():
        return None
    try:
        s = str(raw).strip().replace(" ", "").replace("€", "")
        if "," in s and "." in s:
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            s = s.replace(",", ".")
        return float(s)
    except ValueError:
        return None


def build_file_profile(
    filename: str,
    headers: list[str],
    all_rows: list[dict[str, str]],
    sheet_name: str | None = None,
    sheet_names: list[str] | None = None,
    sheets_breakdown: list[dict] | None = None,
) -> dict[str, Any]:
    """Scan every row for dates, GL distribution, amounts, and column coverage."""
    mapping, col_conf = detect_columns(headers)
    detected_system, sys_conf = detect_system(headers, all_rows[:20])

    date_col = mapping.date
    gl_col = mapping.gl_account
    amount_col = mapping.amount
    debit_col = mapping.debit
    credit_col = mapping.credit

    dates_parsed: list[str] = []
    gl_counter: Counter[str] = Counter()
    amounts: list[float] = []
    skipped_date = 0

    for row in all_rows:
        if date_col and row.get(date_col, "").strip():
            try:
                dates_parsed.append(parse_date(row[date_col].strip()))
            except ValueError:
                skipped_date += 1

        if gl_col and row.get(gl_col, "").strip():
            gl_counter[str(row[gl_col]).strip()] += 1

        if amount_col and row.get(amount_col, "").strip():
            val = _parse_amount(row[amount_col])
            if val is not None:
                amounts.append(val)
        elif debit_col or credit_col:
            deb = _parse_amount(row.get(debit_col or "", "")) or 0.0
            cred = _parse_amount(row.get(credit_col or "", "")) or 0.0
            net = cred - deb
            if net != 0:
                amounts.append(net)

    col_fill: dict[str, float] = {}
    n = len(all_rows) or 1
    for h in headers:
        filled = sum(1 for r in all_rows if str(r.get(h, "")).strip())
        col_fill[h] = round(filled / n, 3)

    date_range = None
    if dates_parsed:
        date_range = {"start": min(dates_parsed), "end": max(dates_parsed)}

    per_sheet: list[dict] = []
    source_col = "_source_sheet"
    if sheets_breakdown:
        for item in sheets_breakdown:
            per_sheet.append(
                {
                    "sheetName": item.get("sheetName"),
                    "rowCount": item.get("rowCount", 0),
                    "headers": item.get("headers", []),
                }
            )
    elif source_col in headers:
        from collections import defaultdict

        by_sheet: dict[str, list[str]] = defaultdict(list)
        for row in all_rows:
            name = str(row.get(source_col, "")).strip() or "unknown"
            if date_col and row.get(date_col, "").strip():
                try:
                    by_sheet[name].append(parse_date(row[date_col].strip()))
                except ValueError:
                    pass
        for name, dates in by_sheet.items():
            count = sum(1 for r in all_rows if str(r.get(source_col, "")).strip() == name)
            entry: dict[str, Any] = {"sheetName": name, "rowCount": count}
            if dates:
                entry["dateRange"] = {"start": min(dates), "end": max(dates)}
            per_sheet.append(entry)

    return {
        "filename": filename,
        "sheetName": sheet_name,
        "sheetNames": sheet_names or ([sheet_name] if sheet_name else []),
        "sheetCount": len(sheet_names or ([sheet_name] if sheet_name else [])),
        "sheetsBreakdown": per_sheet,
        "rowCount": len(all_rows),
        "headers": headers,
        "detectedSystemHeuristic": detected_system,
        "systemConfidenceHeuristic": round(sys_conf, 2),
        "columnMappingHeuristic": mapping.to_dict(),
        "columnConfidenceHeuristic": col_conf,
        "dateColumn": date_col,
        "dateRangeComputed": date_range,
        "datesParsedCount": len(dates_parsed),
        "datesSkippedCount": skipped_date,
        "dateParseRate": round(len(dates_parsed) / n, 3) if n else 0,
        "uniqueGlAccounts": len(gl_counter),
        "topGlAccounts": [{"gl": g, "count": c} for g, c in gl_counter.most_common(40)],
        "amountStats": {
            "count": len(amounts),
            "sum": round(sum(amounts), 2) if amounts else 0,
            "min": round(min(amounts), 2) if amounts else None,
            "max": round(max(amounts), 2) if amounts else None,
        },
        "columnFillRates": col_fill,
        "stratifiedSamples": _stratified_samples(all_rows),
    }


def database_schema_context() -> dict[str, Any]:
    """Target schema the AI must map uploads into."""
    return {
        "unified_transaction_fields": UNIFIED_HEADERS,
        "field_descriptions": {
            "date": "ISO date YYYY-MM-DD — transaction/booking date",
            "gl_account": "General ledger account code (e.g. 4000, 8001)",
            "amount": "Signed EUR amount; positive = inflow/billing, negative = outflow",
            "description": "Line description / omschrijving",
            "opco": "Operating company name — FK to opcos.name",
            "project_id": "Project reference (PRJ-XXX-001 if absent)",
            "source_system": "Gilde|Yuki|Exact|Snelstart|Unknown",
            "gl_category": f"One of: {', '.join(GL_CATEGORIES)}",
            "city": "Dutch city for weather/forecast grouping",
        },
        "data_stores": {
            sid: {"label": meta["label"], "description": meta["description"], "file": meta["file"]}
            for sid, meta in DATA_STORES.items()
        },
        "supabase_tables": [
            "financial_transactions (master fact — one row per line)",
            "gl_mappings (per-opco GL → category)",
            "upload_batches (this file's metadata)",
        ],
        "routing_rules": (
            "Rows route to revenue/costs/overhead/ledger stores by GL prefix and AI target_store. "
            "Mixed P&L sheets split per row by gl_category at merge time."
        ),
    }
