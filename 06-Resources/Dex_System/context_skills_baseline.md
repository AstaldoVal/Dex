# Baseline: контекст и Agent Skills (Dex workspace)

Дата снимка: 2026-05-09 (автоматический прогон из репозитория).

## Как повторить замер

1. Новый чат в workspace Dex, одно короткое сообщение (например `ping`), дождаться ответа агента.
2. Открыть разбивку контекста и список Skills в **Cursor Settings → Plugins → Rules, Skills, Subagents → Skills**.
3. Первые 15–20 строк списка: пометить префиксы `…/Development/DEX/.claude/skills/` vs домашний `/.cursor/skills/` и т.д.

## Машиночитаемый инвентарь корней (до сужения библиотеки)

Вывод `npm run cursor:skills-inventory` из корня DEX:

```
# Cursor skills roots inventory

- Workspace scanned: `/Users/admin.roman.matsukatov/Development/DEX`

- **User ~/.cursor/skills** — число `SKILL.md`: **0** (глобальный Antigravity уже вынесен скриптом rehome)
- **User ~/.claude/skills** — **46**
- **User ~/.codex/skills** — **2**
- **User ~/.cursor/skills-cursor** — **13**
- **Project .agents/skills** — **4**
- **Project .claude/skills** — **269** (основной объём в vault до миграции `pm` / `bmad` / `_available` в `Skills_library/`)
- **Сумма по перечисленным корням:** 334

```

## Вывод для полоски Skills

- Глобальный `~/.cursor/skills` для этого Mac уже пуст по `SKILL.md`.
- Львиная доля project-индекса шла из `.claude/skills/` (сотни пакетов); после переноса тяжёлых деревьев в `Skills_library/` ожидается заметное снижение счётчика в UI (перезапуск Cursor для обновления индекса).

## Машиночитаемый инвентарь после миграции + task-bundles

Дата: 2026-05-09 (тот же день, повторный прогон).

```
# Cursor skills roots inventory (после переноса pm/bmad/_available → Skills_library и добавления .claude/skills/task-bundles/*)

- **Project `.claude/skills`** — число `SKILL.md`: **141** (включая **16** обложек `task-bundles/<category_id>/`).
- **Сумма по всем корням, которые сканирует скрипт инвентаризации:** **206** (в т.ч. user `~/.claude/skills` 46, `~/.cursor/skills-cursor` 13, project `.agents/skills` 4; см. полный вывод командой ниже).
- **`Skills_library/`** — не корень discovery по доке Cursor; не раздувает project-индекс, пока туда не добавлен отдельный корень в настройках.
```

Полный свежий вывод: снова выполни **`npm run cursor:skills-inventory`** из корня DEX и при необходимости замени блок выше.

## UI-полоска после изменений

- Для цифры в попапе **Context** открой **новый чат**, отправь короткое сообщение, дождись ответа, затем разбивку (см. `.cursor/rules/cursor-agent-skills-discovery.mdc`).
- После крупных перемещений skills имеет смысл **полностью перезапустить Cursor**, чтобы индекс пересобрался.
