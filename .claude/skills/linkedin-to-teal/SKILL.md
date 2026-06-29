---
name: linkedin-to-teal
description: Parse LinkedIn job search by URL and add vacancies to Teal in one run. Run with /linkedin-to-teal; paste the search URL in the same message or when asked.
---

# LinkedIn Search → Teal

**Command:** `/linkedin-to-teal`

Один запуск: парсинг вакансий со страницы поиска LinkedIn по ссылке → генерация дайджеста (дедуп Portugal, фильтр не-PM) → добавление в Teal. В конце выводится список добавленных в Teal вакансий.

## Что входит в /linkedin-to-teal

1. **Save server** — поднять сервер сохранения (если не запущен).
2. **Захват поиска LinkedIn** — открыть браузер по URL поиска, расширение Dex захватывает вакансии, сохраняет JSON в `00-Inbox/Job_Search/data/`.
3. **Генерация дайджеста** — из экспорта собрать MD-дайджест: дедуп по Portugal, фильтр не-PM, только PM/PO роли. Файл: `digests/linkedin/search-*.md`.
4. **Добавление в Teal** — скрипт `add-digest-jobs-to-teal-playwright.cjs` добавляет вакансии из дайджеста в Teal Job Tracker.

## Чего нет в /linkedin-to-teal (есть в full-pipeline)

5. **Создание резюме в Teal** — по каждой вакансии из дайджеста создать копию резюме в Teal (teal-resume-batch-from-export). В `/linkedin-to-teal` только добавление вакансий в трекер, резюме не создаются.
6. **Match-score и экспорт** — для каждого резюме: Job Matcher, при score < 80% доработка Professional Summary, добавление Target Title по вакансии, экспорт PDF в `Applied/<Компания>/`, создание/копирование cover letter. В `/linkedin-to-teal` этого нет.

Полный цикл (включая шаги 5–6): `npm run job-search:full-pipeline -- "<URL>"`.

## When You Run This Command

1. **URL в сообщении:** Если пользователь написал ссылку на поиск LinkedIn (например `https://www.linkedin.com/jobs/search/?keywords=...`) в том же сообщении, что и `/linkedin-to-teal`, использовать её.
2. **Без URL:** Если ссылки нет — спросить: «Пришли ссылку на страницу поиска LinkedIn (например senior product manager, remote, last 24h).»
3. **Опция без Teal:** Если пользователь просит только спарсить без добавления в Teal — запустить с флагом `--no-teal`.

## What You Do

1. Извлечь или запросить URL поиска LinkedIn (должен содержать `linkedin.com` и желательно `jobs/search`).
2. Из корня репо выполнить команду с **таймаутом не менее 35 минут** (захват 100–200 вакансий может занять 15–30 мин):
   ```bash
   npm run job-search:linkedin-to-teal -- "<URL>"
   ```
   Если только парсинг без Teal:
   ```bash
   npm run job-search:linkedin-to-teal -- "<URL>" --no-teal
   ```
3. Дождаться завершения (не прерывать по таймауту). При ошибке или таймауте — исправить (например, увеличить таймаут, проверить save server / расширение) и запустить снова, пока не получится успешный результат.
4. Кратко резюмировать: сколько вакансий захвачено, сколько добавлено в Teal; при необходимости процитировать блок «Added to Teal (N):» из вывода.

## Requirements

- Расширение Dex для LinkedIn установлено в Chrome, в `extension-id.txt` указан ID.
- Save server поднимается скриптом автоматически.
- Для добавления в Teal: в `.env` заданы `TEAL_EMAIL` и `TEAL_PASSWORD` (или один раз выполнен вход в Teal с `--setup`).

## Full pipeline (capture → Teal → resumes → summary + target title + export + cover letter)

Одна команда: парсинг по URL → фильтрация → добавление в Teal → создание резюме в Teal → **match-score** (оптимизация summary, добавление Target Title по вакансии, экспорт PDF в `Applied/<Компания>/`, создание или копирование cover letter). При ошибке шаг повторяется до 3 раз.

```bash
npm run job-search:full-pipeline -- "<URL>"
```

Этапы match-score по каждому резюме: Job Matcher → при score < 80% добавление/итерация Professional Summary → добавление нормализованного Target Title → экспорт резюме в PDF → папка Applied с названием компании, cover letter (из vault или автогенерация). На всех этапах скрипт использует полные данные (вакансия, компания, описание) из дайджеста/экспорта.

Лог: `00-Inbox/Job_Search/teal/full-pipeline.log`. Для длительного прогона запускать в фоне (nohup или в отдельном терминале).

## Full flow (8 шагов): команда /full-flow

Полный цикл запускается через **`/full-flow`** (или «Hello»). В конце каждого шага выводится статистика; при результате не 100% скрипт сам повторяет шаг. Логи в терминале: `[Step N] [Вакансии]`, `[Step N] [Дайджест]`, `[Step N] [Описания]`, `[Step N] [Резюме]` и т.д. Подробности: скилл `.claude/skills/full-flow/SKILL.md`.

```bash
npm run job-search:full-flow -- "<URL>"
```

Опция `--no-teal`: остановиться после шага 5. Лог: `00-Inbox/Job_Search/teal/full-flow.log`. Скрипт: `.scripts/job-search/run-full-linkedin-teal-flow.cjs`.

## Reference

- Скрипт: `.scripts/job-search/linkedin-capture-and-teal.cjs`
- Полный пайплайн: `.scripts/job-search/run-full-linkedin-teal-pipeline.cjs`
- Полный flow (8 шагов): `.scripts/job-search/run-full-linkedin-teal-flow.cjs`
- Расширение: `.scripts/job-search/dex-linkedin-extension/`
