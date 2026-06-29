---
name: teal-resume
description: Create a Teal resume copy for a job — detect type (iGaming vs AI/other), duplicate the right template, rename to job title. Run with /teal-resume; provide job title and optionally job description or link.
---

# Teal: резюме под вакансию

**Команда:** `/teal-resume`

По вакансии: определяем тип (iGaming/Compliance или AI/прочее), выбираем эталонное резюме в Teal, копируем его и переименовываем в название вакансии. Адаптация summary — позже.

## Когда вызывать

Пользователь просит создать или подготовить резюме под вакансию (под конкретную компанию/роль), или «скопировать резюме под эту вакансию».

## Что делать

1. **Входные данные:** название вакансии (обязательно) и по возможности описание (для точного определения типа). Если пользователь дал только ссылку на вакансию — при необходимости достать title/description (например из дайджеста или сохранённого JSON в `00-Inbox/Job_Search/data/`).
2. **Запуск:** из корня репо:
   ```bash
   npm run job-search:teal-resume -- --job-title "<название вакансии>" [--job-description "<текст описания>" | --job-description-file <путь к файлу>]
   ```
   Если описание есть в файле (например сохранённая вакансия из Teal или дайджеста), передать `--job-description-file`.
3. **Результат:** скрипт выводит тип (igaming/ai), какой шаблон выбран, и ссылку на созданную копию резюме в Teal. Написать пользователю, что резюме создано и как оно названо; при необходимости дать ссылку на preview.

## Эталоны

- iGaming/Compliance: шаблон в Teal (ID в скрипте).
- AI и прочее: второй шаблон в Teal.

См. `.claude/reference/teal-resume-for-job.md`.

## Сохранение в Applied (match-score 80–100%)

Скрипт **match-score** (`teal-resume-match-score.cjs`): когда матч-скор по резюме достигает 80–100%, автоматически:

1. Нажимает кнопку **Export PDF** в Teal (при необходимости — пункт меню).
2. Создаёт папку `Applied/<Название компании>/` (путь по умолчанию: `~/Documents/Applied` или `APPLIED_BASE`).
3. Сохраняет в папку:
   - **резюме в PDF:** `Roman Matsukatov - CV.pdf`;
   - **cover letter:** `Roman Matsukatov - Cover Letter.docx` (копия из `00-Inbox/Job_Search/cover_letters/` по названию компании).

Имена файлов фиксированные.

**Если в логе «No cover letter found»:** скрипт не умеет вызывать скилл /cover-letter (это команда чата). Ты (ассистент) должен сразу предложить создать письмо здесь: «Создаю cover letter по скиллу /cover-letter. Вставь описание вакансии (или ссылку) — сохраню в cover_letters и подскажу, как скопировать в Applied/<Company>.» Затем выполнить /cover-letter (CV, confirmed facts, формат), сохранить .docx в `00-Inbox/Job_Search/cover_letters/Cover_Letter_{Company}_{Role}.docx`, и напомнить скопировать в папку Applied или перезапустить экспорт. Папка компании создаётся по названию компании из вакансии (безопасное имя для пути).

## Требования

Chrome закрыт перед запуском. Используется тот же профиль Chrome, что и для Teal Job Tracker (логин в Teal уже должен быть выполнен).
