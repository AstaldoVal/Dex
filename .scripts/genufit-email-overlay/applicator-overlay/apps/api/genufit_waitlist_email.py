"""
Canonical GenuFit waitlist email branding (HIR-67).

Applicator Resend send must use these constants — not free-form strings.

Staging currently wrong (2026-06-29 probe):
  resend_from_name: Genufit  -> must be GenuFit
  unsubscribe_base_url: ...run.app/api/v1/waitlist/unsubscribe -> must be page URL below
"""

from __future__ import annotations

import os

# Display name in inbox "From" column (Resend `from` friendly name).
WAITLIST_EMAIL_FROM_NAME = "GenuFit"

# Default from address — override via env in Applicator if needed.
WAITLIST_EMAIL_FROM_ADDRESS = os.getenv("RESEND_FROM_EMAIL", "noreply@genufit.app")

# Full Resend `from` field, e.g. GenuFit <noreply@genufit.app>
WAITLIST_EMAIL_FROM = f"{WAITLIST_EMAIL_FROM_NAME} <{WAITLIST_EMAIL_FROM_ADDRESS}>"

# Inbox subject — one word "waitlist", never "wait-list".
WAITLIST_CONFIRMATION_SUBJECT = "You're on the GenuFit waitlist"

# HTML <title> inside the message (some clients surface it).
WAITLIST_CONFIRMATION_HTML_TITLE = WAITLIST_CONFIRMATION_SUBJECT

# Link in email body + List-Unsubscribe header (NOT the Cloud Run API URL).
WAITLIST_UNSUBSCRIBE_PAGE_URL = os.getenv(
    "WAITLIST_UNSUBSCRIBE_PAGE_URL",
    "https://genufit.app/unsubscribe/",
)

# Interim if custom domain /unsubscribe/ not wired yet (Pages preview URL).
WAITLIST_UNSUBSCRIBE_PAGE_URL_PAGES_FALLBACK = (
    "https://genufit-landing.pages.dev/unsubscribe/"
)
