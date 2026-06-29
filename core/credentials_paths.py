"""
Canonical paths for OAuth and local secret files under <repo>/Credentials/.

MCP servers receive VAULT_PATH; scripts should chdir to repo root or set VAULT_PATH.
"""
from __future__ import annotations

import os
from pathlib import Path


def repo_root() -> Path:
    return Path(os.environ.get("VAULT_PATH", os.getcwd())).resolve()


def personal_dir() -> Path:
    return repo_root() / "Credentials" / "personal"


def default_personal_credentials_json() -> Path:
    return personal_dir() / "credentials.json"


def default_personal_gmail_token() -> Path:
    return personal_dir() / "gmail_token.json"


def default_personal_calendar_token() -> Path:
    return personal_dir() / "google_calendar_token.json"


def default_personal_drive_token() -> Path:
    return personal_dir() / "google_drive_token.json"


def linkedin_session_dir() -> Path:
    """Playwright session, cookies, LinkedIn digest partials (see Credentials/README.md)."""
    return repo_root() / "Credentials" / "linkedin"
