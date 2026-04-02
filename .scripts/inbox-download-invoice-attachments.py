#!/usr/bin/env python3
"""
Download original email attachments (PDF, etc.) for invoice emails.

Reads gmail_id from frontmatter of .md files in the given folder (e.g. 00-Inbox/Invoices_2025_Sep-Dec),
fetches each message via Gmail API, and saves all attachments to the same folder with safe filenames.

Uses same OAuth as Gmail MCP: GMAIL_CREDENTIALS_PATH, gmail_token.json.

Usage:
  python .scripts/inbox-download-invoice-attachments.py [folder]
  # folder defaults to 00-Inbox/Invoices_2025_Sep-Dec
"""

import os
import re
import base64
import argparse
from pathlib import Path

# Reuse Gmail MCP auth
try:
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://mail.google.com/",
]


def _credentials_path():
    path = os.environ.get("GMAIL_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    if path:
        return Path(path).expanduser()
    return Path.cwd() / "credentials.json"


def _token_path():
    path = os.environ.get("GMAIL_TOKEN_PATH")
    if path:
        return Path(path).expanduser()
    return _credentials_path().parent / "gmail_token.json"


def get_service():
    if not HAS_DEPS:
        raise RuntimeError("Install: pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib")
    creds_path = _credentials_path()
    token_path = _token_path()
    if not creds_path.exists():
        raise FileNotFoundError(f"Credentials not found: {creds_path}")
    creds = None
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        except Exception:
            creds = None
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        with open(token_path, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def extract_gmail_ids(folder: Path) -> list[tuple[str, str]]:
    """Return list of (gmail_id, source_md_basename) from .md files with frontmatter gmail_id."""
    ids = []
    for p in folder.glob("*.md"):
        if p.name == "README.md":
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"gmail_id:\s*(\S+)", text)
        if m:
            ids.append((m.group(1).strip(), p.stem))
    return ids


def safe_filename(name: str, max_len: int = 180) -> str:
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", "_", name).strip("._")
    return name[:max_len] if name else "attachment"


def get_attachment_parts(service, message_id: str):
    """Get full message and yield (filename, mime_type, attachment_id or None, inline_data or None)."""
    msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    payload = msg.get("payload", {})
    headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}
    date_str = headers.get("date", "")[:10] if headers.get("date") else ""
    date_clean = re.sub(r"[^\d-]", "", date_str.replace(" ", "-"))[:10] if date_str else ""

    def walk_parts(parts, prefix=""):
        for part in parts or []:
            mime = part.get("mimeType", "")
            filename = part.get("filename") or ""
            body = part.get("body", {})
            att_id = body.get("attachmentId")
            data = body.get("data")

            if part.get("parts"):
                yield from walk_parts(part["parts"], prefix + "_")
            elif filename or att_id or (data and mime and mime not in ("text/plain", "text/html")):
                fname = filename or f"attachment_{att_id or 'inline'}"
                yield (fname, mime, att_id, data, date_clean)

    if "parts" in payload:
        yield from walk_parts(payload["parts"])
    else:
        body = payload.get("body", {})
        att_id = body.get("attachmentId")
        if att_id:
            ext = ".pdf"
            yield (f"attachment_{att_id}{ext}", payload.get("mimeType", ""), att_id, None, date_clean)


def download_attachment(service, message_id: str, attachment_id: str) -> bytes:
    att = service.users().messages().attachments().get(
        userId="me", messageId=message_id, id=attachment_id
    ).execute()
    return base64.urlsafe_b64decode(att["data"])


def main():
    parser = argparse.ArgumentParser(description="Download Gmail attachments for invoice emails")
    parser.add_argument(
        "folder",
        nargs="?",
        default="00-Inbox/Invoices_2025_Sep-Dec",
        help="Folder containing .md files with gmail_id in frontmatter",
    )
    parser.add_argument("--dry-run", action="store_true", help="Only list would-be downloads")
    args = parser.parse_args()

    root = Path(os.environ.get("VAULT_PATH", Path.cwd()))
    folder = root / args.folder
    if not folder.is_dir():
        print(f"Folder not found: {folder}")
        return 1

    ids = extract_gmail_ids(folder)
    if not ids:
        print("No gmail_id found in .md files.")
        return 0

    # Dedupe by message id, keep first source name for prefix
    by_id = {}
    for gid, stem in ids:
        if gid not in by_id:
            by_id[gid] = stem
    unique = list(by_id.items())

    service = get_service()
    saved = []
    skipped = 0

    for message_id, source_stem in unique:
        try:
            for filename, mime, att_id, inline_data, date_clean in get_attachment_parts(service, message_id):
                if not filename.strip():
                    continue
                base_name = safe_filename(Path(filename).stem)
                ext = Path(filename).suffix or (".pdf" if "pdf" in (mime or "").lower() else ".bin")
                if not ext.startswith("."):
                    ext = "." + ext
                # Avoid overwrite: prefix with date and short subject slug
                slug = source_stem[:40].replace(" ", "_") if source_stem else message_id[:8]
                out_name = f"{date_clean}_{slug}_{base_name}{ext}".strip("_")
                out_path = folder / out_name

                if args.dry_run:
                    print(f"Would save: {out_name} (from msg {message_id})")
                    saved.append(out_name)
                    continue

                if out_path.exists():
                    skipped += 1
                    continue

                if att_id:
                    raw = download_attachment(service, message_id, att_id)
                elif inline_data:
                    raw = base64.urlsafe_b64decode(inline_data)
                else:
                    continue

                out_path.write_bytes(raw)
                saved.append(out_name)
                print(f"Saved: {out_name}")
        except Exception as e:
            print(f"Error message {message_id}: {e}")

    print(f"\nTotal saved: {len(saved)}, skipped (existing): {skipped}")
    return 0


if __name__ == "__main__":
    exit(main())
