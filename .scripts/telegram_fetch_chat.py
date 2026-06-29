#!/usr/bin/env python3
"""
One-off: fetch messages from a Telegram chat by id and write to JSON.
Uses same session and _resolve_chat logic as core/mcp/telegram_server.py.
Run from repo root with .env containing TELEGRAM_API_ID, TELEGRAM_API_HASH; VAULT_PATH optional.
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# Repo root = parent of .scripts
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Load .env from repo root if present
_env = REPO_ROOT / ".env"
if _env.exists():
    with open(_env) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "VAULT_PATH") and v:
                    os.environ.setdefault(k, v)

VAULT_PATH = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
TELEGRAM_DIR = VAULT_PATH / ".claude" / "telegram"
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH") or str(TELEGRAM_DIR / "telegram")
TELEGRAM_API_ID = os.environ.get("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH")


async def _resolve_chat(client, chat: str):
    chat = chat.strip()
    if not chat.isdigit():
        return chat
    target_id = int(chat)
    full_channel_id = -(100 * 10**9 + target_id) if target_id > 0 else target_id
    dialogs = await client.get_dialogs(limit=200)
    for d in dialogs:
        e = d.entity
        eid = getattr(e, "id", None)
        if eid is not None and (eid == target_id or eid == full_channel_id):
            return e
    return chat


async def main():
    chat_id = sys.argv[1] if len(sys.argv) > 1 else "1924507124"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    out_path = REPO_ROOT / "00-Inbox" / "Telegram_GURO_messages.json"

    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH (e.g. in .env)", file=sys.stderr)
        sys.exit(1)

    from telethon import TelegramClient

    TELEGRAM_DIR.mkdir(parents=True, exist_ok=True)
    client = TelegramClient(
        TELEGRAM_SESSION_PATH,
        int(TELEGRAM_API_ID),
        TELEGRAM_API_HASH,
    )
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        print("Not authorized. Run: python core/mcp/telegram_login.py", file=sys.stderr)
        sys.exit(1)

    entity = await _resolve_chat(client, chat_id)
    messages = await client.get_messages(entity, limit=limit)
    out = []
    for m in messages:
        out.append({
            "id": m.id,
            "date": m.date.isoformat() if getattr(m, "date", None) else None,
            "text": (getattr(m, "text", None) or "").strip(),
        })
    await client.disconnect()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"chat_id": chat_id, "messages": out}, f, ensure_ascii=False, indent=2)
    print(f"Written {len(out)} messages to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
