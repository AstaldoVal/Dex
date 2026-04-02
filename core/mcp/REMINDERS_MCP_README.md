# Reminders MCP (Apple Reminders)

Управление приложением **Напоминания** (Reminders) на macOS через AppleScript.

## Требования

- macOS
- Разрешение для Cursor/терминала на доступ к Reminders:  
  **Системные настройки → Конфиденциальность и безопасность → Автоматизация** (или **Напоминания** в списке приложений)

## Инструменты

| Tool | Описание |
|------|----------|
| `reminders_list_lists` | Список всех списков напоминаний |
| `reminders_list_reminders` | Напоминания в списке (опция: включать выполненные) |
| `reminders_add_reminder` | Добавить одно напоминание (title, body, due_date_iso опционально) |
| `reminders_add_reminders_batch` | Добавить несколько напоминаний в список (чек-лист, покупки) |
| `reminders_complete_reminder` | Отметить напоминание как выполненное по названию |
| `reminders_create_list` | Создать новый список |

## Подключение

Сервер уже добавлен в `System/.mcp.json.example` как `reminders-mcp`.

- Если используешь **cursor-sync-mcp.py**: добавь `reminders-mcp` в `.cursor/mcp.json.source` (скопируй блок из `System/.mcp.json.example`), затем `python3 .scripts/cursor-sync-mcp.py` и перезапуск Cursor.
- Если используешь **.mcp.json** из корня vault: при следующей генерации из example (или вручную) туда попадёт `reminders-mcp`.

После перезапуска Cursor в чате можно вызывать инструменты (например: «Добавь в Reminders список покупок из Byt_Miya_summary»).
