"""Load environment variables from project .env file."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value

    # Support VITE_ prefix only on server — never expose to frontend bundle
    if not os.environ.get("ANTHROPIC_API_KEY"):
        vite_key = os.environ.get("VITE_ANTHROPIC_API_KEY")
        if vite_key:
            os.environ["ANTHROPIC_API_KEY"] = vite_key
