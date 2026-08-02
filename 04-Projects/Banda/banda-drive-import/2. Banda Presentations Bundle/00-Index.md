# Presentation bundle hub

Ця папка `2. Banda Presentations Bundle` — окремий **Obsidian vault**: у ній є каталог `.obsidian/` з базовими налаштуваннями. У Obsidian: **Open folder as vault** і вкажіть цю теку на диску (або її копію після синхронізації з Google Drive).

## Obsidian як у Board

Структура **та сама**, що в **`1. Board/`**: там, де в теці лежать docx, xlsx, pdf, pptx або txt як прямі дочірні файли, скрипт синку створює підпапку **`Obsidian/`** з індексом `Index …` та файлами `*.board-card.md` (генератор `generate_board_obsidian_cards_and_drive_upload.py` викликається з `presentations_bundle_index_and_drive_upload.py` перед заливкою на Drive).

- Старт з кореня пакета: [[Index Presentations bundle]]
- Далі за деревом: `New Primary Slide decks (Drafts)/Obsidian/`, `Secondary Slide decks (Drafts)/Obsidian/`, вкладені теки під `Municipal pitch decks (Drafts)/…/Obsidian/` там, де є відповідні файли.

Контентні `.md` у цих **`Obsidian/`** за замовчуванням **заливаються на Google Drive** з тим самим відносним шляхом від кореня bundle (див. [[README]]). Вимкнути лише заливку: прапор **`--skip-obsidian-notes-drive`** у скрипті презентацій.

## Що всередині

- **Docx та xlsx:** локально в тих самих теках, що й на Drive — **`New Primary Slide decks (Drafts)/`** (docx) та **`Secondary Slide decks (Drafts)/`** (xlsx); завантаження xlsx з джерела Google і синк описані в [[README]].
- **Три чернетки на Drive і локально** (однакові назви в корені bundle): `New Primary Slide decks (Drafts)`, `Secondary Slide decks (Drafts)`, `Municipal pitch decks (Drafts)` — ID та посилання в [[README]].
- **Плоскі копії docx/xlsx з репозиторію** на Drive: лише за явними цілями в [[README]] (`*_FOLDER_ID` / `*_FOLDER_NAME`) або в legacy-режимі під `_synced-office-from-repo` (деталі в [[README]]).

## Швидкі посилання на матеріали

- Муніципальний pitch (pdf, pptx): теку `Municipal pitch decks (Drafts)` у файловому дереві.
- Окремі нотатки по Banda поза цим пакетом: репозиторій також містить `04-Projects/Banda/obsidian-banda/` для ширшого vault, якщо ви його використовуєте.
