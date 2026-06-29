# Teal Block Layer

Единый слой Playwright для **любого** `resumeId`: find → scroll → expand → extract → mutate → verify → heal.

**PRD:** [PRD-teal-block-layer.md](./PRD-teal-block-layer.md)  
**Реестр:** [teal-block-registry.yaml](./teal-block-registry.yaml)  
**Проверка capabilities:** `npm run job-search:teal-blocks-check` (из корня DEX)

## Ответ на «знаешь блок X?»

1. Прочитать `teal-block-registry.yaml` + `00-Inbox/Job_Search/teal/teal-block-capabilities.json` (генерируется check-скриптом).
2. Если `supported: false` или `lastEval: fail` → **не** отправлять пользователя в Teal: `npm run job-search:teal-ui-learn` → обновить registry/map → `teal-blocks-check` → повтор apply.

## Универсальность vs Asenium

Авоматизация **не привязана** к одной вакансии. `resumeId` передаётся в URL и в feedback (`meta.resume_id`). Asenium — текущий прогон для отладки; block self-test принимает `--resume-id <uuid>` (по умолчанию эталон из registry `smoke.defaultResumeId`).

## Поверхности (surfaces)

| Surface | URL / вкладка | Назначение |
|---------|----------------|------------|
| `preview` | `.../resumes/{id}/preview` | Content Editor, все блоки резюме |
| `matcher` | `.../resumes/{id}/matching` | Job Matcher, `#right-col` |
| `exportPdf` | preview + Export PDF | PDF snapshot для verify |

## Миграция legacy

**Step 10** идёт через **`teal/teal-resume-orchestrator.cjs`** и **`teal/blocks/*.cjs`**. Старые `teal-resume-*.cjs` остаются движком внутри блоков (`legacyModule` в registry). `teal-apply-deferred-v1.cjs` — тонкий re-export оркестратора.

## Reorder (skills)

В v1 **включён**: перенос **категорий** и чипов (`moveCategoryFirst`, `moveCategoryAfter`, drag) — код уже в `teal-resume-skills.cjs`, переносится в `blocks/skills-block.cjs` с `waitStable` + `domFallback` + eval.

## Feedback: block-structured Claude output

Claude Code (step 9) отдаёт **`feedback.json` → `blocks[]`** (block_id + `op` actions). Правила по блокам: [feedback-block-rules.yaml](./feedback-block-rules.yaml). Нормализатор: [resume-feedback-blocks.cjs](../resume-feedback-blocks.cjs) → **`apply`** + **`deferred_v1`** + **`meta.feedback_coverage`** (доля автоматизируемых actions).

- Промпт: `00-Inbox/Job_Search/teal/schemas/cowork-review-prompt.template.md` + auto-append из `buildBlockRulesPromptSection()`.
- Legacy flat `apply` без `blocks` по-прежнему поддерживается; coverage считается по числу apply vs deferred items.
- Step 9 eval пишет `feedback_coverage` в `step-9-eval.json`.
