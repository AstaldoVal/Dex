---
name: job-digest
description: Fetch new job search digest (LinkedIn from email + Remotive, WWR, RemoteOK, Foorilla RSS). Run with /job-digest. Optionally specify "только LinkedIn" / "only email" or "только RSS" / "only RSS" to run one source.
---

# Job Digest — Fetch New Vacancy Digest

**Command:** `/job-digest`

Fetches the latest job digests and writes markdown to `00-Inbox/Job_Search/digests/`:

- **LinkedIn** (из почты) → `linkedin/linkedin-jobs-YYYY-MM-DD.md`
- **RSS** (Remotive, WWR, RemoteOK, Foorilla) → `remote-pm-rss-YYYY-MM-DD.md`
- **BettingJobs** (iGaming Product) → `bettingjobs/bettingjobs-YYYY-MM-DD.md`
- **DOU** (украинские iGaming-компании, домен Gambling) → `dou/dou-gambling-product-compliance-vacancies-YYYY-MM-DD.md`

Pipeline: сбор дайджестов → фильтр LinkedIn (по экспорту расширения) → саммари → выгрузка в Teal.

- **LinkedIn Search** (из расширения Dex) → `linkedin/search-{keywords}-YYYY-MM-DD.md`

## When You Run This Command

1. **Default:** Run single command that does all steps and skips what’s already done: `npm run job-digest`.
2. **Only LinkedIn (from email):** If the user says "только LinkedIn", "только почта", "only email", or "linkedin only" → run `npm run job-digest -- --linkedin` or `npm run job-search:email`.
3. **Only RSS (no email):** If the user says "только RSS", "only RSS", or "rss only" → run `npm run job-digest -- --rss` or `npm run job-search:rss-only` / `npm run job-search:rss`. iGaming-only RSS: `npm run job-search` (JobsCollider, filtered). See `.claude/reference/job-digest-rss-verify.md`.
4. **One or more sources:** Run `npm run job-digest -- --remotive --foorilla` (or any combination of source flags). See "Source flags" below.

## One command: job-digest

**`npm run job-digest`** runs the full pipeline and **skips steps that are already done**:

- **Step 1 (parser):** Если сегодняшнего LinkedIn-дайджеста ещё нет — парсинг писем из почты, запись в `linkedin-jobs-YYYY-MM-DD.md`. RSS, BettingJobs и DOU пишутся в отдельные файлы.
- **Step 2 (filter, только LinkedIn):** Применяется, если есть **файл экспорта расширения Dex** (см. ниже). По нему из дайджеста удаляются hybrid/on-site и закрытые вакансии, подтягиваются title/company/work type. Если файла нет — скрипт генерирует HTML со ссылками; нужно открыть ссылки в Chrome с расширением Dex, сделать экспорт и перезапустить job-digest.
- **Step 3 (summaries):** 3a) Описания вакансий из того же экспорта подмешиваются в `data/jobs/<id>.json`. 3b) Под каждую вакансию с описанием подставляется резюме-саммари.
- **Step 4 (Teal):** Вакансии из LinkedIn- и RSS-дайджестов добавляются в Teal (URL + описание). Если Chrome уже открыт — скрипт запускает альтернативный профиль (в т.ч. fallback); не требовать закрывать Chrome.

### Что такое «экспорт расширения Dex»

Расширение Dex для Chrome (`.scripts/job-search/dex-linkedin-extension/`, «Load unpacked») открывает страницы вакансий LinkedIn и при нажатии **Export for Dex** сохраняет в один JSON по каждой вакансии: remote/hybrid/on-site, закрыта ли («No longer accepting applications»), title, company, описание. Файл нужно сохранить как `00-Inbox/Job_Search/data/dex-linkedin-export-YYYY-MM-DD.json`.

**«Если есть экспорт»** — в папке `00-Inbox/Job_Search/data/` лежит файл `dex-linkedin-export-*.json` (обычно с сегодняшней датой). Тогда Step 2 и 3a используют его автоматически. Если такого файла нет, Step 2 предлагает сгенерировать HTML со ссылками, пройти по ним в браузере с расширением и снова экспортировать JSON.

## What You Do

1. Run **`npm run job-digest`** in the project root (no confirmation).
2. If Step 2 prints "no export file": run **`npm run job-search:open-links:serve`** to open the digest page in Chrome; click **Start auto-capture** in the Dex extension (it will open each job link in turn in the same tab; wait until done), then click "Export for Dex", save the JSON to `00-Inbox/Job_Search/data/`, and run **`npm run job-digest`** again.
3. Capture stdout/stderr. Report which steps ran, which were skipped, and where the digest and Teal output are.

## Source flags

Запуск только выбранных источников (без флагов — все источники):

- `--linkedin` — LinkedIn (парсер писем)
- `--remotive` — Remotive (Product + PM)
- `--wwr` — We Work Remotely
- `--remoteok` — RemoteOK
- `--foorilla` — Foorilla (scrape)
- `--bettingjobs` — BettingJobs (iGaming Product)
- `--dou` — DOU (вакансии украинских iGaming-компаний, домен Gambling; нужен предварительно собранный список: `fetch-dou-gambling-all-pages.cjs --out /tmp/dou-gambling-all.json`)
- `--rss` — группа: remotive + wwr + remoteok (без Foorilla)
- `--search` — LinkedIn Search (из экспорта расширения Dex search-capture). Ищет `dex-linkedin-search-*.json` в `~/Downloads/` и `00-Inbox/Job_Search/data/`. Можно указать файл: `--search --export path/to/file.json`

Примеры: `npm run job-digest -- --linkedin`, `npm run job-digest -- --remotive --foorilla`, `npm run job-digest -- --rss --bettingjobs`, `npm run job-digest -- --search`.

## LinkedIn Search Capture (новое)

Сбор вакансий прямо со страницы поиска LinkedIn через расширение Dex:

1. Открыть страницу поиска LinkedIn в Chrome (с установленным расширением Dex)
2. Расширение покажет кнопку **"Dex: Capture N jobs from search"**
3. Нажать — расширение кликает по каждой карточке (5 сек между кликами), читает правую панель, пагинация обрабатывается автоматически
4. hybrid/on-site/closed вакансии фильтруются на лету
5. По завершении JSON скачивается автоматически в Downloads
6. Запустить `npm run job-digest -- --search`

Расширение сохраняет прогресс — при перезагрузке страницы можно продолжить с места остановки (кнопка "Resume").

### LinkedIn Search — запуск по ссылке без ручного клика

Если пользователь даёт ссылку на поиск LinkedIn и просит запустить парсинг и проанализировать результат:

1. **Сервер сохранения (чтобы файл попал в репо):** Запустить в фоне `npm run dex-save-server` (если ещё не запущен), чтобы расширение могло сохранить JSON в `00-Inbox/Job_Search/data/` при неудаче native host.
2. **Запуск захвата:** Выполнить `npm run job-search:linkedin-capture -- "URL"` (URL — ссылка на поиск LinkedIn). Скрипт откроет URL в браузере по умолчанию с параметром `dex-auto-capture=1`; расширение само запустит захват через ~4 с. Скрипт ждёт появления нового файла в `00-Inbox/Job_Search/data/` (таймаут 30 мин, опрос каждые 45 с) и выводит путь к файлу в stdout.
3. **Анализ:** Прочитать полученный JSON (по выведенному пути). Подсчитать: сколько вакансий захвачено, сколько в failedIds, статистика remote/hybrid/onsite, дубликаты по title+company, обрыв пагинации. Выдать пользователю краткий отчёт.
4. **Исправления:** При необходимости предложить или применить правки (например, доработки в расширении или в скриптах).

Команда: `npm run job-search:linkedin-capture -- "https://www.linkedin.com/jobs/search/?keywords=..."`

## Commands Reference

- **Full pipeline, skip done (default):** `npm run job-digest`
- **Parser only:** `npm run job-search:step1`
- **Filter from extension export:** `npm run job-search:step2` or `npm run job-search:filter-from-export`
- **Generate job links (open in browser):** `npm run job-search:open-links`
- **Inject descriptions from export:** `npm run job-search:inject-from-export`
- **Digest missing descriptions (fully automatic, extension only):** Run `node .scripts/job-search/fetch-job-descriptions.cjs <path-to-digest.md>`. Script starts the server, opens Chrome with `?dex-auto-capture=1`; the extension auto-starts capture, then auto-POSTs the export to the server; script polls for the file and runs inject-from-export and inject-into-digest. No manual clicks. Optional: pass export path as second arg to run only inject steps.
- **Summaries report:** `npm run job-search:step3`
- **Teal HTML:** `npm run job-search:step4`
- **LinkedIn from email:** `npm run job-search:email`
- **LinkedIn Search — открыть ссылку в браузере и ждать файл (автозахват по dex-auto-capture=1):** `npm run job-search:linkedin-capture -- "https://..."`
- **RSS only:** `npm run job-search:rss` (пишет в `remote-pm-rss-YYYY-MM-DD.md`)
- **BettingJobs (iGaming Product, remote):** `npm run job-search:bettingjobs`
- **DOU (iGaming UA):** раз в неделю/при смене списка — `node .scripts/job-search/fetch-dou-gambling-all-pages.cjs --out /tmp/dou-gambling-all.json`. Ежедневно DOU входит в `npm run job-digest` (проверка вакансий + генерация дайджеста).

Do not prompt for confirmation before running; execute and report the result.

## Remote-only filter (user preference)
If `System/user-profile.yaml` has `job_search.consider_only_remote: true`, when **presenting** digest entries (e.g. listing jobs, answering "which are remote"), exclude or clearly mark as non-remote any job whose description or snippet indicates on-site: e.g. "based in [Country/City]" without "Remote" in the same context, "relocate to", "on-site", "office-based". Do not exclude if it says "Remote", "Malta, Remote", etc. See CLAUDE.md → Job digest: remote-only filter.

## Teal

Step 4 adds each digest job to Teal (job tracker) with description. If you prefer to open job URLs in the browser and save via the Teal extension instead, run: `node .scripts/job-search/open-digest-jobs-for-teal.cjs --html` and open the generated HTML in Chrome. See `.claude/reference/job-digest-teal-sync.md`.
