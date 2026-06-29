"""
Genufit waitlist unsubscribe API overlay (HIR-67 / HIR-480).

Mount in Applicator FastAPI app, e.g.:

    from genufit_waitlist_unsubscribe import router as waitlist_unsubscribe_router
    app.include_router(waitlist_unsubscribe_router, prefix="/api/v1/waitlist")

Requires a waitlist store with:
  - get_by_email(email) -> record | None
  - mark_unsubscribed(email) -> bool
"""

from __future__ import annotations

from typing import Any, Callable, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(tags=["waitlist"])

# Public page URL — no signed token; user must confirm email on the form.
UNSUBSCRIBE_PAGE_URL = "https://genufit.app/unsubscribe/"

_waitlist_get: Optional[Callable[[str], Any]] = None
_waitlist_unsubscribe: Optional[Callable[[str], bool]] = None


def configure_waitlist_unsubscribe(
    *,
    get_by_email: Callable[[str], Any],
    mark_unsubscribed: Callable[[str], bool],
) -> None:
    global _waitlist_get, _waitlist_unsubscribe
    _waitlist_get = get_by_email
    _waitlist_unsubscribe = mark_unsubscribed


class UnsubscribeRequest(BaseModel):
    email: EmailStr
    website: Optional[str] = Field(default=None, description="Honeypot")


@router.get("/unsubscribe/")
async def unsubscribe_get() -> Response:
    """
  GET must NOT unsubscribe. Redirect browsers to the static confirmation page.
  Email clients that open the List-Unsubscribe URL land here safely.
  """
    return Response(
        status_code=302,
        headers={"Location": UNSUBSCRIBE_PAGE_URL},
    )


@router.post("/unsubscribe/")
async def unsubscribe_post(body: UnsubscribeRequest, request: Request) -> JSONResponse:
    if body.website:
        raise HTTPException(status_code=400, detail="Invalid request.")

    if _waitlist_get is None or _waitlist_unsubscribe is None:
        raise HTTPException(status_code=503, detail="Waitlist unsubscribe is not configured.")

    email = body.email.strip().lower()
    record = _waitlist_get(email)
    if record is None:
        # Avoid email enumeration — same success message whether or not the address exists.
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
    """
  RFC 8058 one-click POST is intentionally omitted so Gmail/Apple cannot
  unsubscribe without visiting the confirmation page and entering email.
  """
    return {
        "List-Unsubscribe": f"<{UNSUBSCRIBE_PAGE_URL}>",
    }


def render_waitlist_confirmation_html(
    template_html: str,
    *,
    first_name: str = "there",
    unsubscribe_page_url: str = UNSUBSCRIBE_PAGE_URL,
) -> str:
    return (
        template_html.replace("{{FIRST_NAME}}", first_name or "there")
        .replace("{{UNSUBSCRIBE_PAGE_URL}}", unsubscribe_page_url)
    )
