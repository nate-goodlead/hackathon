#!/usr/bin/env python3
"""FastAPI server: upload CSV/XLSX → Anthropic analysis → unified dataset."""

from __future__ import annotations

import csv
import json
import os
import subprocess
import uuid
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from anthropic_analyzer import analyze_with_anthropic, anthropic_available, to_enhancement
from csv_analyzer import ColumnMapping, analyze_csv, normalize_all_rows, read_all_csv_rows, read_csv_content
from db import (
    build_weather_insights,
    confirm_upload_batch,
    create_opco,
    create_upload_batch,
    deactivate_opco,
    get_current_covenant,
    get_current_forecast,
    get_current_portfolio,
    get_current_traces,
    get_current_wip,
    get_opco_by_id,
    insert_transactions,
    list_opcos,
    load_gl_mappings,
    opco_stats,
    supabase_enabled,
    transaction_stats,
    update_opco,
    upload_file_to_storage,
    upsert_gl_mappings,
)
from load_env import load_env
from unified_schema import (
    UPLOADS,
    merge_rows_routed,
    normalize_gl_account,
    save_upload_meta,
    write_stores_and_master,
)
from xlsx_reader import save_xlsx_as_csv

load_env()

ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(title="Altis Data Ingest API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _upload_dir(upload_id: str) -> Path:
    return UPLOADS / upload_id


def _load_analysis(upload_id: str) -> dict:
    path = _upload_dir(upload_id) / "analysis.json"
    if not path.exists():
        raise HTTPException(404, "Upload not found")
    return json.loads(path.read_text(encoding="utf-8"))


def _read_upload_rows(upload_id: str, analysis: dict) -> tuple[list[str], list[dict[str, str]]]:
    folder = _upload_dir(upload_id)
    file_type = analysis.get("fileType", "csv")
    if file_type == "xlsx":
        csv_path = folder / "converted.csv"
    else:
        csv_path = folder / "original.csv"
    if not csv_path.exists():
        raise HTTPException(404, "Original file missing")
    return read_all_csv_rows(csv_path)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "aiAvailable": anthropic_available(),
        "aiProvider": "anthropic" if anthropic_available() else "none",
        "supabaseEnabled": supabase_enabled(),
    }


@app.get("/api/opcos")
def api_list_opcos():
    stats = opco_stats()
    opcos = list_opcos(active_only=False)
    for o in opcos:
        o["transactionCount"] = stats.get(o["id"], {}).get("transactionCount", 0)
    return {"opcos": opcos}


@app.post("/api/opcos")
async def api_create_opco(body: dict):
    for field in ("name", "city", "region"):
        if not str(body.get(field, "")).strip():
            raise HTTPException(400, f"{field} is required")
    try:
        opco = create_opco(body)
        return {"ok": True, "opco": opco}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e


@app.patch("/api/opcos/{opco_id}")
async def api_update_opco(opco_id: str, body: dict):
    try:
        opco = update_opco(opco_id, body)
        return {"ok": True, "opco": opco}
    except ValueError as e:
        raise HTTPException(404, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e


@app.delete("/api/opcos/{opco_id}")
async def api_deactivate_opco(opco_id: str):
    try:
        opco = deactivate_opco(opco_id)
        return {"ok": True, "opco": opco}
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e


@app.get("/api/data/forecast")
def api_data_forecast():
    return get_current_forecast()


@app.get("/api/data/traces")
def api_data_traces(scenario: Optional[str] = None):
    return get_current_traces(scenario)


@app.get("/api/data/wip")
def api_data_wip():
    return get_current_wip()


@app.get("/api/data/covenant")
def api_data_covenant():
    return get_current_covenant()


@app.get("/api/data/weather-insights")
def api_data_weather():
    insights = build_weather_insights()
    if insights and insights.get("cities"):
        return insights
    try:
        from fetch_weather import fetch_all_weather

        return fetch_all_weather()
    except Exception as exc:
        raise HTTPException(404, f"No weather data available: {exc}") from exc


@app.get("/api/data/portfolio")
def api_data_portfolio():
    return get_current_portfolio()


@app.get("/api/uploads")
def list_uploads():
    if not UPLOADS.exists():
        return {"uploads": []}
    items = []
    for folder in sorted(UPLOADS.iterdir(), reverse=True):
        if not folder.is_dir():
            continue
        analysis_path = folder / "analysis.json"
        if analysis_path.exists():
            data = json.loads(analysis_path.read_text(encoding="utf-8"))
            items.append({
                "uploadId": data.get("uploadId"),
                "filename": data.get("filename"),
                "rowCount": data.get("rowCount"),
                "detectedSystem": data.get("detectedSystem"),
                "status": data.get("status", "pending"),
                "aiUsed": data.get("aiUsed", False),
            })
    return {"uploads": items}


@app.post("/api/upload/analyze")
async def upload_analyze(
    file: UploadFile = File(...),
    opco_id: str = Form(""),
    opco: str = Form(""),
    city: str = Form(""),
    source_system: str = Form(""),
    use_ai: bool = Form(True),
):
    if not file.filename:
        raise HTTPException(400, "No file provided")
    if Path(file.filename).name.startswith("~$"):
        raise HTTPException(400, "Temporary Excel lock files are not supported — close Excel and upload the real workbook.")

    name = file.filename.lower()
    is_csv = name.endswith(".csv") or name.endswith(".txt")
    is_xlsx = name.endswith(".xlsx") or name.endswith(".xls")
    if not (is_csv or is_xlsx):
        raise HTTPException(400, "Supported formats: .csv, .xlsx")

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 25MB)")

    upload_id = str(uuid.uuid4())[:8]
    folder = _upload_dir(upload_id)
    folder.mkdir(parents=True, exist_ok=True)

    sheet_name = None
    sheet_names: list[str] = []
    sheets_breakdown: list[dict] = []
    file_type = "csv"
    csv_bytes = content

    if is_xlsx:
        file_type = "xlsx"
        (folder / "original.xlsx").write_bytes(content)
        try:
            headers, rows, sheet_name, sheet_names, sheets_breakdown = save_xlsx_as_csv(
                content, folder / "converted.csv"
            )
        except ValueError as e:
            raise HTTPException(400, str(e)) from e
        csv_bytes = (folder / "converted.csv").read_bytes()
    else:
        (folder / "original.csv").write_bytes(content)

    selected_opco = get_opco_by_id(opco_id.strip()) if opco_id.strip() else None
    defaults = {
        "opco_id": opco_id.strip(),
        "opco": selected_opco["name"] if selected_opco else opco.strip(),
        "city": selected_opco["city"] if selected_opco and not city.strip() else city.strip(),
        "source_system": source_system.strip(),
        "project_id": "PRJ-UNK-001",
    }

    from db import list_opcos, sample_transactions_for_opco

    registry = list_opcos()

    headers, all_rows = read_csv_content(csv_bytes, max_rows=None)
    from file_profile import build_file_profile

    file_profile = build_file_profile(
        file.filename,
        headers,
        all_rows,
        sheet_name,
        sheet_names=sheet_names,
        sheets_breakdown=sheets_breakdown,
    )

    ai_enhancement = None
    ai_failed = False
    if use_ai and anthropic_available():
        prior = sample_transactions_for_opco(opco_id.strip(), 20) if opco_id.strip() else []
        raw = analyze_with_anthropic(
            file.filename,
            headers,
            all_rows[:8],
            sheet_name or "",
            file_profile=file_profile,
            registered_opcos=registry,
            prior_transactions=prior,
            selected_opco=selected_opco,
        )
        if raw:
            ai_enhancement = to_enhancement(raw, file_profile)
        else:
            ai_failed = True
    elif use_ai and not anthropic_available():
        ai_failed = True

    result = analyze_csv(
        upload_id,
        file.filename,
        csv_bytes,
        defaults,
        ai_enhancement,
        file_type=file_type,
        sheet_name=sheet_name,
        sheet_names=sheet_names,
        sheets_breakdown=sheets_breakdown,
        registered_opcos=registry,
        file_profile=file_profile,
    )
    data = result.to_dict()
    data["status"] = "pending"
    data["opcoId"] = defaults.get("opco_id") or None
    data["registeredOpcos"] = [
        {"id": o["id"], "slug": o["slug"], "name": o["name"], "city": o["city"], "region": o.get("region")}
        for o in registry
    ]
    if ai_enhancement and ai_enhancement.get("notes"):
        data["aiNotes"] = ai_enhancement["notes"]
    if ai_failed:
        data.setdefault("warnings", []).append(
            "AI analysis unavailable — check ANTHROPIC_API_KEY or retry. Heuristic mapping applied."
        )
    data["aiUsed"] = bool(ai_enhancement)
    data["fileProfile"] = {
        k: v for k, v in file_profile.items() if k != "stratifiedSamples"
    }

    (folder / "analysis.json").write_text(json.dumps(data, indent=2), encoding="utf-8")
    save_upload_meta(upload_id, {
        "filename": file.filename,
        "defaults": defaults,
        "status": "pending",
        "fileType": file_type,
        "sheetName": sheet_name,
        "sheetNames": sheet_names,
        "sheetsBreakdown": sheets_breakdown,
    })

    storage_key = None
    if is_xlsx:
        storage_key = upload_file_to_storage(folder / "original.xlsx", f"{upload_id}/original.xlsx")
    else:
        storage_key = upload_file_to_storage(folder / "original.csv", f"{upload_id}/original.csv")

    if supabase_enabled():
        try:
            create_upload_batch({
                "uploadId": upload_id,
                "opcoId": opco_id.strip() or None,
                "filename": file.filename,
                "storagePath": storage_key,
                "sourceSystem": defaults.get("source_system"),
                "detectedSystem": data.get("detectedSystem"),
                "storeType": (data.get("storeRouting") or {}).get("targetStore"),
                "aiAnalysis": data.get("aiBriefing"),
                "columnMapping": data.get("columnMapping"),
                "rowCount": data.get("rowCount"),
            })
        except Exception:
            pass

    data["opcoId"] = defaults.get("opco_id") or opco_id.strip() or None
    return data


@app.post("/api/upload/{upload_id}/confirm")
async def confirm_upload(upload_id: str, body: dict):
    analysis = _load_analysis(upload_id)
    if analysis.get("status") == "confirmed":
        raise HTTPException(400, "Upload already confirmed")

    column_mapping = ColumnMapping.from_dict(body.get("columnMapping", analysis.get("columnMapping", {})))
    meta_path = _upload_dir(upload_id) / "meta.json"
    defaults = {}
    if meta_path.exists():
        defaults = json.loads(meta_path.read_text()).get("defaults", {})

    opco_id = (body.get("opcoId") or defaults.get("opco_id") or "").strip()
    if not opco_id:
        raise HTTPException(400, "opcoId is required — select an operating company before merging")

    selected_opco = get_opco_by_id(opco_id)
    if not selected_opco:
        raise HTTPException(400, f"Unknown opco: {opco_id}")

    defaults["opco_id"] = opco_id
    defaults["opco"] = body.get("opco") or selected_opco["name"]
    if body.get("city") or selected_opco.get("city"):
        defaults["city"] = body.get("city") or selected_opco["city"]
    if body.get("sourceSystem") or selected_opco.get("sourceSystem"):
        defaults["source_system"] = body.get("sourceSystem") or selected_opco.get("sourceSystem") or "Unknown"

    _, raw_rows = _read_upload_rows(upload_id, analysis)
    normalized, warnings = normalize_all_rows(raw_rows, column_mapping, defaults)

    if not normalized:
        raise HTTPException(400, "No valid rows after mapping — check column mapping")

    gl_map = load_gl_mappings()
    approved = body.get("glApprovals", {})
    for gl, cat in approved.items():
        normalized_gl = normalize_gl_account(gl)
        if normalized_gl and cat and cat != "unmapped":
            gl_map[normalized_gl] = cat

    for sug in body.get("glSuggestions", analysis.get("glSuggestions", [])):
        if sug.get("status") == "approved" and sug.get("suggestedCategory") != "unmapped":
            normalized_gl = normalize_gl_account(sug.get("glAccount"))
            if normalized_gl:
                gl_map[normalized_gl] = sug["suggestedCategory"]

    routing = analysis.get("storeRouting") or analysis.get("duplicateCheck", {}).get("storeRouting") or {}
    added, added_by_store = insert_transactions(normalized, opco_id, gl_map, upload_batch_id=None)
    upsert_gl_mappings(gl_map, opco_id)

    if added == 0:
        raise HTTPException(
            409,
            "No new rows to merge — this file is already in the central database.",
        )

    store_parts = [f"{added_by_store[sid]} → {sid}" for sid in added_by_store if added_by_store.get(sid)]
    notes = [
        f"Last upload: {analysis.get('filename')} ({added} new rows)",
        f"Routed: {', '.join(store_parts) if store_parts else routing.get('targetStore', 'mixed')}",
        f"Source system: {defaults.get('source_system') or analysis.get('detectedSystem')}",
        f"Opco: {defaults.get('opco', '—')}",
    ]
    if analysis.get("aiBriefing", {}).get("summary"):
        notes.append(f"AI summary: {analysis['aiBriefing']['summary'][:200]}")
    if warnings:
        notes.append("Warnings: " + "; ".join(warnings))

    if not supabase_enabled():
        merged_by_store, _, _ = merge_rows_routed(normalized, gl_map, routing)
        all_rows = write_stores_and_master(merged_by_store, gl_map, notes)
    else:
        from db import load_transactions_as_unified_rows

        all_rows = load_transactions_as_unified_rows()
        confirm_upload_batch(upload_id, {
            "opcoId": opco_id,
            "rowsAdded": added,
            "warnings": warnings,
        })

    raw_gl = ROOT / "data" / "raw" / "gl_account_mapping.csv"
    raw_gl.parent.mkdir(parents=True, exist_ok=True)
    with raw_gl.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["gl_account", "category", "description"])
        for gl, cat in sorted(gl_map.items()):
            w.writerow([gl, cat, "Approved via upload review"])

    analysis["status"] = "confirmed"
    analysis["rowsAdded"] = added
    analysis["rowsAddedByStore"] = added_by_store
    analysis["totalRows"] = len(all_rows)
    analysis["confirmWarnings"] = warnings
    (_upload_dir(upload_id) / "analysis.json").write_text(
        json.dumps(analysis, indent=2), encoding="utf-8"
    )

    forecast_ran = False
    forecast_error = None
    forecast_script = ROOT / "scripts" / "forecast.py"
    if forecast_script.exists():
        try:
            subprocess.run(
                [str(ROOT / ".venv" / "bin" / "python"), str(forecast_script)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
                timeout=120,
            )
            forecast_ran = True
        except Exception as e:
            forecast_error = str(e)

    return {
        "ok": True,
        "rowsAdded": added,
        "rowsAddedByStore": added_by_store,
        "duplicateRowsSkipped": len(normalized) - added,
        "totalRows": len(all_rows),
        "storeRouting": routing,
        "forecastRan": forecast_ran,
        "forecastError": forecast_error,
        "warnings": warnings,
    }


@app.get("/api/unified/stats")
def unified_stats():
    return transaction_stats()


@app.get("/api/unified/stores")
def unified_stores():
    stats = transaction_stats()
    return {
        "totalRows": stats["totalRows"],
        "stores": stats.get("stores", {}),
        "storeCatalog": list(stats.get("stores", {}).values()),
    }


@app.get("/api/schedule/notifications")
def schedule_notifications():
    from schedule_planner import list_notifications

    return {"notifications": list_notifications()}


@app.get("/api/schedule/whatsapp/status")
def schedule_whatsapp_status():
    from whatsapp_bridge import whatsapp_status

    payload, status = whatsapp_status()
    if status >= 500:
        return {
            "connected": False,
            "bridgeOnline": False,
            "error": payload.get("error", "WhatsApp bridge offline"),
        }
    return {**payload, "bridgeOnline": True}


@app.get("/api/schedule/whatsapp/groups")
def schedule_whatsapp_groups():
    from whatsapp_bridge import whatsapp_groups

    payload, status = whatsapp_groups()
    if status != 200:
        raise HTTPException(status if status >= 400 else 503, payload.get("error", "Unavailable"))
    return payload


@app.post("/api/schedule/whatsapp/configure")
async def schedule_whatsapp_configure(body: dict):
    from whatsapp_bridge import whatsapp_configure

    group_jid = (body.get("groupJid") or "").strip()
    if not group_jid:
        raise HTTPException(400, "groupJid required")
    payload, status = whatsapp_configure(group_jid)
    if status != 200:
        raise HTTPException(status if status >= 400 else 503, payload.get("error", "Configure failed"))
    return payload


@app.post("/api/schedule/notify")
async def schedule_notify(body: dict):
    from schedule_planner import add_notification
    from whatsapp_bridge import whatsapp_send

    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "message required")

    wa_payload, wa_status = whatsapp_send(message)
    whatsapp_sent = wa_status == 200 and wa_payload.get("sent")
    channel = "WhatsApp (Baileys)" if whatsapp_sent else "Altis Crew WhatsApp (local log)"

    entry = add_notification(
        message=message,
        city=body.get("city", "All sites"),
        week_label=body.get("weekLabel", "W1"),
        channel=channel,
        author=body.get("author", "Field Schedule"),
    )
    entry["whatsappSent"] = whatsapp_sent
    if not whatsapp_sent:
        entry["whatsappError"] = wa_payload.get("error")
    return entry


@app.post("/api/schedule/ai-briefing")
async def schedule_ai_briefing(body: dict):
    from schedule_planner import ai_crew_briefing

    sites = body.get("sites") or []
    summary = body.get("weatherSummary") or ""
    text = ai_crew_briefing(sites, summary)
    if not text:
        raise HTTPException(
            503,
            "AI briefing unavailable — set ANTHROPIC_API_KEY in .env and restart API",
        )
    return {"briefing": text, "aiUsed": True}


def _mount_static(app: FastAPI) -> None:
    dist = ROOT / "dist"
    if not dist.exists():
        return
    assets = dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = dist / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        index = dist / "index.html"
        if index.exists():
            return FileResponse(index)
        raise HTTPException(404)


if os.environ.get("SERVE_STATIC") == "1":
    _mount_static(app)


def _load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        if key.strip() and key.strip() not in os.environ:
            os.environ[key.strip()] = val.strip()


if __name__ == "__main__":
    _load_dotenv()
    UPLOADS.mkdir(parents=True, exist_ok=True)
    port = int(os.environ.get("PORT", "8000"))
    print(f"Altis ingest API — Anthropic AI: {anthropic_available()} — Supabase: {supabase_enabled()}")
    if os.environ.get("SERVE_STATIC") == "1":
        print("Serving Vite production build from dist/")
    uvicorn.run(app, host="0.0.0.0", port=port)
