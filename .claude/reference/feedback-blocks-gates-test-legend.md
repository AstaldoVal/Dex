# Feedback block gates — покрытие тестами (легенда)

Используй **только эти четыре символа** в таблицах покрытия для Roman. Без подписей вроде «unit», «DOM», «apply» в ячейке — нюанс в колонке «Что проверяет live» или в отдельной колонке «Live-режим».

| Символ | Уровень | npm / скрипт |
|--------|---------|----------------|
| ✅ U | Unit (маршрутизация blocks → apply/deferred, yaml) | `job-search:test-*-gates` |
| ✅ E | E2e sim (pipeline из нескольких ops в одном feedback) | `job-search:test-*-gates-e2e` |
| 🟦 LA | **Live Aggregate** — один Chrome-сессия, все gate кроме отдельных отчётов LD | `job-search:test-feedback-blocks-gates-live` (`FEEDBACK_BLOCKS_E2E_LIVE`) |
| 🟪 LD | **Live Dedicated** — тот же `runLiveGateCheck`, отдельный отчёт `teal/<block>-gates-live/latest.json` | `job-search:test-*-gates-live` (свой `*_E2E_LIVE`) |

## Что такое LA vs LD

- **LA (Live Aggregate):** один прогон `test-feedback-blocks-gates-live-teal.cjs` — Target Title, Professional Summary, Contact, WE, WB, SK, … в одной сессии Teal. Отчёт: `teal/feedback-blocks-gates-live/latest.json`.
- **LD (Live Dedicated):** отдельный npm-скрипт на блок (например `test-skills-gates-live`) — те же проверки gate, но свой env (`SKILLS_E2E_LIVE`) и свой каталог отчёта. Нужен, когда отлаживаешь один блок без полного aggregate.

**Не использовать** «LD sim» — такого уровня нет. Раньше «sim» путали с gate, которые на live только прогоняют **unit** без DOM (`runPureOnLive`). Это по-прежнему **🟦 LA**, режим **routing-only** (см. колонку Live-режим).

## Live-режимы (колонка для таблиц, не отдельные иконки)

| Live-режим | Смысл |
|------------|--------|
| routing-only | На live: unit-тест маршрутизации + сессия Teal открыта; DOM apply не делаем |
| section-present | Секция на preview есть (`#skills`, `#work-experience`, …) + routing unit |
| dom-apply | Реальный apply в Teal (CH1 omit, WE toggle, PS1 paste, T1 enable, …) |
| dom-read | Чтение DOM без изменения (WB4 order read, WE9 chronology) |

## Professional Summary на live

- **dom-apply / dom-read:** PS12 (текст справа), PS1 (self-heal paste), PS14 (кнопки Delete в редакторе).
- **routing-only:** PS2–PS11, PS13, PS15 — валидаторы step 9/10 без браузерного paste в этом gate.
- **REGEN-1…4:** симулятор regen (нет Teal), в aggregate и LD PS — **routing-only** на открытой сессии.

Формулировка для чата: «PS12 и PS1 на live проверяют реальный текст в Teal; остальные PS-gate на live — только правила маршрутизации; REGEN — чистая симуляция без UI».

## Work experience: метаданные позиции (WE10–WE19)

- **WE10** — dom-read: канон текста Location (`Lisbon, Portugal` | `Kyiv, Ukraine` | `Remote`).
- **WE17** — dom-apply: `ensureCanonicalLocationTextOnPage` на live aggregate — **before/after** extract + canonical eval (`beforeErrors`, `patched`, `after=pass`).
- **WE18** — unit: `00-Inbox/Job_Search/teal/roman-work-experience-policy.json` — опыт **не на резюме** в автоматизации (сейчас Mindera Technical PO, Sep 2025–Jan 2026). Step 9: Cowork не должен включать; apply: `injectPolicyExcludesIntoFeedback`; step 10: `verifyPolicyRolesOffResume` + `excludePolicyRolesOnPreview`. Включить только вручную в Teal.
- **WE19** — unit: `chronology_cutoff` в том же JSON — на резюме по умолчанию только позиции **новее** Route4Me **Lead Product Manager**; якорь и всё старее OFF. Step 9: `validateChronologyCutoff` (pass только с `chronology_override` на action/строке); apply: `injectChronologyCutoffIntoFeedback` после WE18 (не затирает явный ON в apply); step 10: `verifyChronologyCutoffOnExtract`. Override в step-9 reason обязателен, если старую позицию включили намеренно.
- **WE20** — unit: `english_resume_rules.cyrillic_bullets_off` в `roman-work-experience-policy.json` — на **английском** резюме achievement-буллеты с **кириллицей** в тексте должны быть **выключены** (unchecked). Step 9: `validateNoCyrillicBulletsEnabled`; apply: `injectCyrillicBulletsOffIntoFeedback` после chronology; step 10: `verifyCyrillicBulletsOffOnExtract` + `excludeCyrillicBulletsOnPreview`. Редко: `cyrillic_override: true` на bullet action + reason в step 9.
- **WE11–WE14** — dom-apply: после `ensureWorkExperienceMetadataIncluded` все галочки Remote / Contractor / dates / Location **ON**, если поле есть (галочки, не правка текста дат).
- **WE13** — это **включение периода на резюме**, не op `editDates` (WE5 deferred).
- **WE15** — галочка роли (position header) ON на каждой позиции.
- **WE16** — unit + **✅ E** (`simulateWorkExperienceMetadataPipeline`: `dates_match` + canonical + inclusion + ensure sim).
- **WE10–WE15** — unit + **✅ E** (тот же metadata pipeline; не только повтор unit в `test-work-experience-gates-e2e.cjs`).
- Step 10: `teal/blocks/work-experience.cjs` всегда вызывает `ensureWorkExperienceMetadataIncluded` после apply rows.
- E2E sim: `simulateWorkExperiencePipeline` (WE1–4) + `simulateWorkExperienceMetadataPipeline` (WE10–16).

## Bullets (WB1–WB99)

- **WB3** — alias `deleteBullet` (скрыть bullet).
- **WB6** — `disableBullet` на блоке bullets; **live aggregate** — DOM: achievement checkbox on→off→on (как WE3, тот же чекбокс).
- **WB7** — `moveBullet` → deferred.
- **WB99** — novel → `askUser` deferred.

**WE3 vs WB6:** один и тот же чекбокс achievement в Teal; на live оба проверяют **aria-checked** через `readAchievementBulletDomState`. **WE3** — `toggleBullet` в `preview.workExperience`. **WB6** — `disableBullet` в `preview.workExperience.bullets`.

**Novel / skip (99):** **PS99**, **WE99**, **CH99**, **WB99** — op `askUser` + `edge_id` → `deferred_v1.other`; unit + live **routing-only** (`runPureOnLive` / `runPureGateOnLiveSession`).

## Contact (CH99)

- **CH99** — `askUser` + `CH99_novel_uncatalogued` для контакта вне CH1–CH2.

Счёт gate в aggregate live: **116** (13 блоков; Skills SK1–SK20 + SK99; дубль SK18 в порядке aggregate убран).

## Тестовое резюме Skills (608d…) — тысячи summary

Если в Teal **>80** пунктов Professional Summary, PS12/PS1 на live падают; preflight-удаление идёт по одному с подтверждением модалки (долго).

1. Массовая очистка: `npm run job-search:teal-delete-first-summary -- <resumeId> 500` (повторять; harness + подтверждение «Delete on ALL resumes»).
2. Быстрый LA без prune (PS могут fail): `FEEDBACK_BLOCKS_SKIP_PS_PREFLIGHT=1 FEEDBACK_BLOCKS_E2E_LIVE=force npm run job-search:test-feedback-blocks-gates-live`.
3. Жёсткий стоп: `FEEDBACK_BLOCKS_PS_FAIL_IF_ABOVE=1` (по умолчанию abort_above=80).

## Skills (preview.skills) — матрица SK1–SK20 + SK99

- **Чип:** SK1 create · SK2 read (extract) · SK3 update · SK4 deactivate · SK5 activate · SK6 remove (uncheck)
- **Категория:** SK7 create · SK8 read · SK9 update · SK10 deactivate row · SK11 activate row · SK12 delete (deferred)
- **Порядок:** SK13–SK15 reorder
- **Ручное:** SK16 library delete · SK17 merge
- **Дубликаты:** SK19 один блок · SK20 два блока → **сначала deactivate**, потом askUser в чат (не removeSkill)
- **SK21 (step 10 eval):** при `section_reviews[skills].skills_detail` — на снимке после apply только keep из detail; одно включённое имя на skill; канонический блок = первый в `block_order`. Fail в `step-10-eval.json` с префиксом `SK21` / `SK20`. Apply: `pruneSkillsContentToDetail` в step 10 Applicator (и тот же снимок для Teal full-flow).
- **Step 10 eval dedup:** `verifySkillsStep10CanonicalGates` — SK19/SK20/SK21; только чипы **ON** (`included !== false`).
- **SK99** novel → askUser deferred
- **Live dom-apply:** SK1 create+delete library · SK3 editSkill rename+delete · SK4/SK5/SK6 checkbox · SK7 addCategory (+ chip delete) · SK9 category rename round-trip · SK10/SK11 category off/on all chips · SK13 moveCategoryFirst
- **Live routing-only:** SK14/SK15 chip reorder (unit only) · SK12,16,17,99 deferred
- **Live dup e2e (no browser):** SK19/SK20 — `simulateSkillsDuplicateApplyPipeline` → skills_toggle + askUser, без removeSkill
- **Purge:** `purgeDexSkillsLiveProbesFromLibrary` — `Dex SK1` / `Dex SK3` chips; старт SK1/SK3 live
- **Step 10 editSkill:** self-heal в `renameSkillChipInCategoryPlaywright` (то же что live SK3)

### Live Skills: тайминг и watchdog (не «ждать 45 мин»)

- Запуск: `npm run job-search:test-skills-gates-live` → обёртка `run-block-live-watched.cjs` (процесс завершается сам; потолок = сумма бюджетов гейтов + ~8% + 1 мин, см. `npm run job-search:block-live-plan-chat`).
- **На каждый гейт** внутри раннера: `[@gate] START` / `[@gate] END … durationMs=…` и жёсткий лимит из `block-live-gate-budgets.cjs` (SK3 до 6 мин, SK2/SK19 ~1 мин и т.д.).
- **Зависание без вывода:** watchdog убивает дочерний процесс после `BLOCK_LIVE_STALL_MS` (по умолчанию = max stall гейтов, обычно ~150 с).
- **Прогресс:** `00-Inbox/Job_Search/teal/skills-gates-live/progress.json` (`currentGate`, `completed`, `done`). Опрос: `node .scripts/job-search/wait-block-live-progress.cjs --slug skills --once`.
- **Частичный прогон:** `BLOCK_LIVE_GATES=SK4,SK5 npm run job-search:test-skills-gates-live`.
- **Cursor / агент:** `block_until_ms` ≈ `npm run job-search:block-live-total-ms` + 2 мин; shell возвращается **сразу после exit** дочернего процесса, не по таймауту Cursor.

## Live probe hygiene (не засорять каталог Teal)

Синтетические имена только в live-gate, которые **создают** строку в библиотеке — после теста **удалять из library**, не только снять с preview.

| Блок | Gate | Имя probe | Cleanup |
|------|------|-----------|---------|
| Skills | SK1 | `Dex SK1 <unix_ms>` | `deleteSkillFromLibraryBestEffort` + `purgeDexSk1ProbeSkillsFromLibrary` |
| Target titles | T4, T9, T10 | `DEX T4 Probe …`, `DEX T9 Probe …`, `DEX T10 dup …` | `deleteDexTargetTitleProbeFromLibrary` + `purgeDexTargetTitleProbesFromLibrary` (`finally` на T4/T9/T10) |

## Target Title — step 10 (T14)

- **T14** — unit + **step-10-eval**: при `meta.job_title` / `context.json` обязательна **отдельная строка** Target Title в шапке PDF (не абзац Professional Summary). Сообщение fail: `target_title: missing or empty`. Срабатывает и когда `apply.target_title.action === skip` (как Opinov8). Live aggregate T1–T13 не заменяют T14.

**Без синтетического create** (только toggle/read существующего резюме): WE1–WE3, WB6, SK4, SK10, CH, PS live, contact — probe не добавляется в каталог.

## Правило для ассистента (чат)

Канон формата ответа: `.cursor/rules/dex-cognitive-load-budget.mdc` (три слоя, мета-команды `вердикт` / `действия` / `разверни`).

**Код gate + название (обязательно в слоях 1–2):** не писать голый **WE18** / **PS12** — сразу по-русски, *что проверяет* (см. строки этого файла про код), затем код. Пример: **WE18** — unit: опыт из `roman-work-experience-policy.json` не должен оказаться на резюме в автоматизации (Mindera Technical PO Sep 2025–Jan 2026); включение только вручную в Teal.

1. В таблице покрытия — ровно четыре символа ✅ U / ✅ E / 🟦 LA / 🟪 LD.
2. Нюанс live — колонка **Live-режим** (`routing-only` | `section-present` | `dom-apply` | `dom-read`).
3. Не смешивать LA и LD в одной ячейке без пояснения: блок может иметь **и** LA **и** LD (одинаковый смысл, разный отчёт).

### Шаблон ответа Roman (статус + FAQ по gate)

**Слой 1 — вердикт (пример формулировок):**

- «Пункты 1–2 и 6 в коде закрыты: live aggregate тянет все gate, у остальных блоков есть отдельный live-скрипт.»
- «Путаница LA sim / LA unit — из‑за смешения уровня покрытия (LA/LD) и режима проверки на странице Teal; отдельного „LD sim“ нет.»

**Слой 2 — действия (пример):**

1. Открыть этот файл — сверить легенду символов и колонку Live-режим.
2. Следующие таблицы покрытия — в LA только 🟦, без подписей DOM/apply в ячейке.
3. Полная таблица 92 gate — только по «разверни» или в `teal/feedback-blocks-gates-live/latest.json`.

**Слой 3 — детали:** пути `.cjs`, `npm run`, таблицы PS12 vs PS2–15, счётчики gate — после слоёв 1–2 или по «разверни».

**Русские подписи для слоёв 1–2 (не смешивать с английским в одной фразе):**

- U → юнит-тест
- E → e2e в симуляции пайплайна
- LA → live aggregate (один прогон)
- LD → live dedicated (один блок)
- routing-only → на live только маршрутизация правил
- dom-apply → правка в интерфейсе Teal

**Eval перед отправкой в чат:** `.cursor/rules/dex-chat-response-eval.mdc`, `npm run dex:eval-chat-response`.
