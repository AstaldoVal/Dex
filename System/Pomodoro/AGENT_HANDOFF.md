# Карта агентов (handoff) — Mac и Cursor

Cursor **не** видит сам, когда ты переключился на другого агента. Правило «одна строка» работает как **полуавтомат**: ты нажимаешь горячую клавишу или кнопку в панели — строка попадает на доску и остаётся перед глазами.

## Плавающая панель на Mac (рекомендуется)

Нативное окно **поверх всех приложений** (уровень floating), иконка **AG** в строке меню.

Из корня репозитория:

```bash
npm run agent-handoff:panel
```

Пересборка после правок Swift:

```bash
npm run agent-handoff:panel:build
```

Данные: `System/Pomodoro/agent-handoff-board.json` (до 5 активных записей). Тот же файл, что для CLI и браузерной панели.

## Панель в браузере (запасной вариант)

```bash
npm run agent-handoff:widget
```

Откроется `http://127.0.0.1:8767` — если не нужно отдельное .app.

## Быстро из терминала

```bash
npm run agent-handoff:add -- --line "Cursor чат 2 | PRD секция 3 | черновик | вкладка Composer"
npm run agent-handoff:list
node .scripts/pomodoro/agent-handoff.cjs done <id>
```

## Shortcuts (опционально)

1. Shortcuts → новый shortcut → **Run Shell Script** (zsh).
2. Скрипт:

```bash
cd /Users/admin.roman.matsukatov/Development/DEX
node .scripts/pomodoro/agent-handoff.cjs add --line "$1"
```

3. Вход: «Text» с подсказкой `Агент | поручил | жду | смотреть`.
4. Назначь **глобальную горячую клавишу** в System Settings → Keyboard → Shortcuts.

## Что не делаем

- Автоматический детект смены чата/агента внутри Cursor без расширения IDE.
- Нативный виджет macOS Desktop (можно позже через Scriptable/Übersicht, читая тот же JSON).
