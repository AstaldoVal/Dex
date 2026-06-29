#!/usr/bin/env python3
"""
One-off: папка Telegram «Recruiting» → только личные DM (User, не бот),
последние сообщения, Markdown-дайджест + JSON.

Та же сессия и пути, что у MCP core/mcp/telegram_server.py (TELEGRAM_SESSION_PATH, .env).
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

_env = REPO_ROOT / ".env"
if _env.exists():
    with open(_env) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k in ("TELEGRAM_API_ID", "TELEGRAM_API_HASH", "VAULT_PATH", "TELEGRAM_SESSION_PATH") and v:
                    __import__("os").environ.setdefault(k, v)

import os

VAULT_PATH = Path(os.environ.get("VAULT_PATH", REPO_ROOT))
TELEGRAM_DIR = VAULT_PATH / ".claude" / "telegram"
TELEGRAM_SESSION_PATH = os.environ.get("TELEGRAM_SESSION_PATH") or str(TELEGRAM_DIR / "telegram")
TELEGRAM_API_ID = os.environ.get("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH")

FOLDER_QUERY = "recruiting"
MSG_LIMIT = 55
OUT_JSON = REPO_ROOT / "00-Inbox" / "Job_Search" / "Telegram_Recruiting_personal_live_2026-04-19.json"
OUT_MD = REPO_ROOT / "00-Inbox" / "Job_Search" / "Telegram_Recruiting_Personal_Chats_Vacancies_Feedback_Digest_2026-04-19.md"

# Подсветка «процесс / фидбэк» (грубый поиск по тексту)
SIGNAL_PAT = re.compile(
    r"отказ|интервью|interview|оффер|offer|feedback|собесед|resume|резюме|"
    r"thank|спасибо|next step|unfortunately|к сожалению|declin|reject|hired|нанима",
    re.I,
)


def _dialog_filter_title(f) -> str:
    t = getattr(f, "title", None)
    if t is None:
        return ""
    if isinstance(t, str):
        return t.strip()
    return (getattr(t, "text", None) or str(t)).strip()


def _msg_link(username: str | None, uid: int, msg_id: int) -> str:
    if username:
        return f"https://t.me/{username}/{msg_id}"
    return f"tg://user?id={uid} (msg {msg_id})"


def _one_line(text: str, max_len: int = 420) -> str:
    t = " ".join(text.split())
    if len(t) > max_len:
        return t[: max_len - 1] + "…"
    return t


async def main() -> None:
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env", file=sys.stderr)
        sys.exit(1)

    from telethon import TelegramClient
    from telethon.tl.functions.messages import GetDialogFiltersRequest
    from telethon.tl.types import Channel, Chat, User

    TELEGRAM_DIR.mkdir(parents=True, exist_ok=True)
    client = TelegramClient(TELEGRAM_SESSION_PATH, int(TELEGRAM_API_ID), TELEGRAM_API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        print("Not authorized. Run: python core/mcp/telegram_login.py", file=sys.stderr)
        sys.exit(1)

    res = await client(GetDialogFiltersRequest())
    filters = getattr(res, "filters", None) or []
    target = None
    for f in filters:
        t = _dialog_filter_title(f)
        if FOLDER_QUERY in t.lower():
            target = f
            break
    if target is None:
        await client.disconnect()
        print(json.dumps({"error": "folder not found", "folders": [_dialog_filter_title(x) for x in filters]}))
        sys.exit(1)

    peers = getattr(target, "include_peers", None) or []
    folder_title = _dialog_filter_title(target)
    collected: list[dict] = []
    skipped: list[dict] = []

    for p in peers:
        try:
            ent = await client.get_entity(p)
        except Exception as e:
            skipped.append({"reason": "resolve_error", "error": str(e), "peer": str(p)})
            continue

        if isinstance(ent, Channel):
            skipped.append(
                {
                    "reason": "channel_or_megagroup",
                    "title": getattr(ent, "title", ""),
                    "username": getattr(ent, "username", None),
                    "id": ent.id,
                }
            )
            continue
        if isinstance(ent, Chat):
            skipped.append({"reason": "basic_group", "title": ent.title, "id": ent.id})
            continue
        if isinstance(ent, User) and ent.bot:
            skipped.append(
                {
                    "reason": "bot",
                    "title": (ent.first_name or "") + " " + (getattr(ent, "last_name", "") or ""),
                    "username": ent.username,
                    "id": ent.id,
                }
            )
            continue
        if not isinstance(ent, User):
            skipped.append({"reason": "unknown_entity", "raw": str(type(ent))})
            continue

        title = ((ent.first_name or "") + " " + (getattr(ent, "last_name", "") or "")).strip() or "Unknown"
        username = ent.username
        uid = ent.id
        ident = f"@{username}" if username else str(uid)

        msgs: list[dict] = []
        async for m in client.iter_messages(ent, limit=MSG_LIMIT):
            text = (getattr(m, "text", None) or "").strip()
            if not text:
                continue
            row = {
                "id": m.id,
                "date": m.date.isoformat() if m.date else None,
                "out": bool(getattr(m, "out", False)),
                "text": text[:4000],
                "signal": bool(SIGNAL_PAT.search(text)),
            }
            msgs.append(row)

        signal_hits = [x for x in msgs if x["signal"]]
        collected.append(
            {
                "title": title,
                "username": username,
                "id": uid,
                "identifier": ident,
                "message_count": len(msgs),
                "signal_hits": len(signal_hits),
                "messages": msgs,
            }
        )

    await client.disconnect()

    built_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = {
        "built_at_utc": built_at,
        "folder_title": folder_title,
        "folder_filter_id": getattr(target, "id", None),
        "personal_user_chats": len(collected),
        "skipped_peers": skipped,
        "chats": collected,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    # Markdown
    lines: list[str] = []
    lines.append("# Дайджест: личные чаты папки «Recruiting» в Telegram — вакансии и фидбэк")
    lines.append("")
    lines.append(f"- **Собрано (UTC):** {built_at}")
    lines.append(
        "- **Источник:** прямое чтение Telegram через **Telethon** (та же сессия и учётные данные, что у MCP `user-telegram` / в Cursor сервер **`user-user-telegram`**)."
    )
    lines.append(f"- **Папка:** {folder_title}")
    lines.append(f"- **Отбор «личные»:** только `User`, не бот; каналы/супергруппы/группы из папки пропущены ({len(skipped)} peer).")
    lines.append(f"- **Лимит сообщений на чат:** {MSG_LIMIT} последних текстовых сообщений.")
    lines.append("")
    lines.append("## Сводка")
    lines.append("")
    lines.append("| Чат | id | Сообщений (текст) | Хиты по ключам процесса |")
    lines.append("|-----|-----|-------------------|-------------------------|")
    for c in sorted(collected, key=lambda x: (-x["signal_hits"], x["title"].lower())):
        u = c["username"] or "—"
        lines.append(
            f"| **{c['title']}** (`{u}`) | `{c['id']}` | {c['message_count']} | {c['signal_hits']} |"
        )
    lines.append("")
    lines.append("## Детали по чатам")
    lines.append("")
    for c in sorted(collected, key=lambda x: x["title"].lower()):
        un = c["username"]
        uid = c["id"]
        lines.append(f"### {c['title']}")
        lines.append("")
        lines.append(f"- Идентификатор: `{c['identifier']}` · numeric id `{uid}`")
        if c["signal_hits"]:
            lines.append(f"- Сообщений с маркерами процесса/фидбэка (эвристика): **{c['signal_hits']}**")
        lines.append("")
        lines.append("Последние сообщения (новые сверху):")
        lines.append("")
        for m in c["messages"][:25]:
            who = "**вы**" if m["out"] else "**собеседник**"
            dt = m["date"] or ""
            link = _msg_link(un, uid, m["id"])
            flag = " _(процесс?)_" if m["signal"] else ""
            lines.append(f"- {dt} · {who}{flag} — [{m['id']}]({link})")
            lines.append(f"  > {_one_line(m['text'])}")
            lines.append("")
        lines.append("---")
        lines.append("")

    lines.append("## Сырые данные")
    lines.append("")
    lines.append(f"Полный дамп: `{OUT_JSON.relative_to(REPO_ROOT)}`")
    lines.append("")
    OUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT_MD} and {OUT_JSON}")


if __name__ == "__main__":
    asyncio.run(main())
