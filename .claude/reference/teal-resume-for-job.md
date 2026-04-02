# Teal: резюме под вакансию

Скрипт по вакансии определяет тип (iGaming/Compliance или AI/прочее), выбирает эталонное резюме в Teal, копирует его и переименовывает в название вакансии.

## Эталонные резюме в Teal

- **iGaming / Compliance:** [preview](https://app.tealhq.com/resume-builder/resumes/ba0cb2e8-5791-4cfc-b405-beeb1acd6dcb/preview)
- **AI и прочие:** [preview](https://app.tealhq.com/resume-builder/resumes/c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9/preview)

## Определение типа

По тексту вакансии (title + description) считается скор по ключевым словам:

- **iGaming:** igaming, gambling, casino, sportsbook, compliance, regulatory, MGA, UKGC, AML, KYC, gaming platform, и т.д.
- **AI/other:** AI, LLM, machine learning, NLP, OpenAI, GPT, RAG, data science, и т.д.

Если есть iGaming-ключевые и их число ≥ AI → выбирается шаблон iGaming, иначе — AI.

## Запуск

```bash
# Название вакансии + описание (для определения типа)
npm run job-search:teal-resume -- --job-title "Senior Product Manager - Cloudbeds" --job-description "At Cloudbeds we're building hospitality software..."

# Описание из файла
npm run job-search:teal-resume -- --job-title "PM - Company" --job-description-file ./path/to/description.txt
```

Перед запуском закрой Chrome. Скрипт откроет Chrome с тем же профилем, что и для Job Tracker, откроет выбранный шаблон, нажмёт Duplicate и переименует копию в `--job-title`.

## Скрипт

`.scripts/job-search/teal-resume-for-job.cjs`  
Использует: `job-search-utils.cjs` (detectJobType), Playwright, профиль Chrome (TEAL_CHROME_PROFILE или Default).

---

## Match score по экспорту (кастомный скрипт)

Скрипт для каждого резюме из того же LinkedIn-экспорта: открывает резюме в Teal → вкладка Job Matcher → вводит название вакансии → выбирает вакансию из дропдауна → ждёт матч-скор. Если скор < 80%, переходит на вкладку Content Editor и кликает блок Professional Summary (чтобы слева подскроллило к нужному summary).

**Запуск:**

```bash
# Все резюме из дефолтного экспорта (те же --exclude, что и у батча)
npm run job-search:teal-match-score

# Свой экспорт, лимит, с какого номера
npm run job-search:teal-match-score -- путь/к/export.json --exclude kraken,toptal --from 1 --limit 10
```

**Требования:** Playwright. Лог: `00-Inbox/Job_Search/teal/match-score.log`.

**Браузер:** Как и add-digest / teal-resume — используется твой профиль Chrome (Default или Profile 1). Закрой Chrome, запусти скрипт: откроется Chrome с твоей сессией Teal. Резюме на странице ищутся по **точному названию** (Title — Company), как в экспорте. Опционально: TEAL_CDP_URL или флаг `--cdp` для подключения к уже запущенному Chrome с `--remote-debugging-port=9222`.

---

## Сохранение в Applied при 80–100% match

Когда матч-скор по резюме достигает 80–100%, скрипт:

1. Переходит на вкладку /preview и нажимает **Export PDF** (резюме скачивается как PDF).
2. Создаёт папку `Applied/<Company>/<Vacancy>/`. Путь по умолчанию: `~/Documents/Applied`; переопределение: переменная окружения `APPLIED_BASE` (например `APPLIED_BASE=/Users/you/Documents/Applied`).
3. Сохраняет в эту папку:
   - **Резюме в PDF:** `Roman Matsukatov - CV.pdf` (скачанный из Teal);
   - **Cover letter:** `Roman Matsukatov - Cover Letter.docx` — если в `cover_letters/` уже есть .docx по компании, он копируется в Applied. Если нет, скрипт извлекает с открытой страницы Teal текущее резюме в .md, подставляет JD и генерирует письмо. **Откуда берётся JD:** сначала по маппингу резюме→вакансия (`00-Inbox/Job_Search/teal/resume-to-job.json`): по `resumeId` находится `jobId`, по нему — описание из дайджеста или export JSON; если маппинга нет — поиск по company+title в digest/JSON. Маппинг записывается: при прогоне match-score по дайджесту (когда открываем резюме) и при создании резюме через `teal-resume-for-job --job-id` (в т.ч. батч `teal-resume-batch-from-export` передаёт `--job-id`).

Имена файлов и структура папки фиксированы. Название папки компании — из поля компании вакансии (санитизированное для пути).

---

## Тест только этапа Applied по ссылке на резюме

Чтобы прогнать только сохранение в Applied (резюме в PDF + cover letter) для **конкретного резюме**, без дайджеста и без match-score:

```bash
npm run job-search:teal-match-score -- --resume-url "https://app.tealhq.com/resume-builder/resumes/03f408f5-9938-4e4e-ab41-c52272acd39c" --company "Foundever"
npm run job-search:teal-match-score -- --resume-url "..." --company "Tangible" --job-description-file ./path/to/jd.txt
```

- `--resume-url` — ссылка на резюме в Teal (или `--resume-id <uuid>`).
- `--job-description-file` — путь к файлу с текстом вакансии; если указан, при отсутствии готового cover letter скрипт сгенерирует его и положит в Applied.
- `--company "Название"` — для базовой папки `Applied/<Название>/` (а конкретная подпапка вакансии внутри неё создаётся автоматически по title вакансии). Если не указать, компания берётся: (1) из поля **Resume Title** на странице (значение вида "Product Manager — Tangible" → компания "Tangible"); (2) при неудаче — со страницы Job Matcher из заголовка h2 вида "CompanyName - remote" (тип занятости отбрасывается). В основном flow (по дайджесту) компания всегда из спаршенного JSON (job.company).

Скрипт откроет это резюме на /preview и выполнит только шаг экспорта в Applied.

---

## Revolut в дайджестах (исключение)

Вакансии Revolut попадали в скрипт из дайджестов LinkedIn. Источники (файлы в vault):

- `00-Inbox/Job_Search/digests/linkedin/search-senior-product-manager-2026-02-12.md` — в начале файла (строки 9, 11 и далее) идут вакансии Revolut (Product Owner Technical/UX и др.).
- `00-Inbox/Job_Search/digests/linkedin/linkedin-jobs-backlog-2026-02-09.md` — Head of Product (Fraud), Head of Product (Wealth & Trading).
- `00-Inbox/Job_Search/digests/linkedin/linkedin-jobs-2026-02-07.md` — несколько вакансий Revolut.

Дефолтный дайджест в коде: `search-senior-product-manager-2026-02-10.md` (первая вакансия там — Toptal). Если запускать с путём к дайджесту **2026-02-12**, первой обрабатывается Revolut.

В скрипте `teal-resume-match-score.cjs` в список исключений по умолчанию добавлен **revolut** (`exclude = ['kraken', 'toptal', 'revolut']`), поэтому вакансии Revolut из любого дайджеста больше не обрабатываются. Чтобы убрать их и из самих файлов, отметь в этих дайджестах строки с Revolut как обработанные/отклонённые (`[-]`) или удали их.
