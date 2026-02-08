# Job Digest: где хранятся описание и summary

Единый источник сырых данных по вакансии — файл **на одну вакансию**. Агрегаты и дайджест собираются из него.

## Хранилища

- **`00-Inbox/Job_Search/data/jobs/<linkedinJobId>.json`** — один файл на вакансию (id из URL `linkedin.com/comm/jobs/view/<id>`).
  - Поля: `id`, `url`, `job_title`, `company`, `work_type`, `job_description` (полный текст JD).
  - Опционально позже: `summary`, `suggested_questions` (после генерации саммари).
  - **Источник истины для описания:** если описание есть — оно здесь (и/или в агрегате).

- **`00-Inbox/Job_Search/data/job-descriptions-YYYY-MM-DD.json`** — массив вакансий за дату дайджеста.
  - Те же поля на элемент; используется для быстрого чтения «все вакансии за день» и для Teal.
  - Заполняется скриптом `fetch-job-descriptions-playwright.cjs`; при успешном фетче каждая вакансия **дополнительно** пишется в `data/jobs/<id>.json`.

- **`00-Inbox/Job_Search/digests/linkedin-jobs-YYYY-MM-DD.md`** — дайджест: ссылки + вставленные resume summary (3 абзаца + suggested questions).
  - Summary генерируются из `data/jobs/<id>.json` (скрипт `inject-summaries-into-digest.cjs`): читает `job_description` из файла вакансии, вызывает `generate_job_summary`, вставляет блок в markdown.

## Поток данных

1. **Парсинг дайджеста / писем** → список URL вакансий.
2. **Фетч описаний** (`fetch-job-descriptions-playwright.cjs` по дайджесту):
   - для каждого URL открывает LinkedIn, забирает описание;
   - пишет в `job-descriptions-YYYY-MM-DD.json` (массив);
   - при успехе пишет ту же вакансию в `jobs/<id>.json`.
3. **Саммари в дайджест** (`inject-summaries-into-digest.cjs`):
   - по каждой ссылке в дайджесте берёт `jobId` из URL;
   - читает `jobs/<id>.json`; если есть `job_description` ≥ 100 символов — генерирует summary и вставляет в .md.
4. **Добавление в Teal** (`add-digest-jobs-to-teal-playwright.cjs --app`):
   - список вакансий и порядок — из дайджеста / `job-descriptions-DATE.json`;
   - для каждой вакансии описание берётся из `job-descriptions-DATE.json`;
   - если описания нет или оно короткое — **fallback** на `jobs/<id>.json`;
   - в Teal не сохраняем вакансию без описания (проверка перед отправкой и возврат на job-tracker после каждой).

## Итог

- **Описание:** сохраняется в `jobs/<id>.json` при фетче; дублируется в `job-descriptions-YYYY-MM-DD.json`. Teal использует агрегат + fallback на `jobs/<id>.json`.
- **Summary:** генерируются из `jobs/<id>.json` и вставляются только в markdown дайджеста; в JSON не хранятся (при необходимости можно дописать поля в `jobs/<id>.json`).
