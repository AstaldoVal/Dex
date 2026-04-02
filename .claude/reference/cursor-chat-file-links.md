# Ссылки на файлы из чата Cursor (вкладка редактора)

## Цель

Чтобы файл оказался **во вкладке Cursor**, а не только в виде ссылки в ответе агента.

## Важно: ссылки в чате часто не работают

Во многих сборках Cursor **markdown-ссылки** в ответе агента (`mdc:`, `file://`, `vscode://file`) **не открывают вкладку** при клике: это ограничение webview чата, а не «неправильный» формат. Промптом это не полностью лечится.

## Расширение «Cursor MDC Link» (установка из Dex)

В Cursor через Open VSX расширение часто **не находится** по имени. Установка с Marketplace (как у PPTX Preview):

- Скрипт: `./.scripts/install-cursor-mdc-link.sh` из корня репозитория.
- Расширение **`udit.cursor-mdc-link`** подключает навигацию по ссылкам вида `[текст](mdc:path/to/file)` в **открытых в редакторе** файлах `.md` и `.mdc` (Cmd+Click / команда **Open MDC Link**). Панель **чата агента** — отдельный webview; расширение может **не** менять клики именно там. После установки при необходимости: **Developer: Reload Window**.

## Важно: расширение Dex Chat Projects и чат агента

Обработчик URI **`vscode://dex.cursor-chat-projects/quickopen?...`** срабатывает, когда этот URI **открывают снаружи** (например `npm run cursor:quickopen` вызывает macOS `open -a Cursor` с URI). Он **не** подключается к панели **чата с агентом**: клики по ссылкам там по-прежнему часто **ничего не делают** (webview Cursor, не редактор). Это нормально и не лечится установкой этого VSIX.

## Надёжный способ открыть вкладку (CLI)

Из **корня репозитория** (где лежит `package.json`):

```bash
npm run cursor:open -- path/от/корня/репозитория.md
```

Пример:

```bash
npm run cursor:open -- 04-Projects/One_Percent_AI_Better_Every_Day/posts/Day_15.md
```

Скрипт вызывает `cursor -r <путь>` — открывает файл в **уже открытом** окне Cursor. Если в `PATH` нет `cursor`, установите CLI из Cursor (Command Palette: **Shell Command: Install 'cursor' command in PATH**).

**Агент в Dex:** после создания артефакта может выполнять эту команду для **одного** главного файла (см. `CLAUDE.md`, блок про ссылки и открытие вкладки).

## Quick Open с префиксом (Cmd+P)

Если нужен **список быстрого открытия** с подставленным путём (как после Cmd+P), а не сразу вкладка с файлом:

```bash
npm run cursor:quickopen -- path/от/корня/репозитория.md
```

Скрипт **`.scripts/cursor-quickopen.cjs`** открывает URI `vscode://dex.cursor-chat-projects/quickopen?path=...` (обрабатывается расширением **Dex Chat Projects** из `tools/cursor-chat-projects/`). Нужен **VSIX 0.1.6+**, после установки: **Developer: Reload Window**. На macOS используется `open -a Cursor` с этим URI.

## Диагностика, если хочется именно клик по ссылке

1. **Multi-root workspace:** ссылки на файлы в чате часто резолвятся только к **первой** папке в workspace. Если Dex не первая — клики могут не работать для всех путей. Проверка: **File → Open Folder** только на одну папку Dex (или в `.code-workspace` поставьте Dex первым).
2. **Путь к файлу:** ошибка «file was not found» — проверить абсолютный путь, пробелы (`%20`), что открыт тот же корень, что и репозиторий.
3. **Расширение Cursor MDC Link** (`udit.cursor-mdc-link`): иногда помогает с `mdc:` в редакторе; в чате не гарантирует клик.

## Запасные форматы ссылок (для совместимости)

Если в вашей версии Cursor клик всё же работает:

1. `mdc:path/from/repo/root` в markdown-ссылке.
2. `vscode://file/` и `file:///` с **percent-encoding** в абсолютном пути.

Файлы **вне** workspace: только `vscode://file/...` и/или `file:///...` с кодированием.

## Ограничения продукта Cursor (не лечатся промптом)

- Клик по «изменённым» файлам в агенте иногда открывает **Review/diff**, а не исходник во вкладке.
- Сообщения на форуме: клик по ссылкам в Composer/Chat и multi-root.

## Смотреть

1. https://forum.cursor.com/t/file-linking-issues-in-chat-composer-ui-the-editor-could-not-be-opened-because-the-file-was-not-found/39043
2. https://forum.cursor.com/t/code-reference-links-in-chat-only-resolve-against-the-first-workspace-folder-in-multi-root-workspaces-so-file-links-for-other-folders-arent-clickable/151635
