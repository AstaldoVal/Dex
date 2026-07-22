#!/usr/bin/env python3
"""Helpers for CEO hourly night-push sweeps (local API + durable disposition).

HIR-2005: tunnel PAPERCLIP_API_URL hangs kill sweeps before PUSH children post.
Always resolve via paperclip_api_local (localhost default) and write a partial
evidence file before any mutating API work so recovery has a durable trail.
"""

from __future__ import annotations

import json
import os
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from paperclip_api_local import (
    DEFAULT_LOCAL,
    DEFAULT_TIMEOUT_S,
    paperclip_request,
    resolve_api_base,
)

LISBON = "Europe/Lisbon"


def night_push_api_base() -> str:
    """Force local Paperclip API for night-push (never tunnel unless FORCE_TUNNEL)."""
    return resolve_api_base(prefer_local=True)


def evidence_path(applicator_root: Path, issue_identifier: str, stamp: str | None = None) -> Path:
    ts = stamp or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    safe = issue_identifier.replace("/", "-")
    return applicator_root / "docs" / "evidence" / f"ceo-night-push-{safe}-{ts}.json"


def write_sweep_evidence(path: Path, payload: dict[str, Any]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = {
        **payload,
        "writtenAt": datetime.now(timezone.utc).isoformat(),
        "apiBase": payload.get("apiBase") or night_push_api_base(),
        "timeoutS": DEFAULT_TIMEOUT_S,
    }
    path.write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def req(
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
    *,
    api_base: str | None = None,
    run_id: str | None = None,
) -> tuple[int, dict[str, Any] | list[Any]]:
    return paperclip_request(
        method,
        path,
        body,
        api_base=api_base or night_push_api_base(),
        run_id=run_id or os.environ.get("PAPERCLIP_RUN_ID"),
    )


def patch_issue_disposition(
    issue_id: str,
    *,
    status: str,
    comment: str,
    api_base: str | None = None,
) -> tuple[int, dict[str, Any] | list[Any]]:
    """Leave a clear final disposition even when earlier steps partially failed."""
    return req(
        "PATCH",
        f"/api/issues/{issue_id}",
        {"status": status, "comment": comment},
        api_base=api_base,
    )


def run_sweep_with_durable_evidence(
    *,
    applicator_root: Path,
    issue_identifier: str,
    issue_id: str,
    work: Any,
) -> dict[str, Any]:
    """Run callable work(api_base) and always persist evidence + best-effort disposition.

    `work` receives api_base and must return a dict summary (pushes, errors, etc.).
    On exception: write evidence with traceback and PATCH issue to blocked with root cause.
    """
    api = night_push_api_base()
    path = evidence_path(applicator_root, issue_identifier)
    summary: dict[str, Any] = {
        "issue": issue_identifier,
        "issueId": issue_id,
        "apiBase": api,
        "defaultLocal": DEFAULT_LOCAL,
        "status": "started",
        "forceTunnel": os.environ.get("PAPERCLIP_FORCE_TUNNEL") == "1",
        "paperclipApiUrlEnv": (os.environ.get("PAPERCLIP_API_URL") or "")[:80],
    }
    write_sweep_evidence(path, summary)

    try:
        result = work(api) or {}
        summary.update(result)
        summary["status"] = result.get("status") or "ok"
        write_sweep_evidence(path, summary)
        return summary
    except Exception as exc:  # noqa: BLE001 — durable recovery path
        summary["status"] = "failed"
        summary["error"] = str(exc)
        summary["traceback"] = traceback.format_exc()[-4000:]
        write_sweep_evidence(path, summary)
        comment = (
            f"Night-push sweep failed before completion. "
            f"API base was `{api}` (localhost default). "
            f"Error: {exc}. Evidence: `{path.as_posix()}`."
        )
        try:
            code, body = patch_issue_disposition(
                issue_id, status="blocked", comment=comment, api_base=api
            )
            summary["dispositionHttp"] = code
            summary["dispositionBody"] = body if isinstance(body, dict) else {"raw": body}
        except Exception as disp_exc:  # noqa: BLE001
            summary["dispositionError"] = str(disp_exc)
            write_sweep_evidence(path, summary)
        raise
