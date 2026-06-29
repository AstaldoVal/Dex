---
name: ai-digest
description: Ежедневный дайджест новостей AI — все громкие изменения за последние сутки (OpenAI, Google Cloud, Gemini и др.)
---

## Purpose

Получить сводку всех заметных новостей и обновлений в сфере AI за выбранный период. Агрегирует посты из OpenAI, Google Cloud, Google (Gemini/AI) и Anthropic. Удобно для ежедневного утреннего обзора или по запросу.

## Usage

- `/ai-digest` — дайджест за последние 24 часа (все вендоры)
- `/ai-digest 48` — за последние 48 часов
- `/ai-digest anthropic` — только Anthropic за 24 ч
- `/ai-digest openai` — только OpenAI за 24 ч
- `/ai-digest google_cloud` — только Google Cloud за 24 ч
- `/ai-digest gemini` — только Google (Gemini/AI) за 24 ч
- `/ai-digest anthropic 72` — только Anthropic за 72 часа (вендор и часы в любом порядке: `48 anthropic` тоже допустимо)

## MCP Dependency

Требуется **AI Updates MCP** (`user-ai-updates`). Инструмент: `get_daily_ai_summary`.

Если MCP недоступен: подсказать установку (`pip install -r core/mcp/requirements-ai-updates.txt` и подключить `user-ai-updates` в настройках MCP).

---

## Process

### Step 1: Parse Arguments

- По умолчанию `hours = 24`, `vendor = None` (все вендоры).
- Допустимые вендоры: `anthropic`, `openai`, `google_cloud`, `gemini`.
- Токены после команды разбирать так: число (1–168) → `hours`, слово из списка вендоров → `vendor`. Порядок не важен: `/ai-digest 48 anthropic` и `/ai-digest anthropic 48` — оба дают vendor=anthropic, hours=48.

### Step 2: Fetch Digest

Вызвать MCP:

```
get_daily_ai_summary(hours=<hours>, max_items_per_feed=30, vendor=<vendor или None>)
```

- `max_items_per_feed=30` — по возможности все новости за период.
- Если пользователь указал вендора (anthropic, openai, google_cloud, gemini) — передать его в `vendor`; иначе `vendor` не передавать или передать `None`.

### Step 3: Present Result

Показать пользователю:

1. **Заголовок** с периодом и временем среза (UTC).
2. **Итог:** сколько записей всего.
3. **Текст дайджеста** из поля `summary` ответа — это уже отформатированный markdown по источникам (OpenAI, Google Cloud, Google Gemini/AI) со ссылками и датами.
4. Если есть ошибки в ответе (например `_error` в записях) — кратко упомянуть, что один из источников временно недоступен.

**Формат вывода:**

```
🤖 AI ДАЙДЖЕСТ — последние <hours> ч (до <cutoff_utc> UTC) [— только <vendor> если задан]

Всего записей: <total_items>

<вставить содержимое summary из ответа>
```

В конце можно добавить: «Сохранить дайджест в файл?» и по желанию записать в `00-Inbox/` или `06-Resources/` с именем вида `YYYY-MM-DD - AI Digest.md`.

### Step 4: Optional — Save to File

Если пользователь просит сохранить или скилл сохраняет по умолчанию (на усмотрение реализации): создать файл в `00-Inbox/` или `07-Archives/` с датой в имени и вставить тот же `summary`.

---

## Error Handling

- **MCP не найден / инструмент недоступен:** сообщить, что нужен AI Updates MCP, и дать короткую инструкцию по установке (см. `.claude/reference/mcp-servers.md` → AI Updates MCP).
- **Пустой дайджест (`total_items: 0`):** «За выбранный период новостей не найдено. Попробуйте увеличить окно (например `/ai-digest 48`) или проверьте позже.»

---

## Related

- Отдельные обновления по платформам: `get_openai_updates`, `get_gemini_updates`, `get_anthropic_updates`, `get_all_ai_updates` (через MCP).
- Чтобы получить новости только по одному вендору — использовать параметр вендора в `/ai-digest` (например `/ai-digest anthropic`).
