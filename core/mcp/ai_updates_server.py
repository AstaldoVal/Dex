#!/usr/bin/env python3
"""
AI & Tech Updates MCP Server for Dex

Следит за обновлениями OpenAI, Google Cloud, Grok (xAI), Manus и Gemini.
Даёт ежедневный дайджест самых заметных изменений в сфере AI за последние сутки.

Tools:
- get_openai_updates: последние посты блога OpenAI и API changelog
- get_google_cloud_updates: блог Google Cloud
- get_grok_updates: новости xAI / Grok
- get_manus_updates: обновления Manus AI
- get_gemini_updates: новости Google Gemini
- get_daily_ai_summary: дайджест громких AI-изменений за последние N часов
- get_all_ai_updates: сводка по всем платформам за период
"""

import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("AI & Tech Updates")

# --- RSS and feed URLs ---
FEEDS = {
    "openai_blog": "https://openai.com/blog/rss.xml",
    "openai_changelog": "https://platform.openai.com/docs/changelog",  # HTML, not RSS
    "google_blog": "https://blog.google/feed",
    "google_cloud": "https://cloudblog.withgoogle.com/rss/",
    "gemini": "https://blog.google/feed",  # Gemini posts are on main Google blog; filter by /gemini or /ai
}

# Sites without RSS: we fetch HTML and extract links (optional, can be extended)
BLOG_PAGES = {
    "xai": "https://x.ai/blog",
    "manus": "https://manus.im/updates",
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_rfc2822(date_str: str) -> Optional[datetime]:
    """Parse RFC 2822 / RFC 822 date (common in RSS)."""
    if not date_str:
        return None
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(date_str)
    except Exception:
        return None


def _parse_iso(date_str: str) -> Optional[datetime]:
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except Exception:
        return None


def _ssl_context():
    """SSL context using certifi bundle (fixes CERTIFICATE_VERIFY_FAILED on macOS)."""
    import ssl
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


async def _fetch_feed(url: str, timeout_sec: int = 15) -> list[dict]:
    """Fetch RSS/Atom feed and return list of entries with title, link, published, summary."""
    import aiohttp
    ssl_ctx = _ssl_context()
    connector = aiohttp.TCPConnector(ssl=ssl_ctx) if ssl_ctx else None
    try:
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout_sec)) as resp:
                if resp.status != 200:
                    return []
                body = await resp.text()
    except Exception as e:
        return [{"_error": str(e), "_url": url}]

    try:
        import feedparser
        parsed = feedparser.parse(body)
        entries = []
        for e in parsed.entries:
            pub = None
            if e.get("published_parsed"):
                try:
                    from time import struct_time
                    pub = datetime(*e.published_parsed[:6], tzinfo=timezone.utc)
                except Exception:
                    pass
            if not pub and e.get("published"):
                pub = _parse_rfc2822(e.published) or _parse_iso(e.published)
            entries.append({
                "title": e.get("title", "").strip(),
                "link": e.get("link", "").strip(),
                "published": pub.isoformat() if pub else None,
                "summary": (e.get("summary") or e.get("description") or "")[:500].strip(),
            })
        return entries
    except Exception as e:
        return [{"_error": f"Parse feed: {e}", "_url": url}]


def _plain_summary(raw: str, max_len: int = 280) -> str:
    """Strip HTML and truncate to a short plain-text summary."""
    if not raw or not raw.strip():
        return ""
    try:
        from html import unescape
        import re
        text = unescape(raw)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > max_len:
            text = text[: max_len - 3].rsplit(" ", 1)[0] + "..."
        return text
    except Exception:
        return raw[:max_len] + "..." if len(raw) > max_len else raw


def _filter_since(entries: list[dict], since: datetime) -> list[dict]:
    out = []
    for e in entries:
        if e.get("_error"):
            continue
        pub = e.get("published")
        if not pub:
            out.append(e)
            continue
        try:
            dt = datetime.fromisoformat(pub.replace("Z", "+00:00")) if isinstance(pub, str) else pub
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt >= since:
                out.append(e)
        except Exception:
            out.append(e)
    return out


def _limit_entries(entries: list[dict], limit: int) -> list[dict]:
    errors = [e for e in entries if e.get("_error")]
    rest = [e for e in entries if not e.get("_error")]
    return errors + rest[:limit]


@mcp.tool()
async def get_openai_updates(limit: int = 10, since_days: Optional[int] = 7) -> list[dict]:
    """
    Получить последние обновления OpenAI: блог и продукт.
    Args:
        limit: макс. число записей (по умолчанию 10).
        since_days: только записи за последние N дней; None — без фильтра по дате.
    Returns:
        Список записей: title, link, published, summary.
    """
    since = (_utc_now() - timedelta(days=since_days)) if since_days else None
    entries = await _fetch_feed(FEEDS["openai_blog"])
    if since:
        entries = _filter_since(entries, since)
    return _limit_entries(entries, limit)


@mcp.tool()
async def get_google_cloud_updates(limit: int = 10, since_days: Optional[int] = 7) -> list[dict]:
    """
    Получить последние посты блога Google Cloud.
    Args:
        limit: макс. число записей.
        since_days: только за последние N дней; None — без фильтра.
    """
    since = (_utc_now() - timedelta(days=since_days)) if since_days else None
    entries = await _fetch_feed(FEEDS["google_cloud"])
    if since:
        entries = _filter_since(entries, since)
    return _limit_entries(entries, limit)


@mcp.tool()
async def get_grok_updates(limit: int = 10, since_days: Optional[int] = 7) -> list[dict]:
    """
    Получить последние новости xAI / Grok (блог x.ai).
    Примечание: у xAI может не быть RSS; в этом случае возвращается ссылка на блог.
    """
    # Попробуем типичные пути RSS для сайтов на разных движках
    for rss_path in ["/feed", "/rss", "/feed.xml", "/rss.xml", "/blog/feed"]:
        url = "https://x.ai" + rss_path
        entries = await _fetch_feed(url)
        if entries and not any(e.get("_error") for e in entries):
            since = (_utc_now() - timedelta(days=since_days)) if since_days else None
            if since:
                entries = _filter_since(entries, since)
            return _limit_entries(entries, limit)
    # Fallback: возвращаем ссылку на блог
    return [{
        "title": "xAI / Grok Blog",
        "link": BLOG_PAGES["xai"],
        "published": None,
        "summary": "RSS не найден. Проверьте обновления вручную: " + BLOG_PAGES["xai"],
    }]


@mcp.tool()
async def get_manus_updates(limit: int = 10, since_days: Optional[int] = 7) -> list[dict]:
    """
    Получить последние обновления Manus AI.
    """
    for rss_path in ["/feed", "/rss", "/updates/feed", "/feed.xml"]:
        url = "https://manus.im" + rss_path
        entries = await _fetch_feed(url)
        if entries and not any(e.get("_error") for e in entries):
            since = (_utc_now() - timedelta(days=since_days)) if since_days else None
            if since:
                entries = _filter_since(entries, since)
            return _limit_entries(entries, limit)
    return [{
        "title": "Manus Updates",
        "link": BLOG_PAGES["manus"],
        "published": None,
        "summary": "RSS не найден. Проверьте: " + BLOG_PAGES["manus"],
    }]


@mcp.tool()
async def get_gemini_updates(limit: int = 10, since_days: Optional[int] = 7) -> list[dict]:
    """
    Получить последние новости Google Gemini (из общего блога Google; фильтр по Gemini/AI).
    """
    since = (_utc_now() - timedelta(days=since_days)) if since_days else None
    entries = await _fetch_feed(FEEDS["google_blog"])
    # Оставляем записи, связанные с Gemini / AI (по ссылке или заголовку)
    gemini_keywords = re.compile(r"gemini|google ai|duet|bard|ai (studio|api)", re.I)
    filtered = []
    for e in entries:
        if e.get("_error"):
            continue
        link = (e.get("link") or "")
        title = (e.get("title") or "")
        if gemini_keywords.search(link) or gemini_keywords.search(title):
            filtered.append(e)
    if since:
        filtered = _filter_since(filtered, since)
    return _limit_entries(filtered, limit)


@mcp.tool()
async def get_daily_ai_summary(hours: int = 24, max_items_per_feed: int = 15) -> dict:
    """
    Собрать дайджест самых заметных изменений в сфере AI за последние N часов.
    Агрегирует посты из OpenAI, Google Cloud, Gemini (Google blog), при возможности Grok и Manus.
    Args:
        hours: период в часах (по умолчанию 24 — последние сутки).
        max_items_per_feed: макс. записей с каждого источника.
    Returns:
        dict с ключами: summary (краткий текст для ежедневного дайджеста), feeds (по источникам), cutoff_utc.
    """
    since = _utc_now() - timedelta(hours=hours)
    # Только рабочие фиды: blog.google/feed отдаёт 0 записей (формат не парсится feedparser).
    # Gemini-посты уже есть в Google Cloud Blog.
    ai_sources = [
        ("OpenAI", FEEDS["openai_blog"]),
        ("Google Cloud", FEEDS["google_cloud"]),
    ]
    all_entries = []
    for name, url in ai_sources:
        entries = await _fetch_feed(url)
        for e in entries:
            if e.get("_error"):
                continue
            e["source"] = name
            all_entries.append(e)
        source_only = [e for e in all_entries if e.get("source") == name]
        source_only.sort(key=lambda x: x.get("published") or "", reverse=True)
        all_entries = [e for e in all_entries if e.get("source") != name] + source_only[:max_items_per_feed]

    in_period = _filter_since(all_entries, since)
    in_period.sort(key=lambda x: (x.get("published") or ""), reverse=True)

    lines = [f"# AI дайджест за последние {hours} ч (до {_utc_now().strftime('%Y-%m-%d %H:%M')} UTC)\n"]
    by_source = {}
    for e in in_period:
        src = e.get("source", "Other")
        by_source.setdefault(src, []).append(e)
    for src, items in sorted(by_source.items()):
        lines.append(f"\n## {src}\n")
        for e in items[:20]:
            title = e.get("title", "Без заголовка")
            link = e.get("link", "")
            pub = e.get("published", "")
            lines.append(f"- **[{title}]({link})**" + (f" — {pub[:10]}" if pub else ""))
            summary_text = _plain_summary(e.get("summary") or "")
            if summary_text:
                lines.append(f"  {summary_text}")

    source_names = [n for n, _ in ai_sources]
    return {
        "cutoff_utc": since.isoformat(),
        "hours": hours,
        "total_items": len(in_period),
        "feeds": {name: [e for e in in_period if e.get("source") == name] for name in source_names},
        "summary": "\n".join(lines).strip(),
    }


@mcp.tool()
async def get_all_ai_updates(
    since_days: int = 7,
    limit_per_source: int = 5,
) -> dict:
    """
    Сводка обновлений по всем платформам: OpenAI, Google Cloud, Grok, Manus, Gemini.
    Удобно для еженедельного или ежедневного обзора.
    Args:
        since_days: период в днях.
        limit_per_source: макс. записей на каждый источник.
    """
    since = _utc_now() - timedelta(days=since_days)
    results = {}
    results["openai"] = _limit_entries(
        _filter_since(await _fetch_feed(FEEDS["openai_blog"]), since), limit_per_source
    )
    google_cloud_entries = _filter_since(await _fetch_feed(FEEDS["google_cloud"]), since)
    results["google_cloud"] = _limit_entries(google_cloud_entries, limit_per_source)
    # blog.google/feed не парсится (0 записей); берём Gemini-посты из Google Cloud
    gemini_re = re.compile(r"gemini|google ai|duet|bard|ai (studio|api)", re.I)
    results["gemini"] = _limit_entries(
        [e for e in google_cloud_entries if gemini_re.search((e.get("link") or "") + " " + (e.get("title") or ""))],
        limit_per_source,
    )
    grok = await get_grok_updates(limit=limit_per_source, since_days=since_days)
    results["grok"] = grok
    manus = await get_manus_updates(limit=limit_per_source, since_days=since_days)
    results["manus"] = manus
    return {
        "since_days": since_days,
        "cutoff_utc": since.isoformat(),
        "sources": results,
    }


if __name__ == "__main__":
    mcp.run()
