---
name: pm-diagrams
description: PM diagrams — user journey, journey map, flows. Structure first; when a visual is needed, generate a diagram image via Gemini (Nano Banana API).
---

# PM Diagrams

Единый скилл для диаграмм продукта: **user journey**, карта пути пользователя, простые потоковые диаграммы. Сначала — структура (этапы, касания, действия, эмоции); при необходимости — **картинка диаграммы** через API (Gemini / Nano Banana).

## Purpose

- Дать один вход для «нарисовать journey» / «диаграмма по сценарию» без разброса по разным скиллам.
- Сначала формировать содержательную структуру (текст + при желании Mermaid), затем по запросу — визуал через генерацию изображения (Nano Banana MCP, Gemini).

## When to Use

- Нужна карта пути пользователя (user journey) или этапы с touchpoints, действиями, эмоциями.
- Нужна простая потоковая/процессная диаграмма по сценарию (шаги, решения, экраны).
- Пользователь просит «диаграмму» или «картинку journey» — дать структуру и при необходимости сгенерировать изображение.

## Process

### 1. Уточнить тип и контекст

- **User journey / journey map:** этапы от первого касания до лояльности (Awareness → Consideration → Decision → Service → Loyalty или свой набор); для каждого этапа: действия, touchpoints, эмоции, метрики. При необходимости опереться на структуру из `Skills_library/pm/deanpeters/customer-journey-map/SKILL.md`.
- **Flow / сценарий:** последовательность шагов, решений, экранов (линейный или с ветвлениями).
- **Персона/продукт:** для кого journey, какой продукт или фича — чтобы формулировки и этапы были релевантны.

Если пользователь дал только тему («onboarding», «покупка») — предложить типовые этапы и уточнить.

### 2. Построить структуру (содержание)

- Выдать диаграмму в виде **текста и/или Mermaid** в markdown:
  - Этапы (горизонтально или вертикально).
  - Для journey: действия, touchpoints, эмоции (кратко по этапам).
  - Для flow: шаги и при необходимости условия/ветвления.

Сохранить в vault: например `04-Projects/<Project>/User_Journey.md` или `00-Inbox/Journey_YYYY-MM-DD.md`. Mermaid можно рендерить в тех инструментах, где поддерживается (GitHub, Obsidian, Notion и т.д.).

### 3. Картинка диаграммы (если нужно)

Когда пользователь просит **визуал**, **картинку**, **изображение** диаграммы или «нарисовать через API»:

- Использовать **Nano Banana MCP** (`nanobanana_generate`): сформировать текстовый промпт по уже собранной структуре.
- В промпте указать: тип диаграммы (user journey, flowchart), этапы/блоки, стиль (чистый, минималистичный, профессиональный, без перегруза текста). Пример: «Professional user journey diagram, horizontal stages: Awareness, Consideration, Decision, Service, Loyalty; simple boxes and arrows; minimal colors, clean layout».
- Параметры: по умолчанию 1 изображение, соотношение сторон по вкусу (например 16:9 для широкой journey). Сохранить в `00-Inbox/Generated_Images` или в папку проекта; вернуть пользователю путь и при необходимости URL.

Если Nano Banana недоступен — сообщить: структура и Mermaid уже есть, картинку можно сгенерировать после настройки MCP или вручную по описанию из промпта.

## Output

- **Всегда:** структурированное описание диаграммы (и при необходимости Mermaid) в markdown-файле в vault.
- **По запросу:** файл изображения диаграммы (PNG) через Nano Banana и путь к нему.

## Dependencies

- **User journey / journey map:** при глубокой рамке можно использовать `Skills_library/pm/deanpeters/customer-journey-map/SKILL.md` (шаблон, этапы, вертикальная структура).
- **Картинка:** Nano Banana MCP (`nanobanana_generate`), Gemini-based. См. `.claude/reference/mcp-servers.md` (Nano Banana MCP) и `.claude/reference/nanobanana-figma-mcp.md`.

## Notes

- Не перегружать диаграмму текстом на картинке: в промпте для генерации — ключевые подписи и этапы, детали остаются в markdown.
- В тексте и на изображении соблюдать правила CLAUDE.md (без em dash, нормальная капитализация и т.д.).
