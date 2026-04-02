#!/usr/bin/env python3
"""
Fetch the latest Navero verification code from Gmail.
Prints the code to stdout for use by save-server / extension.
Uses same OAuth credentials as gmail_server.py (credentials.json, gmail_token.json).
"""
import re
import sys
from pathlib import Path

# Run from repo root (cwd=VAULT); script lives in core/mcp, import gmail_server from same dir
_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

try:
    from gmail_server import get_credentials, decode_message_body
    from googleapiclient.discovery import build
except ImportError:
    print("Gmail dependencies or gmail_server not found", file=sys.stderr)
    sys.exit(2)

def extract_code(body: str) -> str | None:
    """Extract verification code from email body. Prefer 6-digit codes."""
    if not body:
        return None
    # Strip HTML tags for plain-text search
    text = re.sub(r"<[^>]+>", " ", body)
    text = " ".join(text.split())
    # Common patterns: "code is 123456", "verification code: 123456", "123456" in a line alone
    patterns = [
        r"(?:code|verification\s*code|your\s*code)[\s:]+(\d{4,8})\b",
        r"\b(\d{6})\b",  # 6 digits
        r"\b(\d{5})\b",  # 5 digits
        r"\b(\d{4})\b",  # 4 digits
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            return m.group(1).strip()
    return None

def main() -> int:
    creds, err = get_credentials()
    if err:
        print(err, file=sys.stderr)
        return 1
    service = build("gmail", "v1", credentials=creds)
    # Search: recent mail mentioning navero or verification code (last 2 days)
    query = "newer_than:2d (from:navero OR from:app.navero OR subject:navero OR subject:verification subject:code)"
    try:
        result = service.users().messages().list(userId="me", q=query, maxResults=5).execute()
        messages = result.get("messages", [])
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1
    if not messages:
        print("", file=sys.stderr)
        return 1
    # Get the most recent message (first in list)
    msg_id = messages[0]["id"]
    try:
        msg_data = service.users().messages().get(userId="me", id=msg_id, format="full").execute()
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1
    body = decode_message_body(msg_data)
    code = extract_code(body)
    if code:
        print(code)
        return 0
    print("", file=sys.stderr)
    return 1

if __name__ == "__main__":
    sys.exit(main())
