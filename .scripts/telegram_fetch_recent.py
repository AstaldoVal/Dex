#!/usr/bin/env python3
"""Fetch last N messages from a Telegram chat. Usage: python3 telegram_fetch_recent.py @username [limit]"""
import asyncio
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))
env_file = REPO / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k] = v

VAULT = Path(os.environ.get("VAULT_PATH", REPO))
SESSION = os.environ.get("TELEGRAM_SESSION_PATH") or str(VAULT / ".claude" / "telegram" / "telegram")
API_ID = os.environ.get("TELEGRAM_API_ID")
API_HASH = os.environ.get("TELEGRAM_API_HASH")


async def main():
    chat = (sys.argv[1] if len(sys.argv) > 1 else "").strip() or "@Elizavet_2608"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 40
    if not API_ID or not API_HASH:
        print("TELEGRAM_API_ID and TELEGRAM_API_HASH required", file=sys.stderr)
        sys.exit(1)
    from telethon import TelegramClient
    client = TelegramClient(SESSION, int(API_ID), API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        print("Not authorized", file=sys.stderr)
        sys.exit(1)
    out = []
    async for m in client.iter_messages(chat, limit=limit):
        out.append({
            "id": m.id,
            "date": m.date.isoformat() if m.date else None,
            "out": getattr(m, "out", False),
            "text": (getattr(m, "text", None) or "").strip(),
        })
    await client.disconnect()
    # iter_messages is newest first; reverse for chronological
    out.reverse()
    print(json.dumps({"messages": out}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
