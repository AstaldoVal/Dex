# Nano Banana (Gemini Create Image) + Figma MCP

Краткий гайд: генерация изображений через **Gemini Create Image** (Nano Banana) с **fallback на OpenAI GPT Image 1.5** при 429/quota. Использование картинок в Figma — вручную (перетаскивание/вставка).

## Что есть

- **Nano Banana MCP** — генерация по промпту: сначала **Gemini API** (Create Image), при ошибке квоты (429, RESOURCE_EXHAUSTED) — **OpenAI GPT Image 1.5**. Инструмент: `nanobanana_generate`. Редактирование (`nanobanana_edit`) не реализовано.
- **Figma MCP** — официальный удалённый сервер Figma. **Не умеет** добавлять изображения в файл по API.

## Настройка

### Nano Banana (Gemini + OpenAI fallback)

#### Ключи в `.env`

- **GEMINI_API_KEY** — основной провайдер (Google AI Studio). Без ключа или при исчерпании квоты используется fallback.
- **OPENAI_API_KEY** — fallback (GPT Image 1.5). Нужен, если у Gemini нет квоты на image-модели (0/0 на free tier) или при 429.

Достаточно хотя бы одного ключа. Рекомендуется оба: Gemini дешевле, OpenAI — запасной вариант.

#### Как получить ключи

1. **Gemini:** [Google AI Studio](https://aistudio.google.com/apikey) → Create API key → в `.env`: `GEMINI_API_KEY=...`
2. **OpenAI (fallback):** [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → Create key → в `.env`: `OPENAI_API_KEY=...`

#### Остальные шаги

3. Установить зависимости: `pip install -r core/mcp/requirements-nanobanana.txt` (google-genai, openai).
4. Сервер уже в `.cursor/mcp.json.source`. После правок: `python3 .scripts/cursor-sync-mcp.py` и перезапуск Cursor.

## Workflow: картинка → Figma

1. **Подготовить промпт:** использовать скилл `/nanobanana-image-guide` — шаг за шагом собрать контекст и построить эффективный промпт.
2. **Сгенерировать изображение** в Cursor: вызвать `nanobanana_generate` с промптом и при необходимости `save_dir` (например `00-Inbox/Generated_Images`). Получить пути к сохранённым PNG.
3. **Добавить в Figma:** перетащить файл на канвас или Insert → Image (Figma API не создаёт image-узлы по API).
4. **Редактировать:** AI-подсказки в Figma или другой инструмент; `nanobanana_edit` в этом MCP не поддерживается.

## Параметры генерации (nanobanana_generate)

- **prompt** — описание картинки (лучше на английском).
- **model** — для Gemini: `gemini-2.5-flash-image` или `gemini-3-pro-image-preview`; при fallback используется GPT Image 1.5.
- **num** — 1–4 изображения (для OpenAI fallback до 10 за один запрос).
- **image_size** — соотношение сторон: `1:1`, `16:9`, `9:16`, `4:3`, `3:4` (GPT Image 1.5: 1024x1024, 1536x1024, 1024x1536).
- **save_dir** — опционально, папка в vault для PNG (относительно VAULT_PATH).

В ответе поле **provider** — `gemini` или `openai` (кто реально сгенерировал).

## nanobanana_edit

В Dex используется только Create Image (generate). Редактирование изображений через этот MCP не реализовано. Для редактирования используй Google AI Studio или другой workflow.

## Почему в Cursor не видно инструментов

Сервер в списке MCP есть, но вызов даёт «Tool not found» — процесс MCP не смог запуститься до конца (ошибка импорта или путь к python). Проверь: `pip install -r core/mcp/requirements-nanobanana.txt`. Для генерации нужен хотя бы один ключ в `.env`: `GEMINI_API_KEY` и/или `OPENAI_API_KEY`.

## Почему «Nano Banana включён», но агент пишет «MCP server does not exist»

В этот чат/режим Cursor передаёт не полный список MCP. Попробуй запрос в обычном Chat в том же проекте Dex; убедись, что открыт корень репозитория.

## Ограничения

- Добавление изображений в Figma-файл по API недоступно. Только ручное добавление или плагин Figma.
- Редактирование изображений (edit) в этом MCP не поддерживается — только генерация (Gemini или OpenAI fallback).
