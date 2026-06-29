# Google Slides MCP — интеграция

Позволяет создавать и редактировать презентации Google Slides прямо из чата.

**Возможности:** создание презентаций, чтение структуры и текста, изменение слайдов через API.

## Установка в Dex

MCP уже подключён через `.cursor/mcp.json.source`. Скрипт `cursor-sync-mcp.py` подставляет пути и секреты из `.env`.

### 1. Google Cloud Console

1. Создай проект или выбери существующий
2. Включи **Google Slides API** (APIs & Services → Library → Slides API)
3. Создай OAuth 2.0 credentials (Desktop app)
4. Настрой OAuth consent screen и добавь scope: `https://www.googleapis.com/auth/presentations`
5. Получи Refresh Token через [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) или:
   ```bash
   cd .claude/mcp-servers/google-slides-mcp && npm run get-token
   ```
   **Порт:** скрипт ищет **свободный порт** начиная с **3000** до **3100** (если 3000 занят, поднимется 3001 и т.д.). Диапазон можно задать: `GOOGLE_OAUTH_PORT`, `GOOGLE_OAUTH_PORT_END`. В консоль выводятся **точный redirect URI** и **полный URL авторизации** (можно открыть вручную, если браузер не открылся). Для **Web application** OAuth-клиента в Google Cloud в **Authorized redirect URIs** должен быть указан **тот же** URI, что строка `Local callback:` (например `http://localhost:3001/oauth2callback`, если 3000 был занят). Удобно заранее добавить в консоли несколько URI: `http://localhost:3000/oauth2callback` … `http://localhost:3010/oauth2callback`.

### 2. Переменные в `.env`

Добавь в `.env` в корне Dex:

```
GOOGLE_SLIDES_CLIENT_ID=...
GOOGLE_SLIDES_CLIENT_SECRET=...
GOOGLE_SLIDES_REFRESH_TOKEN=...
```

`cursor-sync-mcp.py` подставит их в конфиг MCP при следующем запуске.

### 3. Синхронизация и перезапуск

```bash
python3 .scripts/cursor-sync-mcp.py
```

Полностью перезапусти Cursor, чтобы применились изменения.

### 4. Инструменты

- `create_presentation` — создать презентацию
- `get_presentation` — прочитать структуру
- `batch_update_presentation` — изменить слайды (добавить текст, фигуры, изображения)
- `summarize_presentation` — извлечь весь текст

## C-level deck: синхронизация текста в уже созданную презентацию

Источник правды по тексту слайдов в репозитории: **`.scripts/c-level-slides-batch-requests.json`** (все блоки `insertText` с `objectId`: `i0`, `i1`, `slide2_title`, …).

После изменения этого файла (или зеркала в плане `06-Resources/C_Level_Claude_Cursor_Training_Presentation_Plan.md`, который нужно вручную согласовать с JSON) **обновить живой файл в Google Slides**, а не только локальный Markdown:

1. Из корня Dex (нужны те же OAuth-переменные, что для MCP — см. выше):
   ```bash
   node .claude/mcp-servers/google-slides-mcp/scripts/sync-c-level-deck-content.mjs
   ```
   Скрипт для каждого известного `objectId` выполняет `deleteText` (весь текст) и `insertText` строкой из JSON.

2. Если после замены текста «поплыли» стили заголовка/тела:
   ```bash
   node .claude/mcp-servers/google-slides-mcp/scripts/format-c-level-deck.mjs
   ```

`presentationId` берётся из того же JSON; презентация должна уже существовать (слайды и фигуры созданы ранее батчем или вручную с теми же `objectId`).

## Альтернатива: PPTX → Google Slides

Если MCP пока не настроен:

1. Создай презентацию в формате .pptx (через anthropic-pptx или скрипт)
2. Загрузи файл в Google Drive
3. Правой кнопкой → «Открыть с помощью» → «Google Презентации»
4. Drive конвертирует PPTX в формат Google Slides автоматически
