# Установка выполнена

VSIX собран и установлен в редактор.

## Где панель Chat Projects

**Chat Projects** вынесен из Explorer в **отдельную область**: своя иконка (папка) в крайней левой колонке (Activity Bar), рядом с Explorer, Search и т.д.

- **Explorer** — только файлы.
- **Chat Projects** — отдельная иконка; по клику открывается своя панель с проектами и чатами. Эту панель можно держать открытой одновременно с Explorer или перенести вправо (правый клик по иконке / View → Appearance — если доступно в Cursor).

## Как открыть Chat Projects

1. **По иконке:** нажать иконку **Chat Projects** (папка) в левой колонке.
2. **По команде:** `Cmd+Shift+P` → **Chat Projects: Open Chat Projects panel** → Enter.

## Что делать в панели

- **Создать проект:** кнопка «+» в заголовке панели или `Cmd+Shift+P` → **Create project**.
- **Добавить чаты в проект:** правый клик по проекту → **Add chat to project**. Откроется список последних чатов из Cursor (если расширение смогло их прочитать из БД) — выбери нужный или пункт «Paste ID manually…», чтобы вставить ID вручную. Заголовки чатов сохраняются и показываются в дереве.
- **Переместить чат:** правый клик по чату → **Move to project...** или перетащить на другой проект.
- **Удалить из проекта:** правый клик по чату → **Remove from project**.

## Если панели нет

1. `Cmd+Shift+P` → **Developer: Reload Window**.
2. Установить/обновить VSIX: `Cmd+Shift+P` → **Extensions: Install from VSIX...** → выбрать `tools/cursor-chat-projects/cursor-chat-projects-0.1.6.vsix` → затем Reload Window.

Путь к VSIX: `tools/cursor-chat-projects/cursor-chat-projects-0.1.6.vsix`
