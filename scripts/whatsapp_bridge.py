"""HTTP client for the Altis WhatsApp Baileys bridge (services/whatsapp)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

BRIDGE_URL = os.environ.get("WHATSAPP_BRIDGE_URL", "http://localhost:8001").rstrip("/")


def _request(method: str, path: str, body: dict | None = None, timeout: float = 15):
    url = f"{BRIDGE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode()), resp.status
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = {"error": str(exc)}
        return payload, exc.code
    except urllib.error.URLError as exc:
        return {"error": str(exc.reason)}, 503


def whatsapp_status() -> tuple[dict, int]:
    return _request("GET", "/health")


def whatsapp_groups() -> tuple[dict, int]:
    return _request("GET", "/groups")


def whatsapp_configure(group_jid: str) -> tuple[dict, int]:
    return _request("POST", "/configure", {"groupJid": group_jid})


def whatsapp_send(message: str, group_jid: str | None = None) -> tuple[dict, int]:
    body: dict = {"message": message}
    if group_jid:
        body["groupJid"] = group_jid
    return _request("POST", "/send", body)
