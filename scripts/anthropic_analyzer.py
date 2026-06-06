"""Anthropic Claude analysis for accounting file ingestion."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

PROMPT = """You are a financial data analyst for Altis Groep, a PE-backed Dutch roofing portfolio.
Analyze this accounting export and return JSON only (no markdown fences).

{
  "summary": "2-4 sentences in plain English explaining what this file contains, which company/opco it likely belongs to, date range, and whether it looks like transactions, WIP, or P&L",
  "data_type": "transactions|wip|pl|mixed|unknown",
  "detected_system": "Gilde|Yuki|Exact|Snelstart|Unknown",
  "system_confidence": 0.0-1.0,
  "recommended_opco": "string or null",
  "recommended_city": "Dutch city if inferable or null",
  "date_range": {"start": "YYYY-MM-DD or null", "end": "YYYY-MM-DD or null"},
  "row_count_estimate": number,
  "quality_checks": ["list of issues or confirmations for a controller"],
  "column_mapping": {
    "date": "exact header or null",
    "gl_account": "...",
    "amount": "...",
    "debit": "...",
    "credit": "...",
    "description": "...",
    "opco": "...",
    "project_id": "...",
    "city": "..."
  },
  "gl_suggestions": [
    {"gl_account": "4000", "category": "materials|subcontractors|billing|payment_lag|overhead|unmapped", "confidence": 0.9, "reason": "..."}
  ],
  "merge_recommendation": "ready|review_required|reject",
  "controller_question": "One clear question the user should confirm before merging"
}

GL categories: materials (4xxx), subcontractors (5xxx), billing (8xxx), overhead (9xxx), payment_lag, unmapped.
"""


def _build_prompt(
    filename: str,
    headers: list[str],
    sample_rows: list[dict[str, str]],
    sheet_name: str,
) -> str:
    return (
        PROMPT
        + f"\nFilename: {filename}\n"
        + f"Sheet: {sheet_name or 'n/a'}\n"
        + f"Headers: {json.dumps(headers, ensure_ascii=False)}\n\n"
        + "Sample rows (first 8):\n"
        + json.dumps(sample_rows[:8], indent=2, ensure_ascii=False)
    )


def anthropic_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def analyze_with_anthropic(
    filename: str,
    headers: list[str],
    sample_rows: list[dict[str, str]],
    sheet_name: str = "",
) -> dict[str, Any] | None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
    prompt = _build_prompt(filename, headers, sample_rows, sheet_name)

    body = json.dumps({
        "model": model,
        "max_tokens": 4096,
        "messages": [
            {
                "role": "user",
                "content": prompt,
            }
        ],
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode())
        text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                text += block.get("text", "")
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return json.loads(text)
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError) as e:
        print(f"Anthropic analysis failed: {e}")
        return None


def to_enhancement(result: dict[str, Any]) -> dict[str, Any]:
    """Map Anthropic JSON to pipeline enhancement shape."""
    return {
        "detected_system": result.get("detected_system"),
        "system_confidence": result.get("system_confidence", 0.9),
        "column_mapping": result.get("column_mapping", {}),
        "gl_suggestions": result.get("gl_suggestions", []),
        "notes": result.get("summary", ""),
        "ai_briefing": {
            "summary": result.get("summary", ""),
            "dataType": result.get("data_type", "unknown"),
            "recommendedOpco": result.get("recommended_opco"),
            "recommendedCity": result.get("recommended_city"),
            "dateRange": result.get("date_range"),
            "qualityChecks": result.get("quality_checks", []),
            "mergeRecommendation": result.get("merge_recommendation", "review_required"),
            "controllerQuestion": result.get("controller_question", ""),
        },
    }
