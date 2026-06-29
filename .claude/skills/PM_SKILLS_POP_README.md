# PM Skills (product-on-purpose/pm-skills)

Скиллы скопированы из [product-on-purpose/pm-skills](https://github.com/product-on-purpose/pm-skills) — 24 PM-скилла по фреймворку Triple Diamond (Discover, Define, Develop, Deliver, Measure, Iterate).

**Источник:** https://github.com/product-on-purpose/pm-skills.git  
**Лицензия:** Apache-2.0 (см. LICENSE в репозитории).

## Как обновить

```bash
cd /path/to/Dex
git clone --depth 1 https://github.com/product-on-purpose/pm-skills.git .tmp-pm-skills-pop
for d in .tmp-pm-skills-pop/skills/*/; do name=$(basename "$d"); cp -R "$d" ".claude/skills/$name"; done
rm -rf .tmp-pm-skills-pop
```

## Список скиллов (24, Triple Diamond)

- **Discover (3):** discover-interview-synthesis, discover-competitive-analysis, discover-stakeholder-summary
- **Define (4):** define-problem-statement, define-hypothesis, define-opportunity-tree, define-jtbd-canvas
- **Develop (4):** develop-solution-brief, develop-spike-summary, develop-adr, develop-design-rationale
- **Deliver (5):** deliver-prd, deliver-user-stories, deliver-edge-cases, deliver-launch-checklist, deliver-release-notes
- **Measure (4):** measure-experiment-design, measure-instrumentation-spec, measure-dashboard-requirements, measure-experiment-results
- **Iterate (4):** iterate-retrospective, iterate-lessons-log, iterate-refinement-notes, iterate-pivot-decision

Полный индекс и категоризация: `.claude/reference/pm-skills-index.md`.
