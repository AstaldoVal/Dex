# Cursor Chat Projects

Расширение для Cursor, которое позволяет организовывать чаты в иерархию «проекты → чаты» внутри одного workspace.

## Установка (локально)

1. Установи зависимости и собери расширение:
   ```bash
   cd tools/cursor-chat-projects
   npm install
   npm run compile
   ```
2. В Cursor: **Extensions** → три точки → **Install from VSIX…** не нужны — можно запустить из исходников:
   - Открой папку `tools/cursor-chat-projects` в Cursor (или добавь её в workspace).
   - Нажми F5 (Run Extension) — откроется новое окно Cursor с загруженным расширением.
3. Либо упакуй VSIX и установи:
   ```bash
   npx @vscode/vsce package
   ```
   Затем в Cursor: Install from VSIX → выбери `cursor-chat-projects-0.1.0.vsix`.

## Использование

- **Сайдбар:** иконка папки в Activity Bar → «Chat Projects» → дерево проектов и чатов.
- **Создать проект:** Command Palette (`Cmd+Shift+P`) → «Chat Projects: Create project» → введи имя.
- **Привязать чат к проекту:** Command Palette → «Chat Projects: Assign conversation to project» → выбери проект → введи ID разговора.
- **Переместить чат:** правый клик по чату в дереве → «Chat Projects: Move to project…» → выбери целевой проект.
- **Удалить из проекта:** правый клик по чату → «Chat Projects: Remove from project».
- **Drag and drop:** перетащи чат на другой проект в дереве — чат переместится в выбранный проект.

Конфиг хранится в корне workspace: `.cursor/chat-projects.json`. В Dex это будет внутри vault (например, репо Dex), иерархия бэкапится вместе с проектом.

### Quick Open с префиксом (Dex)

- Команда палитры: **Dex: Quick Open (prefill path)** (`cursorChatProjects.quickOpen`).
- Внешний URI: `vscode://dex.cursor-chat-projects/quickopen?path=<encoded-prefix>` (обрабатывается при `activationEvents: onUri`).
- Из корня репозитория Dex: `npm run cursor:quickopen -- path/от/корня/file.md` (см. `.scripts/cursor-quickopen.cjs` в корне Dex).

## Откуда брать conversation ID

Сейчас Cursor не показывает ID чата в UI. Варианты:

1. **Вручную из БД:** чаты лежат в `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (SQLite). Можно открыть и скопировать ключ/ID (например, из таблицы `ItemTable` или `cursorDiskKV` с префиксом `bubbleId:`).
2. **Через MCP:** если подключён [cursor-chat-history-mcp](https://github.com/vltansky/cursor-chat-history-mcp), в чате с агентом можно спросить «list recent conversations» и получить ID — затем вставить в «Assign conversation to project».
3. **Планы:** в следующей версии расширения можно добавить чтение `state.vscdb` (например, через sql.js) и показывать в команде «Assign» список последних чатов с выбором по заголовку.

Задача расширения — только структурировать чаты по папкам (проектам) и перемещать их через контекстное меню или drag-and-drop. Открывать чат в нативной панели Cursor не требуется.

## Документация

Полное описание концепта и интеграции с Dex — в репозитории Dex: `.claude/reference/cursor-chat-projects-plugin.md`.
