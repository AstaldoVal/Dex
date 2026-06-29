#!/usr/bin/env python3
"""
Сбор фидбэка рекрутеров по откликам: только личные чаты (1:1 с User), не каналы и не группы.

Сообщения сопоставляются с позициями из `applications-tracker.json` по названию компании
(и при возможности по словам из роли). Итог: какой фидбэк и на какую позицию.

Та же сессия Telethon, что у Telegram MCP: VAULT_PATH/.claude/telegram/telegram.session

Первый вход (один раз):
  npm run job-search:telegram-login
  TELEGRAM_API_ID / TELEGRAM_API_HASH в .env (https://my.telegram.org/apps).

Дальше:
  npm run job-search:telegram-feedback

Optional env:
  TELEGRAM_JOB_FEEDBACK_DAYS=120
  TELEGRAM_JOB_FEEDBACK_MAX_DIALOGS=250
  TELEGRAM_JOB_FEEDBACK_MAX_MESSAGES_PER_DIALOG=400
  TELEGRAM_JOB_FEEDBACK_SKIP_BOTS=1
  TELEGRAM_JOB_FEEDBACK_ONLY_PRIVATE=1            # default 1: только лички с рекрутерами; 0 = ещё группы/супергруппы
  TELEGRAM_JOB_FEEDBACK_SKIP_BROADCAST_CHANNELS=1
  TELEGRAM_JOB_FEEDBACK_INCLUDE_ALL_CHANNELS=0    # 1 = снова сканировать broadcast-каналы (шумно)
  TELEGRAM_JOB_FEEDBACK_INCOMING_ONLY=1           # в личках: только входящие (ответ рекрутера), не ваши исходящие
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

os.environ.setdefault("VAULT_PATH", str(REPO))

try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv(REPO / ".env")
except ImportError:
    pass

COMPANY_BLOCKLIST = frozenset({"ukr.net", "re cap"})

# Hiring *feedback* phrasing (avoid bare "offer", "откликнется", channel "вакансии").
FEEDBACK_PATTERN = re.compile(
    r"(?:"
    r"unfortunately|not\s+(?:moving|selected)|moving\s+forward|other\s+candidates|"
    r"\binterview\b|rejection|declined|shortlist|job\s+offer|offer\s+(?:has|of)|"
    r"hiring\s+process|thank\s+you\s+for\s+(?:your\s+)?(?:application|interest|time)|"
    r"candidacy|position\s+(?:has\s+been\s+)?filled|"
    r"отказ\s+от\s+кандидат|отказ\s+в\s+приёме|решили\s+не\s+приглашать|"
    r"(?:^|[^\u0400-\u04FF])собеседован(?:ие|ия|ию|ии|иях)(?:[^\u0400-\u04FF]|$)|"
    r"приглашаем\s+на\s+собесед|"
    r"рассмотрел(?:и)?\s+(?:в\s+)?(?:заявк|анкет|резюме)|"
    r"ваш(?:е\s+)?(?:заявлени|резюме)\s+рассмотр|спасибо\s+за\s+(?:интерес|время)[^.]{0,40}(?:ваканс|позици)"
    r")",
    re.IGNORECASE | re.DOTALL,
)


_SURVEY_SPAM = re.compile(
    r"(?:курсовой|дипломн|магистрат|выпускн|исследован|"
    r"опрос[\s:]|google\.com/forms|forms\.yandex|"
    r"docs\.google\.com/forms|пройдите\s+опрос|анкет)",
    re.IGNORECASE,
)

# Mass CV / vacancy channel posts (not personal recruiter feedback).
_CHANNEL_CV_SPAM = re.compile(
    r"(?:#resume\s*#cv|#резюме\s*#|#вакансия\s*#удаленка|"
    r"^\s*#cv\b|^\s*\*\*#cv\*\*)",
    re.IGNORECASE | re.MULTILINE,
)


def _is_survey_or_research_spam(text: str) -> bool:
    """Student surveys and mass form links are not job-application feedback."""
    t = text.lower()
    if _SURVEY_SPAM.search(t):
        return True
    if t.count("http") >= 2 and ("опрос" in t or "анкет" in t):
        return True
    if _CHANNEL_CV_SPAM.search(text):
        return True
    return False


def _load_tracker_company_tokens(vault: Path) -> set[str]:
    p = vault / "00-Inbox" / "Job_Search" / "data" / "applications-tracker.json"
    if not p.exists():
        return set()
    data = json.loads(p.read_text(encoding="utf-8"))
    out: set[str] = set()
    for a in data.get("applications", []):
        c = (a.get("company") or "").strip().lower().replace("_", " ")
        if not c or c == "—" or c in COMPANY_BLOCKLIST:
            continue
        if len(c) >= 5:
            out.add(c)
        for part in re.split(r"[\s./-]+", c):
            if len(part) >= 5 and part not in COMPANY_BLOCKLIST:
                out.add(part)
    return out


def _load_tracker_applications(vault: Path) -> list[dict]:
    p = vault / "00-Inbox" / "Job_Search" / "data" / "applications-tracker.json"
    if not p.exists():
        return []
    data = json.loads(p.read_text(encoding="utf-8"))
    apps: list[dict] = []
    for a in data.get("applications", []):
        company = (a.get("company") or "").strip()
        if not company or company == "—" or company.lower() in COMPANY_BLOCKLIST:
            continue
        apps.append(a)
    return apps


def _match_tracker_position(text: str, applications: list[dict]) -> tuple[str | None, dict | None]:
    """
    Best-effort: link message to one application (company + role) from tracker.
    Returns (human label "Company — Role", matched app dict) or (None, None).
    """
    if not applications or not text:
        return None, None
    t = text.lower()
    best: dict | None = None
    best_score = 0
    for app in applications:
        company = (app.get("company") or "").strip().lower().replace("_", " ")
        role = (app.get("role") or "").strip()
        if not company:
            continue
        score = 0
        if company in t:
            score += len(company) + 10
        else:
            for part in re.split(r"[\s./-]+", company):
                if len(part) >= 4 and part not in COMPANY_BLOCKLIST and part in t:
                    score += len(part)
        if score == 0:
            continue
        role_lower = role.lower()
        for w in re.findall(r"[a-zа-яё0-9]{4,}", role_lower):
            if w in t:
                score += 3
        if score > best_score:
            best_score = score
            best = app
    if best is None:
        return None, None
    c = (best.get("company") or "").strip()
    r = (best.get("role") or "").strip() or "—"
    return f"{c} — {r}", best


def _message_looks_like_feedback(text: str, company_tokens: set[str]) -> bool:
    if not text or len(text.strip()) < 16:
        return False
    t = text.lower()
    if FEEDBACK_PATTERN.search(text):
        if _is_survey_or_research_spam(text):
            return False
        return True
    for tok in company_tokens:
        if len(tok) >= 5 and tok in t:
            if _is_survey_or_research_spam(text):
                continue
            return True
    return False


def _entity_label(entity) -> str:
    title = getattr(entity, "title", None)
    if title:
        return str(title)
    parts = [getattr(entity, "first_name", None) or "", getattr(entity, "last_name", None) or ""]
    name = " ".join(x for x in parts if x).strip()
    if name:
        return name
    un = getattr(entity, "username", None)
    if un:
        return f"@{un}"
    return str(getattr(entity, "id", "?"))


def _message_ref(entity, msg_id: int) -> str:
    un = getattr(entity, "username", None)
    if un:
        return f"https://t.me/{un}/{msg_id}"
    eid = getattr(entity, "id", None)
    if eid is None:
        return f"msg_id={msg_id}"
    s = str(eid)
    if s.startswith("-100"):
        inner = s[4:]
        return f"https://t.me/c/{inner}/{msg_id}"
    return f"chat_id={eid} msg={msg_id}"


async def _run() -> Path:
    api_id = (os.environ.get("TELEGRAM_API_ID") or "").strip()
    api_hash = (os.environ.get("TELEGRAM_API_HASH") or "").strip()
    if not api_id or not api_hash:
        print(
            "Missing TELEGRAM_API_ID / TELEGRAM_API_HASH. Add to .env from https://my.telegram.org/apps",
            file=sys.stderr,
        )
        raise SystemExit(1)

    vault = Path(os.environ.get("VAULT_PATH", REPO))
    tg_dir = vault / ".claude" / "telegram"
    session = os.environ.get("TELEGRAM_SESSION_PATH") or str(tg_dir / "telegram")

    days = int(os.environ.get("TELEGRAM_JOB_FEEDBACK_DAYS", "120"))
    max_dialogs = int(os.environ.get("TELEGRAM_JOB_FEEDBACK_MAX_DIALOGS", "250"))
    max_per = int(os.environ.get("TELEGRAM_JOB_FEEDBACK_MAX_MESSAGES_PER_DIALOG", "400"))
    skip_bots = (os.environ.get("TELEGRAM_JOB_FEEDBACK_SKIP_BOTS", "1") or "1").strip() not in (
        "0",
        "false",
        "no",
    )
    include_all_channels = (os.environ.get("TELEGRAM_JOB_FEEDBACK_INCLUDE_ALL_CHANNELS", "0") or "0").strip() in (
        "1",
        "true",
        "yes",
    )
    skip_broadcast = (os.environ.get("TELEGRAM_JOB_FEEDBACK_SKIP_BROADCAST_CHANNELS", "1") or "1").strip() not in (
        "0",
        "false",
        "no",
    )
    only_private = (os.environ.get("TELEGRAM_JOB_FEEDBACK_ONLY_PRIVATE", "1") or "1").strip() not in (
        "0",
        "false",
        "no",
    )
    incoming_only = (os.environ.get("TELEGRAM_JOB_FEEDBACK_INCOMING_ONLY", "1") or "1").strip() not in (
        "0",
        "false",
        "no",
    )

    try:
        from telethon import TelegramClient  # type: ignore
        from telethon.tl.types import Channel, User  # type: ignore
    except ImportError:
        print("Install: uv pip install -r core/mcp/requirements-telegram.txt", file=sys.stderr)
        raise SystemExit(1)

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    company_tokens = _load_tracker_company_tokens(vault)
    applications = _load_tracker_applications(vault)

    client = TelegramClient(session, int(api_id), api_hash)
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        print(
            "Telegram session not authorized. Run: npm run job-search:telegram-login",
            file=sys.stderr,
        )
        raise SystemExit(1)

    hits: list[dict] = []
    dialogs = await client.get_dialogs(limit=max_dialogs)

    for d in dialogs:
        ent = d.entity
        if skip_bots and getattr(ent, "bot", False):
            continue
        if only_private and not isinstance(ent, User):
            continue
        if not include_all_channels and skip_broadcast and isinstance(ent, Channel):
            if ent.broadcast and not ent.megagroup:
                continue
        label = _entity_label(ent)
        async for msg in client.iter_messages(ent, limit=max_per):
            if not msg.text:
                continue
            if only_private and incoming_only and isinstance(ent, User) and getattr(msg, "out", False):
                continue
            if msg.date:
                md = msg.date
                if md.tzinfo is None:
                    md = md.replace(tzinfo=timezone.utc)
                if md < cutoff:
                    break
            if not _message_looks_like_feedback(msg.text, company_tokens):
                continue
            pos_label, _matched_app = _match_tracker_position(msg.text, applications)
            hits.append(
                {
                    "chat": label,
                    "date": msg.date.isoformat() if msg.date else "",
                    "ref": _message_ref(ent, msg.id),
                    "text": msg.text.replace("\n", " ")[:900],
                    "position": pos_label,
                }
            )

    await client.disconnect()

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stamp_full = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    with_pos = [h for h in hits if h.get("position")]
    without_pos = [h for h in hits if not h.get("position")]

    lines: list[str] = [
        "# Фидбэк рекрутеров по откликам (Telegram)",
        "",
        f"- Сгенерировано: {stamp_full}",
        f"- Окно: последние **{days}** дней; до **{max_dialogs}** диалогов; до **{max_per}** сообщений на чат.",
        f"- Чаты: **{'только личные диалоги с людьми (рекрутеры и др.)' if only_private else 'личные + группы/супергруппы'}**. Каналы по умолчанию не сканируются.",
        f"- В личках: **{'только входящие сообщения' if incoming_only else 'все сообщения'}** (ответы собеседника, не ваши исходящие).",
        f"- Позиция: сопоставление с `applications-tracker.json` по **названию компании** в тексте (и словам из роли). Если компания в сообщении не найдена, блок ниже «без привязки».",
        f"- Отбор сообщений: типичные формулировки фидбэка **или** упоминание компании из трекера.",
        f"- Всего сообщений: **{len(hits)}** (с привязкой к позиции: **{len(with_pos)}**, без: **{len(without_pos)}**).",
        "",
        "## С привязкой к позиции из трекера",
        "",
    ]

    by_position: dict[str, list[dict]] = {}
    for h in with_pos:
        by_position.setdefault(h["position"] or "—", []).append(h)

    for pos in sorted(by_position.keys(), key=lambda x: x.lower()):
        lines.append(f"### {pos}")
        lines.append("")
        for h in sorted(by_position[pos], key=lambda x: x.get("date") or ""):
            lines.append(
                f"- **{h.get('date', '')}** · чат **{h.get('chat', '')}** — {h.get('ref', '')}"
            )
            lines.append(f"  - {h.get('text', '')}")
        lines.append("")

    lines.append("## Без привязки к позиции в трекере")
    lines.append("")
    lines.append(
        "Сообщения похожи на фидбэк или содержат компанию не из трекера; компания из текста не сопоставилась с откликом."
    )
    lines.append("")

    by_chat: dict[str, list[dict]] = {}
    for h in without_pos:
        by_chat.setdefault(h["chat"], []).append(h)

    for chat in sorted(by_chat.keys(), key=lambda x: x.lower()):
        lines.append(f"### {chat}")
        lines.append("")
        for h in sorted(by_chat[chat], key=lambda x: x.get("date") or ""):
            lines.append(f"- **{h.get('date', '')}** — {h.get('ref', '')}")
            lines.append(f"  - {h.get('text', '')}")
        lines.append("")

    out = vault / "00-Inbox" / "Job_Search" / f"Job_Application_Feedback_Telegram_Snapshot_{stamp}.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


def main() -> int:
    out = asyncio.run(_run())
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
