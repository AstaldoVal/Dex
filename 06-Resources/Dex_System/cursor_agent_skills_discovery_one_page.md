# Cursor Agent Skills в этом vault: одна страница

Цель: зафиксировать **цепочку вывода** без гадания, когда Roman спрашивает про длинный список skills или полоску **Skills** в разбивке контекста.

## 1. Что считается skill в индексе

- Пакет с файлом **`SKILL.md`** внутри дерева, которое Cursor **сканирует** как корень Agent Skills.
- **Каждая** такая папка даёт **одну строку** в индексе (плюс метаданные в UI).

## 2. Какие корни Cursor смотрит (project + user)

Полный текст с официальной ссылкой и формулировками UI: **`.cursor/rules/cursor-agent-skills-discovery.mdc`**.

Кратко:

- **В репозитории:** `.agents/skills/`, `.cursor/skills/`, `.claude/skills/`, `.codex/skills/` (и в монорепо возможны вложенные `.cursor/skills/`).
- **Глобально:** `~/.agents/skills/`, `~/.cursor/skills/`, `~/.claude/skills/`, `~/.codex/skills/`.
- **Итоговый список** в Settings → **Plugins → Rules, Skills, Subagents → Skills** = **объединение** всех найденных пакетов по **всем** подключённым корням, **рекурсивно**.

## 3. Что в Dex **не** попадает в индекс как skills

- Папка **`Skills_library/`** в корне vault: полные деревья PM, BMAD, `_available` и т.д. лежат здесь **как обычные файлы репозитория**. Cursor **не** объявляет их отдельным корнем discovery (путь не из списка в п. 2), поэтому **сотни** `SKILL.md` там **не** раздувают счётчик Agent Skills.
- Глубину по этим темам агент подключает через **`Read`** по карте: **`.claude/reference/task-skill-bundles.md`**.

## 4. Узкий слой в индексе

- **`.claude/skills/task-bundles/<category_id>/SKILL.md`**: короткие «обложки» на 16 закрытых категорий; тело указывает на карту пакетов.
- Остальные скиллы в **`.claude/skills/`** — штатные команды Dex (daily-plan, job-search, …).

## 5. Глобальный `~/.cursor/skills` на этом Mac

- Снимок по машине: **`npm run cursor:skills-inventory`** и **`06-Resources/Dex_System/context_skills_baseline.md`**.
- Если в списке skills в UI доминируют пути из домашнего каталога, основной рычаг — **настройки Cursor / отключение лишних user-корней / тумблер third-party** (см. тот же `.mdc`).

## 6. Документация Cursor

- https://cursor.com/docs/context/skills
