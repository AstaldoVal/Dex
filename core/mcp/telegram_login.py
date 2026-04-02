#!/usr/bin/env python3
"""
One-time Telegram login for Dex Telegram MCP.

Run from repo root with env vars set:
  export TELEGRAM_API_ID=12345
  export TELEGRAM_API_HASH=your_hash
  python core/mcp/telegram_login.py

Or:
  TELEGRAM_API_ID=... TELEGRAM_API_HASH=... python core/mcp/telegram_login.py

You will be prompted for phone number (with country code, e.g. +79991234567)
and the code sent to your Telegram app.
Session is saved to VAULT_PATH/.claude/telegram/telegram.session (or TELEGRAM_SESSION_PATH).
After that, the Telegram MCP can use this session without asking again.
"""

import os
import sys
from pathlib import Path

# Session path must match telegram_server.py (same VAULT_PATH or TELEGRAM_SESSION_PATH)
VAULT_PATH = Path(os.environ.get("VAULT_PATH", os.getcwd()))
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
        await client.start()
        me = await client.get_me()
        print(f"Logged in as {me.first_name} (@{me.username or 'no username'})")
        print(f"Session saved to: {TELEGRAM_SESSION_PATH}.session")
        print("You can now use the Telegram MCP in Cursor.")
        await client.disconnect()

    import asyncio
    asyncio.run(run())


if __name__ == "__main__":
    main()
