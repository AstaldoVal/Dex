#!/usr/bin/env bash
# Один раз: переносит уже установленные PM-скиллы из .claude/skills/ в .claude/skills/pm/<источник>/.
# После переноса вызов скиллов остаётся тем же (/discovery-process, /product-brief и т.д.), если загрузчик скиллов смотрит рекурсивно в .claude/skills/.
# Запуск: из корня vault — ./.scripts/pm-skills-move-to-pm.sh

set -e
VAULT_ROOT="${VAULT_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SKILLS="${VAULT_ROOT}/.claude/skills"
PM="${SKILLS}/pm"

mkdir -p "$PM"/{dex,deanpeters,pop,pmprompt,alirezarezvani,ralph}

# Dex (нативные)
for name in product-brief prioritization roadmap feature-decision project-health customer-intel; do
  [[ -d "$SKILLS/$name" ]] && mv "$SKILLS/$name" "$PM/dex/$name" && echo "moved dex $name"
done

# deanpeters (42)
DEANPETERS="acquisition-channel-advisor agent-orchestration-advisor ai-shaped-readiness-advisor business-health-diagnostic company-research context-engineering-advisor customer-journey-map customer-journey-mapping-workshop discovery-interview-prep discovery-process epic-breakdown-advisor epic-hypothesis eol-message feature-investment-advisor finance-based-pricing-advisor finance-metrics-quickref jobs-to-be-done lean-ux-canvas opportunity-solution-tree pol-probe pol-probe-advisor positioning-statement positioning-workshop press-release prioritization-advisor prd-development problem-framing-canvas problem-statement product-strategy-session proto-persona recommendation-canvas roadmap-planning saas-economics-efficiency-metrics saas-revenue-growth-metrics skill-authoring-workflow storyboard tam-sam-som-calculator user-story user-story-mapping user-story-mapping-workshop user-story-splitting workshop-facilitation"
for name in $DEANPETERS; do
  [[ -d "$SKILLS/$name" ]] && mv "$SKILLS/$name" "$PM/deanpeters/$name" && echo "moved deanpeters $name"
done

# pop (24)
POP="discover-competitive-analysis discover-interview-synthesis discover-stakeholder-summary define-hypothesis define-jtbd-canvas define-opportunity-tree define-problem-statement develop-adr develop-design-rationale develop-solution-brief develop-spike-summary deliver-edge-cases deliver-launch-checklist deliver-prd deliver-release-notes deliver-user-stories measure-dashboard-requirements measure-experiment-design measure-experiment-results measure-instrumentation-spec iterate-lessons-log iterate-pivot-decision iterate-refinement-notes iterate-retrospective"
for name in $POP; do
  [[ -d "$SKILLS/$name" ]] && mv "$SKILLS/$name" "$PM/pop/$name" && echo "moved pop $name"
done

# pmprompt (28)
for d in "$SKILLS"/pmprompt-*/; do
  [[ -d "$d" ]] || continue
  name=$(basename "$d")
  mv "$d" "$PM/pmprompt/$name" && echo "moved pmprompt $name"
done

# alirezarezvani (5)
for name in product-manager-toolkit agile-product-owner product-strategist ux-researcher-designer ui-design-system; do
  [[ -d "$SKILLS/$name" ]] && mv "$SKILLS/$name" "$PM/alirezarezvani/$name" && echo "moved alirezarezvani $name"
done

# ralph (2)
for name in ralph-prd ralph; do
  [[ -d "$SKILLS/$name" ]] && mv "$SKILLS/$name" "$PM/ralph/$name" && echo "moved ralph $name"
done

echo "Move to pm/ done. BMAD остаётся в .claude/skills/bmad (не переносится)."
