# Job digest: отладка сбора описаний вакансий (LinkedIn)

Если скрипт сбора описаний возвращает «no description» для всех или части вакансий, не предлагать ручную работу. Вместо этого — отладка и доработка автоматизации.

## 1. Сохранить HTML одной страницы вакансии

```bash
node .scripts/job-search/fetch-job-descriptions-playwright.cjs 00-Inbox/Job_Search/linkedin-jobs-YYYY-MM-DD.md --debug
```

- Откроется браузер, загрузится первая вакансия, через ~5 с HTML сохранится в `00-Inbox/Job_Search/debug-linkedin-job-page.html`.
- Сессия та же, что у фильтра (`.playwright-linkedin`). Если истекла — сначала: `npm run job-search:linkedin-login`.

## 2. Найти в HTML блок с описанием

**Канонические селекторы LinkedIn (2025–2026):**
- Полное описание вакансии — внутри `[data-testid="expandable-text-box"]`.
- Чтобы получить полный текст, нужно нажать кнопку «… more»: `[data-testid="expandable-text-button"]`, затем читать текст из `expandable-text-box`.
- Заголовок блока: `h2` с текстом "About the job".

Если структура изменилась: открыть `debug-linkedin-job-page.html`, искать по тексту («Responsibilities», «About the role») или по `data-testid`, `class*="description"`, JSON-LD.

## 3. Обновить скрипт

В `.scripts/job-search/fetch-job-descriptions-playwright.cjs`:

- Добавить рабочий селектор в массив `descriptionSelectors` или в fallback через `page.evaluate`.
- При необходимости увеличить ожидание после загрузки (например `PAGE_WAIT_NETWORK_MS`) или добавить `page.waitForSelector(новый_селектор, { timeout: 10000 })` перед извлечением текста.
- Если описание приходит только в JSON: доработать блок «Fallback: extract from page HTML», парся нужное поле из script/JSON.

## 4. Проверка на малой выборке

```bash
node .scripts/job-search/fetch-job-descriptions-playwright.cjs 00-Inbox/Job_Search/linkedin-jobs-YYYY-MM-DD.md --limit=3
```

- В `00-Inbox/Job_Search/job-descriptions-YYYY-MM-DD.json` проверить, что у записей есть `job_description` длиной > 100 символов.
- Если да — запустить полный прогон без `--limit`.

## 5. Полный прогон и саммари

- После успешного сбора описаний: скрипт или пайплайн дайджеста должен сам вызывать генерацию саммари (MCP / job-summary) и подставлять их в дайджест. Ручной ввод не предлагать как основной способ.
