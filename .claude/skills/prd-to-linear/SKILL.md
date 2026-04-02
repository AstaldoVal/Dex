---
name: prd-to-linear
description: Break a PRD into tickets and create them in Linear. Optional sync to Dex tasks with linear_sync.
---

# PRD → Linear Tickets

Один скилл: на входе файл PRD (или контент из чата), на выходе — набор тикетов в Linear, разбитых по PRD (epics, user stories или functional requirements). Опционально — создание соответствующих задач в Dex и привязка через `linear_sync.json`.

## Purpose

Сценарий «вот файл PRD — разбей на N тикетов и создай их в Linear» отсутствовал: есть экспорт уже существующих задач из `03-Tasks/Tasks.md` и правило «одна задача Dex → один issue Linear», но не разбор PRD «с нуля» в тикеты. Этот скилл закрывает пробел.

## When to Use

- Есть готовый PRD (файл в vault, `docs/prd-*.md`, или только что выданный в чате после `/deliver-prd` / `/product-brief`) и нужно получить по нему тикеты в Linear.
- Пользователь просит: «разбей PRD на тикеты и создай в Linear», «создай в Linear задачи по этому PRD», «PRD → Linear».

## Input

- **Путь к файлу:** например `04-Projects/ProjectName/docs/prd-ProjectName-2025-01-15.md`, `docs/prd-*.md`, или любой markdown с секциями Epics / User Stories / Functional Requirements.
- **Контент в чате:** только что выданный PRD в этом диалоге.
- **Ссылка на проект:** «PRD по проекту X» — найти PRD в папке проекта или `docs/` и использовать.

Если ни путь, ни контент не заданы — уточнить у пользователя.

## Process

### 1. Получить PRD-контент

- Если дан путь — прочитать файл.
- Если контент в чате — использовать его.
- Если указан проект — найти в `04-Projects/<Project>/` или в `docs/` файл PRD (например `prd-*.md`) и прочитать.

### 2. Извлечь кандидаты в тикеты

Парсить PRD и собрать список элементов (каждый → один тикет в Linear). Приоритет источников:

1. **User Stories** — секции «User Stories», «High-Level Stories», списки вида «As a [role], I want [goal] so that [benefit]». Каждая история — один тикет (заголовок = краткая формулировка, описание = полный текст истории).
2. **Epics** — секция «Epics»: каждый эпик как заголовок тикета; описание = текст эпика или связанные FR.
3. **Functional Requirements** — секции «Functional Requirements», «FR-001» и т.д.: каждый FR — один тикет (ID + описание + acceptance criteria в description).

Если в PRD нет явных списков, разбить по логическим блокам: крупные разделы (например «Solution», «Key features») разложить на 1–3 тикета на блок по смыслу, чтобы не создавать один огромный тикет.

Итог: упорядоченный список `{ title, description }`. Title — короткий (до ~80 символов для Linear), description — опционально, до 1–2 абзацев.

### 3. Согласовать с пользователем

- Показать количество тикетов и краткий список заголовков (и при необходимости 2–3 примера с description).
- Уточнить: создавать в **существующем проекте** Linear или в **новом** (например «PRD: ProjectName»). Если новый — нужен `team_id`: получить через `linear_list_teams`, по умолчанию первая команда; при одном workspace этого достаточно.
- Спросить: **только Linear** или также **создать задачи в Dex** и связать через `add_linear_sync_link` (тогда завершение в Dex будет синхронизироваться в Linear).

### 4. Создать тикеты в Linear

- Вызвать **Linear MCP:** `linear_list_teams`, при необходимости `linear_list_projects` (чтобы подставить `project_id`) или `linear_create_project` (team_id, name, description) и использовать возвращённый `project_id`.
- Для каждого элемента списка вызвать `linear_create_my_issue(title=..., description=..., project_id=...)` (если проект выбран). Без проекта — `linear_create_my_issue(title=..., description=...)`.
- Собрать по каждому созданному issue: `id`, `identifier` (например ENG-42).

Если Linear MCP недоступен — сообщить пользователю: нужен настроенный Linear MCP и `LINEAR_API_KEY` в `.env`; альтернатива — выдать структурированный список тикетов (markdown или JSON) для ручного создания или для скрипта.

### 5. Опционально: задачи в Dex и связка

Если пользователь выбрал «создать и в Dex»:

- Для каждого созданного issue вызвать **Work MCP:** `create_task(title=..., context=description или identifier)` (или эквивалент с минимальным контекстом), получить `task_id`.
- Сразу вызвать `add_linear_sync_link(task_id=..., linear_identifier=..., linear_id=...)` с данными из шага 4.

В итоге в `03-Tasks/Tasks.md` появятся новые задачи, в `03-Tasks/linear_sync.json` — привязки; при завершении задачи в Dex по правилам CLAUDE.md будет вызываться `linear_set_issue_completed`.

### 6. Итог

- Сообщить: сколько тикетов создано, ссылку на проект (если создавали) или на список issues.
- Перечислить идентификаторы (ENG-1, ENG-2, …) и при желании кратко — заголовки.
- Напомнить, что при выборе «и в Dex» завершение задач в Dex синхронизируется с Linear.

## Output

- Тикеты в Linear (в выбранном или новом проекте).
- Опционально: задачи в `03-Tasks/Tasks.md` и записи в `03-Tasks/linear_sync.json`.
- Краткий отчёт по созданным issues.

## Dependencies

- **Linear MCP** — `linear_list_teams`, `linear_list_projects`, `linear_create_project`, `linear_create_my_issue`. См. `.claude/reference/mcp-servers.md` (Linear MCP). Требуется `LINEAR_API_KEY` в `VAULT_PATH/.env`.
- **Work MCP** (для опции Dex) — `create_task`, `add_linear_sync_link`. См. CLAUDE.md → Linear sync.

## Notes

- Не перегружать title в Linear: короткий заголовок, детали — в description.
- Если PRD очень большой (десятки FR или историй), можно предложить разбить на 2–3 запуска (например по эпикам) или сначала выдать список и спросить, всё ли создавать.
- Правила написания из CLAUDE.md (без em dash, нормальная капитализация) применяются к заголовкам и описаниям тикетов.
