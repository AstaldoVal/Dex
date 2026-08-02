# Локальные решения по структуре vault (overlay поверх dex-core)

## Зачем этот файл

1. **Канон для ассистента:** при мерже с upstream Dex, при конфликтах в `core/paths.py`, `packages/dex-contracts/`, фикстурах vault и при `/dex-update` сначала сверяться с этим списком: что мы уже осознанно поменяли в этом репозитории.
2. **Не дублирует весь CHANGELOG:** сюда попадают только **изменения путей vault**, раскладки папок и контрактов `SESSIONS_DIR` / `EVIDENCE_DIR` / PARA и т.п.
3. **Подробности релиза** по-прежнему в `CHANGELOG.md` под `[Unreleased]`; здесь — краткая карта «было → стало → что трогать при мерже».

## Как вести запись после нового решения

1. Добавить блок ниже (от новых к старым).
2. Обновить `CHANGELOG.md` как обычно.
3. При необходимости — одну строку в `packages/dex-contracts/dist/paths.contract.json` и `python3 core/paths.py` (артефакт `core/paths.json` в `.gitignore`).

## Записи

### 2026-04-12 — Удалена корневая `Active/` в репозитории dex-core

- **Было:** в корне репо существовала пустая ветка `Active/Career/Resume/Sessions` (не PARA, не фикстура), остаток старой раскладки.
- **Стало:** каталог удалён; в `.gitignore` добавлено `/Active/`, чтобы не коммитить легаси снова. Канон сессий resume: `05-Areas/Career/Sessions` в **vault** (`SESSIONS_DIR` в `core/paths.py`), не под корнем репозитория.

### 2026-04-11 — Work MCP и Career MCP на `core.paths` (PARA)

- **Было:** `work_server.py` жёстко зашивал `Active/Relationships/Companies`, корневой `Inbox/`, `People/`, устаревшие пути к задачам и недельным приоритетам; часть логики дублировала `core/paths.py`.
- **Стало:** импорт `BASE_DIR`, `COMPANIES_DIR`, `PEOPLE_DIR`, `MEETINGS_DIR`, `INBOX_DIR`, `TASKS_DIR`, `TASKS_FILE`, `LINEAR_SYNC_FILE`, `WEEK_PRIORITIES_FILE`, `QUARTER_GOALS_FILE`, `GOALS_FILE`, `PILLARS_FILE`, `USER_PROFILE_FILE`, `DEMO_DIR` из `core.paths`; `LINEAR_SYNC_FILE = TASKS_DIR / 'linear_sync.json'`; job-трекинг через `INBOX_DIR / Job_Search / ...`; `resolve_company_filepath()` принимает `05-Areas/Companies/...`, полный vault-relative путь и легаси `Active/Relationships/Companies/`; демо-режим: приоритет PARA-подпапок в `System/Demo`, затем старые `Inbox/` / `People/`; ссылки в задачах: regex с `05-Areas/People` и `05-Areas/Companies`. `career_server.py`: оставшиеся обращения к `Quarter_Goals` и `Tasks` переведены на `QUARTER_GOALS_FILE` и `TASKS_FILE`.
- **Код:** `core/mcp/work_server.py`, `core/mcp/career_server.py`.
- **При мерже:** не возвращать локальные константы путей в work/career MCP без сверки с `core/paths.py`.

### 2026-04-11 — `SESSIONS_DIR` вынесен из `Resume/`

- **Было (upstream-типично):** `05-Areas/Career/Resume/Sessions` (сессии resume-builder внутри папки резюме).
- **Стало:** `05-Areas/Career/Sessions` (рядом с `Resume` и `Evidence`).
- **Код / контракт:** `core/paths.py` (`SESSIONS_DIR = CAREER_DIR / 'Sessions'`), `packages/dex-contracts/dist/paths.contract.json`, `core/mcp/resume_server.py` (импорт из `core.paths`), фикстура `core/tests/fixtures/vault/05-Areas/Career/Sessions/.gitkeep`, тест `core/tests/test_fixture_vault.py`.
- **Данные пользователя:** если в vault уже лежали `*.json` в старой папке — перенести вручную в `05-Areas/Career/Sessions/`.
- **При подтягивании Dex с GitHub:** если upstream всё ещё `Resume/Sessions`, не принимать их версию `SESSIONS_DIR` вслепую; либо сохранить наш overlay, либо осознанно откатить и мигрировать vault.

### 2026-04 — корневой `Inbox/` в vault (данные, не шаблон dex-core)

- **Суть:** перенос встреч и приоритетов из устаревшего корневого `Inbox/` в канон `00-Inbox/` и `02-Week_Priorities/`; см. `CHANGELOG.md` ([Unreleased]).
- **К репозиторию шаблона:** относится к содержимому vault пользователя; при чистом merge dex-core на структуру путей в `core/` не влияет, но при копировании заметок между копиями vault — помнить про новый канон `00-Inbox/`.

---

*Шаблон для следующей записи:*

### YYYY-MM-DD — краткий заголовок

- **Было:** …
- **Стало:** …
- **Код / контракт:** перечислить файлы.
- **Действие для vault / пользователя:** …
- **При мерже с upstream:** …
