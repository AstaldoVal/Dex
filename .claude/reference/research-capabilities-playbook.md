# Research Capabilities Playbook

Единый справочник по возможностям системы для веб- и академического ресёрча: что у нас есть, когда что использовать, и какой порядок шагов брать по умолчанию.

## 1) Что у нас есть (в одном месте)

- **`/web-research`** — основной skill Dex для повседневного поиска и проверки фактов.
  - Флоу: Exa -> Brave/Tavily -> browser MCP -> при необходимости `claude_code` для enrichment.
  - В ответе всегда должен быть блок `Tools used`.

- **MCP для поиска и обогащения**
  - **`exa-mcp`** — семантический и академический поиск (papers, authors, company context).
  - **`brave-search-mcp`** — второй срез выдачи, новости, альтернативные источники.
  - **`tavily-mcp`** — extraction-friendly поиск для длинной сводки/RAG-подобного обобщения.
  - **`open-websearch-mcp`** — fallback без API-ключей (DuckDuckGo).
  - **`browser MCP`** — рендер JS/SPA, чтение «живой» страницы, когда сырой HTML неполный.
  - **`claude-code-mcp`** (`claude_code`) — второй слой для enrichment и связной сводки по уже собранным ссылкам/сниппетам.

- **Пакет academic research skills (`agent-research-skills`)**
  - Установлен в `~/.claude/skills/`.
  - Включает 30+ специализированных skills и slash-команду `/research`.
  - Сфокусирован на полном академическом пайплайне: literature search -> novelty -> experiments -> writing -> review -> slides.

## 2) Порядок по умолчанию (рекомендуемый)

1. Запустить **`/web-research`** с чётким запросом.
2. Начать с **Exa** для семантики и академических источников.
3. Добавить **Brave** и/или **Tavily**, если:
   - мало покрытия;
   - нужен второй независимый срез;
   - нужны более свежие новости/события.
4. Открыть ключевые URL через **browser MCP**, если:
   - сайт JS-heavy;
   - текст неполный в обычной выдаче;
   - нужен фактический контент страницы/PDF.
5. Вызвать **`claude_code`** только как второй шаг:
   - собрать противоречия;
   - сделать длинную структурную сводку;
   - улучшить читабельность и логику синтеза.

## 3) Когда использовать `/web-research`, а когда `/research`

- Использовать **`/web-research`**, если нужно:
  - быстро найти проверяемые факты из интернета;
  - собрать shortlist статей/источников;
  - сделать аккуратную сводку с цитируемыми ссылками;
  - проверить «что вышло вчера/за неделю».

- Использовать **`/research`** (из `agent-research-skills`), если нужно:
  - системный академический обзор по теме (deep literature workflow);
  - formal novelty-check идеи;
  - подготовка артефактов paper-level (related work, rebuttal, self-review, slide generation);
  - длинный многoэтапный пайплайн, где важна структура исследования.

## 4) Рекомендация “что когда”

- **Факты/новости/быстрый вопрос** -> `/web-research`.
- **Академическая тема с papers и авторами** -> `/web-research` (Exa-first).
- **Глубокий академический проект (несколько этапов)** -> `/research`.
- **Нужен только enrichment по уже собранным данным** -> `/web-research` с акцентом на `claude_code`.

## 5) Безопасный режим (для новичка)

- Запускать сначала read-only задачи (поиск/сводка), без массовых file ops.
- Явно задавать рамки в запросе:
  - «только поиск и summary»;
  - «без правок файлов и git-операций».
- Помнить, что `claude_code` работает с `--dangerously-skip-permissions`, поэтому:
  - не использовать как первый шаг обычного поиска;
  - не давать лишние команды вне ресёрча.
- Для критичных тем требовать минимум 2 независимых источника.

## 6) Готовые формулировки запросов

- Для `/web-research`:
  - `Найди 8 академических статей по <тема> за последние 12 месяцев, выдели 3 главных вывода и несогласия между источниками.`
  - `Проверь, какие AI papers опубликованы вчера, и дай краткий digest с ссылками.`
  - `Вот ссылки и сниппеты. Сделай enrichment и итоговую сводку, покажи conflicts и uncertain points.`

- Для `/research`:
  - `/research multi-agent evaluation in scientific workflows`
  - `/research novelty check for <idea>`

## 7) Где это настроено

- Основной skill: `.claude/skills/web-research/SKILL.md`
- MCP-порядок и детали: `.claude/reference/research-search-mcp.md`
- MCP-реестр: `.claude/reference/mcp-servers.md`
- Установленные академические skills: `~/.claude/skills/` (внешний пакет `agent-research-skills`)

## 8) Мини-чеклист перед запуском

- Ключи в `.env` заданы (если нужны): `EXA_API_KEY`, `BRAVE_API_KEY`, `TAVILY_API_KEY`.
- MCP синк выполнен: `python3 .scripts/cursor-sync-mcp.py`.
- Cursor перезапущен после изменения MCP.
- Для `claude_code` один раз пройден CLI bootstrap: `claude --dangerously-skip-permissions`.
