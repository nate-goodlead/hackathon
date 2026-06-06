"""Optional LLM-assisted CSV analysis — falls back to heuristics if no API key."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

SAMPLE_PROMPT = """You analyze Dutch roofing company accounting CSV exports for Altis Groep.

Given CSV headers and sample rows, return JSON only (no markdown):
{
  "detected_system": "Gilde|Yuki|Exact|Snelstart|Unknown",
  "system_confidence": 0.0-1.0,
  "column_mapping": {
    "date": "exact header name or null",
    "gl_account": "...",
    "amount": "...",
    "debit": "...",
    "credit": "...",
    "description": "...",
    "opco": "...",
    "project_id": "..."
  },
  "gl_suggestions": [
    {"gl_account": "4000", "category": "materials|subcontractors|billing|overhead|unmapped", "confidence": 0.9, "reason": "..."}
  ],
  "notes": "brief explanation"
}

Categories: materials (4xxx purchases), subcontractors (5xxx), billing (8xxx revenue/WIP), overhead (9xxx), unmapped.

Headers: {headers}

Sample rows:
{samples}
"""


def _call_openai(prompt: str) -> dict[str, Any] | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    body = json.dumps({
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": "You are a financial data analyst. Respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode())
        content = data["choices"][0]["message"]["content"]
        return json.loads(content)
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError) as e:
        print(f"OpenAI analysis failed: {e}")
        return None


def enhance_analysis(headers: list[str], sample_rows: list[dict[str, str]]) -> dict[str, Any] | None:
    """Call LLM to improve column + GL mapping. Returns None if unavailable."""
    samples_text = json.dumps(sample_rows[:5], indent=2, ensure_ascii=False)
    headers_text = json.dumps(headers)
    prompt = SAMPLE_PROMPT.format(headers=headers_text, samples=samples_text)
    result = _call_openai(prompt)
    if not result:
        return None

    return {
        "detected_system": result.get("detected_system"),
        "system_confidence": result.get("system_confidence", 0.85),
        "column_mapping": result.get("column_mapping", {}),
        "gl_suggestions": result.get("gl_suggestions", []),
        "notes": result.get("notes", ""),
    }


def ai_available() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))
