"""Unit tests for HIR-67 waitlist confirmation email template (overlay)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent / "templates" / "waitlist-confirmation-email-template.html"
)
UNSUBSCRIBE_PAGE_URL = "https://genufit.app/unsubscribe/"


@pytest.fixture
def template_html() -> str:
    return TEMPLATE_PATH.read_text(encoding="utf-8")


def test_template_file_exists() -> None:
    assert TEMPLATE_PATH.is_file()


def test_branding_genufit_not_genofit_or_genufit(template_html: str) -> None:
    assert "genofit" not in template_html.lower()
    assert "Genufit" not in template_html
    assert "GenuFit" in template_html


def test_no_wait_list_hyphen_in_copy(template_html: str) -> None:
    assert "wait-list" not in template_html.lower()


def test_eyebrow_preserves_genufit_casing(template_html: str) -> None:
    assert "text-transform:uppercase" not in template_html.replace(" ", "")
    assert "GenuFit waitlist" in template_html


def test_canonical_email_subject_and_from() -> None:
    from genufit_waitlist_email import (
        WAITLIST_CONFIRMATION_SUBJECT,
        WAITLIST_EMAIL_FROM,
        WAITLIST_EMAIL_FROM_NAME,
    )

    assert WAITLIST_EMAIL_FROM_NAME == "GenuFit"
    assert "GenuFit" in WAITLIST_EMAIL_FROM
    assert WAITLIST_CONFIRMATION_SUBJECT == "You're on the GenuFit waitlist"
    assert "wait-list" not in WAITLIST_CONFIRMATION_SUBJECT.lower()


def test_footer_site_link_is_clickable(template_html: str) -> None:
    assert re.search(
        r'<a\s+href="https://genufit\.app"[^>]*>\s*genufit\.app\s*</a>',
        template_html,
        re.IGNORECASE,
    )


def test_unsubscribe_link_points_to_confirmation_page(template_html: str) -> None:
    assert "{{UNSUBSCRIBE_PAGE_URL}}" in template_html
    assert "/unsubscribe" in template_html
    assert "List-Unsubscribe=One-Click" not in template_html


def test_unsubscribe_copy_requires_confirmation(template_html: str) -> None:
    assert "enter your email" in template_html.lower() or "confirm" in template_html.lower()


def test_no_tokenized_unsubscribe_api_in_body(template_html: str) -> None:
    assert "/api/v1/waitlist/unsubscribe" not in template_html
    assert "token=" not in template_html.lower()


def test_render_replaces_placeholders() -> None:
    from genufit_waitlist_unsubscribe import render_waitlist_confirmation_html

    rendered = render_waitlist_confirmation_html(
        TEMPLATE_PATH.read_text(encoding="utf-8"),
        first_name="Alex",
        unsubscribe_page_url=UNSUBSCRIBE_PAGE_URL,
    )
    assert "Hi Alex," in rendered
    assert f'href="{UNSUBSCRIBE_PAGE_URL}"' in rendered
    assert "{{" not in rendered


def test_email_headers_exclude_one_click_post() -> None:
    from genufit_waitlist_unsubscribe import waitlist_email_headers

    headers = waitlist_email_headers()
    assert "List-Unsubscribe" in headers
    assert UNSUBSCRIBE_PAGE_URL in headers["List-Unsubscribe"]
    assert "List-Unsubscribe-Post" not in headers


def test_get_unsubscribe_redirects_to_page() -> None:
    from fastapi.testclient import TestClient
    from fastapi import FastAPI

    from genufit_waitlist_unsubscribe import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/waitlist")
    client = TestClient(app)
    for path in (
        "/api/v1/waitlist/unsubscribe/",
        "/api/v1/waitlist/unsubscribe",
        "/api/v1/waitlist/unsubscribe?token=legacy-token-from-old-email",
    ):
        response = client.get(path, follow_redirects=False)
        assert response.status_code == 302, path
        assert response.headers["location"] == UNSUBSCRIBE_PAGE_URL


def test_get_with_token_never_returns_plain_text_body() -> None:
    from fastapi.testclient import TestClient
    from fastapi import FastAPI

    from genufit_waitlist_unsubscribe import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/waitlist")
    client = TestClient(app)
    response = client.get(
        "/api/v1/waitlist/unsubscribe?token=abcdefgh12345678",
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert "unsubscribed" not in (response.text or "").lower()


def test_build_unsubscribe_link_is_page_not_api() -> None:
    from genufit_waitlist_unsubscribe import build_unsubscribe_link_for_email

    link = build_unsubscribe_link_for_email()
    assert link == UNSUBSCRIBE_PAGE_URL
    assert "run.app" not in link
    assert "token=" not in link


def test_post_unsubscribe_requires_configured_store() -> None:
    from fastapi.testclient import TestClient
    from fastapi import FastAPI

    from genufit_waitlist_unsubscribe import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/waitlist")
    client = TestClient(app)
    response = client.post("/api/v1/waitlist/unsubscribe/", json={"email": "test@example.com"})
    assert response.status_code == 503


def test_post_unsubscribe_marks_email_when_present() -> None:
    from fastapi.testclient import TestClient
    from fastapi import FastAPI

    from genufit_waitlist_unsubscribe import configure_waitlist_unsubscribe, router

    store = {"test@example.com": {"email": "test@example.com", "unsubscribed": False}}

    def get_by_email(email: str):
        return store.get(email)

    def mark_unsubscribed(email: str) -> bool:
        if email not in store:
            return False
        store[email]["unsubscribed"] = True
        return True

    configure_waitlist_unsubscribe(get_by_email=get_by_email, mark_unsubscribed=mark_unsubscribed)

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/waitlist")
    client = TestClient(app)
    response = client.post("/api/v1/waitlist/unsubscribe/", json={"email": "test@example.com"})
    assert response.status_code == 200
    assert response.json()["unsubscribed"] is True
    assert store["test@example.com"]["unsubscribed"] is True


def test_post_honeypot_rejected() -> None:
    from fastapi.testclient import TestClient
    from fastapi import FastAPI

    from genufit_waitlist_unsubscribe import configure_waitlist_unsubscribe, router

    configure_waitlist_unsubscribe(get_by_email=lambda e: None, mark_unsubscribed=lambda e: True)

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/waitlist")
    client = TestClient(app)
    response = client.post(
        "/api/v1/waitlist/unsubscribe/",
        json={"email": "test@example.com", "website": "spam"},
    )
    assert response.status_code == 400
