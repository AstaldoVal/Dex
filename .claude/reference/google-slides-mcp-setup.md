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

## Альтернатива: PPTX → Google Slides

Если MCP пока не настроен:

1. Создай презентацию в формате .pptx (через anthropic-pptx или скрипт)
2. Загрузи файл в Google Drive
3. Правой кнопкой → «Открыть с помощью» → «Google Презентации»
4. Drive конвертирует PPTX в формат Google Slides автоматически
