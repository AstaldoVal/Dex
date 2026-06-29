"""
Canonical GenuFit waitlist email branding (HIR-67).

Applicator Resend send should use these constants — not free-form strings.
"""

from __future__ import annotations

# Display name in inbox "From" column (Resend `from` friendly name).
WAITLIST_EMAIL_FROM_NAME = "GenuFit"

# Default from address — override via env in Applicator if needed.
WAITLIST_EMAIL_FROM_ADDRESS = "waitlist@genufit.app"

# Full Resend `from` field, e.g. GenuFit <waitlist@genufit.app>
WAITLIST_EMAIL_FROM = f"{WAITLIST_EMAIL_FROM_NAME} <{WAITLIST_EMAIL_FROM_ADDRESS}>"

# Inbox subject line — one word "waitlist", never "wait-list".
WAITLIST_CONFIRMATION_SUBJECT = "You're on the GenuFit waitlist"

# HTML <title> inside the message (some clients surface it).
WAITLIST_CONFIRMATION_HTML_TITLE = WAITLIST_CONFIRMATION_SUBJECT
