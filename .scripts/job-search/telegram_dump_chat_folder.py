#!/usr/bin/env python3
"""Export chats from a Telegram dialog folder (e.g. Recruiting) to JSON.

Uses Telethon session TELEGRAM_SESSION_PATH (base path, no .session suffix).
Morning digest can set that via TELEGRAM_RECRUITING_SESSION_PATH for a file separate from MCP."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sqlite3
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]
if str(_REPO) not in sys.path:
    sys.path.insert(0, str(_REPO))

try:
    from dotenv import load_dotenv

    load_dotenv(_REPO / ".env")
except ImportError:
    pass

from telethon import TelegramClient
from telethon.tl.functions.messages import GetDialogFiltersRequest


async def _connect_with_retries(client: TelegramClient) -> None:
    """Session SQLite is single-writer; other Telethon clients (MCP, scans) cause 'database is locked' on connect."""
    loop = asyncio.get_running_loop()
    max_wait = float(os.environ.get("TELEGRAM_CONNECT_MAX_WAIT_SEC", "240"))
    base = float(os.environ.get("TELEGRAM_CONNECT_RETRY_BASE_SEC", "0.75"))
    deadline = loop.time() + max_wait
    attempt = 0
    last_err: BaseException | None = None
    while loop.time() < deadline:
        try:
            await client.connect()
            return
        except (sqlite3.OperationalError, OSError) as e:
            last_err = e
            msg = str(e).lower()
            if "locked" not in msg and "busy" not in msg:
                raise
            attempt += 1
            if attempt == 1 or attempt % 6 == 0:
                print(
                    f"warn: Telethon session DB locked on connect (attempt {attempt}), retrying…",
                    file=sys.stderr,
                )
            delay = min(25.0, base * (1.28 ** min(attempt, 28)))
            await asyncio.sleep(delay)
    raise sqlite3.OperationalError(
        f"telegram session still locked after {max_wait:.0f}s connect retries ({last_err!r}); "
        "close other Telethon users of this session and retry."
    ) from last_err


async def _disconnect_with_retries(client: TelegramClient) -> None:
    attempts = int(os.environ.get("TELEGRAM_DISCONNECT_RETRIES", "14"))
    base = float(os.environ.get("TELEGRAM_DISCONNECT_RETRY_BASE_SEC", "0.35"))
    for i in range(attempts):
        try:
            await client.disconnect()
            return
        except (sqlite3.OperationalError, OSError) as e:
            msg = str(e).lower()
            if "locked" not in msg and "busy" not in msg:
                raise
            await asyncio.sleep(min(30.0, base * (1.55**i)))
    print(
        f"warn: Telethon disconnect skipped after {attempts} attempts (session DB may stay locked)",
        file=sys.stderr,
    )


def _dialog_filter_title(f) -> str:
    t = getattr(f, "title", None)
    if t is None:
        return ""
    if isinstance(t, str):
        return t.strip()
    return (getattr(t, "text", None) or str(t)).strip()


async def _peer_row(client: TelegramClient, peer) -> dict:
    """Resolve peer to title/username; retry while Telethon session SQLite is briefly locked."""
    loop = asyncio.get_running_loop()
    max_wait = float(os.environ.get("TELEGRAM_PEER_ROW_MAX_WAIT_SEC", "35"))
    base = float(os.environ.get("TELEGRAM_PEER_ROW_RETRY_BASE_SEC", "0.55"))
    deadline = loop.time() + max_wait
    attempt = 0
    while True:
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
            em = str(e).lower()
            locked = isinstance(e, sqlite3.OperationalError) and ("locked" in em or "busy" in em)
            locked = locked or "database is locked" in em or "locked" in em or "busy" in em
            if locked and loop.time() < deadline:
                attempt += 1
                if attempt == 1 or attempt % 8 == 0:
                    print(
                        f"warn: get_entity locked (attempt {attempt}), retrying peer…",
                        file=sys.stderr,
                    )
                await asyncio.sleep(min(18.0, base * (1.28 ** min(attempt, 26))))
                continue
            return {"error": str(e), "peer": str(peer)}


async def main() -> None:
    p = argparse.ArgumentParser(description="Dump Telegram folder chats to JSON")
    p.add_argument("--folder", default="Recruiting", help="Folder title (substring, case-insensitive)")
    p.add_argument(
        "--out",
        type=Path,
        help="Output JSON path (default: 00-Inbox/Job_Search/Telegram_<folder>_YYYY-MM-DD.json)",
    )
    args = p.parse_args()
    vault = Path(os.environ.get("VAULT_PATH", _REPO))
    session = os.environ.get("TELEGRAM_SESSION_PATH") or str(vault / ".claude" / "telegram" / "telegram")
    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH", file=sys.stderr)
        sys.exit(1)
    out = args.out
    if out is None:
        from datetime import date

        safe = "".join(c if c.isalnum() or c in " -_" else "_" for c in args.folder)[:40].strip() or "folder"
        out = vault / "00-Inbox" / "Job_Search" / f"Telegram_{safe}_{date.today().isoformat()}.json"

    client = TelegramClient(session, int(api_id), api_hash)
    await _connect_with_retries(client)
    try:
        if not await client.is_user_authorized():
            hint = (
                "npm run job-search:telegram-login-recruiting"
                if "telegram_recruiting" in session
                else "npm run job-search:telegram-login"
            )
            print(f"Session not authorized. Run: {hint}", file=sys.stderr)
            sys.exit(1)
        res = await client(GetDialogFiltersRequest())
        filters = getattr(res, "filters", None) or []
        needle = args.folder.lower()
        target = None
        for f in filters:
            t = _dialog_filter_title(f)
            if needle == t.lower() or needle in t.lower():
                target = f
                break
        if target is None:
            print("Folder not found. Titles:", [_dialog_filter_title(x) for x in filters], file=sys.stderr)
            sys.exit(2)
        peers = getattr(target, "include_peers", None) or []
        chats: list[dict] = []
        lock_streak = 0
        lock_abort = int(os.environ.get("TELEGRAM_DUMP_LOCK_ABORT_STREAK", "4"))
        for peer in peers:
            row = await _peer_row(client, peer)
            chats.append(row)
            err = row.get("error")
            if err and ("locked" in str(err).lower() or "busy" in str(err).lower()):
                lock_streak += 1
                if lock_streak >= lock_abort:
                    print(
                        f"dump: aborting after {lock_abort} consecutive SQLite lock errors on get_entity; "
                        "close Telethon MCP / other scans using this session, then retry.",
                        file=sys.stderr,
                    )
                    sys.exit(3)
            else:
                lock_streak = 0
        lock_fail = sum(
            1
            for c in chats
            if c.get("error") and ("locked" in str(c["error"]).lower() or "busy" in str(c["error"]).lower())
        )
        if peers and lock_fail > max(4, len(peers) // 10):
            print(
                f"dump: refusing to write JSON ({lock_fail}/{len(peers)} peers hit SQLite lock); "
                "close other Telethon clients and retry.",
                file=sys.stderr,
            )
            sys.exit(3)
        payload = {
            "folder_title": _dialog_filter_title(target),
            "filter_id": getattr(target, "id", None),
            "include_peers_count": len(peers),
            "chats": chats,
        }
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(str(out))
    finally:
        if client.is_connected():
            await _disconnect_with_retries(client)


if __name__ == "__main__":
    asyncio.run(main())
