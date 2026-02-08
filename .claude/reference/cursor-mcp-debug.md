# Cursor MCP — где смотреть и как дебажить

## Почему в списке каждый MCP показывается дважды (дубли)

Cursor подхватывает серверы из **двух мест**: глобальный конфиг `~/.cursor/mcp.json` и проектный `.cursor/mcp.json`. Если в обоих были одни и те же серверы, каждый отображался два раза (один включён, второй — Disabled). В Dex проектный `.cursor/mcp.json` сделан пустым (`mcpServers: {}`), а полный конфиг хранится в `.cursor/mcp.json.source`. Скрипт `cursor-sync-mcp.py` читает **источник** и пишет в глобальный `~/.cursor/mcp.json`. После перезапуска Cursor дублей быть не должно. Редактировать список серверов нужно в `.cursor/mcp.json.source`, затем снова запускать sync.

---

## 1. Где в Cursor смотреть загрузку MCP

Проверь по шагам, чтобы понять, какие MCP загружены и почему календарь/почта могут не появляться.

---

## 1. Где в Cursor смотреть загрузку MCP

1. Открой **Cursor Settings** (Cmd+, или меню Cursor → Settings).
2. В левой колонке: **Features** → **MCP** (или в поиске настроек введи `MCP`).
3. Должен быть раздел **MCP Servers** со списком серверов.

**Что должно быть видно:**
- Список имён серверов (work-mcp, calendar-mcp, granola-mcp, google-calendar-mcp, gmail-mcp, gmail-work-mcp и т.д.).
- У каждого сервера — статус (загружен / ошибка) и при раскрытии — **Available Tools** (список инструментов).
- Если сервер падает при старте — будет красный статус или сообщение об ошибке.

**Если раздела MCP нет или список пустой** — Cursor не читает конфиг. Проверь п. 3 ниже.

---

## 2. Какие серверы и инструменты должны быть для daily-plan

| Сервер | Нужен для | Примеры инструментов (должны быть в Available Tools) |
|--------|-----------|------------------------------------------------------|
| **work-mcp** | Задачи, недельные приоритеты | `list_tasks`, `get_week_progress`, `analyze_calendar_capacity`, `suggest_task_scheduling` |
| **google-calendar-mcp** | Календарь (личный) | `gcal_list_calendars`, `gcal_get_today`, `gcal_get_events_with_attendees` |
| **google-calendar-work-mcp** | Календарь (рабочий) | те же `gcal_*` |
| **gmail-mcp** | Почта (личная) | `gmail_search`, `gmail_get_unread`, `gmail_classify_emails` |
| **gmail-work-mcp** | Почта (рабочая) | те же `gmail_*` |
| **granola-mcp** | Встречи Granola | `get_recent_meetings`, `get_meeting_details` |

В настройках MCP раскрой каждый из этих серверов и проверь: есть ли под ним список инструментов или ошибка.

---

## 3. Откуда Cursor читает конфиг

- **Глобальный конфиг:** `~/.cursor/mcp.json` (домашняя папка).  
  После `python3 .scripts/cursor-sync-mcp.py` сюда копируется конфиг из проекта с **абсолютными путями**.
- Cursor при старте читает именно этот файл. Проектный `.cursor/mcp.json` в чатах часто не подхватывается (баг Cursor), поэтому и нужен sync.

**Проверка в терминале:**
```bash
# Есть ли глобальный конфиг и пути к Dex
cat ~/.cursor/mcp.json | head -50
```
Должны быть пути вида `/Users/.../Documents/Development/DEX/Dex/...`, а не `${workspaceFolder}`.

---

## 4. Типичные ошибки по серверам

### Google Calendar: "Credentials file not found: .../credentials.json"
- **Причина:** у `google-calendar-mcp` в `env` не был задан `GOOGLE_CALENDAR_CREDENTIALS_PATH`, сервер искал файл в домашней папке.
- **Исправлено в проекте:** в `.cursor/mcp.json` для `google-calendar-mcp` добавлены `GOOGLE_CALENDAR_CREDENTIALS_PATH` и `GOOGLE_CALENDAR_TOKEN_PATH`.
- **Что сделать:** заново выполнить `python3 .scripts/cursor-sync-mcp.py` и полностью перезапустить Cursor. Проверить, что в корне Dex есть `credentials.json` и при первом вызове календаря создался `google_calendar_token.json`.

### Work MCP: "ModuleNotFoundError: No module named 'core'" / "NameError: name 'logger' is not defined"

Cursor запускает скрипт без установки текущей директории в корень репозитория, поэтому `from core.utils...` не находит пакет `core`. В `work_server.py` в начало добавлен `sys.path.insert(0, repo_root)`. Если такой же импорт есть в других MCP — добавь в самый верх скрипта вставку корня репо в `sys.path`. В том же блоке `except ImportError` не должен использоваться `logger`, пока он не объявлен — либо объяви `logger` выше try/except, либо используй `logging.warning(...)`.

### Gmail (или другой MCP): "Connection closed" / "Pending server creation failed"

Если в логе Cursor: `Client closed for command` и `Pending server creation failed: MCP error -32000: Connection closed` через 1–2 секунды после старта — процесс MCP падает до завершения handshake. Частая причина: сервер написан под старый API MCP и вызывает `stdio_server(app)` вместо корректного запуска через `async with stdio_server() as (read_stream, write_stream): await app.run(...)`. В таком случае нужно привести код к тому же формату, что в `work_server.py` или `granola_server.py` (async `_main()`, `app.run()` с `InitializationOptions`).

### Gmail: ошибки credentials / token
- **Проверить файлы:** в корне репозитория Dex: `credentials.json`, `gmail_token.json`; для рабочей почты: `.claude/google-work/credentials.json`, `.claude/google-work/gmail_token.json`.
- В `~/.cursor/mcp.json` у `gmail-mcp` и `gmail-work-mcp` в `env` должны быть `GMAIL_CREDENTIALS_PATH` и `GMAIL_TOKEN_PATH` с абсолютными путями к этим файлам (sync подставляет их сам).

### Сервер в списке красный / "Failed to start"
- В Cursor в разделе MCP часто показывается причина (например, "ModuleNotFoundError" или путь не найден).
- **ModuleNotFoundError:** установить зависимости, например:  
  `pip install -r core/mcp/requirements-google-calendar.txt` и `pip install -r core/mcp/requirements-gmail.txt`
- **Команда не найдена:** в конфиге используется `python3` — он должен быть в PATH при запуске Cursor (тот же терминал, что и при ручном запуске скриптов).

---

## 5. Чеклист для ручной проверки

- [ ] Открыл **Cursor Settings → Features → MCP** и вижу список MCP Servers.
- [ ] В списке есть **work-mcp**, **google-calendar-mcp**, **gmail-mcp**, **gmail-work-mcp** (и при необходимости **google-calendar-work-mcp**).
- [ ] У каждого из них при раскрытии есть **Available Tools** (не пусто и не ошибка).
- [ ] Выполнил из корня Dex: `python3 .scripts/cursor-sync-mcp.py`.
- [ ] После sync полностью перезапустил Cursor (Quit и открыл снова).
- [ ] В корне Dex есть `credentials.json` и `gmail_token.json` (и при необходимости файлы в `.claude/google-work/`).
- [ ] В новом чате написал «покажи сегодняшние события календаря» или «покажи непрочитанные письма» — запрос выполняется без сообщения «инструменты недоступны».

Если после этого какой-то сервер всё ещё не работает — пришли точный текст ошибки из Cursor Settings → MCP для этого сервера и (по желанию) вывод `cat ~/.cursor/mcp.json | grep -A5 "google-calendar-mcp\|gmail-mcp"` (без секретов).
