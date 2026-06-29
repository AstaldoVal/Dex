# Карта пакетов по `category_id` (стартовые `Read`)

Закрытый enum категорий и смысл каждой — в **`.cursor/rules/dex-task-skill-router.mdc`**. Здесь только **пути для первого раунда `Read`** по задаче (3–10 файлов). Расширяй пакет, если пользователь явно расширил запрос или не хватает контекста.

Формат секции: заголовок уровня 3 с именем категории (пример: `### dex_os`) и маркированный список путей от корня репозитория.

### dex_os

- `CLAUDE.md`
- `.cursor/rules/session-bootstrap-enforcer.mdc`
- `.claude/skills/day-sprint/SKILL.md`
- `.claude/reference/day-sprint-skill-map.md`
- `.claude/skills/dex-update/SKILL.md`
- `.claude/skills/health-check/SKILL.md`
- `System/Chat_logs/README.md`
- `.cursor/rules/dex-root-hygiene.mdc`

### job_search

- `.claude/skills/full-flow/SKILL.md`
- `.claude/skills/full-flow-v2/SKILL.md` (изолированный дубликат для нового UI Teal; state `teal/full-flow-v2/`)
- `.claude/skills/job-digest/SKILL.md`
- `.claude/skills/linkedin-to-teal/SKILL.md`
- `00-Inbox/Job_Search/teal/full-flow-state.md`
- `.claude/reference/job-digest-min-salary.md`
- `.claude/reference/job-digest-high-travel-filter.md`

### career_assets

- `.claude/skills/job-summary/SKILL.md`
- `.claude/skills/cover-letter/SKILL.md`
- `.claude/skills/application-checklist-custom/SKILL.md`
- `.claude/reference/summary-writing-checklist.md`
- `.claude/reference/ai-writing-signs-banned.md`

### meetings

- `.claude/skills/meeting-prep/SKILL.md`
- `.claude/skills/process-meetings/SKILL.md`
- `.claude/reference/meeting-intel.md`

### pm_delivery

- `Skills_library/bmad/bmad-master/SKILL.md`
- `.claude/reference/pm-skills-index.md`
- `.claude/skills/product-brief/SKILL.md`
- `.claude/skills/prd-advisor/SKILL.md`
- `.claude/skills/pm-diagrams/SKILL.md`
- `.claude/commands/bmad/workflow-init.md`
- `04-Projects/Vegas_Bonanza/Experiment_Description_Template.md`
- `.cursor/rules/vegas-bonanza-notion-experiment-card.mdc`
- `.cursor/rules/vegas-bonanza-experiment-readout-conclusion.mdc`
- `04-Projects/Vegas_Bonanza/Experiment_Readout_Conclusion_Guide.md`
- `04-Projects/Vegas_Bonanza/Mixpanel_Experiment_Board_Standard.md`

### engineering

- `.cursor/rules/dex-coding-skills-gate.mdc`
- `.claude/reference/superpowers-guide.md`
- `.claude/skills/karpathy-guidelines/SKILL.md`
- `.cursor/rules/action-first-outcomes.mdc`
- `AGENTS.md`
- `.claude/reference/cursor-team-kit-skills-index.md` (CI/PR/review/smoke — pick one `Skills_library/cursor-team-kit/skills/*/SKILL.md`)

### integrations

- `.claude/reference/mcp-servers.md`
- `.claude/skills/dex-add-mcp/SKILL.md`
- `.claude/skills/mcp-profiles/SKILL.md`
- `.claude/reference/cursor-mcp-debug.md`

### banda_google

- `.cursor/rules/banda-google-drive-content-only.mdc`
- `.cursor/rules/banda-obsidian-structure-drive-sync.mdc`
- `.cursor/rules/banda-presentations-drive-source-of-truth.mdc`
- `04-Projects/Banda/banda-drive-import/2. Banda Presentations Bundle/README.md`
- `.claude/skills/banda-google-slides/SKILL.md`
- `.claude/reference/banda-presentation-eval.md`

### vault_obsidian

- `.claude/skills/dex-obsidian-setup/SKILL.md`
- `06-Resources/Dex_System/Folder_Structure.md`
- `.cursor/rules/search-routing.mdc`
- `.cursor/rules/dex-plain-language-structure.mdc`

### writing_public

- `.claude/reference/ai-writing-signs-banned.md`
- `.claude/skills/linkedin-posting/SKILL.md`
- `.claude/skills/substack-post-checklist/SKILL.md`
- `.claude/skills/one-percent-ai-substack/SKILL.md`

### research

- `.claude/skills/web-research/SKILL.md`
- `.claude/reference/research-search-mcp.md`

### personal_ops

- `.claude/skills/physical-daily-checkin/SKILL.md`
- `.claude/skills/physical-check-custom/SKILL.md`
- `.claude/skills/get-invoices/SKILL.md`
- `.cursor/rules/apple-health-export-routing.mdc`

### security_offensive

- `.claude/reference/forbidden-tools.md`
- `CLAUDE.md` (раздел Forbidden tools)
- Редкий добор: при необходимости пользователь явно подключает тяжёлые скиллы из **`~/.cursor/skills`** (не индексируются этим файлом).

### cloud_vendor_sdk

- `.claude/skills/anthropic-mcp-builder/SKILL.md`
- `.claude/skills/create-mcp/SKILL.md`
- `.claude/skills/integrate-mcp/SKILL.md`
- Редкий добор: SDK-энциклопедии из **`~/.cursor/skills`** по явному запросу.

### data_ml_academic

- `Skills_library/pm/deanpeters/discovery-process/SKILL.md`
- `Skills_library/pm/deanpeters/prd-development/SKILL.md`
- `.claude/skills/evidence-gate/SKILL.md`
- `.claude/skills/pestel-analysis/SKILL.md`
- Редкий добор: академические / LaTeX-скиллы из **`~/.cursor/skills`** по явному запросу.

### misc

- `.claude/skills/pm-skills/SKILL.md`
- `.claude/reference/superpowers-operational-playbook.md`
- `.claude/reference/superpowers-smoke-checklist.md`
