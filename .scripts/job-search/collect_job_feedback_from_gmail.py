#!/usr/bin/env python3
"""
Search personal Gmail for job-application feedback (rejections, interviews, etc.)
Uses the same OAuth files as Gmail MCP: Credentials/personal/credentials.json + gmail_token.json
(unless GMAIL_CREDENTIALS_PATH / GMAIL_TOKEN_PATH are set).

Writes a markdown snapshot under 00-Inbox/Job_Search/ — no secrets, only subjects/snippets.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

os.environ.setdefault("VAULT_PATH", str(REPO))

from googleapiclient.discovery import build  # noqa: E402

from core.mcp.gmail_server import format_message, get_credentials  # noqa: E402


# Tracker rows that are not real company names (email domains, typos) — never use for matching.
COMPANY_BLOCKLIST = frozenset(
    {
        "ukr.net",
        "re cap",
    }
)

# If company name is "X + generic word" (e.g. 10x.Team), matching only "team" in From would hit every email.
GENERIC_COMPANY_TOKENS = frozenset(
    {
        "team",
        "group",
        "labs",
        "global",
        "digital",
        "services",
        "solutions",
        "international",
        "systems",
        "holdings",
        "ventures",
        "studio",
        "studios",
        "works",
        "software",
        "network",
        "networks",
        "media",
        "capital",
        "partners",
    }
)


QUERIES = [
    # English HR patterns
    'newer_than:150d (subject:application OR subject:Application OR subject:interview OR subject:Interview OR subject:update OR "thank you for applying" OR "Thank you for your application" OR "thank you for your interest")',
    'newer_than:150d (unfortunately OR "not moving forward" OR "not been selected" OR "will not be moving forward" OR "decided to move forward with other" OR "other candidates" OR "unable to proceed" OR "position has been filled")',
    'newer_than:150d (subject:rejection OR subject:Rejection OR subject:declined OR subject:Declined OR "your candidacy" OR "your application")',
    # Recruiting domains / Greenhouse / Lever patterns in body often appear in snippets
    'newer_than:150d (from:greenhouse.io OR from:lever.co OR from:workable OR from:smartrecruiters.com OR from:ashbyhq.com OR from:jobs.lever.co)',
    # Russian
    'newer_than:150d (отказ OR собеседование OR "спасибо за отклик" OR рассмотрение отклика)',
]


def load_tracker_companies(vault: Path) -> set[str]:
    p = vault / "00-Inbox" / "Job_Search" / "data" / "applications-tracker.json"
    if not p.exists():
        return set()
    data = json.loads(p.read_text(encoding="utf-8"))
    out: set[str] = set()
    for a in data.get("applications", []):
        c = (a.get("company") or "").strip()
        if c and c != "—":
            key = c.lower().replace("_", " ")
            if normalize_company(key) in COMPANY_BLOCKLIST or key in COMPANY_BLOCKLIST:
                continue
            out.add(key)
    return out


def load_tracker_applications(vault: Path) -> list[dict]:
    p = vault / "00-Inbox" / "Job_Search" / "data" / "applications-tracker.json"
    if not p.exists():
        return []
    data = json.loads(p.read_text(encoding="utf-8"))
    return list(data.get("applications") or [])


def normalize_company(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _significant_token_parts(n: str) -> list[str]:
    """Tokens with length >= 4, excluding generic words that appear in unrelated From lines."""
    return [
        p
        for p in n.split()
        if len(p) >= 4 and p not in GENERIC_COMPANY_TOKENS
    ]


def domain_hint(from_header: str) -> str:
    m = re.search(r"@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", from_header)
    return m.group(1).lower() if m else ""


def match_company(from_header: str, subject: str, snippet: str, companies: set[str]) -> str | None:
    """Return tracker company key (lowercase) that best matches this message, or None."""
    blob = normalize_company(f"{from_header} {subject} {snippet}")
    # Prefer longer company names first (e.g. "Acme Software" before "Acme").
    for c in sorted(companies, key=lambda x: len(normalize_company(x)), reverse=True):
        if not c:
            continue
        if c in COMPANY_BLOCKLIST:
            continue
        n = normalize_company(c)
        if len(n) < 4:
            continue
        parts = _significant_token_parts(n)
        if n in blob:
            return c
        if parts and all(part in blob for part in parts):
            return c
    dom = domain_hint(from_header)
    if dom:
        dom_base = dom.split(".")[0]
        if len(dom_base) < 4:
            return None
        for c in sorted(companies, key=lambda x: len(normalize_company(x)), reverse=True):
            if c in COMPANY_BLOCKLIST:
                continue
            n = normalize_company(c).replace(" ", "")
            if dom_base in n:
                return c
    return None


def tracker_company_key(company: str) -> str:
    return (company or "").strip().lower().replace("_", " ")


def build_company_feedback_index(
    messages: list[dict], companies: set[str]
) -> dict[str, list[dict]]:
    """Map tracker company key -> messages whose From/subject/snippet matched that company."""
    by_company: dict[str, list[dict]] = {}
    for msg in messages:
        subj = (msg.get("subject") or "").replace("\n", " ")[:500]
        frm = (msg.get("from") or "")[:500]
        snip = (msg.get("snippet") or "")[:500]
        mc = match_company(frm, subj, snip, companies)
        if not mc:
            continue
        by_company.setdefault(mc, []).append(msg)
    for k in by_company:
        by_company[k].sort(key=lambda x: (x.get("date") or "", x.get("subject") or ""))
    return by_company


def write_feedback_by_tracker(
    vault: Path,
    by_company: dict[str, list[dict]],
    stamp: str,
) -> Path:
    apps = load_tracker_applications(vault)
    lines: list[str] = [
        "# Фидбэк из Gmail по строкам трекера",
        "",
        f"- Сгенерировано: {stamp}",
        "- Источник писем: тот же прогон, что и `Job_Application_Feedback_Gmail_Snapshot_*.md`.",
        "- Сопоставление: эвристика `match_company` (название в тексте / домен). Пустой блок значит совпадений не найдено.",
        "",
        "## По заявкам из applications-tracker.json",
        "",
    ]
    for a in sorted(apps, key=lambda x: (tracker_company_key(x.get("company") or ""), x.get("role") or "")):
        co = (a.get("company") or "").strip()
        ck = tracker_company_key(co)
        if not co or co == "—":
            continue
        if normalize_company(ck) in COMPANY_BLOCKLIST or ck in COMPANY_BLOCKLIST:
            continue
        role = (a.get("role") or "—").replace("\n", " ")[:200]
        status = (a.get("status") or "—").replace("\n", " ")[:120]
        notes = (a.get("notes") or "").replace("\n", " ")[:300]
        matched = by_company.get(ck, [])
        lines.append(f"### {co}")
        lines.append("")
        lines.append(f"- **Роль:** {role}")
        lines.append(f"- **Статус в трекере:** {status}")
        if notes:
            lines.append(f"- **Заметка в трекере:** {notes}")
        lines.append("")
        if not matched:
            lines.append("- **Письма Gmail (автосопоставление):** нет совпадений по эвристике.")
        else:
            lines.append("- **Письма Gmail (автосопоставление):**")
            for msg in matched:
                mid = msg.get("id") or ""
                subj = (msg.get("subject") or "").replace("\n", " ")[:180]
                dt = (msg.get("date") or "")[:80]
                snip = (msg.get("snippet") or "").replace("\n", " ")[:240]
                suffix = f" (id: `{mid}`)" if mid else ""
                lines.append(f"  - {dt} — **{subj}**{suffix}")
                lines.append(f"    - Snippet: {snip}")
        lines.append("")
    out = vault / "00-Inbox" / "Job_Search" / f"Job_Application_Feedback_By_Tracker_{stamp[:10]}.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    return out


def main() -> int:
    creds, err = get_credentials()
    if err:
        print(err, file=sys.stderr)
        return 1

    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    seen: set[str] = set()
    messages: list[dict] = []

    for q in QUERIES:
        resp = (
            service.users()
            .messages()
            .list(userId="me", q=q, maxResults=80)
            .execute()
        )
        for m in resp.get("messages", []) or []:
            mid = m["id"]
            if mid in seen:
                continue
            seen.add(mid)
            full = (
                service.users()
                .messages()
                .get(userId="me", id=mid, format="full")
                .execute()
            )
            messages.append(format_message(full))

    companies = load_tracker_companies(REPO)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    stamp_file = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    by_company = build_company_feedback_index(messages, companies)

    # Sort by date header if parseable
    lines: list[str] = []
    lines.append("# Снимок фидбэков по откликам из Gmail")
    lines.append("")
    lines.append(f"- Сгенерировано: {stamp}")
    lines.append(f"- Найдено писем (после дедупликации по id): {len(messages)}")
    lines.append(f"- Запросов поиска: {len(QUERIES)}")
    lines.append("")
    lines.append("## Как читать")
    lines.append("")
    lines.append("- Это **автоматический** отбор по ключевым словам и доменам ATS; возможны ложные срабатывания (рассылки, не про твой отклик).")
    lines.append("- Колонка «Сопоставление с трекером» — эвристика по названию компании в тексте письма / домену и списку компаний из `applications-tracker.json`.")
    lines.append("")
    lines.append("## Письма")
    lines.append("")

    matched = 0
    for msg in sorted(messages, key=lambda x: (x.get("date") or "", x.get("subject") or "")):
        subj = (msg.get("subject") or "").replace("\n", " ")[:200]
        frm = (msg.get("from") or "")[:220]
        snip = (msg.get("snippet") or "")[:400]
        date = (msg.get("date") or "")[:80]
        mc = match_company(frm, subj, snip, companies)
        if mc:
            matched += 1
        lines.append(f"### {subj or '(no subject)'}")
        lines.append("")
        lines.append(f"- **Дата (заголовок письма):** {date}")
        lines.append(f"- **From:** {frm}")
        lines.append(f"- **Сопоставление с трекером:** {mc or '— (проверь вручную по From / тексту)'}")
        lines.append(f"- **Snippet:** {snip}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append(f"- Писем с хотя бы одним эвристическим совпадением компании из трекера: **{matched}** из **{len(messages)}**.")
    lines.append("")

    out = REPO / "00-Inbox" / "Job_Search" / f"Job_Application_Feedback_Gmail_Snapshot_{stamp_file}.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    out2 = write_feedback_by_tracker(REPO, by_company, stamp)
    print(out)
    print(out2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
