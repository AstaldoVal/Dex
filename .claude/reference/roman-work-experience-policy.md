# Roman: опыт вне автоматизации резюме

Источник: `00-Inbox/Job_Search/teal/roman-work-experience-policy.json`

## Правило (список exclude)

Записи в `exclude_from_resume_automation` **никогда** не включаются на резюме скриптами full-flow, step 10 apply и Cowork. Roman может включить позицию **только вручную** в Teal.

## Текущие кейсы exclude

- **mindera_technical_po_sep2025_jan2026** — Mindera, Technical Product Owner, Full-time, Portugal (Remote), Sep 2025 – Jan 2026

## Хронология (chronology_cutoff)

- **cutoff_after_route4me_lead_pm** — якорь: **Route4Me**, роль **Lead Product Manager** (не plain Product Manager).
- **По умолчанию ON** только позиции **новее** якоря в порядке редактора Teal (`flattenExperiencePositions`: меньший `editorIndex` = выше на резюме).
- **OFF по умолчанию:** якорь и все позиции с индексом **≥** якоря (старее на резюме).
- **Claude Code override (step 9 pass):** `chronology_override: true` на строке apply или на action в blocks; в reason step 9 описать, какую старую позицию включили и зачем.
- **Apply inject:** не перетирать только строки с `chronology_override: true`; иначе принудительно OFF для якоря и старее (включая случайный `role_included: true` без override).
- **Roman вручную:** старые роли можно включить только в UI Teal, не через автоматизацию без override.

## Кириллица в буллетах (english_resume_rules)

- **`cyrillic_bullets_off: true`** — на английском резюме любой achievement-буллет с кириллицей в тексте должен быть **OFF** в автоматизации.
- **Claude override (редко):** `cyrillic_override: true` на bullet action; в reason step 9 — зачем оставили русский буллет.
- **Apply inject:** `injectCyrillicBulletsOffIntoFeedback` после policy и chronology; не перетирает буллет с `cyrillic_override: true`.

## Eval

- **Step 9 (WE18):** `validatePolicyResumeExcludes` — fail, если Cowork включает exclude-роль.
- **Step 9 (WE19):** `validateChronologyCutoff` — fail, если Cowork включает якорь/старее без override.
- **Step 9 (WE20):** `validateNoCyrillicBulletsEnabled` — fail, если Cowork включает кириллический буллет без `cyrillic_override`.
- **Step 10:** `verifyPolicyRolesOffResume` + `verifyChronologyCutoffOnExtract` + `verifyCyrillicBulletsOffOnExtract`.
- **Apply:** `injectPolicyExcludesIntoFeedback`, затем `injectChronologyCutoffIntoFeedback`, затем `injectCyrillicBulletsOffIntoFeedback` (extract из пакета или со страницы); `excludePolicyRolesOnPreview` + `excludeChronologyCutoffOnPreview` + `excludeCyrillicBulletsOnPreview`.
- **Unit:** `npm run job-search:test-teal-resume-experience-policy`, `npm run job-search:test-teal-resume-experience-chronology-cutoff`, `npm run job-search:test-teal-resume-experience-cyrillic-bullets`; gates **WE18**, **WE19**, **WE20** в `npm run job-search:test-work-experience-gates`.

Добавить exclude-кейс: новая запись в JSON. Смена якоря: правка `chronology_cutoff` + прогон тестов выше.
