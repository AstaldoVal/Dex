#!/usr/bin/env python3
"""
Batch follow LinkedIn companies from Game Providers spreadsheet.
Runs with 20-second delays between subscriptions to avoid rate limiting.
Run from repo root: VAULT_PATH=/path/to/Dex python3 .scripts/linkedin-batch-follow.py
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core', 'mcp'))

from google_drive_server import _service
from linkedin_server import sync_playwright, _get_browser_context, _wait_for_linkedin_load, _is_logged_in, _save_context_state
import time
import json
import re

# Шаг 1: Извлекаем все LinkedIn ссылки
print("📖 Читаю документ Game Providers из Google Drive...")
service = _service()
file_id = '1FzuG9eObMpNPHGCnbvnicG6fVFA9Hv8BOnIbBz7mMjM'

content = service.files().export(fileId=file_id, mimeType='text/csv').execute()
if isinstance(content, bytes):
    text = content.decode('utf-8', errors='replace')
else:
    text = str(content)

linkedin_urls = []
lines = text.split('\n')

for line in lines:
    matches = re.findall(r'https?://(?:www\.)?linkedin\.com/company/[^,\s"]+', line, re.IGNORECASE)
    for match in matches:
        url = match.rstrip('/')
        if '?' in url:
            url = url.split('?')[0]
        if url not in linkedin_urls:
            linkedin_urls.append(url)

# Убираем первую (100hp-gaming)
first_url = 'https://www.linkedin.com/company/100hp-gaming'
if first_url in linkedin_urls:
    linkedin_urls.remove(first_url)

print(f"✅ Найдено {len(linkedin_urls)} компаний для подписки")
print(f"⏱️  Ориентировочное время: {len(linkedin_urls) * 20 / 60:.1f} минут\n")

# Шаг 2: Подписываемся на все компании
delay_seconds = 20
results = []

with sync_playwright() as playwright:
    context = _get_browser_context(playwright, headless=False)
    page = context.new_page()
    
    try:
        # Проверяем вход
        page.goto('https://www.linkedin.com/feed')
        _wait_for_linkedin_load(page)
        
        if not _is_logged_in(page):
            print("❌ Ошибка: Не залогинен в LinkedIn")
            sys.exit(1)
        
        print("✅ Вход подтверждён. Начинаю подписки...\n")
        
        follow_selectors = [
            'button:has-text("Follow")',
            'button[aria-label*="Follow"]',
            'button[data-control-name="follow"]',
            'button:has-text("+ Follow")',
        ]
        
        for i, url in enumerate(linkedin_urls, 1):
            try:
                print(f"[{i}/{len(linkedin_urls)}] Обрабатываю: {url}")
                
                page.goto(url)
                _wait_for_linkedin_load(page)
                
                # Пробуем подписаться
                followed = False
                for selector in follow_selectors:
                    try:
                        button = page.locator(selector).first
                        if button.count() > 0:
                            button.click()
                            followed = True
                            results.append({"url": url, "status": "followed"})
                            print(f"  ✅ Подписан")
                            break
                    except Exception:
                        continue
                
                if not followed:
                    if page.locator('button:has-text("Following")').count() > 0:
                        results.append({"url": url, "status": "already_following"})
                        print(f"  ℹ️  Уже подписан")
                    else:
                        results.append({"url": url, "status": "failed", "error": "Could not find Follow button"})
                        print(f"  ❌ Не удалось найти кнопку Follow")
                
                # Сохраняем сессию каждые 10 компаний
                if i % 10 == 0:
                    _save_context_state(context)
                    print(f"  💾 Сессия сохранена (обработано {i} компаний)")
                
                # Задержка перед следующей подпиской
                if i < len(linkedin_urls):
                    print(f"  ⏳ Ожидание {delay_seconds} секунд...\n")
                    time.sleep(delay_seconds)
                
            except Exception as e:
                results.append({"url": url, "status": "error", "error": str(e)})
                print(f"  ❌ Ошибка: {e}")
                if i < len(linkedin_urls):
                    time.sleep(delay_seconds)
        
        _save_context_state(context)
        
        # Итоговая статистика
        print("\n" + "="*60)
        print("📊 ИТОГОВАЯ СТАТИСТИКА:")
        print("="*60)
        followed_count = sum(1 for r in results if r["status"] == "followed")
        already_count = sum(1 for r in results if r["status"] == "already_following")
        failed_count = sum(1 for r in results if r["status"] == "failed")
        error_count = sum(1 for r in results if r["status"] == "error")
        
        print(f"✅ Успешно подписано: {followed_count}")
        print(f"ℹ️  Уже были подписаны: {already_count}")
        print(f"❌ Не удалось подписаться: {failed_count}")
        print(f"⚠️  Ошибки: {error_count}")
        print(f"📊 Всего обработано: {len(results)}")
        print("="*60)
        
        # Сохраняем результаты
        vault_path = os.environ.get("VAULT_PATH", os.path.dirname(os.path.dirname(__file__)))
        results_file = os.path.join(vault_path, ".claude", "linkedin", "subscription_results.json")
        os.makedirs(os.path.dirname(results_file), exist_ok=True)
        with open(results_file, 'w') as f:
            json.dump({
                "total": len(results),
                "followed": followed_count,
                "already_following": already_count,
                "failed": failed_count,
                "errors": error_count,
                "results": results
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Результаты сохранены в: {results_file}")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Прервано пользователем")
        _save_context_state(context)
        print(f"💾 Сессия сохранена. Обработано {len(results)} из {len(linkedin_urls)} компаний")
        
        # Сохраняем промежуточные результаты
        vault_path = os.environ.get("VAULT_PATH", os.path.dirname(os.path.dirname(__file__)))
        results_file = os.path.join(vault_path, ".claude", "linkedin", "subscription_results_partial.json")
        os.makedirs(os.path.dirname(results_file), exist_ok=True)
        with open(results_file, 'w') as f:
            json.dump({
                "processed": len(results),
                "total": len(linkedin_urls),
                "results": results
            }, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"\n❌ Критическая ошибка: {e}")
        import traceback
        traceback.print_exc()
        _save_context_state(context)
    finally:
        context.close()
