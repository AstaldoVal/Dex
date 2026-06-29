#!/usr/bin/env python3
"""
Wise MCP Server for Dex

Connects to Wise API with personal API token. List profiles, balances, and fetch
transaction statements (balance statements) for reconciliation and reporting.

Tools:
- wise_list_profiles: List all Wise profiles (personal/business) for the account
- wise_list_balances: List balance accounts for a profile (by profile_id)
- wise_get_statement: Get transaction statement for a balance (JSON or CSV) for a date range

Setup:
- Wise.com → Your Account → Integrations and Tools → API tokens → Add new Token
- Set WISE_API_TOKEN in vault .env (or export in shell before starting Cursor)

Limitation (Wise docs): EU/UK accounts with personal token cannot view balance statements
via API (PSD2). Other regions work with personal token.
"""

import os
import json
import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from mcp.server.fastmcp import FastMCP

# Load .env from vault if present (so WISE_API_TOKEN doesn't need to be in MCP config)
VAULT_PATH = Path(os.environ.get("VAULT_PATH", Path.cwd()))
_env_file = VAULT_PATH / ".env"
if _env_file.exists():
    try:
        with open(_env_file, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    k, v = k.strip(), v.strip()
                    if k and v and not os.environ.get(k):
                        os.environ[k] = v
    except Exception:
        pass

mcp = FastMCP("Wise")
logger = logging.getLogger(__name__)

WISE_BASE = os.environ.get("WISE_API_BASE", "https://api.wise.com")


def _headers() -> Dict[str, str]:
    token = os.environ.get("WISE_API_TOKEN", "").strip()
    if not token:
        raise ValueError(
            "WISE_API_TOKEN is not set. Add it to vault .env or export before starting Cursor."
        )
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _get(url: str, params: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    import urllib.request
    import urllib.error

    req_url = url
    if params:
        from urllib.parse import urlencode
        req_url = f"{url}?{urlencode(params)}"
    req = urllib.request.Request(req_url, headers=_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return {"ok": True, "status": resp.status, "data": json.loads(resp.read().decode())}
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        try:
            err_data = json.loads(body) if body else {}
        except Exception:
            err_data = {"error": body or str(e)}
        return {"ok": False, "status": e.code, "error": err_data}
    except Exception as e:
        return {"ok": False, "status": 0, "error": {"message": str(e)}}


def _get_raw(url: str, params: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """GET that returns raw bytes (for CSV/PDF etc.)."""
    import urllib.request
    import urllib.error

    req_url = url
    if params:
        from urllib.parse import urlencode
        req_url = f"{url}?{urlencode(params)}"
    req = urllib.request.Request(req_url, headers=_headers(), method="GET")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
            if "application/json" in content_type:
                return {"ok": True, "status": resp.status, "data": json.loads(raw.decode())}
            return {"ok": True, "status": resp.status, "raw": raw.decode("utf-8", errors="replace"), "content_type": content_type}
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        try:
            err_data = json.loads(body) if body else {}
        except Exception:
            err_data = {"error": body or str(e)}
        return {"ok": False, "status": e.code, "error": err_data}
    except Exception as e:
        return {"ok": False, "status": 0, "error": {"message": str(e)}}


@mcp.tool()
def wise_list_profiles() -> Dict[str, Any]:
    """
    List all Wise profiles for the authenticated account (personal and business).
    Returns profile id, type, and details needed to list balances and get statements.
    """
    out = _get(f"{WISE_BASE}/v2/profiles")
    if not out.get("ok"):
        return out
    profiles = out.get("data") or []
    return {
        "ok": True,
        "profiles": [
            {
                "id": p.get("id"),
                "type": p.get("type"),
                "currentState": p.get("currentState"),
                "details": p.get("details"),
            }
            for p in profiles
        ],
    }


@mcp.tool()
def wise_list_balances(profile_id: int) -> Dict[str, Any]:
    """
    List balance accounts for a profile. Pass profile_id from wise_list_profiles.
    Returns balances with id, currency, type (STANDARD/SAVINGS), and amounts.
    """
    out = _get(
        f"{WISE_BASE}/v4/profiles/{profile_id}/balances",
        params={"types": "STANDARD,SAVINGS"},
    )
    if not out.get("ok"):
        return out
    balances = out.get("data") or []
    return {
        "ok": True,
        "balances": [
            {
                "id": b.get("id"),
                "currency": b.get("currency"),
                "type": b.get("type"),
                "name": b.get("name"),
                "visible": b.get("visible"),
                "amount": b.get("amount"),
                "cashAmount": b.get("cashAmount"),
                "reservedAmount": b.get("reservedAmount"),
                "totalWorth": b.get("totalWorth"),
            }
            for b in balances
        ],
    }


@mcp.tool()
def wise_get_statement(
    profile_id: int,
    balance_id: int,
    interval_start: str,
    interval_end: str,
    format: str = "json",
) -> Dict[str, Any]:
    """
    Get transaction statement for a balance for a date range.
    Use profile_id and balance_id from wise_list_profiles and wise_list_balances.

    interval_start / interval_end: ISO 8601 date or datetime (e.g. 2025-09-01, 2025-12-31).
    format: 'json' or 'csv'. CSV returns raw text in 'raw' field.

    Note: EU/UK accounts with personal token may get 403 (PSD2 restriction).
    """
    params = {
        "intervalStart": interval_start,
        "intervalEnd": interval_end,
    }
    if format and format.lower() == "csv":
        params["format"] = "csv"
    out = _get_raw(
        f"{WISE_BASE}/v1/profiles/{profile_id}/balance-statements/{balance_id}/statement",
        params=params,
    )
    if not out.get("ok"):
        return out
    if "data" in out:
        return {"ok": True, "statement": out["data"]}
    return {"ok": True, "raw": out.get("raw", ""), "content_type": out.get("content_type", "")}


@mcp.tool()
def wise_list_transactions(
    profile_id: int,
    balance_id: int,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    List transactions for a balance as JSON. Convenience wrapper: fetches statement
    for the given (or default last 90 days) range and returns it.
    from_date/to_date: YYYY-MM-DD. If omitted, last 90 days from today.
    """
    if not from_date or not to_date:
        end = datetime.utcnow()
        start = end - timedelta(days=90)
        from_date = start.strftime("%Y-%m-%d")
        to_date = end.strftime("%Y-%m-%d")
    return wise_get_statement(
        profile_id=profile_id,
        balance_id=balance_id,
        interval_start=from_date,
        interval_end=to_date,
        format="json",
    )


if __name__ == "__main__":
    mcp.run()
