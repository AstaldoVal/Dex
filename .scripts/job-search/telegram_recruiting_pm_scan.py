#!/usr/bin/env python3
"""
Scan all chats from a dumped Telegram folder JSON (e.g. Recruiting) for PM / adjacent
product roles in messages from the last N days.

Uses TELEGRAM_SESSION_PATH (default: VAULT_PATH/.claude/telegram/telegram). For a dedicated
session (no SQLite lock vs MCP), set TELEGRAM_RECRUITING_SESSION_PATH in the morning-digest shell
or export TELEGRAM_SESSION_PATH before running this script.

  uv run python .scripts/job-search/telegram_recruiting_pm_scan.py
  uv run python .scripts/job-search/telegram_recruiting_pm_scan.py --json 00-Inbox/Job_Search/Telegram_Recruiting_2026-04-12.json --days 7

Env:
  TELEGRAM_RECRUITING_PM_DELAY_SEC=0.35   delay between chats
  TELEGRAM_RECRUITING_PM_MAX_MSGS=400    max messages scanned per chat (newest first)
  TELEGRAM_CONNECT_MAX_WAIT_SEC=240      retry connect() while session SQLite is locked
  TELEGRAM_CONNECT_RETRY_BASE_SEC=0.75   backoff base for connect retries
  TELEGRAM_PEER_ROW_MAX_WAIT_SEC=35       (dump only) per-peer retry budget while session DB is locked
  TELEGRAM_DUMP_LOCK_ABORT_STREAK=4       (dump only) exit if this many consecutive peers hit SQLite lock
  TELEGRAM_PEER_ROW_RETRY_BASE_SEC=0.55 backoff for peer resolution retries

User filters (default ON, disable with --no-user-filters):
  - Exclude office-centric roles: очно, в офис, on-site, hybrid/гибрид, (офис, …), etc.
  - Exclude if Москва / Moscow / МСК, or Россия / Russia / РФ as geography, or salary in RUB/₽/руб.

Strict vacancy mode (--strict-vacancy, recommended for morning digest):
  - After PM/title heuristics, require >= N structural markers (default N=2, env TELEGRAM_PM_VACANCY_MIN_STRUCTURE).
  - Markers include #вакансия, line "Вакансия:/Vacancy:", "Company:/Компания:", "Work mode:/Формат:",
    salary/comp line with currency, "Requirements:/Обязанности:", line-start "Ищем … PM/продакт", etc.
  - Drops channel Q&A / HH rants that only mention PM/CPO in prose.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
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
from telethon.errors import FloodWaitError, RPCError
from telethon.tl.types import User as TlUser

# --- Match product / PM vacancies (multilingual), aligned loosely with generate-search-digest NON_PM exclusions ---

_EXCLUDE_TITLE = [
    re.compile(r"\bGame\s+Mathematician\b", re.I),
    re.compile(r"\bMathematician\b(?![^.\n]{0,80}\bproduct\b)", re.I),
    re.compile(
        r"\b(?:Senior|Lead|Principal|Staff|Middle|Junior)?\s*"
        r"(?:Backend|Front(?:end)?|Full[- ]?stack|Software|Platform|Mobile|Android|iOS|DevOps|SRE|QA|Data|ML|AI)\s+"
        r"(?:Engineer|Developer)\b",
        re.I,
    ),
    re.compile(r"\bSenior\s+Backend\s+Engineer\b[^.\n]{0,40}\(\s*\.net\s*/\s*c#\s*\)", re.I),
    re.compile(r"Operations Manager\s*\(\s*Product\s*\)", re.I),
    re.compile(r"Product Success (?:Specialist|Manager)", re.I),
    re.compile(r"Product Design(?:er)?\s+Lead", re.I),
    re.compile(r"\bProduct\s+Designer\b", re.I),
    re.compile(r"\bMarketing\s+Manager\b(?!\s*\()", re.I),
    re.compile(r"Product\s+Marketing\s+Manager", re.I),
    re.compile(r"\bProduct\s+Category\s+Manager\b", re.I),
    re.compile(r"\bProduct\s+Line\s+Manager\b", re.I),
    re.compile(r"\bBusiness\s+Analyst\b", re.I),
    re.compile(r"\bSenior\s+Business\s+Analyst\b", re.I),
    re.compile(r"\bJunior\s+Product\s+Manager\b", re.I),
    re.compile(r"\bIntern\b", re.I),
    re.compile(r"\bGraduate\b", re.I),
    re.compile(r"\bEntry[- ]?level\b", re.I),
]

_JUNIOR_PM = re.compile(r"\bJunior\s+Product\s+Manager\b", re.I)

# Strong: likely PM/PO/Head product / Russian equivalents
_INCLUDE = re.compile(
    r"(?is)"
    r"(?:"
    r"\b(?:Senior|Lead|Principal|Staff|Group|Head|Chief|VP|Director|Executive|Remote|Global)?\s*"
    r"(?:Product\s+(?:Manager|Owner)|Head\s+of\s+Product|CPO|Chief\s+Product\s+Officer)\b"
    r"|"
    r"\b(?:Technical|Platform|Growth|AI|Data)\s+Product\s+Manager\b"
    r"|"
    r"\bGroup\s+PM\b|\b(?:Senior|Lead)\s+PM\b(?=[\s,.\n#]|$)"
    r"|"
    r"продакт[-\s]?менеджер|ведущий\s+продакт|руководител[ья]\s+продукта|"
    r"ищем\s+продакта|продакт[-\s]?менеджер(?:а|у|ом|е)?\s+в\s"
    r"|"
    r"#\s*product\s*manager|#\s*productowner|#\s*продакт\b"
    r")",
)

# "PM" alone is noisy; allow only with product context
_PM_WITH_PRODUCT = re.compile(
    r"(?is)(?:\bproduct\b.{0,120}\bPM\b|\bPM\b.{0,120}\b(?:product|продукт|saas|b2b|fintech|mobile)\b)",
)
_HASHTAG_PM = re.compile(r"(?is)#\s*product[_\s-]*manager\b|#\s*project[_\s-]*manager\b")
_RUNON_PM = re.compile(r"(?is)\bproduct\s*manager(?=[А-Яа-яІіЇїЄє])|\bproject\s*manager(?=[А-Яа-яІіЇїЄє])")


def _dedupe_signature(text: str) -> str:
    """Normalized signature to collapse reposted vacancy text (keep latest message)."""
    s = (text or "").lower()
    # Remove links and Telegram mentions that often vary between reposts.
    s = re.sub(r"https?://\S+|www\.\S+", " ", s, flags=re.I)
    s = re.sub(r"@\w+", " ", s)
    # Remove punctuation noise and normalize spaces.
    s = re.sub(r"[^\w\s]+", " ", s, flags=re.U)
    s = re.sub(r"\s+", " ", s).strip()
    # Trim to stable prefix; enough to identify duplicated vacancy bodies.
    return s[:900]


def _utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _text_ok(raw: str | None) -> bool:
    if not raw or len(raw.strip()) < 40:
        return False
    return True


def _excluded(text: str) -> bool:
    for rx in _EXCLUDE_TITLE:
        if rx.search(text):
            return True
    return False


def _excluded_by_user_geo_and_currency(text: str) -> bool:
    """Moscow, Russia geography, or ruble-denominated compensation (user rules)."""
    if re.search(r"(?<![\w/])(?:москва|moscow|мск\.?)(?![\w/])", text, re.I):
        return True
    if re.search(
        r"(?<![\w/])\b(?:росси(?:я|и|ю|е|й)|russia|в\s+рф|по\s+рф|из\s+рф|"
        r"российск(?:ая|ое|ие|их|ому)?|российск\.|citizenship:\s*russia)\b",
        text,
        re.I,
    ):
        return True
    # Salary / comp in rubles (incl. «200к», «тыс. руб», net/gross in RU job posts)
    if re.search(
        r"(?:зп|зарплат|оклад|ставк|вилк|salary|compensation|payment)[^.\n]{0,100}"
        r"(?:руб\.?|₽|\bRUB\b)",
        text,
        re.I,
    ):
        return True
    if re.search(
        r"\d[\d\s]*(?:тыс\.?|k)\s*(?:руб|₽|rub\.?)\b",
        text,
        re.I,
    ):
        return True
    if re.search(
        r"\d[\d\s]{2,}\s*(?:руб\.?|₽)(?!\w)|(?<!\w)₽",
        text,
        re.I,
    ):
        return True
    return False


def _excluded_by_user_office_format(text: str) -> bool:
    """On-site / office / hybrid (implies office days). Remote-only posts pass."""
    t = text
    if re.search(r"\b(?:hybrid|гибрид)\b", t, re.I):
        return True
    if re.search(
        r"(?:\bочно\b|on[- ]?site\b|on\s+site\b|\bonsite\b|только\s+офис|office[- ]only|"
        r"office[- ]based|в\s+офис(?:е|\b)|работа\s+из\s+офиса|"
        r"\(офис[,\s]|\bофис\s*[,\(]|\bофис\s*моск|"
        r"work\s*mode\s*:\s*office\b|"
        r"format\s*of\s*work\s*:\s*office\b|"
        r"\boffice\s*\([^)]+\))",
        t,
        re.I,
    ):
        return True
    return False


def _excluded_by_video_gamedev(text: str) -> bool:
    """Exclude video-game development roles (user has no relevant experience)."""
    t = text or ""
    # Keep iGaming roles; exclude entertainment game dev only.
    if re.search(r"\bigaming\b|\bbetting\b|\bcasino\b|\bsportsbook\b", t, re.I):
        return False
    if re.search(
        r"\b(?:gamedev|game\s*dev|game\s*development|video\s*game(?:s)?|"
        r"game\s*studio|unity\b|unreal\b|game\s*designer|level\s*designer)\b",
        t,
        re.I,
    ):
        return True
    return False


def _looks_like_candidate_resume_not_vacancy(text: str) -> bool:
    """Heuristic: job-seeker CV posts in PM channels (exclude from 'vacancies' list)."""
    head = (text[:1800] or "").lower()
    vacancy = any(
        x in head
        for x in (
            "вакансия",
            "ищем ",
            "ищем\n",
            "vacancy",
            "we are hiring",
            "we're hiring",
            "hiring:",
            "join our",
            "join us",
            "открыта позиция",
            "требуется ",
            "looking for a ",
            "open position",
            "job description",
            "responsibilities:",
            "requirements:",
            "we offer",
        )
    ) or bool(
        re.search(
            r"в поиске\s+(?:product|продакт|po|product\s+owner|chief\s+product)",
            head,
            re.I,
        )
    )
    if vacancy:
        return False
    resume_tags = sum(1 for t in ("#resume", "#cv", "#резюме") if t in head)
    seeker = any(
        x in head
        for x in (
            "opentowork",
            "#opentowork",
            "ищу работу",
            "open to work",
            "шукаю роботу",
            "шукаю:",
            "в пошуку роботи",
        )
    )
    first_person_intro = any(
        x in head
        for x in (
            "мене звати",
            "меня зовут",
            "i am product manager",
            "я product manager",
            "я продакт",
            "я product manager /",
        )
    )
    first_person_profile = bool(
        re.search(
            r"(?is)\b(i am|i have|my|me)\b.{0,120}\b(product manager|product owner|pm|tpm)\b",
            head,
            re.I,
        )
    )
    recruiter_qna_profile = any(
        x in head
        for x in (
            "a couple of lines about yourself",
            "one example of a product you personally brought",
            "about yourself and your product experience",
        )
    )
    role_line = "должность:" in head and ("product" in head or "продакт" in head or "head of" in head)
    if re.search(r"(?m)^\s*#резюме\b", text[:800], re.I) and not vacancy:
        return True
    if resume_tags >= 1 and (seeker or role_line or first_person_intro):
        return True
    if first_person_intro and seeker:
        return True
    if recruiter_qna_profile and not vacancy:
        return True
    if first_person_profile and not vacancy:
        return True
    if first_person_intro and not vacancy and any(
        x in head
        for x in (
            "за бекграундом",
            "за досягненнями",
            "мій досвід",
            "мой опыт",
            "my background",
            "my experience",
        )
    ):
        return True
    if first_person_intro and re.search(
        r"(?is)\b(шукаю|ищу)\b.{0,90}\b(product manager|product owner|technical pm|delivery manager)\b",
        head,
        re.I,
    ):
        return True
    if (
        ("опыт работы:" in head or "experience:" in head)
        and not vacancy
        and re.search(
            r"(?is)(?:\b(я|i)\b.{0,120}\b(работаю|веду|координирую|управляю|i work|i lead|i have)\b|"
            r"\b(работаю|веду|координирую|управляю)\b.{0,180}\bкоманд|"
            r"\b202\d\b\s*-\s*(?:н\.?в\.?|present|now))",
            head,
            re.I,
        )
    ):
        return True
    if (
        ("опыт работы:" in head or "experience:" in head)
        and not vacancy
        and not any(x in head for x in ("company:", "компания:", "мы ищем", "вакансия"))
    ):
        return True
    if (
        not vacancy
        and re.search(r"опыт\s+\d+(?:[.,]\d+)?\s*год", head, re.I)
        and any(x in head for x in ("#product", "#projectmanager", "#delivery", "#igaming"))
    ):
        return True
    if resume_tags >= 2:
        return True
    return False


def _looks_like_non_vacancy_discussion(text: str) -> bool:
    """Exclude discussion/help posts that are not job vacancies."""
    t = (text or "").lower()
    if any(
        x in t
        for x in (
            "может сможете подсказать",
            "где искать стажиров",
            "ищу стажиров",
            "прохожу сейчас обучение",
            "планирую переход",
            "здесь ищут продакт менеджеров",
        )
    ):
        return True
    if "?" in t and any(x in t for x in ("где искать", "подскажите", "кто подскажет")):
        return True
    return False


def _vacancy_structure_score(text: str) -> int:
    """Count how 'job-post shaped' the message is (used with --strict-vacancy)."""
    t = text or ""
    score = 0
    if re.search(r"(?i)#вакансия\b|#vacancy\b", t):
        score += 1
    if re.search(
        r"(?im)^\s*(?:вакансия|vacancy|open\s+position|открытая\s+позиция)\s*[:\-]\s*\S",
        t,
    ):
        score += 1
    if re.search(r"(?im)^\s*(?:company|компания|employer|заказчик)\s*[:\-]\s*\S", t):
        score += 1
    if re.search(
        r"(?im)^\s*(?:work\s*mode|режим|формат(?:\s*работы)?|format(?:\s*of\s*work)?|employment\s*type)\s*[:\-]\s*\S",
        t,
    ):
        score += 1
    if re.search(r"(?im)^\s*(?:industry|индустрия|сфера|vertical)\s*[:\-]\s*\S", t):
        score += 1
    if re.search(
        r"(?is)(?:^|\n)\s*(?:salary|зарплат|compensation|ставк|вилк|оклад|payment)\s*[:\-].{0,200}"
        r"(?:\$|€|\bUSD\b|\bEUR\b|\bGBP\b|\d{2,}\s*(?:usd|eur|gbp|\$|€|k\b)|\d{1,3}\s*[\.,]\s*\d\s*k\b)",
        t,
    ):
        score += 1
    if re.search(
        r"(?im)^\s*(?:requirements|требования|responsibilities|обязанности|qualifications|stack|"
        r"what\s+you\s*'?\s*ll\s+do|что\s+вы\s+будете|что\s+делаете\s+по\s+продукту)\s*[:\-]",
        t,
    ):
        score += 1
    if re.search(
        r"(?im)^\s*(?:description|описание|о\s+проекте|about\s+the\s+role|job\s+description)\s*[:\-]\s*\S",
        t,
    ):
        score += 1
    if re.search(
        r"(?im)^\s*ищем\s+.{5,120}(?:продакт|product\s+manager|product\s+owner|cpo|\bpm\b)\b",
        t,
    ):
        score += 1
    if re.search(r"(?i)\b(?:we(?:'|\s)?re\s+hiring|we\s+are\s+hiring|join\s+our\s+team)\b", t):
        score += 1
    # Typical formatted vacancy bullets (one point only if several lines use ●).
    if len(re.findall(r"(?m)^\s*[●·]\s+\S", t)) >= 2:
        score += 1
    return score


def _is_pm_vacancy(
    text: str,
    *,
    user_filters: bool = True,
    strict_vacancy: bool = False,
) -> bool:
    if not _text_ok(text):
        return False
    if _excluded(text):
        return False
    if _looks_like_candidate_resume_not_vacancy(text):
        return False
    if _looks_like_non_vacancy_discussion(text):
        return False
    matched = False
    if _INCLUDE.search(text) or _HASHTAG_PM.search(text) or _RUNON_PM.search(text):
        matched = True
    elif _PM_WITH_PRODUCT.search(text) and not _JUNIOR_PM.search(text):
        matched = True
    if not matched:
        return False
    if user_filters:
        if _excluded_by_user_geo_and_currency(text):
            return False
        if _excluded_by_user_office_format(text):
            return False
        if _excluded_by_video_gamedev(text):
            return False
    if strict_vacancy:
        min_s = max(1, int(os.environ.get("TELEGRAM_PM_VACANCY_MIN_STRUCTURE", "2")))
        if _vacancy_structure_score(text) < min_s:
            return False
    return True


def _link(username: str | None, channel_id: int | None, msg_id: int) -> str:
    """Public: t.me/username/msg. Private megagroup/channel: t.me/c/<id>/msg (id without -100)."""
    if username:
        return f"https://t.me/{username}/{msg_id}"
    if channel_id is not None:
        cid = int(channel_id)
        if cid < 0 and str(cid).startswith("-100"):
            cid = int(str(cid)[4:])
        elif cid < 0:
            cid = abs(cid)
        return f"https://t.me/c/{cid}/{msg_id}"
    return ""


async def _resolve_entity(client: TelegramClient, row: dict):
    if row.get("error"):
        return None
    u = row.get("username")
    cid = row.get("id")
    try:
        if u:
            return await client.get_entity(u)
        if cid is not None:
            return await client.get_entity(cid)
    except Exception:
        return None
    return None


def _is_personal_dialog(entity) -> bool:
    """Exclude direct user chats; keep channels/groups only."""
    return isinstance(entity, TlUser)


async def _connect_with_retries(client: TelegramClient) -> None:
    """Session SQLite is single-writer; concurrent Telethon clients cause 'database is locked' on connect."""
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
    """Telethon saves SQLite session on disconnect; concurrent users cause 'database is locked'."""
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


async def _scan_chat(
    entity,
    username: str | None,
    entity_id: int | None,
    cutoff: datetime,
    max_msgs: int,
    client: TelegramClient,
    user_filters: bool = True,
    strict_vacancy: bool = False,
) -> list[dict]:
    out: list[dict] = []
    seen_signatures: set[str] = set()
    n = 0
    async for msg in client.iter_messages(entity, reverse=False):
        n += 1
        if n > max_msgs:
            break
        if not msg or not getattr(msg, "id", None):
            continue
        d = _utc(msg.date)
        if d < cutoff:
            break
        raw = msg.message or ""
        if not _is_pm_vacancy(raw, user_filters=user_filters, strict_vacancy=strict_vacancy):
            continue
        sig = _dedupe_signature(raw)
        if sig and sig in seen_signatures:
            continue
        if sig:
            seen_signatures.add(sig)
        excerpt = raw.strip()
        if len(excerpt) > 600:
            excerpt = excerpt[:597] + "..."
        permalink = getattr(msg, "link", None) or _link(username, entity_id, msg.id)
        out.append(
            {
                "message_id": msg.id,
                "date_iso": d.isoformat(),
                "link": permalink or "",
                "excerpt": excerpt,
                "dedupe_sig": sig,
            }
        )
    return out


async def main_async(args: argparse.Namespace) -> int:
    vault = Path(os.environ.get("VAULT_PATH", _REPO))
    if args.json:
        json_path = Path(args.json)
        if not json_path.is_file():
            cand = vault / args.json
            json_path = cand if cand.is_file() else _REPO / args.json
    else:
        json_path = vault / "00-Inbox" / "Job_Search" / "Telegram_Recruiting_2026-04-12.json"

    if not json_path.is_file():
        print(f"JSON not found: {json_path}", file=sys.stderr)
        return 2

    data = json.loads(json_path.read_text(encoding="utf-8"))
    chats = data.get("chats") or []
    if not chats:
        print(f"No chats in JSON: {json_path}", file=sys.stderr)
        return 2
    missing_id = sum(1 for c in chats if not c.get("id"))
    if missing_id > max(5, (len(chats) * 9) // 10):
        print(
            f"Folder JSON is unusable ({missing_id}/{len(chats)} chats lack id — likely a failed dump "
            "under SQLite lock). Re-run: npm run job-search:telegram-dump-folder",
            file=sys.stderr,
        )
        return 3
    session = os.environ.get("TELEGRAM_SESSION_PATH") or str(vault / ".claude" / "telegram" / "telegram")
    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env", file=sys.stderr)
        return 1

    days = max(1, int(args.days))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    delay = float(os.environ.get("TELEGRAM_RECRUITING_PM_DELAY_SEC", "0.35"))
    max_msgs = int(os.environ.get("TELEGRAM_RECRUITING_PM_MAX_MSGS", "400"))

    client = TelegramClient(session, int(api_id), api_hash)
    await _connect_with_retries(client)
    if not await client.is_user_authorized():
        hint = (
            "npm run job-search:telegram-login-recruiting"
            if "telegram_recruiting" in session
            else "npm run job-search:telegram-login"
        )
        print(f"Session not authorized. Run: {hint}", file=sys.stderr)
        return 1

    try:
        results: list[dict] = []
        errors: list[str] = []
        skipped_personal = 0
        marked_read = 0
        total = len(chats)

        for i, row in enumerate(chats, 1):
            title = row.get("title") or row.get("identifier") or "?"
            try:
                entity = await _resolve_entity(client, row)
                if entity is None:
                    errors.append(f"{title}: could not resolve entity")
                    await asyncio.sleep(delay)
                    continue
                if _is_personal_dialog(entity):
                    skipped_personal += 1
                    await asyncio.sleep(delay)
                    continue
                un = getattr(entity, "username", None) or row.get("username")
                eid = getattr(entity, "id", None)
                hits = await _scan_chat(
                    entity,
                    un,
                    eid,
                    cutoff,
                    max_msgs,
                    client,
                    user_filters=not args.no_user_filters,
                    strict_vacancy=args.strict_vacancy,
                )
                if args.mark_read_scanned:
                    try:
                        await client.send_read_acknowledge(entity)
                        marked_read += 1
                    except Exception as e:
                        errors.append(f"{title}: mark_read_failed: {e}")
                if hits:
                    results.append(
                        {
                            "chat_title": title,
                            "username": row.get("username"),
                            "identifier": row.get("identifier"),
                            "hits": hits,
                        }
                    )
            except FloodWaitError as e:
                await asyncio.sleep(int(e.seconds) + 1)
                errors.append(f"{title}: FloodWait {e.seconds}s")
            except RPCError as e:
                errors.append(f"{title}: {e.__class__.__name__} {e}")
            except Exception as e:
                errors.append(f"{title}: {e}")

            if i % 20 == 0:
                print(f"Progress: {i}/{total} chats, {len(results)} with PM hits so far", file=sys.stderr)

            await asyncio.sleep(delay)

        # Cross-chat dedupe: keep the latest message globally for identical/semantic reposts.
        flat_hits: list[dict] = []
        for block in results:
            for h in block["hits"]:
                flat_hits.append(
                    {
                        "chat_title": block["chat_title"],
                        "username": block.get("username"),
                        "identifier": block.get("identifier"),
                        "hit": h,
                    }
                )

        flat_hits.sort(key=lambda x: x["hit"]["date_iso"], reverse=True)

        deduped_flat: list[dict] = []
        seen_sigs: set[str] = set()
        for row in flat_hits:
            h = row["hit"]
            sig = (h.get("dedupe_sig") or "").strip()
            if sig and sig in seen_sigs:
                continue
            deduped_flat.append(row)
            if sig:
                seen_sigs.add(sig)

        regrouped: dict[tuple[str, str | None, str | None], list[dict]] = {}
        for row in deduped_flat:
            key = (row["chat_title"], row.get("username"), row.get("identifier"))
            regrouped.setdefault(key, []).append(row["hit"])

        results_deduped: list[dict] = []
        for (chat_title, username, identifier), hits in regrouped.items():
            hits.sort(key=lambda x: x["date_iso"], reverse=True)
            results_deduped.append(
                {
                    "chat_title": chat_title,
                    "username": username,
                    "identifier": identifier,
                    "hits": hits,
                }
            )
        results_deduped.sort(
            key=lambda b: (b["hits"][0]["date_iso"] if b["hits"] else ""), reverse=True
        )

        out_md = Path(args.out) if args.out else vault / "00-Inbox" / "Job_Search" / f"Telegram_Recruiting_PM_last{days}d_{datetime.now(timezone.utc).date().isoformat()}.md"
        if not out_md.is_absolute():
            out_md = vault / out_md

        try:
            rel_json = json_path.relative_to(vault)
        except ValueError:
            rel_json = json_path
        min_struct = int(os.environ.get("TELEGRAM_PM_VACANCY_MIN_STRUCTURE", "2"))
        strict_note = ""
        if args.strict_vacancy:
            strict_note = (
                f" Strict vacancy gate: >= {min_struct} structure markers "
                "(#вакансия / Вакансия: / Company: / Work mode: / salary line / requirements / …)."
            )
        filter_note = (
            (
                "Excluded: office/on-site/hybrid/гибрид; Москва/Moscow/МСК; Россия/Russia/РФ; salary in RUB/₽/руб."
                if not args.no_user_filters
                else "User geo/office filters: OFF (--no-user-filters)."
            )
            + strict_note
        )
        lines = [
            f"# Telegram Recruiting folder: PM / product roles (last {days} days)",
            "",
            f"- Source JSON: `{rel_json}`",
            f"- Chats scanned: {total}",
            f"- Personal dialogs excluded: {skipped_personal}",
            f"- Non-personal chats marked as read: {marked_read}" if args.mark_read_scanned else "- Non-personal chats marked as read: disabled",
            f"- Chats with at least one matching message: {len(results_deduped)}",
            f"- Cutoff (UTC): {cutoff.isoformat()}",
            f"- Filters: {filter_note}",
            "",
        ]
        if errors:
            lines.append("## Scan notes / errors")
            for e in errors[:80]:
                lines.append(f"- {e}")
            if len(errors) > 80:
                lines.append(f"- ... and {len(errors) - 80} more")
            lines.append("")

        lines.append("## Vacancies (by chat)")
        lines.append("")
        count_msgs = 0
        for block in results_deduped:
            lines.append(f"### {block['chat_title']}")
            lines.append(f"- Identifier: `{block.get('identifier')}`")
            for h in block["hits"]:
                count_msgs += 1
                lines.append(f"- **{h['date_iso'][:10]}** (msg {h['message_id']})")
                if h.get("link"):
                    lines.append(f"  - Link: {h['link']}")
                lines.append("")
                for para in h["excerpt"].split("\n")[:12]:
                    if para.strip():
                        lines.append(f"  {para.strip()}")
                lines.append("")

        lines.append("---")
        lines.append(f"- Total matching messages: {count_msgs}")

        out_md.parent.mkdir(parents=True, exist_ok=True)
        out_md.write_text("\n".join(lines), encoding="utf-8")
        print(str(out_md))
        return 0
    finally:
        if client.is_connected():
            await _disconnect_with_retries(client)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--json", help="Path to Telegram_*_Recruiting_*.json")
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--out", type=str, default="", help="Output markdown path")
    p.add_argument(
        "--no-user-filters",
        action="store_true",
        help="Do not apply office/geo/RUB filters (vacancy + PM match only).",
    )
    p.add_argument(
        "--mark-read-scanned",
        action="store_true",
        help="Mark scanned non-personal chats as read.",
    )
    p.add_argument(
        "--strict-vacancy",
        action="store_true",
        help="Require structured vacancy markers (see TELEGRAM_PM_VACANCY_MIN_STRUCTURE, default 2). "
        "Filters out channel discussions that only mention PM/CPO in prose.",
    )
    args = p.parse_args()
    raise SystemExit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
