# Откуда берутся сотни Cursor skills и как разнести по смыслу

Кратко для Roman: тумблер **Include third-party Plugins, Skills, and other configs** в Cursor подмешивает конфиги из экосистем вроде Claude Code и Codex в общий индекс агента. Но самый большой слой на твоём Mac — это не «неизвестные плагины», а **одна явная установка**: полный git-клон **Antigravity Awesome Skills** прямо в **`~/.cursor/skills`** (репозиторий `sickn33/antigravity-awesome-skills`, сотни папок с `SKILL.md` внутри `skills/`).

## Как получить актуальную структурированную сводку

1. В корне vault или репозитория DEX выполни: `npm run cursor:skills-inventory` (или `python3 .scripts/cursor/inventory_cursor_skill_roots.py --workspace .`).
2. Скрипт **ничего не меняет на диске**, только печатает Markdown: для каждого стандартного корня — путь, есть ли папка, число `SKILL.md`, при наличии **`git remote origin`**.
3. Для машинного разбора: `python3 .scripts/cursor/inventory_cursor_skill_roots.py --workspace . --json`.

## Что уже видно по твоей конфигурации (снимок логики, не догадка)

- **Глобальный «мегакаталог»:** `~/.cursor/skills` → **866** файлов `SKILL.md`, origin **`https://github.com/sickn33/antigravity-awesome-skills.git`**. Это и есть основной кандидат на «970+» в списке Skills.
- **Глобальный Claude-совместимый слой:** `~/.claude/skills` → **46** skill.
- **Глобальный Codex:** `~/.codex/skills` → **2** skill.
- **Папка рядом (не канонический корень Cursor):** `~/.cursor/skills-cursor` → **13** skill; в официальном списке корней discovery фигурирует именно **`~/.cursor/skills`**, не `skills-cursor`, поэтому эту папку Cursor **может не индексировать** — сверь по подсказкам путей в UI, если там появятся пути с `skills-cursor`.
- **Внутри репозитория DEX (при открытом workspace):** `.claude/skills` → **269** skill; `.agents/skills` → **4** skill.

Итого по файлам на диске сумма больше, чем «970» в UI: Cursor может **не подмешивать** все корни сразу, **дедуплицировать** или **скейпить** часть контекста — точное число в UI остаётся ориентиром, а скрипт — полным перечнем деревьев.

## Как «структурировать отдельно» на практике

**Смысл:** один каталог `~/.cursor/skills` сейчас выполняет две роли сразу: «канонический глобальный корень Cursor» и «целая библиотека Antigravity». Их лучше развести по папкам на диске и по политике включения.

### Автоматический перенос (Dex)

Если в `~/.cursor/skills` лежит клон **Antigravity Awesome Skills** (remote `sickn33/antigravity-awesome-skills` или маркеры в `README.md`), его можно **снять с канонического пути** одной командой из корня DEX:

1. Просмотр без изменений: `npm run cursor:skills-rehome-antigravity:dry-run`
2. Выполнить перенос: `npm run cursor:skills-rehome-antigravity:apply`

Скрипт **`.scripts/cursor/rehome_antigravity_global_skills.py`** перемещает дерево в **`~/Development/_cursor_global_skills_archive/antigravity-awesome-skills_<UTC‑время>`**, заново создаёт пустой **`~/.cursor/skills`** и кладёт туда **`README_DEX_AUTOMATION.txt`** с путём к архиву. Папку **`~/.cursor/skills-cursor`** скрипт **не трогает** (managed Cursor pack).

Тумблер **Include third-party…** в UI Cursor из этого репозитория **не переключается** (нет стабильного ключа в workspace-файлах); после переноса всё равно перезапусти Cursor или открой настройки skills заново, чтобы список обновился.

### Если нужно вернуть Antigravity в индекс

Переименуй архивную папку обратно в **`~/.cursor/skills`** (или сделай symlink с осторожностью: Cursor рекурсивно обходит `SKILL.md`).

### Ручные шаги (только если автоматика не подходит)

1. **Выключить** тумблер third-party в Settings и проверить, сколько skills осталось в списке (станет меньше шума из чужих тулов).
2. **Оставить в `~/.cursor/skills` только то, что хочешь глобально** для всех проектов: несколько hand-picked папок с `SKILL.md` или пустой корень и опора на project-level `.claude/skills` в DEX.
3. **Не смешивать** Dex-специфичные Cursor skills с Antigravity: держать копии Dex в репозитории под `.cursor/skills/` (если появится) или в документированном месте; глобальный `skills-cursor` — осознанное решение, но проверь, индексирует ли его твоя версия Cursor.

Если нужен повторяемый отчёт для сравнения «до и после» чистки — снова `npm run cursor:skills-inventory` и сохранить вывод в заметку в vault.
