---
type: guide
domain: obsidian
cluster: graph-system
status: active
review: 2026-05-01
tags:
  - dex/obsidian
  - dex/graph
---

# DEX Obsidian Graph Playbook

## Objective

Сформировать отдельные "созвездия" заметок и связать их через change-log.

## Core rule

Каждая новая заметка должна иметь:

1. Ссылку на свой MOC.
2. Ссылку на текущий monthly changelog.
3. Минимальный frontmatter (`type/domain/cluster/status/review`).

## Anti-hub rule

Не связывать каждую заметку со всеми главными MOC сразу. Это создает один "черный центр".

- Правильно: локальный MOC + monthly changelog (+ 0-1 смысловой кросс-линк при необходимости).
- Неправильно: добавлять в каждую заметку ссылки на Inbox/Projects/Areas/Resources одновременно.

## Current hubs

- [[00-Inbox/_MOC_Inbox]]
- [[04-Projects/_MOC_Projects]]
- [[05-Areas/_MOC_Areas]]
- [[06-Resources/_MOC_Resources]]
- [[System/Change_Log/2026-04]]
- [[00-Inbox/Job_Search/_MOC_Job_Search]]
- [[00-Inbox/Job_Search/_MOC_Job_Search_Telegram]]
- [[00-Inbox/Job_Search/_MOC_Job_Search_Feedback]]
- [[00-Inbox/Job_Search/_MOC_Job_Search_Snapshots]]

## Projects cluster (bulk)

- Все markdown-файлы под `04-Projects/**/*.md` (кроме `_MOC_*.md`): spine на [[04-Projects/_MOC_Projects]] + changelog [[System/Change_Log/2026-04#2026-04-22-batch-projects]].
- Файлы **внутри подпапки проекта** получают третью ссылку в `Graph links` на hub: **`04-Projects/<Проект>/_Vault_Project_Hub.md`** (приоритет над `README.md`, чтобы в графе не было десятков одинаковых подписей «README»). Корневые `04-Projects/*.md` → `[[04-Projects/_Vault_Root_Projects_Hub]]`.
- `node_modules` под проектами **не** обрабатываются батчем; при случайном засорении см. `.scripts/obsidian/strip_projects_graph_from_node_modules.py`.
- Реестр папок и корневых заметок: [[04-Projects/_MOC_Projects]].
- Скрипт: `.scripts/obsidian/batch_projects_graph_metadata.py`

## Job Search cluster (bulk)

- Все markdown-файлы под `00-Inbox/Job_Search/` получили единый spine: `moc` + `change_log` + строка `Graph links`.
- Changelog-якоря: [[System/Change_Log/2026-04#2026-04-22-batch-job-search]] (первый bulk), [[System/Change_Log/2026-04#2026-04-22-batch-job-search-submocs]] (под-MOC + классификация по имени файла).
- Повторный прогон (идемпотентно): `uv run python .scripts/obsidian/batch_job_search_graph_metadata.py`

## Graph View settings

- Groups:
  - by `path` (00-Inbox / 04-Projects / 05-Areas / 06-Resources / System/Change_Log)
  - by tag prefixes `dex/cluster/*`
- Filters:
  - include only active clusters while cleaning
  - temporarily exclude `07-Archives` and `node_modules`
- Forces:
  - slightly higher repel
  - moderate link distance to keep cluster separation visible

### Почему в графе «три больших README»

1. **Подпись узла** в Graph View часто совпадает с **именем файла** (`README`). Разные пути (`06-Resources/.../README` и `04-Projects/.../README`) — это **разные узлы**, но с **одинаковой подписью**; при сильных силах они **визуально наезжают** друг на друга и выглядят как один «супер-узел».
2. **Размер узла** растёт с числом ссылок **на** этот файл. Типичный `README` в репозитории много кто цитирует — он становится крупным даже без «слияния».
3. **Веер из мелких точек** рядом часто даёт не README, а **огромная папка** (`node_modules`, vendored docs): узлы мелкие, но их тысячи. Их лучше **выкинуть из графа** (фильтр или **Settings → Files & links → Excluded files**).

### Фильтры Graph View (синтаксис = Search)

Поле **Search files** в настройках графа использует **тот же язык запросов, что глобальный Search** (`Cmd+Shift+F` / `Ctrl+Shift+F`): операторы `path:`, `file:`, отрицание `-`, скобки, `OR` (заглавными).

**Разделить «только проекты» от остального vault** — одна строка в *Search files*:

```text
path:04-Projects -path:node_modules
```

- `path:04-Projects` — в граф попадают только файлы, у которых **путь** содержит эту подстроку (все заметки под `04-Projects/`).
- `-path:node_modules` — выкидываем любые пути с `node_modules` (и случайный мусор из клонов репо внутри проектов).

**Один конкретный проект (остров):**

```text
path:"04-Projects/One_Percent_AI_Better_Every_Day" -path:node_modules
```

(подставь имя папки проекта; кавычки — если в пути есть пробелы или хочешь зафиксировать точный сегмент.)

**Два «кластера» без всего остального:**

```text
(path:04-Projects OR path:05-Areas) -path:node_modules
```

**Спрятать все `README.md` из графа** (радикально: пропадут и полезные README внутри проектов):

```text
-file:README
```

**Почему при `path:04-Projects` всё ещё видны «огромные README».**

1. В Obsidian подпись узла по умолчанию = **имя файла**. Несколько разных `README.md` в разных папках — это **разные узлы**, но с **одинаковой подписью**; на графе они легко **визуально сливаются** и выглядят как один «монстр».
2. Внутри `04-Projects` лежат и **заметки**, и **целые репозитории** (`app/`, `lib/`, вложенные `README`, отчёты `out/`). Даже без `node_modules` там много узлов и рёбер — картинка остаётся «облаком».
3. Батч уже ведёт spine на **`_Vault_Project_Hub`**, а не на README; ссылки на `README` в основном остаются **точечно** (hub → README, MOC-реестр). То есть проблема чаще **визуальная + структура папок**, а не «батч снова всё в README».

**Компромиссный фильтр только для графа** (остаются проекты, выкидываем одноимённые readme-узлы — пропадут и вложенные `case/.../README`):

```text
path:04-Projects -path:node_modules -file:README
```

Ориентир по структуре папок: в [[04-Projects/_MOC_Projects]] см. разделы **«От какой папки считать пути»** и **«Рекомендуемая структура одного проекта (папки)»** — там полные пути от корня vault и пример дерева `04-Projects/<ИмяПроекта>/`.

**Проверка запроса:** в обычном **Search** (`Cmd+Shift+F`) вставь ту же строку — если результатов мало/много, подправь `path:` до тех же границ, потом перенеси строку в Graph.

### Локальный граф вместо глобального

- Открой заметку **`04-Projects/<Проект>/_Vault_Project_Hub`** (или любую заметку проекта).
- Команда **Open local graph** — видишь только **связанный остров** вокруг активной заметки; глубину задаёшь слайдером. Это самый быстрый способ «отделить проект», даже без запоминания фильтров.

### Постоянно убрать `node_modules` из vault

**Settings → Files & links → Excluded files** — добавь шаблон (пример):

```text
**/node_modules/**
```

Тогда Search и Graph **вообще не индексируют** эти файлы (не только фильтр на один сеанс).

## Weekly maintenance

1. Process new inbox notes: add MOC + changelog links.
2. Archive stale notes by status.
3. Update monthly changelog with new cross-cluster links.
