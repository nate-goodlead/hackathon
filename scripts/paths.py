"""Resolve data file paths — incoming folder takes priority over raw."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCOMING = ROOT / "data" / "incoming"
RAW = ROOT / "data" / "raw"


def data_path(filename: str) -> Path:
    """Return path to data file, preferring data/incoming/ over data/raw/."""
    incoming = INCOMING / filename
    if incoming.exists():
        return incoming
    return RAW / filename
