# Job Search: скрипты и шаги (эталон Full Flow и отличия)

Эталон — **Full Flow** (`run-full-linkedin-teal-flow.cjs`). Все скрипты, которые обрабатывают резюме/Teal с какого-то шага, должны использовать ту же логику для общих шагов. Ниже — список скриптов, какие шаги универсальны и в чём отличия.

---

## Эталон: Full Flow (8 шагов)

**Скрипт:** `run-full-linkedin-teal-flow.cjs`  
**Вызов:** `node .scripts/job-search/run-full-linkedin-teal-flow.cjs "https://www.linkedin.com/jobs/search/?..."`

| Шаг | Название | Что делает | Скрипт/команда |
|-----|----------|------------|----------------|
| 1 | Capture LinkedIn search | Save server + захват поиска по URL (расширение) | `linkedin-capture-run.cjs` |
| 2 | Create MD digest | Дайджест из экспорта (PM/PO, дедуп) | `generate-search-digest.cjs` |
| 3 | Filter digest by export | Remote/on-site по полному экспорту | `filter-digest-from-export.cjs` (после шага 5) |
| 4 | Generate HTML links | HTML со ссылками на вакансии | `generate-digest-open-links.cjs` |
| 5 | Add descriptions 100% | Догрузка описаний до 100% (open-links + fetch) | `fetch-job-descriptions.cjs` |
| 6 | Add jobs to Teal | Добавление вакансий из дайджеста в Teal | `add-digest-jobs-to-teal-playwright.cjs` (digest, --app, --export) |
| 7 | Create Teal resumes | Копии резюме по дайджесту (iGaming vs AI, переименование) | `teal-resume-batch-from-export.cjs` (digest) |
| 8 | Match-score | Job Matcher → summary если <80% → Target Title → PDF в Applied → cover letter | `teal-resume-match-score.cjs` (digest) |

Профиль Chrome для шагов 6–8: `TEAL_CHROME_PROFILE_ALT`. Состояние: `full-flow-state.json` / `full-flow-state.md`.

---

## Список скриптов (от Full Flow к частным кейсам)

### 1. Full Flow (эталон)

- **run-full-linkedin-teal-flow.cjs** — все 8 шагов по порядку (1 → 2 → 4 → 5 → 3 → 6 → 7 → 8).  
- Опция `--no-teal`: остановка после шага 5.  
- Опция `--use-existing-export`: пропуск шага 1, использование последнего экспорта.

---

### 2. Incremental Flow (по расписанию, только новые вакансии)

- **run-incremental-linkedin-teal-flow.cjs**  
- **Вход:** URL поиска LinkedIn (тот же, что в cron).  
- **Шаги:** свой «шаг 1» (capture по URL) → diff по `last-processed-job-ids` → только новые job ID → шаг 2 (digest по экспорту, затем фильтр дайджеста до только новых) → **3 → 4 → 5 → 6 → 7 → 8** теми же скриптами, что и Full Flow.  
- **Универсально:** шаги 3–8 — те же скрипты и тот же порядок: filter-digest, open-links, fetch descriptions, add-digest-jobs-to-teal, teal-resume-batch-from-export, teal-resume-match-score.  
- **Отличие:** шаг 1 — один URL, один экспорт; шаг 2 — дайджест по этому экспорту + вырезание только новых job ID в отдельный инкрементальный дайджест; шаги 6–8 вызываются с **инкрементальным** дайджестом. Профиль: `TEAL_CHROME_PROFILE_HOURLY`. Нет записи в `full-flow-state.json`.

---

### 3. Teal Catch-up (догон по уже созданным дайджестам)

- **run-teal-catch-up.cjs**  
- **Вход:** инкрементальные дайджесты за последние N дней (по умолчанию 1).  
- **Шаги:** только **6 → 7 → 8** для каждого найденного дайджеста (без 1–5).  
- **Универсально:** те же скрипты — add-digest-jobs-to-teal-playwright, teal-resume-batch-from-export, teal-resume-match-score. Аргументы: digest path, для шага 6 ещё `--app --export` (берётся последний search export).  
- **Отличие:** нет шагов 1–5; цикл по нескольким дайджестам; один профиль `.chrome-profile-catchup` на весь прогон; не пишет full-flow-state.

---

### 4. Full Pipeline (укороченная цепочка, не эталон)

- **run-full-linkedin-teal-pipeline.cjs**  
- **Зачем есть:** исторически — «одна команда» с ретраями (capture → add to Teal → batch → match-score) без явных 8 шагов. В скилле `/linkedin-to-teal` упоминается как «полный цикл до резюме и match-score».  
- **Вход:** URL поиска LinkedIn.  
- **Шаги:** 1) `linkedin-capture-and-teal.cjs` (capture + digest + add to Teal, **без** open-links и без 100% descriptions); 2) teal-resume-batch-from-export (по **export**); 3) teal-resume-match-score (по digest или export).  
- **Универсально:** шаги 7 и 8 — те же скрипты (batch, match-score), но источник и порядок отличаются.  
- **Отличие:** нет шагов 3, 4, 5 Full Flow → описания вакансий могут быть неполными → match-score/summary работают с худшими данными. Нет full-flow-state.  
- **Рекомендация:** эталон — Full Flow. Pipeline оставлен как быстрый путь; для полных данных и возможности «продолжить с шага N» использовать `run-full-linkedin-teal-flow.cjs`.

---

### 5. Резюме с определённого шага (дебаг / ручной запуск)

Вызов тех же низкоуровневых скриптов с путём к дайджесту (или экспорту) и опциями `--from N` / `--limit M`.

- **teal-resume-match-score.cjs** `[digest.md]`  
  - Полный шаг 8: список резюме из дайджеста → для каждого: поиск в списке Teal → Job Matcher → выбор вакансии → ожидание score → summary если <80% → Target Title → PDF + cover в Applied.  
  - Опции: `--from N`, `--limit M`, `--company "Name"`, `--exclude Company1,Company2`, `--filter` (PM-only), `--wait-for-click` (дебаг).  
  - **Универсально:** логика шага 8 (Job Matcher, summary, Target Title, export) одна и та же для всех резюме из дайджеста.  
  - **Отличие от эталона внутри шага 8:** при вызове из Full Flow передаётся только путь к дайджесту; при resume с шага 8 в full-flow-state.md подсказывается тот же вызов с этим дайджестом.

- **teal-resume-match-score.cjs** `--resume-url "https://app.tealhq.com/resume-builder/resumes/<uuid>/matching"`  
  - Один резюме по URL: открыть preview → (при необходимости логин) → company/title из страницы или Job Matcher → открыть Job Matcher → поиск вакансии в dropdown → score → summary при null или <80% → Target Title → PDF + cover.  
  - **Универсально:** после входа в Job Matcher и выбора вакансии цепочка та же: ожидание score (SCORE_WAIT_MS), блок summary (generateSummaryForJob, вставка в Professional Summary, сохранение), addTargetTitleToResume, exportPdfAndSaveToApplied.  
  - **Отличия:** вход — один URL резюме (нет итерации по дайджесту); проверка логина при sign-in/sign-up при открытии страницы резюме. Логика шага 8 после выбора вакансии (score, summary при null/<80%, Target Title, PDF, cover) совпадает с режимом по дайджесту.

- **teal-resume-batch-from-export.cjs** `[digest.md]` или `[export.json]`  
  - Шаг 7: создание копий резюме в Teal по дайджесту/экспорту (шаблон iGaming vs AI, переименование по вакансии).  
  - **Универсально:** тот же скрипт вызывается в Full Flow и в Incremental, и в Catch-up.  
  - Опции: `--from N`, `--digest` при вызове от export.

- **add-digest-jobs-to-teal-playwright.cjs** `digest.md --app [--setup] --export export.json`  
  - Шаг 6: добавление вакансий из дайджеста в Teal.  
  - **Универсально:** один и тот же скрипт в Full Flow, Incremental и Catch-up.

---

### 6. Остальные скрипты (вспомогательные / отдельные кейсы)

- **linkedin-capture-run.cjs** — только захват поиска по URL (расширение).  
- **linkedin-capture-and-teal.cjs** — capture + generate-search-digest + add to Teal (без 4, 5, 7, 8).  
- **generate-search-digest.cjs** — шаг 2 по экспорту.  
- **generate-digest-open-links.cjs** — шаг 4.  
- **fetch-job-descriptions.cjs** — шаг 5.  
- **filter-digest-from-export.cjs** — шаг 3.  
- **teal-resume-for-job.cjs** — одно резюме под одну вакансию (ручное создание копии + переименование), не входит в цепочку 6–7–8.  
- **run-job-digest.cjs** — дайджест из email (LinkedIn alerts) + RSS и т.д., не тот же пайплайн, что Full Flow.  
- **teal-login.cjs**, **teal-cleanup-copies.cjs**, **teal-delete-first-summary.cjs**, **kill-teal-process-one.cjs** и т.д. — утилиты, не шаги пайплайна.

---

## Где шаги 6–8 совпадают с эталоном, а где нет

| Сценарий | Шаг 6 | Шаг 7 | Шаг 8 (скрипт) | Идентичность шага 8 |
|----------|-------|-------|----------------|----------------------|
| Full Flow | add-digest (digest, --app, --export) | teal-resume-batch (digest) | teal-resume-match-score (digest) | Эталон |
| Incremental | add-digest (incremental digest, --app, --export) | teal-resume-batch (incremental digest) | teal-resume-match-score (incremental digest) | Да, те же скрипты и логика; другой только путь к дайджесту и профиль Chrome |
| Catch-up | add-digest (по каждому дайджесту) | teal-resume-batch (по каждому дайджесту) | teal-resume-match-score (по каждому дайджесту) | Да |
| Ручной «с шага 8» | — | — | teal-resume-match-score (digest) | Да |
| --resume-url | — | — | teal-resume-match-score --resume-url | Да: та же цепочка (score → summary при null/<80% → Target Title → PDF + cover); отличия только вход (один URL) и проверка логина при sign-in |
| Full Pipeline | внутри linkedin-capture-and-teal | teal-resume-batch (по export) | teal-resume-match-score (digest или export) | Шаг 8 тот же скрипт; шаги 1–5 не совпадают с эталоном (нет 3–4–5 как отдельных шагов) |

---

## Расхождение (исправлено): этап summary при score === null

- **Раньше:** в режиме по дайджесту summary выполнялся только при `score !== null && score < MIN_SCORE`; при таймауте score этап пропускался. В `--resume-url` при `score === null` summary выполнялся.  
- **Сейчас:** оба режима выровнены: при наличии JD summary выполняется при `score === null` или `score < 80%`; при `score === null` в digest-режиме выводится лог и `currentScore = 0` для цикла итераций.

---

## Краткая шпаргалка: что запускать для дебага с шага N

- **С шага 6:**  
  `node .scripts/job-search/add-digest-jobs-to-teal-playwright.cjs <path-to-digest.md> --app --export <path-to-export.json>`

- **С шага 7:**  
  `node .scripts/job-search/teal-resume-batch-from-export.cjs <path-to-digest.md>`

- **С шага 8:**  
  `node .scripts/job-search/teal-resume-match-score.cjs <path-to-digest.md>`  
  С опциями: `--from N`, `--limit M` при необходимости.

- **Один резюме (Job Matcher + summary + PDF + cover):**  
  `node .scripts/job-search/teal-resume-match-score.cjs --resume-url "https://app.tealhq.com/resume-builder/resumes/<uuid>/matching"`  
  Опционально: `--company "Company Name"`, `--job-description-file path/to/jd.txt`.
