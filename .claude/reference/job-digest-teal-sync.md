# Job Digest → Teal (sync via extension)

Как добавлять вакансии из Job Digest в Teal.

## Автоматическое добавление (Playwright)

Есть два режима.

### Режим — веб-приложение Teal (рекомендуется, без расширения)

Скрипт логинится в app.tealhq.com и добавляет вакансии через форму «Add a New Job» (URL и/или вставка описания из дайджеста). Chrome и расширение не нужны.

**Google при входе пишет «This browser or app may not be secure»** в окне скрипта — логин через Google в автоматизированном браузере блокируется. Поэтому скрипт **по умолчанию** использует твой системный профиль Chrome (macOS: Default или Profile 1). Делай так:

1. В **обычном** Chrome открой https://app.tealhq.com и войди через Google.
2. Убедись, что ты в аккаунте Teal (видишь Job Tracker).
3. **Полностью закрой Chrome** (все окна).
4. Запусти скрипт **без** `--setup` (переменные окружения не нужны):

```bash
node .scripts/job-search/add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --app --limit=2
```

Скрипт сам подставит профиль Chrome (Default или Profile 1). Если у тебя другой профиль (например «Рабочий»), задай путь вручную:

```bash
export TEAL_CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome/Profile 1"
node .scripts/job-search/add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --app --limit=2
```

**Если хочешь пробовать логин в окне скрипта (без своего профиля):** один раз:

```bash
node .scripts/job-search/add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --app --setup
```

Откроется Chrome на странице Teal. Войди в аккаунт, закрой браузер.

**Дальше — полностью автоматически:**

```bash
node .scripts/job-search/add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --app --limit=2
```

Скрипт откроет Teal, для каждой вакансии нажмёт «Add job», подставит URL и описание из `job-descriptions-YYYY-MM-DD.json` (если есть). По умолчанию используется твой Chrome (Default/Profile 1); при отсутствии профиля — временный профиль (нужен один раз `--setup` для входа).

**Правила режима app:**

- **Описание обязательно.** Вакансия без описания (или с описанием короче 50 символов) не сохраняется — скрипт пропускает её и пишет «Skip: no description». Перед отправкой формы скрипт проверяет, что поле описания реально заполнено.
- **После каждой добавленной вакансии** Teal перенаправляет на страницу этой вакансии. Скрипт после сохранения возвращается на список Job Tracker (`/job-tracker`), чтобы снова нажать «Add a new job» для следующей вакансии.

**Откуда берутся описания:** сначала из `data/job-descriptions-YYYY-MM-DD.json`, при пустом или коротком описании — fallback на `00-Inbox/Job_Search/data/jobs/<id>.json`. См. `.claude/reference/job-digest-data-architecture.md`. Структура папок: `00-Inbox/Job_Search/README.md`.

### Режим — расширение Teal в Chrome

Скрипт открывает страницы вакансий в Chrome и нажимает кнопку расширения «Save».

**Однократная настройка:** установить расширение Teal в профиле job-search и при необходимости войти в Teal:

```bash
node .scripts/job-search/add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --setup
```

**Дальше:**

```bash
node .scripts/job-search/add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --limit=2
```

Нужны Chrome (`channel: 'chrome'`) и профиль `.playwright-linkedin`.

Опции: `--limit=N`, `--debug` (скриншот/HTML для отладки формы или кнопки).

## Ограничение Teal

У Teal нет API и массового импорта. Вакансии попадают в трекер только так:

- **Расширение:** на странице вакансии нажимается кнопка расширения — job сохраняется в Teal (это и делает скрипт выше).
- **Вручную:** в дашборде Teal можно ввести данные вакансии вручную.

## Скрипт

Скрипт собирает все LinkedIn-ссылки из дайджеста (или из `job-descriptions-YYYY-MM-DD.json`) и либо печатает их, либо генерирует HTML «открыть все вкладки», либо открывает по одной в браузере с паузой.

**Путь:** `.scripts/job-search/open-digest-jobs-for-teal.cjs`

**Запуск (из корня vault или с VAULT_PATH):**

```bash
# по дате дайджеста
node .scripts/job-search/open-digest-jobs-for-teal.cjs 2026-02-07

# по имени файла дайджеста
node .scripts/job-search/open-digest-jobs-for-teal.cjs linkedin-jobs-2026-02-07.md
```

**Опции:**

- `--print` — вывести список URL (по одному на строку).
- `--html` — создать HTML-файл в `00-Inbox/Job_Search/teal/` (например `teal-open-all-2026-02-07.html`) с кнопкой «Open all in new tabs». Открываете этот файл в Chrome, жмёте кнопку — открываются все вакансии в новых вкладках; в каждой вкладке нажимаете Save в расширении Teal.
- `--open` — открывать каждый URL в браузере по очереди с паузой (по умолчанию 10 с), чтобы успеть нажать Teal Save.
- `--delay N` — пауза в секундах между открытиями (по умолчанию 10).

**Примеры:**

```bash
# только список URL
node .scripts/job-search/open-digest-jobs-for-teal.cjs 2026-02-07 --print

# HTML «открыть все вкладки»
node .scripts/job-search/open-digest-jobs-for-teal.cjs 2026-02-07 --html

# открывать по одному с паузой 12 сек
node .scripts/job-search/open-digest-jobs-for-teal.cjs 2026-02-07 --open --delay 12
```

## Рекомендуемый сценарий

1. Запустить дайджест (например `/job-digest`), получить `linkedin-jobs-YYYY-MM-DD.md`.
2. Запустить:  
   `node .scripts/job-search/open-digest-jobs-for-teal.cjs YYYY-MM-DD --html`
3. Открыть созданный `teal-open-all-YYYY-MM-DD.html` в Chrome (с установленным расширением Teal).
4. Нажать «Open all in new tabs».
5. В каждой вкладке с вакансией нажать кнопку расширения Teal и сохранить вакансию в трекер.

В результате все спаршенные в Job Digest вакансии оказываются в Teal за счёт расширения на каждой странице.
