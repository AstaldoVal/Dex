#!/usr/bin/env python3
"""
Проверка источников AI-дайджеста вручную.
Показывает: доступность URL, код ответа, число записей в RSS, даты последних постов.

Запуск из корня Dex: python3 .scripts/ai-digest-debug.py
"""
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

def main():
    import urllib.request
    import ssl
    try:
        import feedparser
    except ImportError:
        print("Установите feedparser: pip install feedparser")
        return
    try:
        import certifi
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ssl_ctx = None
        print("Подсказка: для исправления SSL на macOS установите certifi: pip install certifi\n")

    feeds = [
        ("OpenAI Blog", "https://openai.com/blog/rss.xml"),
        ("Google Cloud Blog", "https://cloudblog.withgoogle.com/rss/"),
        ("Google Blog (Gemini/AI)", "https://blog.google/feed"),
    ]

    print("=" * 60)
    print("Проверка источников AI-дайджеста")
    print("=" * 60)

    for name, url in feeds:
        print(f"\n▶ {name}")
        print(f"  URL: {url}")

        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MCP-Dex-Debug/1.0"})
            kwargs = {"timeout": 15}
            if ssl_ctx is not None:
                kwargs["context"] = ssl_ctx
            with urllib.request.urlopen(req, **kwargs) as r:
                status = r.status
                body = r.read().decode("utf-8", errors="replace")
        except Exception as e:
            print(f"  Ошибка запроса: {e}")
            continue

        print(f"  HTTP: {status}, размер: {len(body)} байт")

        if status != 200:
            print(f"  Не 200 OK — фид может быть недоступен.")
            continue

        parsed = feedparser.parse(body)
        entries = parsed.entries
        print(f"  Записей в RSS: {len(entries)}")

        if not entries:
            print("  (фид пустой или не RSS)")
            continue

        # Показать даты первых 3 записей
        for i, e in enumerate(entries[:3]):
            title = (e.get("title") or "")[:60]
            pub = e.get("published") or e.get("updated") or "—"
            print(f"  [{i+1}] {pub[:16]} — {title}...")
        if len(entries) > 3:
            print(f"  ... и ещё {len(entries) - 3} записей")

    print("\n" + "=" * 60)
    print("Если везде «Ошибка запроса» или 0 записей — проверьте сеть, VPN, прокси.")
    print("Открыть фиды в браузере:")
    for name, url in feeds:
        print(f"  {name}: {url}")
    print("=" * 60)


if __name__ == "__main__":
    main()
