# Проверка RSS-источников дайджеста

По умолчанию дайджест собирает LinkedIn из почты и **RSS** (Remotive, We Work Remotely, RemoteOK, JobsCollider) — скрипт `fetch-remote-pm-rss.cjs` вызывается из `run-job-digest` после шага парсера писем. Отдельно iGaming/PM: JobsCollider через `job-search` (часто 0 по iGaming-фильтру).

**Флаги источников:** можно запускать только выбранные источники: `npm run job-digest -- --remotive`, `--wwr`, `--remoteok`, `--jobscollider`, `--foorilla`, `--rss` (все RSS без Foorilla). То же для `fetch-remote-pm-rss.cjs`: `node .scripts/job-search/fetch-remote-pm-rss.cjs --remotive --no-merge`.

**RSS-источники в дайджесте (Product/PM, remote):**
- Remotive: https://remotive.com/remote-jobs/feed/product, …/feed/project-management
- We Work Remotely: https://weworkremotely.com/categories/remote-product-jobs.rss
- RemoteOK: https://remoteok.com/remote-jobs.rss
- JobsCollider: https://jobscollider.com/remote-product-jobs.rss, …/remote-project-management-jobs.rss  
  **Важно:** jobscollider.com делает 301 на remotefirstjobs.com, где пути `.rss` и `/api/search-jobs` возвращают 404 (RSS/API не перенесены). В скриптах включён fallback на API: при ответе HTML вместо RSS запрашивается `jobscollider.com/api/search-jobs?category=product|project_management`. Пока на новом домене API не работает — вакансий от JobsCollider 0; когда починят — данные появятся без смены кода.

**Remote First Jobs (remotefirstjobs.com):** отдельного RSS нет. Проверено 2026-02: `/feed`, `/rss`, `/jobs/feed`, `/jobs.rss`, `/jobs/product.rss`, `/remote-jobs.rss`, `/jobs?format=rss` — все 404 или HTML. Есть только email-алерты (Get Job Alerts) и XML-sitemap'ы для поисковиков (`/sitemap_jobs_*.xml`), не подходящие как RSS-фид.

**Foorilla (foorilla.com/hiring/):** RSS нет; используется **scrape** списка вакансий. Скрипт получает сессию с `/hiring/`, запрашивает `/hiring/jobs/` и `/hiring/jobs/?page=2` (только эти две страницы отдаёт API, ~100 вакансий), парсит заголовок и ссылку, фильтрует по Product/PM + product-related (например Associate Product Data Analyst). Поиск по сайту («Senior Product Manager») делается на фронте — сервер игнорирует `?q=`, поэтому в выгрузке только общий хронологический список; PM-ролей в нём мало (обычно 1–3 за запуск).

**Как проверить вручную:**

1. **Открыть фиды в браузере** (например):
   - https://jobscollider.com/remote-product-jobs.rss
   - https://jobscollider.com/remote-project-management-jobs.rss  
   Посмотреть, есть ли в XML теги `<item>` с вакансиями и подходят ли они по тематике (product/PM, remote).

2. **Через curl (терминал):**
   ```bash
   curl -sL "https://jobscollider.com/remote-product-jobs.rss" | head -100
   ```
   Убедиться, что ответ 200 и в теле есть `<item>`, `<title>`, `<link>`.

3. **Запустить только RSS-шаг:**
   ```bash
   npm run job-search
   ```
   Скрипт пишет в `00-Inbox/Job_Search/gaming-pm-jobs-YYYY-MM-DD.md`. Если файл снова с 0 вакансий — фильтр по iGaming (casino, sportsbook, compliance и т.д.) отсекает всё, либо в фиде нет подходящих записей.

Если нужно снова включить RSS в полный дайджест: в `package.json` вернуть в `job-search:all` первым шагом `node .scripts/job-search/fetch-gaming-pm-jobs.cjs &&`.