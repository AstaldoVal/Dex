# PM Skills (deanpeters/Product-Manager-Skills)

Эти скиллы скопированы из [deanpeters/Product-Manager-Skills](https://github.com/deanpeters/Product-Manager-Skills) (42 фреймворка для PM: компонентные, интерактивные, workflow).

**Источник:** https://github.com/deanpeters/Product-Manager-Skills.git  
**Лицензия оригинала:** CC BY-NC-SA 4.0 (см. LICENSE в репозитории).

## Как обновить

```bash
cd /path/to/Dex
git clone --depth 1 https://github.com/deanpeters/Product-Manager-Skills.git .tmp-pm-skills
for d in .tmp-pm-skills/skills/*/; do name=$(basename "$d"); cp -R "$d" ".claude/skills/$name"; done
rm -rf .tmp-pm-skills
```

## Список скиллов (42)

- **Component (19):** company-research, customer-journey-map, eol-message, epic-hypothesis, finance-metrics-quickref, jobs-to-be-done, pestel-analysis, pol-probe, positioning-statement, press-release, problem-statement, proto-persona, recommendation-canvas, saas-economics-efficiency-metrics, saas-revenue-growth-metrics, storyboard, user-story, user-story-mapping, user-story-splitting
- **Interactive (18):** acquisition-channel-advisor, agent-orchestration-advisor, ai-shaped-readiness-advisor, business-health-diagnostic, context-engineering-advisor, customer-journey-mapping-workshop, discovery-interview-prep, epic-breakdown-advisor, feature-investment-advisor, finance-based-pricing-advisor, lean-ux-canvas, opportunity-solution-tree, pol-probe-advisor, positioning-workshop, prioritization-advisor, problem-framing-canvas, tam-sam-som-calculator, user-story-mapping-workshop, workshop-facilitation
- **Workflow (5):** discovery-process, prd-development, product-strategy-session, roadmap-planning, skill-authoring-workflow
