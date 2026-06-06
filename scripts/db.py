"""Supabase persistence layer with CSV fallback when credentials are absent."""

from __future__ import annotations

import json
import os
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from data_stores import DATA_STORES, classify_row_store
from unified_schema import DEFAULT_GL_MAP, gl_category, row_key

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "output"
PUBLIC = ROOT / "public" / "data"
BATCH_SIZE = 500

_client = None


def supabase_enabled() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def get_client():
    global _client
    if not supabase_enabled():
        return None
    if _client is None:
        from supabase import create_client

        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        )
    return _client


def storage_bucket() -> str:
    return os.environ.get("SUPABASE_STORAGE_BUCKET", "uploads")


# ── Opcos ─────────────────────────────────────────────────────────────────────

def _opco_row_to_dict(row: dict) -> dict:
    return {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "city": row["city"],
        "region": row.get("region"),
        "lat": row["lat"],
        "lng": row["lng"],
        "sourceSystem": row.get("source_system"),
        "dataFolder": row.get("data_folder"),
        "notes": row.get("notes"),
        "isActive": row.get("is_active", True),
        "createdAt": row.get("created_at"),
        "updatedAt": row.get("updated_at"),
    }


def list_opcos(active_only: bool = True) -> list[dict]:
    sb = get_client()
    if not sb:
        return _list_opcos_from_json(active_only)
    q = sb.table("opcos").select("*").order("name")
    if active_only:
        q = q.eq("is_active", True)
    res = q.execute()
    return [_opco_row_to_dict(r) for r in (res.data or [])]


def _list_opcos_from_json(active_only: bool = True) -> list[dict]:
    path = ROOT / "data" / "incoming" / "opco_locations.json"
    if not path.exists():
        path = PUBLIC / "opco_locations.json"
    if not path.exists():
        return []
    rows = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for r in rows:
        out.append({
            "id": r.get("opco_id", r["city"].lower()),
            "slug": r.get("opco_id", ""),
            "name": r["opco_name"],
            "city": r["city"],
            "region": r.get("region"),
            "lat": r["lat"],
            "lng": r["lng"],
            "sourceSystem": r.get("source_system"),
            "dataFolder": r.get("data_folder"),
            "notes": r.get("notes"),
            "isActive": True,
        })
    return out


def get_opco_by_id(opco_id: str) -> dict | None:
    sb = get_client()
    if not sb:
        for o in list_opcos(active_only=False):
            if o["id"] == opco_id or o["slug"] == opco_id:
                return o
        return None
    res = sb.table("opcos").select("*").eq("id", opco_id).limit(1).execute()
    if res.data:
        return _opco_row_to_dict(res.data[0])
    return None


def get_opco_by_slug(slug: str) -> dict | None:
    sb = get_client()
    if not sb:
        for o in list_opcos(active_only=False):
            if o["slug"] == slug:
                return o
        return None
    res = sb.table("opcos").select("*").eq("slug", slug).limit(1).execute()
    if res.data:
        return _opco_row_to_dict(res.data[0])
    return None


def get_opco_by_data_folder(folder: str) -> dict | None:
    for o in list_opcos(active_only=False):
        if o.get("dataFolder") == folder:
            return o
    return None


def resolve_opco_id(name_or_id: str) -> str | None:
    if not name_or_id:
        return None
    sb = get_client()
    if sb:
        res = sb.table("opcos").select("id, name, slug").execute()
        for r in res.data or []:
            if r["id"] == name_or_id or r["slug"] == name_or_id:
                return r["id"]
            if r["name"].lower() == name_or_id.lower():
                return r["id"]
    for o in list_opcos(active_only=False):
        if o["id"] == name_or_id or o["slug"] == name_or_id:
            return o["id"]
        if o["name"].lower() == name_or_id.lower():
            return o["id"]
    return None


def create_opco(payload: dict) -> dict:
    sb = get_client()
    if not sb:
        raise RuntimeError("Supabase not configured — cannot create opco")
    slug = payload.get("slug") or _slugify(payload["name"])
    row = {
        "slug": slug,
        "name": payload["name"],
        "city": payload["city"],
        "region": payload.get("region"),
        "lat": float(payload["lat"]),
        "lng": float(payload["lng"]),
        "source_system": payload.get("sourceSystem"),
        "data_folder": payload.get("dataFolder"),
        "notes": payload.get("notes"),
        "is_active": True,
    }
    res = sb.table("opcos").insert(row).execute()
    return _opco_row_to_dict(res.data[0])


def update_opco(opco_id: str, payload: dict) -> dict:
    sb = get_client()
    if not sb:
        raise RuntimeError("Supabase not configured — cannot update opco")
    row: dict[str, Any] = {"updated_at": datetime.utcnow().isoformat()}
    field_map = {
        "name": "name",
        "city": "city",
        "region": "region",
        "lat": "lat",
        "lng": "lng",
        "sourceSystem": "source_system",
        "dataFolder": "data_folder",
        "notes": "notes",
        "isActive": "is_active",
    }
    for src, dst in field_map.items():
        if src in payload:
            row[dst] = payload[src]
    res = sb.table("opcos").update(row).eq("id", opco_id).execute()
    if not res.data:
        raise ValueError(f"Opco not found: {opco_id}")
    return _opco_row_to_dict(res.data[0])


def deactivate_opco(opco_id: str) -> dict:
    return update_opco(opco_id, {"isActive": False})


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.upper()).strip("-")
    return f"OPCO-{s[:32]}"


def opco_stats() -> dict[str, dict]:
    """Transaction counts and last upload per opco id."""
    sb = get_client()
    if not sb:
        return {}
    res = sb.table("financial_transactions").select("opco_id").execute()
    counts: dict[str, int] = {}
    for r in res.data or []:
        oid = r["opco_id"]
        counts[oid] = counts.get(oid, 0) + 1
    return {oid: {"transactionCount": n} for oid, n in counts.items()}


# ── GL mappings ───────────────────────────────────────────────────────────────

def load_gl_mappings() -> dict[str, str]:
    sb = get_client()
    mapping = dict(DEFAULT_GL_MAP)
    if sb:
        res = sb.table("gl_mappings").select("gl_account, category").execute()
        for r in res.data or []:
            gl = r["gl_account"]
            cat = r["category"]
            if gl and cat and cat != "unmapped":
                mapping[gl] = cat
    from unified_schema import load_gl_mapping_file

    mapping.update({k: v for k, v in load_gl_mapping_file().items() if k not in mapping})
    return mapping


def upsert_gl_mappings(gl_map: dict[str, str], opco_id: str | None = None) -> None:
    sb = get_client()
    if not sb:
        return
    rows = [
        {
            "opco_id": opco_id,
            "gl_account": gl,
            "category": cat,
            "status": "approved",
            "description": "Approved via upload review",
        }
        for gl, cat in gl_map.items()
        if cat and cat != "unmapped"
    ]
    if rows:
        sb.table("gl_mappings").upsert(rows, on_conflict="opco_id,gl_account").execute()


# ── Transactions ──────────────────────────────────────────────────────────────

def _row_to_txn_record(
    row: dict,
    opco_id: str,
    opco_name: str,
    gl_map: dict[str, str],
    upload_batch_id: str | None = None,
) -> dict:
    store = classify_row_store(row, gl_map)
    cat = gl_category(row["gl_account"], gl_map)
    city = row.get("city") or ""
    return {
        "opco_id": opco_id,
        "upload_batch_id": upload_batch_id,
        "txn_date": row["date"],
        "gl_account": str(row["gl_account"]),
        "amount": float(row["amount"]),
        "description": row.get("description", ""),
        "project_id": row.get("project_id", ""),
        "source_system": row.get("source_system", "Unknown"),
        "gl_category": cat,
        "store_type": store,
        "city": city,
        "dedup_hash": row_key(
            row["date"],
            row["gl_account"],
            float(row["amount"]),
            row.get("project_id", ""),
            row.get("source_system", ""),
        ),
        "_opco_name": opco_name,
    }


def get_existing_dedup_hashes(hashes: list[str]) -> set[str]:
    sb = get_client()
    if not sb or not hashes:
        return set()
    found: set[str] = set()
    for i in range(0, len(hashes), BATCH_SIZE):
        chunk = hashes[i : i + BATCH_SIZE]
        res = sb.table("financial_transactions").select("dedup_hash").in_("dedup_hash", chunk).execute()
        found.update(r["dedup_hash"] for r in res.data or [])
    return found


def insert_transactions(
    rows: list[dict],
    opco_id: str,
    gl_map: dict[str, str],
    upload_batch_id: str | None = None,
) -> tuple[int, dict[str, int]]:
    opco = get_opco_by_id(opco_id)
    if not opco:
        raise ValueError(f"Unknown opco_id: {opco_id}")
    opco_name = opco["name"]
    sb = get_client()
    if not sb:
        from unified_schema import merge_rows_routed, write_stores_and_master

        routing = {"targetStore": "mixed", "mixed": True}
        merged, added_by_store, total = merge_rows_routed(rows, gl_map, routing)
        if merged:
            write_stores_and_master(merged, gl_map)
        return total, added_by_store

    records = [_row_to_txn_record(r, opco_id, opco_name, gl_map, upload_batch_id) for r in rows]
    hashes = [r["dedup_hash"] for r in records]
    existing = get_existing_dedup_hashes(hashes)
    new_records = [r for r in records if r["dedup_hash"] not in existing]
    added_by_store: dict[str, int] = {}
    for i in range(0, len(new_records), BATCH_SIZE):
        chunk = new_records[i : i + BATCH_SIZE]
        insert_rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in chunk]
        sb.table("financial_transactions").insert(insert_rows).execute()
        for r in chunk:
            st = r["store_type"]
            added_by_store[st] = added_by_store.get(st, 0) + 1
    return len(new_records), added_by_store


def load_transactions_as_unified_rows() -> list[dict]:
    """Load all transactions in unified CSV shape for forecast pipeline."""
    sb = get_client()
    if not sb:
        from unified_schema import read_unified

        return read_unified()

    opcos = {o["id"]: o for o in list_opcos(active_only=False)}
    all_rows: list[dict] = []
    offset = 0
    page = 1000
    while True:
        res = (
            sb.table("financial_transactions")
            .select("*")
            .order("txn_date")
            .range(offset, offset + page - 1)
            .execute()
        )
        batch = res.data or []
        if not batch:
            break
        for r in batch:
            opco = opcos.get(r["opco_id"], {})
            all_rows.append({
                "date": r["txn_date"],
                "gl_account": r["gl_account"],
                "amount": str(r["amount"]),
                "description": r.get("description") or "",
                "opco": opco.get("name", "Unknown"),
                "opco_id": r["opco_id"],
                "project_id": r.get("project_id") or "",
                "source_system": r.get("source_system") or "Unknown",
                "gl_category": r.get("gl_category") or "unmapped",
                "city": r.get("city") or opco.get("city", ""),
                "store_type": r.get("store_type", "ledger"),
            })
        if len(batch) < page:
            break
        offset += page
    return all_rows


def duplicate_stats_db(
    normalized_rows: list[dict],
    opco_id: str,
    routing: dict | None = None,
) -> dict:
    from data_stores import route_rows, resolve_store_routing
    from unified_schema import DATA_STORES

    total = len(normalized_rows)
    if total == 0:
        return {
            "totalRows": 0,
            "duplicateRows": 0,
            "newRows": 0,
            "duplicatePercent": 0.0,
            "blockMerge": True,
            "status": "empty",
            "message": "No valid rows to merge after normalization.",
            "storeRouting": routing,
        }

    if not routing:
        routing = resolve_store_routing("upload.csv", normalized_rows)
    target = routing.get("targetStore", "mixed")
    buckets = route_rows(normalized_rows, None if target == "mixed" else target)
    gl_map = load_gl_mappings()
    opco = get_opco_by_id(opco_id)
    opco_name = opco["name"] if opco else "Unknown"

    all_hashes = []
    hash_to_store: dict[str, str] = {}
    for sid, rows in buckets.items():
        for row in rows:
            h = row_key(
                row["date"], row["gl_account"], float(row["amount"]),
                row.get("project_id", ""), row.get("source_system", ""),
            )
            all_hashes.append(h)
            hash_to_store[h] = sid

    existing = get_existing_dedup_hashes(all_hashes) if supabase_enabled() else set()
    if not supabase_enabled():
        from unified_schema import duplicate_stats

        return duplicate_stats(normalized_rows, routing)

    duplicate_rows = sum(1 for h in all_hashes if h in existing)
    new_rows = total - duplicate_rows
    dup_by_store: dict[str, int] = {}
    new_by_store: dict[str, int] = {}
    for h in all_hashes:
        sid = hash_to_store[h]
        if h in existing:
            dup_by_store[sid] = dup_by_store.get(sid, 0) + 1
        else:
            new_by_store[sid] = new_by_store.get(sid, 0) + 1

    block_merge = new_rows == 0
    store_label = DATA_STORES[target]["label"] if target in DATA_STORES else "multiple stores"
    if block_merge:
        status, message = "all_duplicate", f"All {total:,} rows already exist ({store_label})."
    elif duplicate_rows > 0:
        status = "partial_duplicate"
        message = f"{duplicate_rows:,} of {total:,} duplicate. {new_rows:,} new row(s) for {opco_name}."
    else:
        status, message = "all_new", f"All {total:,} rows are new → {store_label}."

    return {
        "totalRows": total,
        "duplicateRows": duplicate_rows,
        "newRows": new_rows,
        "duplicatePercent": round((duplicate_rows / total) * 100, 1),
        "blockMerge": block_merge,
        "status": status,
        "message": message,
        "storeRouting": routing,
        "newRowsByStore": new_by_store,
        "duplicateRowsByStore": dup_by_store,
    }


def transaction_stats() -> dict:
    sb = get_client()
    if not sb:
        from unified_schema import read_unified, store_stats

        rows = read_unified()
        typed = store_stats()
        if not rows:
            return {
                "totalRows": 0,
                "opcos": [],
                "opcoIds": [],
                "systems": [],
                "cities": [],
                "unmappedGl": 0,
                "stores": typed["stores"],
            }
        unmapped = sum(1 for r in rows if r.get("gl_category") == "unmapped")
        return {
            "totalRows": len(rows),
            "opcos": sorted({r["opco"] for r in rows}),
            "opcoIds": [],
            "systems": sorted({r["source_system"] for r in rows}),
            "cities": sorted({r.get("city", "") for r in rows if r.get("city")}),
            "unmappedGl": unmapped,
            "stores": typed["stores"],
        }

    res = sb.table("financial_transactions").select("opco_id, source_system, city, gl_category, store_type").execute()
    rows = res.data or []
    opco_ids = sorted({r["opco_id"] for r in rows})
    opco_names = []
    for oid in opco_ids:
        o = get_opco_by_id(oid)
        if o:
            opco_names.append(o["name"])
    store_counts: dict[str, int] = {}
    for r in rows:
        st = r.get("store_type", "ledger")
        store_counts[st] = store_counts.get(st, 0) + 1
    stores = {
        sid: {
            "label": DATA_STORES[sid]["label"],
            "file": DATA_STORES[sid]["file"],
            "rowCount": store_counts.get(sid, 0),
        }
        for sid in DATA_STORES
    }
    unmapped = sum(1 for r in rows if r.get("gl_category") == "unmapped")
    return {
        "totalRows": len(rows),
        "opcos": sorted(opco_names),
        "opcoIds": opco_ids,
        "systems": sorted({r["source_system"] for r in rows if r.get("source_system")}),
        "cities": sorted({r["city"] for r in rows if r.get("city")}),
        "unmappedGl": unmapped,
        "stores": stores,
    }


# ── Upload batches & storage ──────────────────────────────────────────────────

def create_upload_batch(meta: dict) -> str:
    sb = get_client()
    if not sb:
        return meta.get("uploadId", "")
    row = {
        "id": meta.get("uploadId") if len(meta.get("uploadId", "")) == 36 else None,
        "opco_id": meta.get("opcoId"),
        "filename": meta.get("filename", ""),
        "storage_path": meta.get("storagePath"),
        "source_system": meta.get("sourceSystem"),
        "detected_system": meta.get("detectedSystem"),
        "store_type": meta.get("storeType"),
        "status": "analyzed",
        "ai_analysis": meta.get("aiAnalysis"),
        "column_mapping": meta.get("columnMapping"),
        "row_count": meta.get("rowCount"),
    }
    row = {k: v for k, v in row.items() if v is not None}
    res = sb.table("upload_batches").insert(row).execute()
    return res.data[0]["id"]


def confirm_upload_batch(batch_id: str, updates: dict) -> None:
    sb = get_client()
    if not sb:
        return
    sb.table("upload_batches").update({
        "status": "confirmed",
        "opco_id": updates.get("opcoId"),
        "rows_added": updates.get("rowsAdded"),
        "warnings": updates.get("warnings"),
    }).eq("id", batch_id).execute()


def upload_file_to_storage(local_path: Path, storage_key: str) -> str | None:
    sb = get_client()
    if not sb or not local_path.exists():
        return None
    bucket = storage_bucket()
    content = local_path.read_bytes()
    sb.storage.from_(bucket).upload(
        storage_key,
        content,
        {"content-type": "application/octet-stream", "upsert": "true"},
    )
    return storage_key


# ── Forecast persistence ──────────────────────────────────────────────────────

def save_forecast_run(
    anchor_date: date,
    forecast: dict[str, list],
    traces: list[dict],
    wip: list[dict],
    covenant: dict,
    portfolio: dict,
) -> str | None:
    sb = get_client()
    run_id = None
    if sb:
        sb.table("forecast_runs").update({"is_current": False}).eq("is_current", True).execute()
        res = sb.table("forecast_runs").insert({
            "anchor_date": anchor_date.isoformat(),
            "is_current": True,
            "wip_snapshot": wip,
            "covenant_snapshot": covenant,
            "portfolio_snapshot": portfolio,
        }).execute()
        run_id = res.data[0]["id"]
        week_rows = []
        for scenario, weeks in forecast.items():
            for w in weeks:
                week_rows.append({
                    "run_id": run_id,
                    "scenario": scenario,
                    "week_num": w["week"],
                    "label": w.get("label"),
                    "materials": w.get("materials"),
                    "subcontractors": w.get("subcontractors"),
                    "milestone_billing": w.get("milestoneBilling"),
                    "payment_lag": w.get("paymentLag"),
                    "weather_impact": w.get("weatherImpact"),
                    "net": w.get("net"),
                })
        for i in range(0, len(week_rows), BATCH_SIZE):
            sb.table("forecast_weeks").insert(week_rows[i : i + BATCH_SIZE]).execute()
        trace_rows = []
        for t in traces:
            trace_rows.append({
                "run_id": run_id,
                "week_num": t["week"],
                "scenario": t["scenario"],
                "driver": t["driver"],
                "amount": t["amount"],
                "opco_id": resolve_opco_id(t.get("projectName", "")),
                "source_system": t.get("sourceSystem"),
                "gl_account": t.get("glAccount"),
                "project_id": t.get("projectId"),
                "project_name": t.get("projectName"),
                "assumption": t.get("assumption"),
                "source_date": t.get("sourceDate") or None,
                "source_description": t.get("sourceDescription"),
            })
        for i in range(0, len(trace_rows), BATCH_SIZE):
            sb.table("forecast_trace_lines").insert(trace_rows[i : i + BATCH_SIZE]).execute()

    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    payload = {"base": forecast["base"], "wet": forecast["wet"], "dry": forecast["dry"]}
    (OUT / "forecast.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    (OUT / "trace_data.json").write_text(json.dumps(traces, indent=2), encoding="utf-8")
    (OUT / "wip_data.json").write_text(json.dumps(wip, indent=2), encoding="utf-8")
    (OUT / "covenant_summary.json").write_text(json.dumps(covenant, indent=2), encoding="utf-8")
    (OUT / "portfolio_stats.json").write_text(json.dumps(portfolio, indent=2), encoding="utf-8")
    for name in ("forecast.json", "trace_data.json", "wip_data.json", "covenant_summary.json", "portfolio_stats.json"):
        src = OUT / name
        if src.exists():
            (PUBLIC / name).write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return run_id


def get_current_forecast() -> dict:
    sb = get_client()
    if sb:
        res = sb.table("forecast_runs").select("id").eq("is_current", True).limit(1).execute()
        if res.data:
            run_id = res.data[0]["id"]
            weeks_res = sb.table("forecast_weeks").select("*").eq("run_id", run_id).order("week_num").execute()
            forecast: dict[str, list] = {"base": [], "wet": [], "dry": []}
            for w in weeks_res.data or []:
                scenario = w["scenario"]
                forecast.setdefault(scenario, []).append({
                    "week": w["week_num"],
                    "label": w.get("label") or f"W{w['week_num']}",
                    "materials": float(w.get("materials") or 0),
                    "subcontractors": float(w.get("subcontractors") or 0),
                    "milestoneBilling": float(w.get("milestone_billing") or 0),
                    "paymentLag": float(w.get("payment_lag") or 0),
                    "weatherImpact": float(w.get("weather_impact") or 0),
                    "net": float(w.get("net") or 0),
                })
            if any(forecast.values()):
                return forecast
    path = PUBLIC / "forecast.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"base": [], "wet": [], "dry": []}


def get_current_traces(scenario: str | None = None) -> list[dict]:
    sb = get_client()
    if sb:
        res = sb.table("forecast_runs").select("id").eq("is_current", True).limit(1).execute()
        if res.data:
            run_id = res.data[0]["id"]
            q = sb.table("forecast_trace_lines").select("*").eq("run_id", run_id)
            if scenario:
                q = q.eq("scenario", scenario)
            trace_res = q.limit(5000).execute()
            return [
                {
                    "week": t["week_num"],
                    "driver": t["driver"],
                    "amount": float(t["amount"] or 0),
                    "scenario": t["scenario"],
                    "sourceSystem": t.get("source_system", ""),
                    "glAccount": t.get("gl_account", ""),
                    "projectId": t.get("project_id", ""),
                    "projectName": t.get("project_name", ""),
                    "assumption": t.get("assumption", ""),
                    "sourceDate": t.get("source_date", ""),
                    "sourceDescription": t.get("source_description", ""),
                }
                for t in trace_res.data or []
            ]
    path = PUBLIC / "trace_data.json"
    if path.exists():
        traces = json.loads(path.read_text(encoding="utf-8"))
        if scenario:
            return [t for t in traces if t.get("scenario") == scenario]
        return traces
    return []


def get_current_wip() -> list[dict]:
    sb = get_client()
    if sb:
        res = sb.table("forecast_runs").select("wip_snapshot").eq("is_current", True).limit(1).execute()
        if res.data and res.data[0].get("wip_snapshot"):
            return res.data[0]["wip_snapshot"]
    path = PUBLIC / "wip_data.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


def get_current_covenant() -> dict:
    sb = get_client()
    if sb:
        res = sb.table("forecast_runs").select("covenant_snapshot").eq("is_current", True).limit(1).execute()
        if res.data and res.data[0].get("covenant_snapshot"):
            return res.data[0]["covenant_snapshot"]
    path = PUBLIC / "covenant_summary.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def get_current_portfolio() -> dict:
    sb = get_client()
    if sb:
        res = sb.table("forecast_runs").select("portfolio_snapshot").eq("is_current", True).limit(1).execute()
        if res.data and res.data[0].get("portfolio_snapshot"):
            return res.data[0]["portfolio_snapshot"]
    path = PUBLIC / "portfolio_stats.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"companies": []}


# ── Weather ───────────────────────────────────────────────────────────────────

def upsert_weather_daily(rows: list[dict]) -> int:
    sb = get_client()
    if not sb:
        return 0
    count = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        sb.table("weather_daily").upsert(chunk, on_conflict="opco_id,weather_date,source").execute()
        count += len(chunk)
    return count


def load_weather_for_forecast() -> tuple[dict[str, dict[int, float]], dict[int, float]]:
    """Returns (by_city_week delays, portfolio avg by week) — same shape as forecast.py."""
    sb = get_client()
    if not sb:
        return {}, {}

    res = sb.table("weather_daily").select("*").order("weather_date").execute()
    by_city_week: dict[str, dict[int, list[float]]] = {}
    start = date.today() - timedelta(days=date.today().weekday())

    for r in res.data or []:
        opco = get_opco_by_id(r["opco_id"])
        city = opco["city"] if opco else "Unknown"
        d = date.fromisoformat(r["weather_date"])
        week = min(13, max(1, (d - start).days // 7 + 1))
        if r.get("is_stoppage"):
            delay = 1.0
        else:
            rain = float(r.get("rainfall_mm") or 0)
            tmin = float(r.get("temp_min_c") or 5)
            delay = 0.0
            if rain > 5.0:
                delay += 1
            if tmin < 0:
                delay += 1
        by_city_week.setdefault(city, {}).setdefault(week, []).append(delay)

    weather_by_city = {
        city: {w: sum(v) / len(v) for w, v in weeks.items()}
        for city, weeks in by_city_week.items()
    }
    by_week: dict[int, list[float]] = {}
    for city_delays in weather_by_city.values():
        for w, d in city_delays.items():
            by_week.setdefault(w, []).append(d)
    base_delay = {w: sum(v) / len(v) for w, v in by_week.items()}
    return weather_by_city, base_delay


def build_weather_insights() -> dict | None:
    sb = get_client()
    opcos = list_opcos()
    if not opcos:
        return None

    path = PUBLIC / "weather_insights.json"
    if not supabase_enabled() and path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    start = date.today() - timedelta(days=date.today().weekday())
    cities_out = []
    for opco in opcos:
        weekly = []
        if sb:
            res = (
                sb.table("weather_daily")
                .select("*")
                .eq("opco_id", opco["id"])
                .gte("weather_date", start.isoformat())
                .lte("weather_date", (start + timedelta(weeks=13)).isoformat())
                .execute()
            )
            by_week: dict[int, dict] = {}
            for r in res.data or []:
                d = date.fromisoformat(r["weather_date"])
                wk = min(13, max(1, (d - start).days // 7 + 1))
                entry = by_week.setdefault(wk, {"rainDays": 0, "frostDays": 0, "stoppageDays": 0})
                if float(r.get("rainfall_mm") or 0) >= 5:
                    entry["rainDays"] += 1
                if float(r.get("temp_min_c") or 5) < 0:
                    entry["frostDays"] += 1
                if r.get("is_stoppage"):
                    entry["stoppageDays"] += 1
            for wk in range(1, 14):
                e = by_week.get(wk, {"rainDays": 0, "frostDays": 0, "stoppageDays": 0})
                weekly.append({
                    "week": wk,
                    "label": f"W{wk}",
                    "rainDays": e["rainDays"],
                    "frostDays": e["frostDays"],
                    "stoppageDays": e["stoppageDays"],
                })
        cities_out.append({
            "opco": opco["name"],
            "city": opco["city"],
            "lat": opco["lat"],
            "lng": opco["lng"],
            "weekly": weekly,
            "transactionMatches": [],
        })

    if not cities_out:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return None

    payload = {
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
        "source": "supabase",
        "timezone": "Europe/Amsterdam",
        "horizonWeeks": 13,
        "weekStart": start.isoformat(),
        "summary": f"Weather cache for {len(cities_out)} opcos.",
        "topHighlights": [],
        "cities": cities_out,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=2)
    (OUT / "weather_insights.json").write_text(text, encoding="utf-8")
    (PUBLIC / "weather_insights.json").write_text(text, encoding="utf-8")
    return payload


def sample_transactions_for_opco(opco_id: str, limit: int = 20) -> list[dict]:
    sb = get_client()
    if not sb:
        from unified_schema import read_unified

        opco = get_opco_by_id(opco_id)
        name = opco["name"] if opco else ""
        return [r for r in read_unified() if r.get("opco") == name][:limit]
    res = (
        sb.table("financial_transactions")
        .select("txn_date, gl_account, amount, description, source_system, gl_category")
        .eq("opco_id", opco_id)
        .order("txn_date", desc=True)
        .limit(limit)
        .execute()
    )
    return [
        {
            "date": r["txn_date"],
            "gl_account": r["gl_account"],
            "amount": r["amount"],
            "description": r.get("description"),
            "source_system": r.get("source_system"),
            "gl_category": r.get("gl_category"),
        }
        for r in res.data or []
    ]
