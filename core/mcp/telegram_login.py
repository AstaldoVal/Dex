#!/usr/bin/env python3
"""
One-time Telegram login for Dex Telegram MCP.

Recommended (loads .env from repo root automatically):
  cd /path/to/Dex
  uv run python core/mcp/telegram_login.py

Or: npm run job-search:telegram-login

Put TELEGRAM_API_ID and TELEGRAM_API_HASH in .env (from https://my.telegram.org/apps).
Optional: TELEGRAM_PHONE=+351... in .env to skip typing the number (code from Telegram is still prompted).

Session is saved to VAULT_PATH/.claude/telegram/telegram.session (or TELEGRAM_SESSION_PATH).
After that, the Telegram MCP and job-feedback scripts use this session without asking again.
"""

import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]

# Session path must match telegram_server.py (same VAULT_PATH or TELEGRAM_SESSION_PATH)
_default_vault = _REPO_ROOT if _REPO_ROOT.is_dir() else Path.cwd()
VAULT_PATH = Path(os.environ.get("VAULT_PATH", _default_vault))

try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(_REPO_ROOT / ".env")
    load_dotenv(VAULT_PATH / ".env")
except ImportError:
    pass
TELEGRAM_DIR = VAULT_PATH / ".claude" / "telegram"
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH") or str(TELEGRAM_DIR / "telegram")
TELEGRAM_API_ID = os.environ.get("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH")


def main():
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        print("Error: set TELEGRAM_API_ID and TELEGRAM_API_HASH")
        print("Get them at https://my.telegram.org/apps")
        print("Example: TELEGRAM_API_ID=12345 TELEGRAM_API_HASH=abc... python core/mcp/telegram_login.py")
        sys.exit(1)

    try:
        from telethon import TelegramClient
    except ImportError:
        print("Error: install Telethon: pip install -r core/mcp/requirements-telegram.txt")
        sys.exit(1)

    TELEGRAM_DIR.mkdir(parents=True, exist_ok=True)
    client = TelegramClient(
        TELEGRAM_SESSION_PATH,
        int(TELEGRAM_API_ID),
        TELEGRAM_API_HASH,
    )

    async def run():
        phone = (os.environ.get("TELEGRAM_PHONE") or "").strip() or None
        await client.start(phone=phone)
        me = await client.get_me()
        print(f"Logged in as {me.first_name} (@{me.username or 'no username'})")
        print(f"Session saved to: {TELEGRAM_SESSION_PATH}.session")
        print("You can now use the Telegram MCP in Cursor.")
        await client.disconnect()

    import asyncio
    asyncio.run(run())


if __name__ == "__main__":
    main()
