#!/usr/bin/env python3
"""
Запуск AI-дайджеста локально (обход, если MCP недоступен).
Использование: из корня репозитория Dex:
  python3 .scripts/ai-digest-run.py [hours]
  например: python3 .scripts/ai-digest-run.py 24
"""
import asyncio
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# add project root
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

async def main():
    try:
        import feedparser
        import aiohttp
    except ImportError:
        print("Установите зависимости: pip install -r core/mcp/requirements-ai-updates.txt")
        sys.exit(1)
    ssl_ctx = None
    try:
        import ssl
        import certifi
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass

    hours = int(sys.argv[1]) if len(sys.argv) > 1 else 24
    hours = max(1, min(168, hours))
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    # blog.google/feed отдаёт 0 записей (формат не парсится); Gemini есть в Google Cloud
    feeds = [
        ("OpenAI", "https://openai.com/blog/rss.xml"),
        ("Google Cloud", "https://cloudblog.withgoogle.com/rss/"),
    ]

    async def fetch(url):
        try:
            connector = aiohttp.TCPConnector(ssl=ssl_ctx) if ssl_ctx else None
            async with aiohttp.ClientSession(connector=connector) as s:
                async with s.get(url, timeout=aiohttp.ClientTimeout(total=20)) as r:
                    if r.status != 200:
                        return [], str(r.status)
                    return feedparser.parse(await r.text()).entries, None
        except Exception as e:
            return [], str(e)

    def parse_date(e):
        if e.get("published_parsed"):
            try:
                return datetime(*e.published_parsed[:6], tzinfo=timezone.utc)
            except Exception:
                pass
        if e.get("published"):
            try:
                from email.utils import parsedate_to_datetime
                return parsedate_to_datetime(e.published)
            except Exception:
                pass
        return None

    def plain_summary(raw, max_len=280):
        if not raw or not raw.strip():
            return ""
        import re
        from html import unescape
        text = unescape(raw)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > max_len:
            text = text[: max_len - 3].rsplit(" ", 1)[0] + "..."
        return text

    all_entries = []
    for name, url in feeds:
        entries, err = await fetch(url)
        if err:
            all_entries.append({"title": f"Ошибка: {err}", "link": url, "published": None, "source": name, "summary": ""})
            continue
        for e in entries:
            title = (e.get("title") or "").strip()
            link = (e.get("link") or "").strip()
            pub = parse_date(e)
            summary_raw = (e.get("summary") or e.get("description") or "")[:500].strip()
            all_entries.append({"title": title, "link": link, "published": pub, "source": name, "summary": summary_raw})
        src = [x for x in all_entries if x["source"] == name]
        src.sort(key=lambda x: x["published"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        all_entries = [x for x in all_entries if x["source"] != name] + src[:30]

    in_period = [e for e in all_entries if e.get("published") and e["published"] >= since]
    in_period.sort(key=lambda x: x.get("published") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

    now = datetime.now(timezone.utc)
    lines = [f"# AI дайджест — последние {hours} ч (до {now.strftime('%Y-%m-%d %H:%M')} UTC)\n"]
    by = {}
    for e in in_period:
        by.setdefault(e["source"], []).append(e)
    for src in sorted(by.keys()):
        lines.append(f"\n## {src}\n")
        for e in by[src][:20]:
            pub = (e["published"].strftime("%Y-%m-%d") if e.get("published") else "")
            lines.append(f"- **[{e['title'] or 'Без заголовка'}]({e['link']})**" + (f" — {pub}" if pub else ""))
            s = plain_summary(e.get("summary") or "")
            if s:
                lines.append(f"  {s}")

    summary = "\n".join(lines).strip()
    print(f"🤖 AI ДАЙДЖЕСТ — последние {hours} ч (до {since.isoformat()} UTC)\n")
    print(f"Всего записей: {len(in_period)}\n")
    print(summary)


if __name__ == "__main__":
    asyncio.run(main())
