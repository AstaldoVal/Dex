#!/usr/bin/env python3
"""Paperclip API helpers for CTO heartbeat temp scripts.

NEVER use PAPERCLIP_API_URL tunnel (lhr.life) for in-agent calls on Mac —
it hangs 800s+. Default: http://127.0.0.1:3100 after launchd health check.

Override only via PAPERCLIP_BASE_URL or PAPERCLIP_FORCE_TUNNEL=1.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

DEFAULT_LOCAL = "http://127.0.0.1:3100"
DEFAULT_TIMEOUT_S = max(1.0, float(os.environ.get("PAPERCLIP_API_TIMEOUT_MS", "25000")) / 1000.0)
PROBE_TIMEOUT_S = 2.0


def _strip(url: str) -> str:
    return url.rstrip("/")


def probe_health(base: str, timeout_s: float = PROBE_TIMEOUT_S) -> bool:
    req = urllib.request.Request(
        f"{_strip(base)}/api/health",
        headers={"Accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def resolve_api_base(*, prefer_local: bool = True) -> str:
    explicit = _strip(os.environ.get("PAPERCLIP_BASE_URL", ""))
    if explicit:
        return explicit

    if os.environ.get("PAPERCLIP_FORCE_TUNNEL") == "1":
        tunnel = _strip(os.environ.get("PAPERCLIP_API_URL", ""))
        return tunnel or DEFAULT_LOCAL

    if prefer_local and probe_health(DEFAULT_LOCAL):
        return DEFAULT_LOCAL

    tunnel = _strip(os.environ.get("PAPERCLIP_API_URL", ""))
    if tunnel and tunnel != DEFAULT_LOCAL and probe_health(tunnel, timeout_s=5.0):
        return tunnel

    return DEFAULT_LOCAL


def paperclip_request(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    *,
    api_base: str | None = None,
    timeout_s: float | None = None,
    run_id: str | None = None,
) -> tuple[int, dict[str, Any] | list[Any]]:
    base = _strip(api_base or resolve_api_base())
    key = os.environ.get("PAPERCLIP_API_KEY", "")
    run = run_id or os.environ.get("PAPERCLIP_RUN_ID", "")
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if run:
        headers["X-Paperclip-Run-Id"] = run

    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{base}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout_s or DEFAULT_TIMEOUT_S) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        try:
            return e.code, json.loads(err) if err else {"error": e.reason}
        except json.JSONDecodeError:
            return e.code, {"error": err or e.reason}
