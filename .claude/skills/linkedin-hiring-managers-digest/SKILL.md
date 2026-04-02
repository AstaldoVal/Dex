---
name: linkedin-hiring-managers-digest
description: Собрать дайджест remote-вакансий со страницы LinkedIn My Network > Grow. Автоматический сбор через расширение Dex (один клик) или ручной список URL + скрипт digest.
---

# LinkedIn Hiring Managers Digest — Remote-вакансии из блока «Hiring»

**Command:** `/linkedin-hiring-managers-digest`

Источник: страница [LinkedIn My Network > Grow](https://www.linkedin.com/mynetwork/grow/) — список хайринг-менеджеров. Расширение Dex автоматически обходит профили, открывает блок «Hiring» → «Show job», в модалке «Open roles» собирает только **Remote** вакансии и сохраняет JSON. Дайджест строится одной командой из этого JSON.

**Ограничение:** На LinkedIn запрещена автоматизация через Playwright (см. `.claude/reference/forbidden-tools.md`). Используется только расширение Dex в реальном браузере пользователя.

---

## Где что искать

1. **Страница списка:** https://www.linkedin.com/mynetwork/grow/
2. **Профиль менеджера:** клик по карточке менеджера открывает его профиль.
3. **Блок «Hiring» на профиле:** секция с заголовком вида `Hiring: Senior Product Manager, Authentication` и подписью компании/локации; внизу ссылка **«Show job»**.
4. **Поп-ап «Open roles»:** по клику на блок/«Show job» открывается модальное окно (`role="dialog"`, заголовок «Open roles»). Внутри — список вакансий (job cards).

### Структура поп-апа (для ручного отбора и для будущего расширения)

- Заголовок модалки: `h2#po-route-modal-header-view` — «Open roles».
- Карточки вакансий: `li.po-view__job-card` или контейнер с `data-job-id`, внутри:
  - Ссылка на вакансию: `a.job-card-container__link` или `a[href^="/jobs/view/"]` — `href` вида `/jobs/view/4331756715/`.
  - Название: текст ссылки (например, «Senior Product Manager, Authentication»).
  - Компания: `.job-card-container__company-name`.
  - Тип работы: элемент с классом `job-card-container__metadata-item--workplace-type` — текст **Remote**, **Hybrid** или **On-site**.

**Правило отбора:** сохраняем в дайджест только вакансии, у которых тип работы **Remote** или не указан (нет явного Hybrid/On-site). Hybrid и On-site не включаем.

---

## Workflow

### Вариант A: Один запуск (агент или пользователь) — рекомендуется

1. Убедиться, что save-server запущен (чтобы экспорт писался в vault): `npm run dex-save-server`. Если порт 8765 занят, сервер уже работает.
2. Запустить **одну команду** (агент выполняет её сам при вызове скилла):

```bash
npm run job-search:hiring-managers-capture
```

Скрипт откроет в Chrome страницу https://www.linkedin.com/mynetwork/grow/, выведет напоминание нажать кнопку. Пользователь нажимает **«Dex: Capture Hiring Managers»** один раз. Расширение обходит профили, собирает только Remote-вакансии и сохраняет JSON. Скрипт ждёт появления файла в `data/` (до 60 мин), затем сам запускает генерацию дайджеста. Digest появляется в `00-Inbox/Job_Search/digests/linkedin/hiring-managers-remote-YYYY-MM-DD.md`.

Если экспорт за сегодня уже есть в `data/`, скрипт сразу строит digest без открытия браузера.

### Вариант B: Ручной список URL + скрипт

Если пользователь вручную собрал ссылки в файл (одна строка на вакансию: URL и опционально через таб/пробелы «Title — Company»):

```bash
node .scripts/job-search/generate-hiring-managers-digest.cjs [path/to/urls.txt]
```

По умолчанию скрипт ищет `data/dex-linkedin-hiring-managers-YYYY-MM-DD.json` или `data/hiring-managers-remote-urls-YYYY-MM-DD.txt`.

---

## Формат дайджеста

- Путь: `00-Inbox/Job_Search/digests/linkedin/hiring-managers-remote-YYYY-MM-DD.md`
- Заголовок: `# LinkedIn Hiring Managers (Remote) — YYYY-MM-DD`
- Подзаголовок: источник и правило отбора (только Remote из поп-апа «Open roles»).
- Список: `- [ ] [Title — Company (remote)](https://www.linkedin.com/jobs/view/...)` — по одной строке на вакансию. Если title/company неизвестны, использовать «View job» и при необходимости обновить после открытия.

Формат совместим с общим pipeline дайджестов (Teal, job-summary и т.д.).

---

## Что делает ассистент при вызове скилла

1. **Автоматически выполнить полный цикл:** запустить `npm run job-search:hiring-managers-capture`. Скрипт откроет Grow в Chrome, будет ждать экспорт от расширения (пользователь один раз нажимает «Dex: Capture Hiring Managers»), затем сам соберёт дайджест и выведет путь к файлу. Проверить, что save-server запущен (`npm run dex-save-server`); при EADDRINUSE сервер уже работает.

2. **Если пользователь прислал список URL (и опционально Title — Company):**
   - Записать строки в `00-Inbox/Job_Search/data/hiring-managers-remote-urls-YYYY-MM-DD.txt`.
   - Запустить `node .scripts/job-search/generate-hiring-managers-digest.cjs [файл]`.
   - Сообщить путь к digest и число вакансий.

3. **Если пользователь просит только инструкцию:** дать краткую памятку по варианту A (Grow → кнопка расширения → digest-скрипт) или B (ручной файл + скрипт).

4. **Не делать:** не использовать Playwright на LinkedIn, не открывать LinkedIn программно вне расширения.
