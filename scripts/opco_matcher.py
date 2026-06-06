"""Deterministic opco matching from filename, columns, and registered profiles."""

from __future__ import annotations

import re
from typing import Any


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _norm_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]", "", h.lower().strip())


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) >= 3}


_COLUMN_PATTERNS: dict[str, list[str]] = {
    "opco": ["opco", "kostenplaats", "business_unit", "company", "bedrijf", "organisatie", "entity", "vestiging"],
    "city": ["city", "plaats", "locatie", "location"],
}


def _column_values(rows: list[dict], headers: list[str], field: str) -> set[str]:
    patterns = _COLUMN_PATTERNS.get(field, [])
    col = None
    for h in headers:
        nh = _norm_header(h)
        if any(_norm_header(p) == nh or _norm_header(p) in nh for p in patterns):
            col = h
            break
    if not col:
        return set()
    return {str(r.get(col, "")).strip() for r in rows if r.get(col, "").strip()}


def match_opco_deterministic(
    filename: str,
    headers: list[str],
    sample_rows: list[dict],
    registered_opcos: list[dict],
) -> dict[str, Any]:
    """Score registered opcos and return recommendation + step-by-step reasoning."""
    if not registered_opcos:
        return {
            "recommendedOpcoId": None,
            "recommendedOpco": None,
            "recommendedCity": None,
            "opcoMatchConfidence": 0.0,
            "opcoLinkReasoning": ["No registered opcos — create profiles in Opco Admin first."],
        }

    fn = filename.lower()
    fn_tokens = _tokens(filename)
    opco_col_vals = _column_values(sample_rows, headers, "opco")
    city_col_vals = _column_values(sample_rows, headers, "city")

    scores: dict[str, float] = {o["id"]: 0.0 for o in registered_opcos}
    reasons: dict[str, list[str]] = {o["id"]: [] for o in registered_opcos}

    for opco in registered_opcos:
        oid = opco["id"]
        name = opco.get("name") or ""
        city = opco.get("city") or ""
        region = opco.get("region") or ""
        notes = opco.get("notes") or ""
        slug = opco.get("slug") or ""

        city_n = _norm(city)
        if city_n and city_n in _norm(fn):
            scores[oid] += 0.45
            reasons[oid].append(f"Filename contains city '{city}' → {name}")

        for token in _tokens(name):
            if len(token) >= 4 and token in fn_tokens:
                scores[oid] += 0.2
                reasons[oid].append(f"Filename token '{token}' matches opco name '{name}'")

        if region and _norm(region) in _norm(fn):
            scores[oid] += 0.15
            reasons[oid].append(f"Filename references region '{region}'")

        if slug and slug.replace("-", "") in _norm(fn):
            scores[oid] += 0.25
            reasons[oid].append(f"Filename matches opco slug '{slug}'")

        for val in opco_col_vals:
            if _norm(val) == _norm(name) or _norm(city) in _norm(val):
                scores[oid] += 0.5
                reasons[oid].append(f"Opco column value '{val}' aligns with {name} ({city})")

        for val in city_col_vals:
            if _norm(val) == city_n:
                scores[oid] += 0.35
                reasons[oid].append(f"City column value '{val}' matches registered city '{city}'")

        for hint in _tokens(notes):
            if len(hint) >= 5 and hint in fn_tokens:
                scores[oid] += 0.1
                reasons[oid].append(f"Filename matches note keyword '{hint}' on {name}")

    best = max(registered_opcos, key=lambda o: scores[o["id"]])
    best_score = scores[best["id"]]
    steps = reasons[best["id"]] or [
        "No strong filename or column signal — review opco assignment manually.",
    ]

    if best_score < 0.2:
        return {
            "recommendedOpcoId": None,
            "recommendedOpco": None,
            "recommendedCity": None,
            "opcoMatchConfidence": round(best_score, 2),
            "opcoLinkReasoning": steps + [f"Weak best match: {best['name']} (score {best_score:.2f})"],
        }

    return {
        "recommendedOpcoId": best["id"],
        "recommendedOpco": best["name"],
        "recommendedCity": best["city"],
        "opcoMatchConfidence": round(min(0.98, best_score + 0.15), 2),
        "opcoLinkReasoning": steps,
    }
