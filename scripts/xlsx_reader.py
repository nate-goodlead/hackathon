"""Parse Excel uploads into tabular rows for the ingest pipeline."""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from pathlib import Path

import openpyxl


def _cell_str(value) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value == int(value):
        return str(int(value))
    return str(value).strip()


def xlsx_to_rows(content: bytes, max_rows: int | None = None) -> tuple[list[str], list[dict[str, str]], str]:
    """Return headers, rows, and sheet name from the best worksheet."""
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    best_sheet = None
    best_score = -1
    best_headers: list[str] = []
    best_rows: list[dict[str, str]] = []

    for name in wb.sheetnames:
        ws = wb[name]
        rows_iter = ws.iter_rows(values_only=True)
        try:
            header_row = next(rows_iter)
        except StopIteration:
            continue
        headers = [_cell_str(h) or f"col_{i}" for i, h in enumerate(header_row)]
        if not any(headers):
            continue

        rows: list[dict[str, str]] = []
        for i, row in enumerate(rows_iter):
            if max_rows is not None and i >= max_rows:
                break
            values = [_cell_str(v) for v in row]
            if not any(values):
                continue
            padded = values + [""] * max(0, len(headers) - len(values))
            rows.append(dict(zip(headers, padded[: len(headers)])))

        score = len(rows) + (10 if any("grootboek" in h.lower() or "account" in h.lower() for h in headers) else 0)
        if score > best_score:
            best_score = score
            best_sheet = name
            best_headers = headers
            best_rows = rows

    wb.close()
    if not best_headers:
        raise ValueError("No usable worksheet found in Excel file")
    return best_headers, best_rows, best_sheet or "Sheet1"


def rows_to_csv_bytes(headers: list[str], rows: list[dict[str, str]]) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8")


def save_xlsx_as_csv(content: bytes, dest: Path) -> tuple[list[str], list[dict[str, str]], str]:
    headers, rows, sheet = xlsx_to_rows(content)
    dest.write_bytes(rows_to_csv_bytes(headers, rows))
    return headers, rows, sheet
