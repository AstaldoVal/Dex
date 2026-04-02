#!/usr/bin/env python3
"""
Telegram MCP Server for Dex

Подключение к аккаунту Telegram пользователя и чтение сообщений из чатов.
Использует Telethon (user client), не бот — доступ ко всем чатам пользователя.

Перед первым использованием нужно один раз выполнить авторизацию:
  python core/mcp/telegram_login.py

Tools:
- telegram_list_chats: список чатов пользователя (диалоги)
- telegram_get_messages: последние сообщения из указанного чата
- telegram_search_in_chat: поиск по тексту в чате
"""

import os
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

from mcp.server import Server, NotificationOptions
from mcp.server.models import InitializationOptions
import mcp.server.stdio
import mcp.types as types

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Paths
VAULT_PATH = Path(os.environ.get("VAULT_PATH", Path.cwd()))
TELEGRAM_DIR = VAULT_PATH / ".claude" / "telegram"
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH") or str(TELEGRAM_DIR / "telegram")
TELEGRAM_API_ID = os.environ.get("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH")

# Lazy client (created on first use)
_telegram_client = None


def _get_client():
    """Get or create Telethon client. Requires TELEGRAM_API_ID and TELEGRAM_API_HASH."""
    global _telegram_client
    if _telegram_client is not None:
        return _telegram_client
    try:
        from telethon import TelegramClient
    except ImportError:
        raise RuntimeError(
            "Telethon not installed. Run: pip install -r core/mcp/requirements-telegram.txt"
        )
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        raise RuntimeError(
            "Set TELEGRAM_API_ID and TELEGRAM_API_HASH (get them at https://my.telegram.org/apps)"
        )
    TELEGRAM_DIR.mkdir(parents=True, exist_ok=True)
    _telegram_client = TelegramClient(
        TELEGRAM_SESSION_PATH,
        int(TELEGRAM_API_ID),
        TELEGRAM_API_HASH,
    )
    return _telegram_client


async def _ensure_connected():
    """Connect client and check authorization."""
    client = _get_client()
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        raise RuntimeError(
            "Telegram session not authorized. Run once in terminal: "
            "cd <repo_root> && TELEGRAM_API_ID=... TELEGRAM_API_HASH=... python core/mcp/telegram_login.py"
        )
    return client


def _message_to_dict(msg) -> dict:
    """Convert Telethon message to JSON-serializable dict."""
    from_id = getattr(msg, "from_id", None)
    from_peer = None
    if from_id is not None:
        # Telethon uses PeerUser / PeerChannel / PeerChat objects here.
        # They aren't JSON-serializable, so we normalize to a small dict.
        if hasattr(from_id, "user_id"):
            from_peer = {"type": "user", "id": int(from_id.user_id)}
        elif hasattr(from_id, "channel_id"):
            from_peer = {"type": "channel", "id": int(from_id.channel_id)}
        elif hasattr(from_id, "chat_id"):
            from_peer = {"type": "chat", "id": int(from_id.chat_id)}
        else:
            from_peer = {"type": "unknown", "raw": str(from_id)}

    reply_to = getattr(msg, "reply_to", None)
    reply_to_msg_id = None
    if reply_to is not None:
        # Telethon's reply_to can be a MessageReplyHeader-like object.
        reply_to_msg_id = getattr(reply_to, "reply_to_msg_id", None) or getattr(reply_to, "reply_to_top_id", None)
    return {
        "id": msg.id,
        "date": msg.date.isoformat() if getattr(msg, "date", None) else None,
        "text": getattr(msg, "text", None) or "",
        "from_id": from_peer,
        "reply_to_msg_id": int(reply_to_msg_id) if isinstance(reply_to_msg_id, int) else None,
        "out": getattr(msg, "out", None),
    }


async def _resolve_chat(client, chat: str):
    """
    Resolve chat identifier to entity. For numeric id (e.g. private channel),
    Telethon's get_entity(str) fails; resolve via dialogs instead.
    """
    chat = chat.strip()
    if not chat.isdigit():
        return chat
    target_id = int(chat)
    # Telegram supergroup/channel id can be stored as id or -100xxxxxxxxxx
    full_channel_id = -(100 * 10**9 + target_id) if target_id > 0 else target_id
    dialogs = await client.get_dialogs(limit=200)
    for d in dialogs:
        e = d.entity
        eid = getattr(e, "id", None)
        if eid is not None and (eid == target_id or eid == full_channel_id):
            return e
    return chat


# ============================================================================
# MCP SERVER
# ============================================================================

app = Server("user-telegram-mcp")


@app.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="telegram_list_chats",
            description="List user's Telegram chats (dialogs). Returns chat title, username or id for use in telegram_get_messages and telegram_search_in_chat.",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max number of chats to return (default 50)",
                        "default": 50,
                    },
                },
            },
        ),
        types.Tool(
            name="telegram_get_messages",
            description="Get recent messages from a Telegram chat. Use chat_id (number), @username, or t.me/username.",
            inputSchema={
                "type": "object",
                "properties": {
                    "chat": {
                        "type": "string",
                        "description": "Chat identifier: @username, t.me/username, or numeric chat/channel id",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max messages to fetch (default 50, max 100)",
                        "default": 50,
                    },
                    "min_id": {
                        "type": "integer",
                        "description": "Optional: only messages with id > min_id (for pagination)",
                    },
                },
                "required": ["chat"],
            },
        ),
        types.Tool(
            name="telegram_search_in_chat",
            description="Search messages by text in a Telegram chat.",
            inputSchema={
                "type": "object",
                "properties": {
                    "chat": {
                        "type": "string",
                        "description": "Chat identifier: @username, t.me/username, or numeric id",
                    },
                    "query": {
                        "type": "string",
                        "description": "Search query (text)",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max messages to return (default 30)",
                        "default": 30,
                    },
                },
                "required": ["chat", "query"],
            },
        ),
    ]


@app.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent]:
    args = arguments or {}
    try:
        client = await _ensure_connected()
    except RuntimeError as e:
        return [types.TextContent(type="text", text=json.dumps({"error": str(e)}, indent=2, default=str))]
    except Exception as e:
        logger.exception("Telegram connection error")
        return [types.TextContent(type="text", text=json.dumps({"error": str(e)}, indent=2, default=str))]

    try:
        if name == "telegram_list_chats":
            limit = int(args.get("limit", 50))
            dialogs = await client.get_dialogs(limit=limit)
            chats = []
            for d in dialogs:
                entity = d.entity
                title = getattr(entity, "title", None) or getattr(entity, "first_name", "") or "Unknown"
                username = getattr(entity, "username", None)
                chat_id = getattr(entity, "id", None)
                ident = f"@{username}" if username else str(chat_id)
                chats.append({
                    "title": title,
                    "username": username,
                    "id": chat_id,
                    "identifier": ident,
                })
            return [types.TextContent(type="text", text=json.dumps({"chats": chats}, indent=2, ensure_ascii=False, default=str))]

        if name == "telegram_get_messages":
            chat = args.get("chat", "").strip()
            if not chat:
                return [types.TextContent(type="text", text=json.dumps({"error": "chat is required"}, indent=2))]
            limit = min(int(args.get("limit", 50)), 100)
            min_id = args.get("min_id")
            entity = await _resolve_chat(client, chat)
            kwargs = {"limit": limit}
            if min_id is not None:
                kwargs["min_id"] = int(min_id)
            messages = await client.get_messages(entity, **kwargs)
            out = [_message_to_dict(m) for m in messages]
            return [types.TextContent(type="text", text=json.dumps({"messages": out}, indent=2, ensure_ascii=False, default=str))]

        if name == "telegram_search_in_chat":
            chat = args.get("chat", "").strip()
            query = args.get("query", "").strip()
            if not chat or not query:
                return [types.TextContent(type="text", text=json.dumps({"error": "chat and query are required"}, indent=2))]
            limit = int(args.get("limit", 30))
            entity = await _resolve_chat(client, chat)
            messages = await client.get_messages(entity, search=query, limit=limit)
            out = [_message_to_dict(m) for m in messages]
            return [types.TextContent(type="text", text=json.dumps({"messages": out}, indent=2, ensure_ascii=False, default=str))]

        return [types.TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}, default=str))]
    except Exception as e:
        logger.exception("Tool %s failed", name)
        return [types.TextContent(type="text", text=json.dumps({"error": str(e)}, indent=2, default=str))]


async def _main():
    logger.info("Starting Telegram MCP Server")
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="user-telegram-mcp",
                server_version="1.0.0",
                capabilities=app.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


def main():
    import asyncio
    asyncio.run(_main())


if __name__ == "__main__":
    main()
