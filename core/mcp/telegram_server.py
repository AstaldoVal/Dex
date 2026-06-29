#!/usr/bin/env python3
"""
Telegram MCP Server for Dex

Подключение к аккаунту Telegram пользователя и чтение сообщений из чатов.
Использует Telethon (user client), не бот — доступ ко всем чатам пользователя.

Перед первым использованием нужно один раз выполнить авторизацию:
  python core/mcp/telegram_login.py

Tools:
- telegram_list_chats: список чатов пользователя (диалоги)
- telegram_list_folder_chats: чаты из именованной папки (dialog filter), например Recruiting
- telegram_get_messages: последние сообщения из указанного чата
- telegram_search_in_chat: поиск по тексту в чате
"""

import json
import logging
import os
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(_REPO_ROOT / ".env")
except ImportError:
    pass

import mcp.server.stdio
import mcp.types as types
from mcp.server import NotificationOptions, Server
from mcp.server.models import InitializationOptions

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


def _dialog_filter_title(f) -> str:
    """DialogFilter.title may be str or TextWithEntities (TL)."""
    t = getattr(f, "title", None)
    if t is None:
        return ""
    if isinstance(t, str):
        return t.strip()
    return (getattr(t, "text", None) or str(t)).strip()


async def _peer_to_chat_row(client, peer) -> dict:
    """Resolve InputPeer to title, username, id for JSON output."""
    try:
        ent = await client.get_entity(peer)
        title = getattr(ent, "title", None) or (
            (getattr(ent, "first_name", "") or "") + " " + (getattr(ent, "last_name", "") or "")
        ).strip() or "Unknown"
        username = getattr(ent, "username", None)
        chat_id = getattr(ent, "id", None)
        ident = f"@{username}" if username else str(chat_id)
        return {"title": title, "username": username, "id": chat_id, "identifier": ident}
    except Exception as e:
        return {"error": str(e), "peer": str(peer)}


def _entity_to_user_row(ent) -> dict:
    """Normalize Telethon user entity into stable JSON payload."""
    first = (getattr(ent, "first_name", None) or "").strip()
    last = (getattr(ent, "last_name", None) or "").strip()
    full_name = f"{first} {last}".strip()
    username = getattr(ent, "username", None)
    user_id = getattr(ent, "id", None)
    return {
        "id": user_id,
        "username": username,
        "first_name": first or None,
        "last_name": last or None,
        "full_name": full_name or None,
        "identifier": f"@{username}" if username else str(user_id),
    }


async def _resolve_user(client, user_id: int, chat: str | None = None) -> dict | None:
    """
    Resolve user by Telegram numeric user_id.
    Strategy:
    1) Direct get_entity(PeerUser)
    2) If chat provided, scan chat participants
    3) Scan recent dialogs and resolve participants lazily
    """
    from telethon.tl.types import PeerUser

    # 1) Direct entity lookup
    try:
        ent = await client.get_entity(PeerUser(user_id))
        if ent is not None:
            return _entity_to_user_row(ent)
    except Exception:
        pass

    # 2) Resolve inside specific chat participants
    if chat:
        try:
            entity = await _resolve_chat(client, chat)
            async for p in client.iter_participants(entity):
                pid = getattr(p, "id", None)
                if pid == user_id:
                    return _entity_to_user_row(p)
        except Exception:
            pass

    # 3) Fallback: scan dialogs and try resolve by user peer
    try:
        dialogs = await client.get_dialogs(limit=300)
        for d in dialogs:
            e = d.entity
            if getattr(e, "id", None) == user_id:
                return _entity_to_user_row(e)
    except Exception:
        pass

    return None


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
            name="telegram_list_folder_chats",
            description=(
                "List chats in a Telegram chat folder (dialog filter) by folder title, e.g. Recruiting. "
                "Uses messages.getDialogFilters; include_peers_count is the number of explicitly included chats. "
                "Set folder_title empty to only list all folder names and peer counts."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "folder_title": {
                        "type": "string",
                        "description": (
                            "Folder name as shown in Telegram (substring match, case-insensitive), "
                            "e.g. Recruiting. Leave empty to return summaries for every folder."
                        ),
                        "default": "",
                    },
                    "resolve_entities": {
                        "type": "boolean",
                        "description": "If true (default), resolve each peer to title/username/id. If false, only counts.",
                        "default": True,
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
        types.Tool(
            name="telegram_resolve_user",
            description=(
                "Resolve Telegram user identity by numeric user_id. "
                "Optionally provide chat id/username to resolve from participants of that chat."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "integer",
                        "description": "Telegram numeric user id from message.from_id.id",
                    },
                    "chat": {
                        "type": "string",
                        "description": "Optional chat identifier (@username, t.me/..., or numeric id) to resolve within chat participants",
                    },
                },
                "required": ["user_id"],
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

        if name == "telegram_list_folder_chats":
            from telethon.tl.functions.messages import GetDialogFiltersRequest

            folder_title = (args.get("folder_title") or "").strip()
            resolve_entities = bool(args.get("resolve_entities", True))
            res = await client(GetDialogFiltersRequest())
            filters = getattr(res, "filters", None) or []
            summaries = []
            for f in filters:
                peers = getattr(f, "include_peers", None) or []
                summaries.append({
                    "title": _dialog_filter_title(f),
                    "filter_id": getattr(f, "id", None),
                    "include_peers_count": len(peers),
                })
            if not folder_title:
                return [
                    types.TextContent(
                        type="text",
                        text=json.dumps({"folders": summaries}, indent=2, ensure_ascii=False, default=str),
                    )
                ]
            needle = folder_title.lower()
            target = None
            for f in filters:
                t = _dialog_filter_title(f)
                if needle == t.lower() or needle in t.lower():
                    target = f
                    break
            if target is None:
                return [
                    types.TextContent(
                        type="text",
                        text=json.dumps(
                            {
                                "error": "folder not found",
                                "folder_title_query": folder_title,
                                "folders": summaries,
                            },
                            indent=2,
                            ensure_ascii=False,
                            default=str,
                        ),
                    )
                ]
            peers = getattr(target, "include_peers", None) or []
            payload = {
                "folder_title": _dialog_filter_title(target),
                "filter_id": getattr(target, "id", None),
                "include_peers_count": len(peers),
                "flags": {
                    "contacts": getattr(target, "contacts", None),
                    "non_contacts": getattr(target, "non_contacts", None),
                    "bots": getattr(target, "bots", None),
                    "groups": getattr(target, "groups", None),
                    "broadcasts": getattr(target, "broadcasts", None),
                },
            }
            if resolve_entities:
                chats = []
                for p in peers:
                    chats.append(await _peer_to_chat_row(client, p))
                payload["chats"] = chats
            return [types.TextContent(type="text", text=json.dumps(payload, indent=2, ensure_ascii=False, default=str))]

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

        if name == "telegram_resolve_user":
            user_id = args.get("user_id")
            if user_id is None:
                return [types.TextContent(type="text", text=json.dumps({"error": "user_id is required"}, indent=2))]
            chat = (args.get("chat") or "").strip() or None
            user = await _resolve_user(client, int(user_id), chat=chat)
            if user is None:
                return [
                    types.TextContent(
                        type="text",
                        text=json.dumps(
                            {"error": "user not found", "user_id": int(user_id), "chat": chat},
                            indent=2,
                            ensure_ascii=False,
                            default=str,
                        ),
                    )
                ]
            return [types.TextContent(type="text", text=json.dumps({"user": user}, indent=2, ensure_ascii=False, default=str))]

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
