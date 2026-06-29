# PM-скиллы из внешних репозиториев

Установлены копированием в `.claude/skills/`. Исходные репозитории лежат в `06-Resources/External/` для обновления.

---

## alirezarezvani/claude-skills (product-team)

**Репозиторий:** https://github.com/alirezarezvani/claude-skills  
**Локально:** `06-Resources/External/claude-skills`

Установленные скиллы (5):

- **product-manager-toolkit** — RICE prioritizer, customer interview analyzer, PRD templates, discovery frameworks, metrics. Python: `scripts/rice_prioritizer.py`, `scripts/customer_interview_analyzer.py`.
- **agile-product-owner** — User story generator (INVEST), sprint planner, epic breakdown, velocity. Python: `scripts/user_story_generator.py`.
- **product-strategist** — OKR cascade, strategy templates, vision, team scaling. Python: `scripts/okr_cascade_generator.py`.
- **ux-researcher-designer** — Persona generator, journey mapper, research synthesizer, usability. Python: `scripts/persona_generator.py`.
- **ui-design-system** — Design tokens, component architecture, responsive, export CSS/JSON. Python: `scripts/design_token_generator.py`.

Вызов: `/product-manager-toolkit`, `/agile-product-owner`, `/product-strategist`, `/ux-researcher-designer`, `/ui-design-system`.

Обновление: `cd 06-Resources/External/claude-skills && git pull`, затем заново скопировать нужные папки из `product-team/` в `.claude/skills/`.

---

## snarktank/ralph

**Репозиторий:** https://github.com/snarktank/ralph  
**Локально:** `06-Resources/External/ralph`

Установленные скиллы (2):

- **ralph-prd** — Генерация PRD в формате для автономного цикла Ralph (детальные user stories под итерации).
- **ralph** — Конвертация markdown PRD в `prd.json` для запуска цикла Ralph.

Вызов: `/ralph-prd`, `/ralph`.

Скрипт автономного цикла (опционально): `06-Resources/External/ralph/ralph.sh` — запускает AI (Amp или Claude Code) итеративно до завершения всех пунктов в `prd.json`. Требует `jq`, git, один из: Amp CLI или Claude Code.

Обновление: `cd 06-Resources/External/ralph && git pull`, затем скопировать `skills/prd` → `.claude/skills/ralph-prd`, `skills/ralph` → `.claude/skills/ralph`.
