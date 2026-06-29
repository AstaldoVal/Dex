# Day sprint — карта skills репозитория

Канон для агента при `/day-sprint` и фазах EXP. Spec и roadmap — **внутри проекта**, не в этом файле.

## Как пользоваться

1. Открыть run дня: `npm run day-sprint:status`
2. По **фазе** EXP выбрать skill из таблицы ниже
3. После шага: `npm run day-sprint:advance -- --exp EXP-001` (или `--to blocked` / `--eval-pass`)
4. Полная карта slash-skills: `.claude/skills/README.md`, PM: `.claude/reference/pm-skills-index.md`

---

## A. Контейнер дня (ритуал + состояние)

| Skill / команда | Когда |
|-----------------|-------|
| `/day-sprint` | Старт/статус/привязка пиков, оркестрация EXP |
| `/daily-plan` | Утро: календарь, задачи, приоритеты → цель дня и слоты EXP |
| `/daily-review` | Вечер: закрытие EXP, метрики, хвосты |
| `/week-plan`, `/week-review` | Недельный контекст, не заменяет дневной спринт |
| `/double-plan` | Стресс-тест плана дня (авто после planning-skills) |
| `thinking-work-os` | Цикл ingest → evaluate → decide → record для решений дня |
| `physical-daily-checkin`, `physical-check-custom` | Готовность перед пиками |
| `session-bootstrap-custom` | Контракт чата + skills |
| Session + `pomodoro:session-log`, `session-pomodoro-mcp` | Пик = один EXP; outcome → `day-sprint outcome` |
| `agent-handoff:*` | Несколько агентов / чатов на разные EXP |
| `cognitive:ultradian-*` | Сетка пиков DEX-RHYTHM |

---

## B. Фаза `spec` (discovery → spec, per-project)

| Skill | Когда |
|-------|-------|
| `brainstorming` (Superpowers) | Неясная идея, границы EXP |
| `product-brief`, `prd-advisor` | Новая фича / продуктовый контур |
| `/prd`, `/tech-spec`, `/architecture` | BMAD: структурированный spec под проект |
| `workflow-init`, `workflow-status` | Статус BMAD-проекта |
| `solutioning-gate-check` | Gate перед реализацией |
| `anthropic-doc-coauthoring` | Совместная правка spec-дока |
| `evidence-gate` | Факты vs пробелы в spec |
| `idea-evaluation-custom` | Отсечь лишние EXP |
| `prioritization`, `roadmap`, `feature-decision` | Выбор что в today vs defer |
| `project-health` | Активные проекты → кандидаты в EXP |
| `context-manager` | Context pack перед spec |
| `pm-diagrams` | Journey / flow в spec |
| Skills_library/pm/* (deanpeters, alirezarezvani, …) | Глубокий PM-разбор по `.claude/reference/pm-skills-index.md` |

**Артеfact spec:** путь задаётся в EXP (`--spec`), обычно `{project}/.sdlc/specs/...` — создаётся по ходу проекта.

---

## C. Фаза `tasks` (разбиение)

| Skill | Когда |
|-------|-------|
| `/sprint-planning`, `/create-story` | BMAD: stories под проект |
| `writing-plans` (Superpowers) | План шагов без полного BMAD |
| `prd-to-linear` | Тикеты в Linear из spec |
| Work MCP `create_task` | Задачи в Dex + Linear sync |

---

## D. Фаза `implement` (код / автomation)

| Skill | Когда |
|-------|-------|
| `/dev-story` | BMAD story → код |
| `executing-plans`, `subagent-driven-development` | Многошаговый план |
| `dispatching-parallel-agents` | Независимые подзадачи |
| `using-git-worktrees` | Изоляция EXP |
| `karpathy-guidelines` + `dex-coding-skills-gate` | Дисциплина правок |
| `test-driven-development` | Новая логика / регрессии |
| `anthropic-frontend-design`, `anthropic-webapp-testing` | UI |
| `anthropic-mcp-builder`, `/create-mcp` | Новые интеграции |
| `.claude/skills/task-bundles/engineering` | Router инженерных skills |

**Job search (отдельный pillar, night shift):** `full-flow`, `job-digest`, `teal-*`, `job-summary` — EXP с `night_shift: true`.

**Banda / integrations:** task-bundles `banda_google`, `integrations`.

---

## E. Фаза `eval` (автопроверки)

| Skill / инструмент | Когда |
|--------------------|-------|
| `verification-before-completion` | Перед сменой фазы |
| `npm run dex:eval-chat-response` | Ответы агента Roman |
| `solutioning-gate-check` | BMAD gate |
| `scan-skill-injection` | Новые skills |
| Job-search gates (`.scripts/job-search/*-gates.cjs`) | **Образец** phase-eval для кода |
| `systematic-debugging` | Eval fail → fix loop |
| `ai-stats` | Стоимость/качество API за день |

После pass: `npm run day-sprint:advance -- --exp EXP-001 --eval-pass`  
После fail: `advance --to implement` (retry) или `--to blocked`

---

## F. Фаза `human_review` (Roman)

| Skill | Когда |
|-------|-------|
| `requesting-code-review`, `receiving-code-review` | PR / diff |
| `finishing-a-development-branch` | Merge / cleanup |
| `save-insight`, `dex-improve` | Уроки в vault |
| `/speak` | Озвучить итог дня |

---

## G. Superpowers — сквозной минимум

Для любого EXP с кодом: `using-superpowers` → по фазе из таблиц B–E → `verification-before-completion`.

Playbook: `.claude/reference/superpowers-operational-playbook.md`

---

## H. Не тащить в дневной спринт по умолчанию

Career/job-only без кода (`cover-letter`, `linkedin-posting`, …), чистый research (`web-research`, `ai-digest`), личные ops (`get-invoices`, `mia-events`) — отдельные EXP только если явно в goal дня.

---

## CLI (инфраструктура)

```bash
npm run day-sprint:init -- --goal "…"
npm run day-sprint:add -- --title "…" [--project 04-Projects/…] [--night]
npm run day-sprint:bind -- --exp EXP-001 --peak 1
npm run day-sprint:advance -- --exp EXP-001
npm run day-sprint:phase-eval -- --exp EXP-001
npm run day-sprint:night-shift
npm run day-sprint:bind-session
npm run day-sprint:outcome -- --exp EXP-001 --text "…"
npm run day-sprint:status
```

Состояние: `System/Daily_Sprint/runs/YYYY-MM-DD.json`  
Конфиг фаз + night_shift + phase_eval: `System/Daily_Sprint/config.json`  
Hook phase-eval: `.cursor/hooks/day-sprint-phase-eval.cjs` (перезапуск Cursor после изменения `.cursor/hooks.json`)
