---
name: teal-resume-batch
description: Create Teal resumes for all jobs from LinkedIn export (no timeouts). Run with /teal-resume-batch; process runs in background, progress in log file.
---

# Teal: батч резюме по экспорту

**Команда:** `/teal-resume-batch`

Создаёт копии резюме в Teal под все вакансии из экспорта LinkedIn (по одной на вакансию, шаблон — iGaming или AI по описанию). Батч **всегда** запускается в фоне, без таймаутов; прогресс пишется в лог.

## Когда вызывать

Пользователь просит создать резюме в Teal для всех вакансий из дайджеста/экспорта, «батч резюме», «резюме по экспорту» и т.п.

## Что делать

1. **Запуск только через слэш-команду.** По запросу пользователя вызови этот скилл и выполни команду из п.2.
2. **Запуск в фоне** (обязательно — иначе среда может убить процесс по таймауту):
   ```bash
   npm run job-search:teal-resume-batch-background
   ```
   С опциями (если пользователь уточнил):
   - другой экспорт: `npm run job-search:teal-resume-batch-background -- путь/к/export.json`
   - исключить компании: `--exclude Company1,Company2`
   - продолжить с N-й вакансии: `--from N`
3. **Ответ пользователю:** сказать, что батч запущен в фоне; прогресс смотреть так:
   ```bash
   tail -f 00-Inbox/Job_Search/teal/batch-progress.log
   ```

## Экспорт по умолчанию

`00-Inbox/Job_Search/data/dex-linkedin-search-senior-product-manager-2026-02-10.json`  
По умолчанию исключаются компании: Kraken, Toptal.

## Справка

- Скрипт батча: `.scripts/job-search/teal-resume-batch-from-export.cjs`
- Лог прогресса: `00-Inbox/Job_Search/teal/batch-progress.log`
- Один резюме под вакансию: скилл `/teal-resume`
