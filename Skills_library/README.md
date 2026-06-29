# Skills_library — полные тексты вне индекса Cursor Agent Skills

## Зачем отдельная папка

В одном vault Dex хранится **полная** библиотека инструкций (PM, BMAD, готовые «коробочные» скиллы из `_available` и т.д.). Cursor индексирует Agent Skills только из фиксированных корней (см. **`.cursor/rules/cursor-agent-skills-discovery.mdc`** и **`.cursor/rules/dex-task-skill-router.mdc`**).

Если оставить сотни пакетов с `SKILL.md` внутри **`.claude/skills/`**, полоска **Skills** в разбивке контекста раздувается. Поэтому тяжёлые деревья перенесены сюда: они остаются в **git** и доступны через **`Read`**, но **не** регистрируются как отдельные строки индекса.

## Что лежит внутри

- **`pm/`** — продуктовые скиллы по источникам (dex, deanpeters, pop, pmprompt, alirezarezvani, ralph). Индекс: **`.claude/reference/pm-skills-index.md`**. Обновление: **`Skills_library/pm/update.sh`**.
- **`bmad/`** — BMAD Method (роли, мастер-скилл). Команды: **`.claude/commands/bmad/`**, конфиг: **`.claude/config/bmad/`**.
- **`_available/`** — готовые доменные скиллы (sales, marketing, finance, …) для редких сценариев; подключать выборочно через карту пакетов.
- **`cursor-team-kit/`** — официальные skills Cursor Team Kit (CI, PR, ревью, smoke, harness). Каталог: **`Skills_library/cursor-team-kit/README.md`**. Индекс: **`.claude/reference/cursor-team-kit-skills-index.md`**. Обновление: **`Skills_library/cursor-team-kit/update.sh`**.

## Как агенту работать

1. На новую задачу выбрать **`category_id`** по правилу **`.cursor/rules/dex-task-skill-router.mdc`**.
2. Открыть **`.claude/reference/task-skill-bundles.md`** и **`Read`** только перечисленные там пути (при необходимости затем углубляться внутри `Skills_library/`).

## Связанные пути

- Карта стартовых чтений: **`.claude/reference/task-skill-bundles.md`**
- Тонкие bundle-записи в индексе: **`.claude/skills/task-bundles/`**
- Одностраничное резюме discovery: **`06-Resources/Dex_System/cursor_agent_skills_discovery_one_page.md`**
