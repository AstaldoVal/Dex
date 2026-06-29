# PRD: Teal Block Layer

**Статус:** v1 в работе (каркас + registry)  
**Владелец:** Dex job-search engineering  
**Цель:** любой `resumeId`, все блоки Teal, все поверхности (preview + matcher + export PDF), единый контракт и eval.

---

## 1. Принципы (согласовано)

1. **Capability, не «магия»:** `supported: true|false` из registry + последний `teal-ui-learn` + последний block eval.
2. **Self-heal:** при `supported: false` → discover (`teal-ui-learn`) → fix registry → re-eval → retry apply (как MCP health-check).
3. **Один lifecycle на блок:** `find` → `ensureVisible` → `expand` → `extract` → `apply` → `verify` → (+ `heal` на уровне orchestrator).
4. **Обязательные примитивы runtime:** `waitStable`, `dismissOverlays`, `domFallback`, `selectorVersion` (hash из ui-learn).
5. **`removeMode` в registry:** `uncheck` | `deleteChip` | `deleteSection` — разная семантика Teal.
6. **`verifySurface`:** `page` | `pdf` | `both` — target title, contact, certifications часто только PDF.
7. **Reorder v1:** да, особенно **skills** (категории + drag); не откладывать в deferred без явного `supported: false` в registry.
8. **Scope v1:** сразу **preview + matcher + exportPdf** (не только step 10).

---

## 2. Универсальность резюме

- Пайплайн принимает **`resumeId`** и открывает `https://app.tealhq.com/resume-builder/resumes/{resumeId}/preview` (или matching).
- **Smoke / CI:** опциональный `--resume-id` для прогона block-check; дефолт в registry — эталон для регрессии, **не** единственное резюме в проде.
- Asenium (`98a9852c-…`) — пример отладки, не архитектурное ограничение.

---

## 3. Контракт `BaseTealBlock`

| Метод | Назначение |
|-------|------------|
| `find(page)` | Блок есть на текущей surface |
| `ensureVisible(page)` | scroll + expand section |
| `extract(page)` | JSON snapshot (schema в registry) |
| `apply(page, intent)` | мутации по intent (toggle, add, remove, reorder, editText) |
| `verify(page, expected)` | read-back на page |
| `verifyPdf?(pdfPath, expected)` | если `verifySurface` включает pdf |
| `capabilities()` | какие ops реально поддерживаются |
| `selectorVersion()` | hash якорей (сравнение с ui-learn) |

**Runtime prelude (все блоки):** `dismissOverlays` → `waitStable` после тяжёлых mutate.

---

## 4. Реестр блоков (v1 — все секции Content Editor)

| block_id | Якорь | legacyModule | reorder v1 |
|----------|-------|--------------|------------|
| `preview.contactHeader` | Contact / header fields | `teal-set-contact-links.cjs` | — |
| `preview.targetTitles` | `#target-titles` | `teal-target-title.cjs`, match-score | — |
| `preview.professionalSummary` | Add Professional Summary | `teal-paste-professional-summary.cjs` | — |
| `preview.blurbs` | `#blurbs` | `teal-resume-sections.cjs` | — |
| `preview.workExperience` | `#work-experience` + company/position/achievement | `teal-resume-experience.cjs` | — |
| `preview.projects` | `#projects` + Project rows | `teal-exclude-projects.cjs` | — |
| `preview.skills` | `#skills` + resume-tags | `teal-resume-skills.cjs` | **да** |
| `preview.certifications` | `#certifications` | `teal-sync-certifications.cjs` | — |
| `preview.education` | TBD (ui-learn) | — | — |
| `preview.interests` | `#interests` | `teal-resume-interests.cjs` | chip reorder TBD |
| `matcher.rightCol` | `#right-col` | `teal-resume-match-score.cjs` | — |
| `matcher.jobSearch` | `#job-search-input` | match-score | — |
| `export.pdf` | Export PDF menu | `teal-export-resume-pdf.cjs` | — |

**Вложенность work experience:** под-блоки `preview.workExperience.company` | `.position` | `.achievement` — тот же контракт, родитель координирует.

---

## 5. Eval

- `step-10-eval.cjs` → модули `teal/eval/blocks/<blockId>.cjs`, каждый использует **тот же `extract`**, что apply.
- Новые проверки v1: `professionalSummary`, `blurbs`, `certifications` (page + pdf), `projects`, `education` (после discover).

---

## 6. Capability CLI

```bash
npm run job-search:teal-blocks-check -- --resume-id <uuid>
```

Пишет `00-Inbox/Job_Search/teal/teal-block-capabilities.json`:

```json
{
  "preview.skills": {
    "supported": true,
    "lastCheck": "2026-05-25T…",
    "ops": { "find": true, "extract": true, "reorderCategory": true, … },
    "selectorVersion": "abc123"
  }
}
```

Агент на вопрос «умеешь skills?» читает этот файл + registry.

---

## 7. Фазы миграции

| Фаза | Содержание |
|------|------------|
| **0** (сейчас) | registry YAML, PRD, `base-teal-block`, `teal-block-capability-check`, capabilities JSON |
| **1** | `SkillsBlock` + eval; перенос reorder/drag; фасад `teal-resume-skills.cjs` |
| **2** | `WorkExperienceBlock` (+ achievement); фасад experience |
| **3** | interests, summary, blurbs, target titles, projects, certifications, contact |
| **4** | `MatcherBlock`, `ExportPdfBlock`; match-score / finalize через block-layer |
| **5** | education после ui-learn; interests chip reorder; registry 100% `supported: true` на smoke resume |

---

## 8. Reorder (skills) — технические требования v1

- Ops: `reorderCategoryFirst`, `reorderCategoryAfter`, `dragCategoryAbove`, `dragChipWithinCategory` (если Teal поддерживает).
- После каждого drag: **`waitStable`** (DOM settle), verify порядок через `getCategoryOrder`.
- При timeout: **`domFallback`** (evaluate drag events), затем heal-retry (max N).
- Eval: порядок категорий сравнивается с `feedback.apply.skills_reorder` / plan hints.

---

## 9. Критерий готовности v1

- На любом `resumeId` step 10 вызывает block-layer, не разрозненные copy-paste селекторы.
- `teal-blocks-check` → все блоки preview `supported: true` на smoke resume (или явный fail + auto ui-learn в CI).
- Вопрос «блок X?» → ответ из capabilities.json; при false агент запускает discover, не manual Teal.

---

## 10. Block-structured feedback (Claude Code step 9)

| Artifact | Role |
|----------|------|
| `teal/feedback-block-rules.yaml` | Per-block allowed ops → apply vs deferred |
| `resume-feedback-blocks.cjs` | `blocks[]` → `apply` + `deferred_v1` + `meta.feedback_coverage` |
| `cowork-review-prompt.template.md` | Claude writes `blocks` first; pipeline normalizes |

**Coverage metric:** `meta.feedback_coverage.coverage_pct` = apply_actions / total_actions. Step 9 eval copies it to `step-9-eval.json` → `feedback_coverage`.

**Goal:** shrink deferred share resume-by-resume; unsupported ops always land in `deferred_v1.other` with reason.
