"""FastAPI bridge: Telethon feed, WebSocket push, publish, rewrite (Ollama)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sqlite3
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
import tempfile
import uuid
from pathlib import Path
from typing import Any

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket
from starlette.websockets import WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name)
    return v if v is not None and v != "" else default


def _jwt_secret() -> str:
    s = _env("BRIDGE_JWT_SECRET") or _env("BRIDGE_API_SECRET")
    if not s:
        raise RuntimeError("Set BRIDGE_JWT_SECRET or BRIDGE_API_SECRET")
    return s


def _api_secret() -> str:
    s = _env("BRIDGE_API_SECRET")
    if not s:
        raise RuntimeError("Set BRIDGE_API_SECRET")
    return s


def _session_path() -> str:
    p = _env("TELEGRAM_SESSION_PATH")
    if p:
        return p
    vault = Path(_env("VAULT_PATH") or os.getcwd())
    return str(vault / ".claude" / "telegram" / "telegram")


# Часті опечатки ключа в `NEWS_SOURCE_MAP` (другий канал порожній, якщо peer збігся з іншим ключем).
_SOURCE_KEY_ALIASES: dict[str, str] = {
    "uasonli": "uaonlii",
    "uaonli": "uaonlii",
}


def _canonical_channel_key(key: str) -> str:
    k = str(key).strip()
    low = k.lower()
    fixed = _SOURCE_KEY_ALIASES.get(low)
    if fixed and fixed != k:
        logger.warning("channel key %r normalized to %r (fix NEWS_SOURCE_MAP / watchlist)", k, fixed)
        return fixed
    return k


def _parse_channel_specs() -> list[tuple[str, str]]:
    """
    Pairs (channel_key, telegram_peer).
    NEWS_SOURCE_MAP JSON: {"uaonlii":"@uaonlii","real_kyiv":"1181169156"}
    Or NEWS_SOURCE_CHANNELS comma-separated peers (default keys uaonlii, real_kyiv for two peers).
    """
    raw_map = _env("NEWS_SOURCE_MAP")
    if raw_map:
        try:
            m = json.loads(raw_map)
            if isinstance(m, dict):
                merged: dict[str, str] = {}
                for raw_k, raw_v in m.items():
                    ck = _canonical_channel_key(str(raw_k))
                    peer = str(raw_v).strip()
                    if ck in merged and merged[ck] != peer:
                        logger.warning(
                            "NEWS_SOURCE_MAP duplicate key %r after normalize (peers %r vs %r); keeping last",
                            ck,
                            merged[ck],
                            peer,
                        )
                    merged[ck] = peer
                return list(merged.items())
        except json.JSONDecodeError:
            logger.warning("NEWS_SOURCE_MAP invalid JSON, falling back to NEWS_SOURCE_CHANNELS")

    raw = _env("NEWS_SOURCE_CHANNELS")
    if not raw:
        # @ prefix avoids Telethon treating short bare strings as invite hashes elsewhere.
        return [("uaonlii", "@uaonlii"), ("real_kyiv", "1181169156")]

    peers = [p.strip() for p in raw.split(",") if p.strip()]
    default_keys = ["uaonlii", "real_kyiv", "ch2", "ch3", "ch4"]
    out: list[tuple[str, str]] = []
    for i, peer in enumerate(peers):
        key = default_keys[i] if i < len(default_keys) else f"ch{i}"
        if peer.startswith("@"):
            out.append((key, peer))
        elif peer.isdigit():
            out.append((key, peer))
        else:
            out.append((peer.lstrip("@"), f"@{peer}"))
    return out


def _env_channel_keys() -> set[str]:
    return {k for k, _ in _parse_channel_specs()}


def _watchlist_path() -> Path:
    p = _env("BRIDGE_WATCHLIST_PATH")
    if p:
        return Path(p).expanduser()
    return Path(_session_path()).parent / "telegram_news_watchlist.json"


def _load_watchlist_entries() -> list[tuple[str, str]]:
    path = _watchlist_path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return []
        out: list[tuple[str, str]] = []
        for item in data:
            if isinstance(item, dict):
                k = _canonical_channel_key(str(item.get("key") or "").strip())
                pe = str(item.get("peer") or "").strip()
                if k and pe:
                    out.append((k, pe))
        return out
    except Exception as e:
        logger.warning("watchlist read failed: %s", e)
        return []


def _save_watchlist_entries(entries: list[tuple[str, str]]) -> None:
    path = _watchlist_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = [{"key": k, "peer": p} for k, p in entries]
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _normalize_peer(peer: str) -> str:
    p = peer.strip()
    if p.startswith("@"):
        return p[1:].lower()
    if p.isdigit():
        return f"id:{p}"
    return p.lower()


def _all_channel_specs() -> list[tuple[str, str]]:
    """Env sources first, then persisted watchlist (no duplicate keys / peers vs env)."""
    seen_keys: set[str] = set()
    seen_peers: set[str] = set()
    out: list[tuple[str, str]] = []
    for k, pe in _parse_channel_specs():
        if k in seen_keys:
            continue
        seen_keys.add(k)
        seen_peers.add(_normalize_peer(pe))
        out.append((k, pe))
    for k, pe in _load_watchlist_entries():
        if k in seen_keys:
            continue
        np = _normalize_peer(pe)
        if np in seen_peers:
            continue
        seen_keys.add(k)
        seen_peers.add(np)
        out.append((k, pe))
    return out


def _slug_channel_key(username: str) -> str:
    base = re.sub(r"[^a-z0-9_]+", "_", username.lower().strip("@").strip())[:48].strip("_")
    if not base:
        base = "channel"
    if base[0].isdigit():
        base = "ch_" + base
    return base


def _infer_peer_from_input(url_or_peer: str) -> str:
    """Derive Telethon peer string from t.me link, @handle, or numeric channel id."""
    s = url_or_peer.strip()
    if not s:
        raise ValueError("empty")
    if s.startswith("-100") and s[4:].isdigit():
        return s[4:]
    if re.match(r"^-?\d+$", s) and "t.me" not in s.lower() and "telegram.me" not in s.lower():
        if s.startswith("-100") and s[4:].isdigit():
            return s[4:]
        if s.lstrip("-").isdigit():
            return s.lstrip("-") if s.startswith("-") else s
        return s
    low = s.lower()
    if "joinchat/" in low:
        m = re.search(r"joinchat/([A-Za-z0-9_-]+)", s, re.I)
        if m:
            return m.group(1)
    m = re.search(r"(?:t\.me|telegram\.me)/\+([A-Za-z0-9_-]+)", s, re.I)
    if m:
        return m.group(1)
    m = re.search(r"(?:t\.me|telegram\.me)/c/(\d+)/", s, re.I)
    if m:
        return m.group(1)
    m = re.search(r"(?:t\.me|telegram\.me)/s/([^/?#]+)", s, re.I)
    if m:
        return "@" + m.group(1).lstrip("@")
    m = re.search(r"(?:t\.me|telegram\.me)/([A-Za-z][A-Za-z0-9_]{3,})(?:/|$|\?)", s, re.I)
    if m:
        slug = m.group(1)
        if slug.lower() not in {"addstickers", "socks", "iv", "login", "joinchat"}:
            return "@" + slug
    if s.startswith("@"):
        return s
    if s.isdigit():
        return s
    return "@" + s.lstrip("@")


async def _resolve_entity_from_peer(client: Any, peer: str) -> Any:
    """Resolve @username / numeric id / private channel fragment / invite hash."""
    from telethon.errors import InviteHashExpiredError, UserAlreadyParticipantError
    from telethon.tl.functions.messages import CheckChatInviteRequest, ImportChatInviteRequest

    p = peer.strip()
    if p.isdigit() or (p.startswith("-") and p[1:].isdigit()):
        return await _resolve_entity(client, p)
    if p.startswith("@"):
        return await _resolve_entity(client, p)
    # Public @username without @ (4–32 chars). Must run before invite-hash heuristic: strings like "UaOnlii"
    # match ^[A-Za-z0-9_-]{8,}$ and are usernames, not invite hashes.
    if re.match(r"^[A-Za-z][A-Za-z0-9_]{3,31}$", p):
        try:
            return await _resolve_entity(client, p)
        except Exception:
            pass
    # invite hash (joinchat / t.me/+...)
    looks_invite = bool(re.match(r"^[A-Za-z0-9_-]{8,}$", p))
    if looks_invite:
        try:
            chk = await client(CheckChatInviteRequest(p))
            chat = getattr(chk, "chat", None)
            if chat is not None:
                return chat
        except Exception:
            pass
        try:
            updates = await client(ImportChatInviteRequest(p))
        except UserAlreadyParticipantError:
            chk2 = await client(CheckChatInviteRequest(p))
            chat = getattr(chk2, "chat", None)
            if chat is not None:
                return chat
            raise ValueError("already in channel but could not resolve entity") from None
        except InviteHashExpiredError as e:
            raise ValueError("invite link expired") from e
        except Exception as e:
            raise ValueError(f"invite failed: {e}") from e
        chats = getattr(updates, "chats", None) or []
        if chats:
            return chats[0]
        raise ValueError("invite import returned no chat")
    return await _resolve_entity(client, p)


def _message_body_html(msg: Any) -> str:
    """HTML that mirrors Telegram formatting (Telethon unparse)."""
    from html import escape

    from telethon.extensions.html import unparse

    raw = getattr(msg, "message", None)
    if raw is None:
        raw = getattr(msg, "text", None) or ""
    entities = getattr(msg, "entities", None) or []
    if entities:
        return unparse(raw, entities)
    return escape(str(raw)).replace("\n", "<br/>")


def _media_slots(msg: Any) -> list[dict[str, Any]]:
    """Describe attachable media on a message (used by dashboard + /media/... download)."""
    from telethon.tl.types import (
        DocumentAttributeAnimated,
        DocumentAttributeVideo,
        MessageMediaDocument,
        MessageMediaEmpty,
        MessageMediaPhoto,
        MessageMediaUnsupported,
        MessageMediaWebPage,
    )

    mid = int(getattr(msg, "id", 0) or 0)

    # Prefer Telethon custom Message helpers (covers web previews, edge TL shapes).
    if getattr(msg, "photo", None) is not None:
        return [{"kind": "photo", "mime": "image/jpeg", "message_id": mid}]
    gif_doc = getattr(msg, "gif", None)
    if gif_doc is not None:
        mime = (getattr(gif_doc, "mime_type", None) or "video/mp4").strip()
        return [{"kind": "animation", "mime": mime or "video/mp4", "message_id": mid}]
    vid_doc = getattr(msg, "video", None)
    if vid_doc is not None:
        mime = (getattr(vid_doc, "mime_type", None) or "video/mp4").strip()
        return [{"kind": "video", "mime": mime or "video/mp4", "message_id": mid}]
    vn_doc = getattr(msg, "video_note", None)
    if vn_doc is not None:
        mime = (getattr(vn_doc, "mime_type", None) or "video/mp4").strip()
        return [{"kind": "video", "mime": mime or "video/mp4", "message_id": mid}]
    doc = getattr(msg, "document", None)
    if doc is not None:
        mime = (getattr(doc, "mime_type", None) or "").strip()
        if mime.startswith("image/"):
            return [{"kind": "photo", "mime": mime, "message_id": mid}]
        if mime.startswith("video/"):
            return [{"kind": "video", "mime": mime, "message_id": mid}]
        return [{"kind": "document", "mime": mime or "application/octet-stream", "message_id": mid}]

    media = getattr(msg, "media", None)
    if not media:
        return []
    if isinstance(media, (MessageMediaEmpty, MessageMediaUnsupported)):
        return []
    out: list[dict[str, Any]] = []
    if isinstance(media, MessageMediaPhoto):
        out.append({"kind": "photo", "mime": "image/jpeg", "message_id": mid})
        return out
    if isinstance(media, MessageMediaWebPage):
        wp = getattr(media, "webpage", None)
        if wp is not None and getattr(wp, "photo", None) is not None:
            out.append({"kind": "photo", "mime": "image/jpeg", "webpage": True, "message_id": mid})
        return out
    if isinstance(media, MessageMediaDocument):
        doc = getattr(media, "document", None)
        if doc is None:
            return out
        mime = (getattr(doc, "mime_type", None) or "").strip()
        attrs = list(getattr(doc, "attributes", None) or [])
        is_video_attr = any(isinstance(a, DocumentAttributeVideo) for a in attrs)
        is_gif = any(isinstance(a, DocumentAttributeAnimated) for a in attrs)
        if is_gif:
            out.append({"kind": "animation", "mime": mime or "video/mp4", "message_id": mid})
        elif is_video_attr or mime.startswith("video/"):
            out.append({"kind": "video", "mime": mime or "video/mp4", "message_id": mid})
        elif mime.startswith("image/"):
            out.append({"kind": "photo", "mime": mime, "message_id": mid})
        else:
            out.append({"kind": "document", "mime": mime or "application/octet-stream", "message_id": mid})
        return out
    logger.warning("unhandled Telegram media type=%s msg_id=%s", type(media).__name__, mid)
    return []


def _msg_group_meta(msg: Any) -> tuple[int | None, bool]:
    """Album id (Telegram grouped_id) and invert_media (caption above media when True)."""
    gid = getattr(msg, "grouped_id", None)
    if gid is not None:
        try:
            gid = int(gid)
        except (TypeError, ValueError):
            gid = None
    inv = bool(getattr(msg, "invert_media", False))
    return gid, inv


def _telegram_message_url(chat: Any, message_id: int, tg_utils: Any) -> str | None:
    """Public t.me link to the message (username channel or /c/... for private megachannels)."""
    un = getattr(chat, "username", None)
    if isinstance(un, str) and un.strip():
        return f"https://t.me/{un.lstrip('@').lower()}/{message_id}"
    try:
        peer_id = int(tg_utils.get_peer_id(chat))
    except Exception:
        return None
    if peer_id < 0:
        s = str(abs(peer_id))
        if s.startswith("100") and len(s) > 3:
            return f"https://t.me/c/{s[3:]}/{message_id}"
    return None


@dataclass
class Post:
    channel_key: str
    channel_title: str
    message_id: int
    date_iso: str
    text: str
    text_html: str
    telegram_url: str | None = None
    media: list[dict[str, Any]] = field(default_factory=list)
    grouped_id: int | None = None
    invert_media: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "channel_key": self.channel_key,
            "channel_title": self.channel_title,
            "message_id": self.message_id,
            "date": self.date_iso,
            "text": self.text,
            "text_html": self.text_html,
            "telegram_url": self.telegram_url,
            "media": list(self.media),
            "grouped_id": self.grouped_id,
            "invert_media": self.invert_media,
        }


@dataclass
class BridgeState:
    max_posts: int = 200
    posts_by_channel: dict[str, deque[Post]] = field(default_factory=dict)
    ws_clients: set[WebSocket] = field(default_factory=set)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    telethon_client: Any = None
    channel_entities: dict[int, tuple[str, str]] = field(
        default_factory=dict
    )  # chat_id -> (key, title)
    key_to_entity: dict[str, Any] = field(default_factory=dict)  # channel_key -> Telethon entity

    def __post_init__(self) -> None:
        for key, _ in _all_channel_specs():
            self.posts_by_channel.setdefault(key, deque(maxlen=self.max_posts))


state = BridgeState()


async def broadcast_ws(payload: dict[str, Any]) -> None:
    raw = json.dumps(payload, ensure_ascii=False)
    dead: list[WebSocket] = []
    async with state.lock:
        clients = list(state.ws_clients)
    for ws in clients:
        try:
            await ws.send_text(raw)
        except Exception:
            dead.append(ws)
    async with state.lock:
        for ws in dead:
            state.ws_clients.discard(ws)


def verify_bearer(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer")
    token = authorization[7:].strip()
    if token != _api_secret():
        raise HTTPException(status_code=401, detail="invalid bearer")


def verify_ws_token(token: str | None) -> None:
    if not token:
        raise WebSocketException(code=1008, reason="missing token")
    try:
        jwt.decode(
            token,
            _jwt_secret(),
            algorithms=["HS256"],
            audience="telegram-news-ws",
        )
    except jwt.PyJWTError as e:
        raise WebSocketException(code=1008, reason="invalid token") from e


class WebSocketException(Exception):
    """Use Starlette WS close codes: 1008 policy violation for auth failures."""

    def __init__(self, code: int = 1008, reason: str = "error") -> None:
        self.code = code
        self.reason = reason
        super().__init__(reason)


async def telethon_loop() -> None:
    from telethon import TelegramClient, events
    from telethon import utils as tg_utils

    try:
        await _telethon_loop_impl(events, tg_utils)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("telethon_loop crashed")


async def _resolve_entity(client: Any, peer: str) -> Any:
    """Resolve @username / invite / numeric channel id (Telethon needs PeerChannel for raw ids)."""
    from telethon.tl.types import PeerChannel

    p = peer.strip()
    if p.isdigit():
        return await client.get_entity(PeerChannel(int(p)))
    # Bare public usernames (e.g. NEWS_SOURCE_CHANNELS) must use @ so Telethon resolves a channel, not a contact string.
    if not p.startswith("@") and re.match(r"^[A-Za-z][A-Za-z0-9_]{3,31}$", p):
        p = "@" + p
    return await client.get_entity(p)


async def register_watched_channel(
    client: Any,
    key: str,
    peer_stored: str,
    tg_utils: Any,
    *,
    backfill_limit: int,
    persist_watchlist: bool,
    entity: Any | None = None,
) -> dict[str, Any]:
    """Register entity, backfill deque, optionally persist to watchlist JSON."""
    key = _canonical_channel_key(key.strip())
    peer_stored = peer_stored.strip()
    if not key or not peer_stored:
        raise ValueError("key and peer required")
    ent = entity if entity is not None else await _resolve_entity_from_peer(client, peer_stored)
    peer_id = int(tg_utils.get_peer_id(ent))
    title = getattr(ent, "title", None) or getattr(ent, "username", None) or str(peer_id)
    title_s = str(title)
    async with state.lock:
        existing = state.channel_entities.get(peer_id)
        if existing and existing[0] == key:
            return {
                "channel_key": key,
                "channel_title": existing[1],
                "peer_id": peer_id,
                "backfill_count": 0,
                "already_watching": True,
            }
        if existing and existing[0] != key:
            raise ValueError(f"channel already watched as {existing[0]!r}")
        old_ent = state.key_to_entity.get(key)
        if old_ent is not None:
            old_pid = int(tg_utils.get_peer_id(old_ent))
            if old_pid != peer_id:
                raise ValueError(f"key {key!r} is already used for another channel")
        state.channel_entities[peer_id] = (key, title_s)
        state.key_to_entity[key] = ent
        state.posts_by_channel.setdefault(key, deque(maxlen=state.max_posts))

    lim = max(1, min(backfill_limit, state.max_posts, 500))
    msgs = await client.get_messages(ent, limit=lim)
    sorted_msgs = sorted([m for m in msgs if m and getattr(m, "id", None)], key=lambda m: int(m.id))
    async with state.lock:
        dq = state.posts_by_channel.setdefault(key, deque(maxlen=state.max_posts))
        for m in sorted_msgs:
            text = getattr(m, "text", None) or ""
            text_html = _message_body_html(m)
            media = _media_slots(m)
            gid, invert_media = _msg_group_meta(m)
            turl = _telegram_message_url(ent, int(m.id), tg_utils)
            d = getattr(m, "date", None)
            date_iso = d.astimezone(timezone.utc).isoformat() if d else ""
            dq.appendleft(
                Post(
                    channel_key=key,
                    channel_title=title_s,
                    message_id=int(m.id),
                    date_iso=date_iso,
                    text=text,
                    text_html=text_html,
                    telegram_url=turl,
                    media=media,
                    grouped_id=gid,
                    invert_media=invert_media,
                )
            )

    if persist_watchlist and key not in _env_channel_keys():
        entries = [p for p in _load_watchlist_entries() if p[0] != key]
        entries.append((key, peer_stored))
        await asyncio.to_thread(_save_watchlist_entries, entries)

    return {
        "channel_key": key,
        "channel_title": title_s,
        "peer_id": peer_id,
        "backfill_count": len(sorted_msgs),
    }


async def _telethon_loop_impl(events: Any, tg_utils: Any) -> None:
    from telethon import TelegramClient

    api_id = _env("TELEGRAM_API_ID")
    api_hash = _env("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        logger.error("TELEGRAM_API_ID / TELEGRAM_API_HASH not set; Telethon idle")
        return

    specs = _all_channel_specs()
    session = _session_path()
    Path(session).parent.mkdir(parents=True, exist_ok=True)

    client = TelegramClient(session, int(api_id), api_hash)
    state.telethon_client = client

    try:
        await client.connect()
    except sqlite3.OperationalError as e:
        if "locked" in str(e).lower():
            logger.error(
                "Cannot open Telethon session (SQLite locked). Another process is using the same "
                "session file — often Cursor Telegram MCP. Disable that MCP server or stop the "
                "other script, then restart the bridge. Alternatively use TELEGRAM_SESSION_PATH to a "
                "dedicated session and run: uv run python core/mcp/telegram_login.py with that env set."
            )
        raise
    if not await client.is_user_authorized():
        logger.error("Telegram session not authorized; run telegram_login.py")
        await client.disconnect()
        return

    entities: list[Any] = []
    for key, peer in specs:
        try:
            ent = await _resolve_entity(client, peer)
        except Exception as e:
            logger.warning("Skip channel key=%s peer=%s: %s", key, peer, e)
            continue
        entities.append(ent)
        peer_id = int(tg_utils.get_peer_id(ent))
        title = getattr(ent, "title", None) or getattr(ent, "username", None) or str(peer_id)
        state.channel_entities[peer_id] = (key, title)
        state.key_to_entity[key] = ent
        logger.info("Watching channel key=%s peer_id=%s title=%s", key, peer_id, title)

    if not entities:
        logger.error("No channels could be resolved; check NEWS_SOURCE_* and Telegram FloodWait")
        await client.disconnect()
        return

    async def on_new_message(event: Any) -> None:
        try:
            msg = event.message
            chat = await event.get_chat()
            cid = int(tg_utils.get_peer_id(chat))
            pair = state.channel_entities.get(cid)
            if not pair:
                sch = getattr(msg, "sender_chat", None)
                if sch is not None:
                    try:
                        cid2 = int(tg_utils.get_peer_id(sch))
                        pair = state.channel_entities.get(cid2)
                    except Exception:
                        pair = None
            if not pair:
                return
            key, title = pair
            text = getattr(msg, "text", None) or ""
            text_html = _message_body_html(msg)
            media = _media_slots(msg)
            gid, invert_media = _msg_group_meta(msg)
            turl = _telegram_message_url(chat, int(msg.id), tg_utils)
            date = getattr(msg, "date", None)
            date_iso = date.astimezone(timezone.utc).isoformat() if date else datetime.now(timezone.utc).isoformat()
            post = Post(
                channel_key=key,
                channel_title=title,
                message_id=int(msg.id),
                date_iso=date_iso,
                text=text,
                text_html=text_html,
                telegram_url=turl,
                media=media,
                grouped_id=gid,
                invert_media=invert_media,
            )
            async with state.lock:
                dq = state.posts_by_channel.setdefault(key, deque(maxlen=state.max_posts))
                dq.appendleft(post)
            await broadcast_ws({"type": "new_post", "post": post.to_dict()})
        except Exception:
            logger.exception("on_new_message failed")

    # Any chat: filter by channel_entities (supports dynamically added channels).
    client.add_event_handler(on_new_message, events.NewMessage())

    # backfill recent messages
    for ent in entities:
        cid = int(tg_utils.get_peer_id(ent))
        pair = state.channel_entities.get(cid)
        if not pair:
            continue
        key, title = pair
        msgs = await client.get_messages(ent, limit=30)
        sorted_msgs = sorted([m for m in msgs if m and getattr(m, "id", None)], key=lambda m: int(m.id))
        async with state.lock:
            dq = state.posts_by_channel.setdefault(key, deque(maxlen=state.max_posts))
            for m in sorted_msgs:
                text = getattr(m, "text", None) or ""
                text_html = _message_body_html(m)
                media = _media_slots(m)
                gid, invert_media = _msg_group_meta(m)
                turl = _telegram_message_url(ent, int(m.id), tg_utils)
                d = getattr(m, "date", None)
                date_iso = d.astimezone(timezone.utc).isoformat() if d else ""
                dq.appendleft(
                    Post(
                        channel_key=key,
                        channel_title=title,
                        message_id=int(m.id),
                        date_iso=date_iso,
                        text=text,
                        text_html=text_html,
                        telegram_url=turl,
                        media=media,
                        grouped_id=gid,
                        invert_media=invert_media,
                    )
                )

    logger.info("Telethon running until disconnect")
    await client.run_until_disconnected()


telethon_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global telethon_task
    logging.basicConfig(level=logging.INFO)
    telethon_task = asyncio.create_task(telethon_loop())
    yield
    if telethon_task:
        telethon_task.cancel()
        try:
            await telethon_task
        except asyncio.CancelledError:
            pass
    c = state.telethon_client
    if c is not None:
        try:
            await c.disconnect()
        except Exception:
            pass


app = FastAPI(title="Telegram News Bridge", lifespan=lifespan)

_cors = _env("BRIDGE_CORS_ORIGINS", "")
if _cors:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in _cors.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/feed")
async def get_feed(_: None = Depends(verify_bearer)) -> JSONResponse:
    async with state.lock:
        out: dict[str, list[dict[str, Any]]] = {}
        for k, dq in state.posts_by_channel.items():
            out[k] = [p.to_dict() for p in list(dq)]
    return JSONResponse({"channels": out})


@app.get("/channels")
async def list_channels(_: None = Depends(verify_bearer)) -> JSONResponse:
    """Watched channel keys + titles (for UI)."""
    async with state.lock:
        rows: list[dict[str, Any]] = []
        for peer_id, (key, title) in sorted(
            state.channel_entities.items(), key=lambda x: (x[1][0], x[0])
        ):
            rows.append({"channel_key": key, "channel_title": title, "peer_id": peer_id})
    return JSONResponse({"channels": rows})


class WatchChannelBody(BaseModel):
    """Add a column: pass a t.me link, @username, invite hash, or numeric channel id."""

    url: str | None = Field(default=None, description="https://t.me/username or /c/.../msg or joinchat")
    peer: str | None = Field(default=None, description="Alternative to url: @channel, id, invite hash")
    channel_key: str | None = Field(default=None, max_length=64, description="Slug for API/media; default from @username")
    backfill_limit: int = Field(100, ge=1, le=500, description="How many recent messages to load immediately")


@app.post("/channels/watch")
async def watch_channel(body: WatchChannelBody, _: None = Depends(verify_bearer)) -> JSONResponse:
    from telethon import utils as tg_utils_mod

    src = (body.url or body.peer or "").strip()
    if not src:
        raise HTTPException(400, "provide url or peer")
    c = state.telethon_client
    if c is None or not c.is_connected():
        raise HTTPException(503, "telegram client not ready")
    try:
        peer_stored = _infer_peer_from_input(src)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    try:
        ent = await _resolve_entity_from_peer(c, peer_stored)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        logger.exception("watch_channel resolve")
        raise HTTPException(502, f"cannot resolve channel: {e}") from e

    un = getattr(ent, "username", None)
    if body.channel_key:
        ck = re.sub(r"[^a-zA-Z0-9_]", "_", body.channel_key.strip())[:48].strip("_")
        if not ck:
            raise HTTPException(400, "invalid channel_key")
        if ck[0].isdigit():
            ck = "ch_" + ck
        key = ck
    elif isinstance(un, str) and un.strip():
        key = _slug_channel_key(un)
    else:
        key = f"tg_{abs(int(tg_utils_mod.get_peer_id(ent)))}"

    key = _canonical_channel_key(key)

    try:
        info = await register_watched_channel(
            c,
            key,
            peer_stored,
            tg_utils_mod,
            backfill_limit=body.backfill_limit,
            persist_watchlist=True,
            entity=ent,
        )
    except ValueError as e:
        raise HTTPException(409, str(e)) from e
    except Exception as e:
        logger.exception("watch_channel register")
        raise HTTPException(502, str(e)) from e

    async with state.lock:
        snapshot = {k: [p.to_dict() for p in list(dq)] for k, dq in state.posts_by_channel.items()}
    await broadcast_ws({"type": "snapshot", "channels": snapshot})
    return JSONResponse({"ok": True, **info, "channels": snapshot})


def _unlink_media_file(path: str) -> None:
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        pass


@app.get("/media/{channel_key}/{message_id}")
async def get_channel_media(
    channel_key: str,
    message_id: int,
    slot: int = 0,
    _: None = Depends(verify_bearer),
) -> FileResponse:
    """Download one media attachment (photo / video / animation) for a stored message."""
    ent = state.key_to_entity.get(channel_key)
    if ent is None:
        raise HTTPException(status_code=404, detail="unknown channel_key")
    c = state.telethon_client
    if c is None or not c.is_connected():
        raise HTTPException(status_code=503, detail="telegram client not ready")
    msg = await c.get_messages(ent, ids=message_id)
    if msg is None or getattr(msg, "id", None) is None:
        raise HTTPException(status_code=404, detail="message not found")
    slots = _media_slots(msg)
    use_slot = slot
    if not slots and getattr(msg, "media", None) is not None and slot == 0:
        # Telethon may still download media our slot detector does not classify (new TL types).
        slots = [{"kind": "document", "mime": "application/octet-stream", "message_id": message_id}]
        use_slot = 0
    if not slots or use_slot < 0 or use_slot >= len(slots):
        raise HTTPException(status_code=404, detail="no media for message")
    tmp_base = Path(tempfile.gettempdir()) / f"tgnews_{uuid.uuid4().hex}"
    path = await c.download_media(msg, file=str(tmp_base))
    if not path:
        raise HTTPException(status_code=502, detail="download failed")
    path_obj = Path(str(path))
    if not path_obj.is_file():
        raise HTTPException(status_code=502, detail="download not a file")
    media_type = str(slots[use_slot].get("mime") or "application/octet-stream").strip()
    if media_type == "application/octet-stream":
        suf = path_obj.suffix.lower()
        if suf in (".jpg", ".jpeg"):
            media_type = "image/jpeg"
        elif suf == ".png":
            media_type = "image/png"
        elif suf == ".webp":
            media_type = "image/webp"
        elif suf in (".mp4", ".webm", ".mov"):
            media_type = "video/mp4" if suf == ".mp4" else "video/webm"
    resolved = str(path_obj.resolve())
    return FileResponse(
        resolved,
        media_type=media_type,
        background=BackgroundTask(_unlink_media_file, resolved),
    )


class PublishBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=16000)
    target: str | None = Field(default=None, description="Override @username or id; default NEWS_TARGET_CHANNEL")


@app.post("/publish")
async def publish(body: PublishBody, _: None = Depends(verify_bearer)) -> JSONResponse:
    from telethon import TelegramClient

    c = state.telethon_client
    if c is None or not c.is_connected():
        raise HTTPException(503, "telegram client not ready")

    target = body.target or _env("NEWS_TARGET_CHANNEL")
    if not target:
        raise HTTPException(400, "NEWS_TARGET_CHANNEL or target required")

    ent = await c.get_entity(target.strip())
    await c.send_message(ent, body.text)
    return JSONResponse({"ok": True, "target": str(target)})


class RewriteBody(BaseModel):
    text: str = Field(..., min_length=1)
    channel_key: str | None = None


@app.post("/rewrite")
async def rewrite(body: RewriteBody, _: None = Depends(verify_bearer)) -> JSONResponse:
    """UA-neutral rewrite via Ollama (default) or pass-through if Ollama disabled."""
    ollama = (_env("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").rstrip("/")
    model = _env("OLLAMA_MODEL") or "llama3.2"
    system = (
        "Ти — редактор новин. Перепиши вхідний текст українською мовою у стилі нейтральної новини. "
        "Збережи факти та тему; не копіюй дослівно; без агресивної риторики. "
        "Відповідь лише текст новини, без преамбули."
    )
    user = f"Оригінал:\n\n{body.text}"
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.post(
                f"{ollama}/api/chat",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "stream": False,
                },
            )
            r.raise_for_status()
            data = r.json()
            msg = (data.get("message") or {}).get("content") or data.get("response") or ""
            if isinstance(msg, str) and msg.strip():
                return JSONResponse({"rewrite": msg.strip()})
    except Exception as e:
        logger.exception("ollama rewrite failed: %s", e)
    raise HTTPException(502, "rewrite failed (check OLLAMA_BASE_URL / OLLAMA_MODEL)")


@app.websocket("/ws/feed")
async def ws_feed(websocket: WebSocket, token: str | None = Query(default=None)) -> None:
    try:
        verify_ws_token(token)
    except WebSocketException as e:
        await websocket.close(code=e.code, reason=e.reason[:123])
        return
    await websocket.accept()
    async with state.lock:
        state.ws_clients.add(websocket)
    try:
        async with state.lock:
            snapshot = {k: [p.to_dict() for p in list(dq)] for k, dq in state.posts_by_channel.items()}
        await websocket.send_text(json.dumps({"type": "snapshot", "channels": snapshot}, ensure_ascii=False))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        async with state.lock:
            state.ws_clients.discard(websocket)
