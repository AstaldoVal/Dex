"""
GenuFit waitlist unsubscribe API overlay (HIR-67 / HIR-480).

Replaces Applicator token-based GET unsubscribe (instant opt-out + plain text)
with redirect to the static confirmation page. Actual opt-out is POST with email.

Applicator env (Cloud Run):
  WAITLIST_UNSUBSCRIBE_PAGE_URL=https://genufit.app/unsubscribe/
  RESEND_FROM_NAME=GenuFit

Emails and List-Unsubscribe must use WAITLIST_UNSUBSCRIBE_PAGE_URL — never the API URL.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Optional

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field

from genufit_waitlist_email import WAITLIST_UNSUBSCRIBE_PAGE_URL

router = APIRouter(tags=["waitlist"])

_waitlist_get: Optional[Callable[[str], Any]] = None
_waitlist_unsubscribe: Optional[Callable[[str], bool]] = None
_resolve_email_from_token: Optional[Callable[[str], Optional[str]]] = None


def configure_waitlist_unsubscribe(
    *,
    get_by_email: Callable[[str], Any],
    mark_unsubscribed: Callable[[str], bool],
    resolve_email_from_token: Optional[Callable[[str], Optional[str]]] = None,
) -> None:
    global _waitlist_get, _waitlist_unsubscribe, _resolve_email_from_token
    _waitlist_get = get_by_email
    _waitlist_unsubscribe = mark_unsubscribed
    _resolve_email_from_token = resolve_email_from_token


class UnsubscribeRequest(BaseModel):
    email: EmailStr
    website: Optional[str] = Field(default=None, description="Honeypot")


def _page_url() -> str:
    return os.getenv("WAITLIST_UNSUBSCRIBE_PAGE_URL", WAITLIST_UNSUBSCRIBE_PAGE_URL).rstrip("/") + "/"


def _redirect_to_page() -> Response:
    return Response(status_code=302, headers={"Location": _page_url()})


@router.get("/unsubscribe")
@router.get("/unsubscribe/")
async def unsubscribe_get(token: Optional[str] = None) -> Response:
    """
    GET must NEVER unsubscribe — even when legacy emails include ?token=.
    Redirect to the static form; ignore token for opt-out (confirmation requires POST + email).
    """
    return _redirect_to_page()


@router.post("/unsubscribe")
@router.post("/unsubscribe/")
async def unsubscribe_post(body: UnsubscribeRequest) -> JSONResponse:
    if body.website:
        raise HTTPException(status_code=400, detail="Invalid request.")

    if _waitlist_get is None or _waitlist_unsubscribe is None:
        raise HTTPException(status_code=503, detail="Waitlist unsubscribe is not configured.")

    email = body.email.strip().lower()
    record = _waitlist_get(email)
    if record is None:
        return JSONResponse(
            {
                "message": "If that address was on our waitlist, it is now unsubscribed.",
                "unsubscribed": True,
            }
        )

    if getattr(record, "unsubscribed", False) or (
        isinstance(record, dict) and record.get("unsubscribed")
    ):
        return JSONResponse(
            {
                "message": "That email is already unsubscribed from GenuFit waitlist emails.",
                "unsubscribed": True,
            }
        )

    _waitlist_unsubscribe(email)
    return JSONResponse(
        {
            "message": "You are unsubscribed. You will not receive further waitlist emails from GenuFit.",
            "unsubscribed": True,
        }
    )


def waitlist_email_headers() -> dict[str, str]:
    return {"List-Unsubscribe": f"<{_page_url()}>"}


def build_unsubscribe_link_for_email() -> str:
    """Use in HTML templates — page URL only, no API host, no token."""
    return _page_url()


def render_waitlist_confirmation_html(
    template_html: str,
    *,
    first_name: str = "there",
    unsubscribe_page_url: Optional[str] = None,
) -> str:
    url = unsubscribe_page_url or _page_url()
    return template_html.replace("{{FIRST_NAME}}", first_name or "there").replace(
        "{{UNSUBSCRIBE_PAGE_URL}}", url
    )
