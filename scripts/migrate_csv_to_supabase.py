#!/usr/bin/env python3
"""One-time import of unified_data.csv and gl_mapping into Supabase."""

from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

from load_env import load_env

load_env()

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public" / "data"


def main() -> int:
    from db import (
        get_opco_by_id,
        insert_transactions,
        list_opcos,
        load_gl_mappings,
        resolve_opco_id,
        supabase_enabled,
        upsert_gl_mappings,
    )

    if not supabase_enabled():
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
        return 1

    unified_path = PUBLIC / "unified_data.csv"
    if not unified_path.exists():
        unified_path = ROOT / "data" / "output" / "unified_data.csv"
    if not unified_path.exists():
        print("No unified_data.csv found")
        return 1

    opcos = list_opcos(active_only=False)
    print(f"Registered opcos: {len(opcos)}")

    gl_map = load_gl_mappings()
    gl_path = PUBLIC / "gl_mapping.csv"
    if gl_path.exists():
        with gl_path.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                gl = row.get("gl_account", "").strip()
                cat = row.get("category", "").strip()
                if gl and cat and cat != "unmapped":
                    gl_map[gl] = cat
    upsert_gl_mappings(gl_map)

    by_opco: dict[str, list[dict]] = defaultdict(list)
    unmapped_opcos: set[str] = set()

    with unified_path.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            opco_name = (row.get("opco") or "").strip()
            opco_id = resolve_opco_id(opco_name)
            if not opco_id:
                unmapped_opcos.add(opco_name)
                continue
            by_opco[opco_id].append({
                "date": row["date"],
                "gl_account": row["gl_account"],
                "amount": float(row["amount"]),
                "description": row.get("description", ""),
                "opco": opco_name,
                "project_id": row.get("project_id", ""),
                "source_system": row.get("source_system", "Unknown"),
                "city": row.get("city", ""),
            })

    total_added = 0
    for opco_id, rows in by_opco.items():
        opco = get_opco_by_id(opco_id)
        print(f"  Importing {len(rows):,} rows → {opco['name'] if opco else opco_id}")
        added, _ = insert_transactions(rows, opco_id, gl_map)
        total_added += added

    if unmapped_opcos:
        print(f"\nSkipped opcos (no registry match): {sorted(unmapped_opcos)[:10]}")
        if len(unmapped_opcos) > 10:
            print(f"  ... and {len(unmapped_opcos) - 10} more")

    print(f"\nDone. {total_added:,} new rows inserted into Supabase.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
