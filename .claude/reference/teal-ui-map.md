# Teal UI Map (Job Tracker + Resume Builder)

Живая карта структуры интерфейса и селекторов Teal для Job Tracker и Resume Builder.

Задача этого файла — описывать:
- **Какие блоки информации есть** на ключевых страницах.
- **Как к ним обращаться** из автоматизации (CSS / locator / role / data-testid).
- **Как эта структура связана** с типами опыта в резюме (AI, iGaming и др.).

Заполняется и поддерживается скиллом `/teal-ui-learn-custom`.

**Block Layer (единый API блоков):** `.scripts/job-search/teal/README.md`, реестр `teal-block-registry.yaml`, проверка `npm run job-search:teal-blocks-check`. На вопрос «умеешь блок X?» — `00-Inbox/Job_Search/teal/teal-block-capabilities.json` + registry; при `supported: false` → ui-learn и обновление якорей, не ручной Teal.

**Структура опыта и чекбоксы резюме:** при прогоне `teal-ui-learn` и при любой работе со страницей resume preview используйте модуль `teal-resume-experience.cjs`. Он даёт: компании → позиции → буллеты с флагом «включён/выключен» (included). Файл `00-Inbox/Job_Search/teal/teal-resume-experience.json` хранит последнее извлечённое состояние; скрипты, открывающие resume preview, могут вызывать `extractResumeExperienceFromPage(page)` для актуальных данных или `loadResumeExperience(TEAL_DIR, { resumeId })` для сохранённых.

## Примеры ID и URL

- **Job Tracker (список):**
 - URL: `https://app.tealhq.com/job-tracker`
- **Пример карточки вакансии:**
 - Job ID: 172fa305-3739-4fec-ae21-371fc6187796
 - URL: `https://app.tealhq.com/job-tracker/{jobId}`
- **Список резюме:**
 - URL: `https://app.tealhq.com/resume-builder/resumes`
- **Пример AI‑резюме:**
 - Resume ID: 6ff3c8c9-b37e-4689-9d60-13465bf19547
 - Preview URL: `https://app.tealhq.com/resume-builder/resumes/{resumeId}/preview`
 - Matching URL: `https://app.tealhq.com/resume-builder/resumes/{resumeId}/matching`
- **Эталонные резюме (структура и чекбоксы):**
 - iGaming & compliance: `296be353-ba11-4ee7-a827-cb7985cbfa26` — https://app.tealhq.com/resume-builder/resumes/296be353-ba11-4ee7-a827-cb7985cbfa26
 - AI & Other: `c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9` — https://app.tealhq.com/resume-builder/resumes/c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9
 - Сводка «какие чекбоксы включены/выключены» по каждому эталону: `00-Inbox/Job_Search/teal/teal-reference-resumes-checkboxes.md` (обновляется скриптом `npm run job-search:teal-extract-reference-resumes`; Chrome перед запуском закрыть).
 - Сырые данные: `teal-resume-experience-igaming.json`, `teal-resume-experience-ai.json` в той же папке.

## Job Tracker — список вакансий

Таблица — Tabulator: контейнер `.job-tracker-table.tabulator` или `.tabulator[role="grid"]`, тело `.tabulator-tablebody`, строки данных `.tabulator-row`, ячейки `.tabulator-cell` с атрибутом `tabulator-field`.

- **Блок:** Сетка (таблица)
 - **Селектор:** `.job-tracker-table.tabulator`, `.tabulator[role="grid"]`
- **Блок:** Строка вакансии в списке
 - **Селектор:** `.tabulator-tablebody .tabulator-row` или `.tabulator-row` (не внутри `.tabulator-header`)
 - **Пример содержимого:** одна строка = одна вакансия (позиция, компания, статус)
- **Блок:** Заголовок вакансии в строке (Job Position)
 - **Селектор:** ячейка с `tabulator-field="role"` внутри строки; ссылка `a[href*="/job-tracker/"]` для ID
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Компания / организация
 - **Селектор:** ячейка `tabulator-field="company"` или `tabulator-field="companyName"`
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Статус вакансии (Applied, Bookmarked, Interviewing и др.)
 - **Селектор:** ячейка `tabulator-field="statusName"` или `tabulator-field="status"`
 - **Пример содержимого:** _(одна строка)_

## Job Tracker — карточка вакансии (детальная)

- **Блок:** Заголовок вакансии
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Компания
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Локация / формат (remote, hybrid и т.п.)
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Основной текст описания вакансии
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(краткий фрагмент)_
- **Блок:** Поле для заметок / комментариев
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(краткий фрагмент)_

## Resumes — список резюме

- **Блок:** Карточка резюме в списке
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(например, "AI Resume — Senior PM")_
- **Блок:** Название резюме
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Метаданные (дата обновления, тип и т.п.)
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(одна строка)_

## Resume Preview — блок Target Title

Страница: Content Editor на `/resume-builder/resumes/{resumeId}/preview`. Левый столбец; блок Target Title может быть свёрнут по умолчанию.

- **Блок (секция) Target Title:**
 - **Селектор:** контейнер `#target-titles` или заголовок с текстом "Target Title" (например `h3` с кнопкой).
 - **Свёрнутое состояние:** `[data-state="closed"]` на контейнере; кнопка-триггер с `aria-expanded="false"`. Перед кликом по "Add a Target Title" нужно развернуть секцию: клик по триггеру, подождать ~600 ms.
- **Кнопка «Add a Target Title»:**
 - **Селектор:** `button[aria-label="Add a Target Title"]`.
- **Поле ввода названия:**
 - **Селектор:** `input[placeholder*="e.g."]` или `input[placeholder*="Marketing Manager"]` или `input[name="name"]` внутри формы после клика Add.
- **Кнопка «Save» (сохранить тайтл):**
 - **Селектор:** `button[aria-label="Save"][type="submit"]` или `button[type="submit"]` с текстом "Save".

**Логика для скрипта:** развернуть секцию при необходимости. Элементы списка Target Title ведут себя как чекбоксы: клик по тайтлу переключает состояние (выбран/не выбран). Выбранный тайтл попадает в выгружаемое резюме. Скрипт должен: (1) если нужный тайтл уже есть в списке и уже выбран — не кликать; (2) если тайтл есть, но не выбран — один раз кликнуть; (3) если тайтла нет — Add a Target Title → input → Save; (4) **правка на месте** (typo, убрать «(Remote)»): hover на строку → `button[aria-label*="Edit" i]` → input → Save — **не** Add; `match_from` = точный текст строки в списке.

## Resume Preview — блок Professional Summary

Страница: Content Editor (вкладка «Content Editor») на `/resume-builder/resumes/{resumeId}/preview`. Левый столбец — редактор контента; блок Professional Summary идёт выше Work Experience.

- **Блок (секция) Professional Summary:**
 - **Селектор:** Якорь — кнопка `button[aria-label="Add a Professional Summary"]`; секция — общий контейнер этой кнопки и списка пунктов (например `addBtn.closest('section')` или родительский `div`, содержащий заголовок «Professional Summary» и список пунктов). Альтернатива: ограничить DOM между заголовком с текстом "Professional Summary" и заголовком "Work Experience" (любой элемент: `h1`–`h6`, `[role="heading"]`, или элемент с `textContent.trim().toLowerCase() === 'professional summary'`).
 - **Свёрнутое состояние:** секция может быть свёрнута (`[data-state="closed"]`). Перед поиском кнопок удаления нужно развернуть: найти `addBtn.closest('[data-state="closed"]')`, в нём — триггер (кнопка с `[aria-expanded="false"]` или элемент с текстом "Professional Summary"), кликнуть, подождать ~600 ms.
 - **Пример содержимого:** Секция с кнопкой «Add a Professional Summary» и одним или несколькими пунктами summary (каждый пункт — редактируемый текст + кнопка удаления).
- **Кнопка «Add a Professional Summary»:**
 - **Селектор:** `button[aria-label="Add a Professional Summary"]` (из selectors-report).
 - **Пример содержимого:** Кнопка добавления нового пункта summary.
- **Первый пункт summary в списке:**
 - **Селектор:** Внутри блока Professional Summary — первый по порядку в DOM элемент, содержащий кнопку удаления (aria-label*="Delete" или "Remove") и редактируемый текст. То есть: все кнопки Delete/Remove между заголовком Professional Summary и заголовком Work Experience; взять первую такую кнопку; контейнер первого пункта — `deleteBtn.closest('li')` или `deleteBtn.closest('[class*="summary"]')` или `deleteBtn.parentElement.closest('div')` или `deleteBtn.parentElement`.
 - **Пример содержимого:** Один абзац текста summary (то, что будет удалено при «удалить первый пункт»).
- **Кнопка удаления первого пункта summary:**
 - **Селектор:** `button[aria-label="Delete summary"]` (точный лейбл у кнопки напротив каждого пункта Professional Summary). Классы: `inline-flex items-center justify-center ... w-8 h-8`, иконка `lucide-trash`. Запасной вариант: `button[aria-label*="Delete" i]` в границах блока Summary.
 - **Важно:** кнопка в DOM показывается только при наведении на соответствующий блок summary. Перед кликом нужно вызвать `mouseover` на контейнере пункта (например `deleteBtn.closest('li')` или `parentElement`), подождать ~300 ms, затем кликнуть по кнопке.
 - **Подтверждение в попапе:** после клика по "Delete summary" появляется диалог; нужно нажать кнопку подтверждения: `button[type="submit"]` с текстом "Delete on ALL resumes" (классы `border-red-700 text-red-700`). Без этого пункт не удаляется.
 - **Пример содержимого:** Иконка корзины (trash), клик удаляет этот пункт summary.

**Логика для скрипта удаления первого summary:** (1) Найти `[aria-label="Add a Professional Summary"]`; (2) найти границы блока — заголовок "Professional Summary" и "Work Experience" (любой тег с таким textContent); (3) в этом диапазоне найти все кнопки с aria-label, содержащим "Delete" или "Remove"; (4) первая по document order — кнопка удаления первого пункта; (5) контейнер первого пункта — `closest('li')` / `closest('[class*="summary"]')` / `parentElement` от этой кнопки; (6) клик по кнопке удаления.

**Не путать с PS12:** paste и Delete summary — **левый** столбец. Проверка «что увидит рекрутер» (PS12) — **правый** столбец; см. раздел ниже «Правый столбец — превью резюме (PS12)».

## Resume Preview — левый столбец: `#blurbs`, Languages, Selected Projects

Страница та же: Content Editor `/preview`. Слева несколько **разных по смыслу** секций резюме, но часть из них добавляется через **один** контейнер Teal `#blurbs` и ту же кнопку `Add a Professional Summary` + rich-text редактор (`contenteditable` / TipTap).

- **Контейнер blurbs (только слева):**
 - **Селектор:** `#blurbs`
 - **Назначение:** список «пунктов» под Professional Summary в UI редактора (не финальная вёрстка PDF).
 - **Пример содержимого:** один или несколько блоков с Delete summary, редактором текста.
- **Professional Summary intro (paste step 10 / match-score step 8):**
 - Редактируется **здесь** (см. раздел «блок Professional Summary» выше).
 - На **правом** превью отображается как секция **Professional Summary** — её читает PS12.
- **Languages / Selected iGaming projects (step 10 `resume_sections`):**
 - **Селектор добавления:** та же `button[aria-label="Add a Professional Summary"]` внутри `#blurbs`, затем `contenteditable` (см. `teal-resume-sections.cjs` → `summaryEditorLocator`).
 - **На правом превью:** отдельные заголовки (например **Languages**, **Selected iGaming projects**) — **не** подменяют PS12 и **не** вырезаются как «Professional Summary».
 - **Скрипт:** `applyResumeSectionsFromFeedback` / блок `preview.blurbs` в block layer.

**Граница для PS12:** код PS12 использует `#blurbs.getBoundingClientRect().right` только чтобы знать, где **заканчивается левый столбец**; текст Languages/Projects из `#blurbs` **не** должен попадать в read-back summary.

## Resume Preview — правый столбец — превью резюме (PS12)

**Назначение:** после paste step 10 прочитать текст **Professional Summary** так, как его видит рекрутер в **правой** панели (и сверить с `feedback.json` + PDF). Это gate **PS12**, модуль `.scripts/job-search/professional-summary-right-preview.cjs` → `extractProfessionalSummaryRightPreviewText(page)`.

**Не использовать для PS12:** левый `#blurbs`, любой `[contenteditable="true"]`, `button[aria-label="Delete summary"]`, `#work-experience`, `#target-titles`, `#skills`, `#projects`, `#certifications`, `#interests`.

### Якорь корня правого превью (порядок приоритета)

**Проверено на живом Teal 2026-05-29** (`inspect-right-preview-testids.cjs`, резюме `98a9852c-c971-430f-a49b-6e45b9a72c88` и `c0ad3ea2-8d9e-4e84-8b60-eab3172de3d9`):

- **Контент превью** рендерится во **iframe** `name="preview-iframe"` (`about:srcdoc`), не в основном DOM.
- Оболочка справа: `#resume-preview` (пустой `innerText`, внутри iframe).
- Элемент iframe: `#preview-iframe` / `iframe.resume-preview-iframe`.
- **`data-testid` на правой панели нет** — ни `[data-testid="resume-preview"]`, ни `[data-testid="resume-preview-container"]` на странице preview не найдены.
- Внутри iframe **`data-testid` тоже нет**; read-back идёт по `body.innerText` + метки секции.
- На части шаблонов заголовок секции в превью — **`Objective:`**, а не «Professional Summary» (левый редактор по-прежнему «Professional Summary»).

PS12 сначала открывает iframe (`resolvePreviewFrame`), затем режет текст. Список **`selectorRoots`** / **`PS_PREVIEW_SELECTOR_ROOTS`** в `.scripts/job-search/professional-summary-right-preview.cjs` **должен совпадать** с этим разделом.

**Порядок (синхрон с кодом):**

1. `#preview-iframe` — iframe с HTML превью (**фактический источник текста PS12**).
2. `#resume-preview` — оболочка справа (без текста; содержит iframe).
3. `[data-testid="resume-preview"]` — **legacy / не на live 2026-05**; оставлен для обратной совместимости.
4. `[data-testid="resume-preview-container"]` — то же.
5. `[class*="ResumePreview"]`
6. `[class*="resume-preview"]` — на live совпадает с `#preview-iframe` (`resume-preview-iframe`).
7. `[class*="ResumeDocument"]`

**Iframe locators (до evaluate):** `#preview-iframe`, `#resume-preview iframe`, `iframe.resume-preview-iframe`, `page.frame({ name: 'preview-iframe' })`.

**Статус:** live 2026-05-29; при смене вёрстки Teal — `node .scripts/job-search/teal/inspect-right-preview-testids.cjs --resume-id <uuid>` и обновить этот блок + `professional-summary-right-preview.cjs`.

### Левая граница (отсечь редактор)

Узел считается **правым превью**, только если:

- центр элемента по X **правее** `leftBoundary + 16px`;
- `leftBoundary` = `Math.max(42% ширины окна, #blurbs.getBoundingClientRect().right)`; если `#blurbs` нет — правый край `main` / editor около кнопки Add summary;
- узел **не** внутри `#blurbs` и **не** внутри селекторов левого редактора (см. список «Не использовать» выше);
- `getBoundingClientRect()`: ширина ≥ 40px, высота ≥ 8px.

### Вырезка текста Professional Summary (между заголовками секций)

**Конечные заголовки секции** (первое совпадение обрывает текст): `Work Experience`, `Experience`, `Skills`, `Education`, `Projects`.

**Алгоритм `sliceBetween` (тот же в `sliceBetweenSectionLabels` для unit-тестов):**

**Iframe (основной путь live):**

1. Взять `document.body.innerText` iframe `preview-iframe`.
2. Обрезать **до первого** конечного заголовка (`Work Experience`, …) — summary почти всегда в этом префиксе.
3. В префиксе искать стартовые метки **`Professional Summary` / `Objective:`**; если метки нет (частый шаблон) — взять текст **после** contact-блока (linkedin / email) до `Work Experience`.
4. Подзаголовки **`Objective:`** внутри bullet-опыта **игнорировать** (они ниже `Work Experience` или после первого блока experience).

**Legacy main DOM (fallback):**

1. Взять `innerText` / `textContent` корня (в iframe — `document.body`).
2. Найти **первую** из стартовых меток (по порядку): **`Professional Summary`**, **`Objective:`**, **`Objective`** (без учёта регистра для поиска).
3. Взять всё **после** метки до **первого** из конечных заголовков выше.
4. Очистить шум UI: убрать фразы `Add a Professional Summary`, `Delete summary`; схлопнуть пробелы.
5. Успех read-back: длина тела **≥ 40** символов (иначе `source: not_found`).

**Пример содержимого после вырезки:** один или несколько абзацев intro PM (без заголовка Work Experience и без текста Languages, если Languages — отдельная секция ниже по превью).

### Запасные стратегии (если корень по testid пустой)

Порядок в `extractProfessionalSummaryRightPreviewText` (для отладки смотреть поле `source` в возврате):

1. `selector:<корень>` — сработал один из якорей списка выше.
2. `heading-container` — заголовок `Professional Summary` справа, текст в родителе (до 6 уровней вверх).
3. `heading-siblings` — siblings после заголовка до следующей секции (до 12 узлов).
4. `right-block-scan` — `section` / `article` / `div` справа, в тексте есть «professional summary», без contenteditable и Delete внутри.
5. `not_found` — PS12 verify должен retry paste / self-heal (PS1), не подменять левым редактором.

### Заголовок секции на превью (для ui-learn)

- **Селектор кандидатов:** `h1, h2, h3, h4, h5, h6, p, div, span, strong` **справа** от `leftBoundary`.
- **Текст узла:** `^professional summary$` или `^objective:?$` (регистронезависимо), либо короткая строка (≤ 28 символов) с `professional summary` / `objective`.
- **Пример (live):** «Objective:» над абзацем intro в iframe превью.

### Связь с PDF (PS12)

Текст PDF режется отдельно (`professional-summary-verify.cjs` → `extractProfessionalSummaryFromPdfText`): между метками `Professional Summary` и `Work Experience` в сыром тексте экспорта. Правило вырезки **то же по смыслу**, что для правого превью; якорь DOM PDF не нужен.

### Отладка при падении PS12

- В логе step 10 / verify смотреть `meta.professional_summary_verify.preview.source` и `reason`.
- Если `not_found` при живом превью — запустить `node .scripts/job-search/teal/inspect-right-preview-testids.cjs --resume-id <uuid>`, проверить iframe и метку секции; обновить **`PS_PREVIEW_*`** в `professional-summary-right-preview.cjs` и этот раздел **вместе**.
- **Не** чинить PS12 селекторами Languages / Projects — они другая секция резюме.

## Resume Preview — Work Experience и прочие секции (превью)

- **Блок:** Отдельная запись опыта (одна роль в резюме)
 - **Селектор:** _(заполнить общую модель)_
 - **Пример содержимого:** _(одна роль)_
- **Блок:** Заголовок роли (должность)
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Компания
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Период работы
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(одна строка)_
- **Блок:** Список буллетов / достижений
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(1–2 коротких буллета)_

## Resume Matching — сопоставление резюме и вакансии

- **Блок:** Match Score (общий)
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(например, "78% Match")_
- **Блок:** Hard Skills — список
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(2–3 примера навыков)_
- **Блок:** Soft Skills — список
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(2–3 примера навыков)_
- **Блок:** Other / Tools — список
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(2–3 примера)_
- **Блок:** Объяснения / подсказки по улучшению матчинга
 - **Селектор:** _(заполнить)_
 - **Пример содержимого:** _(краткий фрагмент)_

## Статус селекторов и эволюция

- Для устаревших селекторов добавлять пометку:
 - **Статус:** устаревший с YYYY-MM-DD, не использовать в новых скриптах.
- Для новых селекторов:
 - Кратко фиксировать, **почему выбран именно этот локатор** (например, устойчивый `data-testid`, стабильный aria‑лейбл).

Этот файл не хранит полные тексты вакансий или резюме, только минимальные фрагменты, необходимые для понимания структуры.

