# PM Skills (pmprompt/claude-plugin-product-management)

Скиллы скопированы из [pmprompt/claude-plugin-product-management](https://github.com/pmprompt/claude-plugin-product-management) — 28 PM-скиллов (PRD, JTBD, Shape Up, OKR, позиционирование, эксперименты, рост, PLG).

**Источник:** https://github.com/pmprompt/claude-plugin-product-management.git  
**Лицензия:** MIT (см. LICENSE в репозитории).  
**Домашняя страница:** https://pmprompt.com/claude-product-management-plugin

В Dex все скиллы установлены с префиксом `pmprompt-`, вызов: `/pmprompt-<имя>`, например `/pmprompt-jobs-to-be-done`, `/pmprompt-shape-up`.

## Как обновить

Из корня vault (Dex):

```bash
VAULT_ROOT="/path/to/your/vault"  # или cd в корень vault
git clone --depth 1 https://github.com/pmprompt/claude-plugin-product-management.git /tmp/pmprompt-pm-plugin
cd /tmp/pmprompt-pm-plugin/skills && for d in */; do name="${d%/}"; mkdir -p "${VAULT_ROOT}/.claude/skills/pmprompt-${name}" && cp -r "$d"* "${VAULT_ROOT}/.claude/skills/pmprompt-${name}/"; done
rm -rf /tmp/pmprompt-pm-plugin
```

## Список скиллов (28)

- **Discovery:** pmprompt-jobs-to-be-done, pmprompt-competitive-analysis-framework, pmprompt-user-feedback-synthesizer
- **Приоритизация и решения:** pmprompt-feature-prioritization-assistant, pmprompt-opportunity-solution-trees, pmprompt-thinking-in-bets
- **Roadmap и планирование:** pmprompt-okrs, pmprompt-shape-up, pmprompt-shaping, pmprompt-breadboarding, pmprompt-design-sprint
- **PRD и артефакты:** pmprompt-prd-writer, pmprompt-working-backwards, pmprompt-stakeholder-update-generator
- **Позиционирование и стратегия:** pmprompt-positioning-canvas, pmprompt-strategic-narrative, pmprompt-seven-powers
- **Валидация и эксперименты:** pmprompt-ab-test-designer, pmprompt-trustworthy-experiments, pmprompt-pmf-survey
- **Метрики и финансы:** pmprompt-monetizing-innovation
- **Рост и product-led growth:** pmprompt-growth-loops, pmprompt-hierarchy-of-engagement, pmprompt-hierarchy-of-marketplaces, pmprompt-hooked-model, pmprompt-product-led-growth, pmprompt-product-led-seo
- **Коммуникация:** pmprompt-radical-candor

Полный индекс и категоризация: `.claude/reference/pm-skills-index.md`.
