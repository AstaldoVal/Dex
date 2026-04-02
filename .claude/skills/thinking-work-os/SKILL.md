---
name: thinking-work-os
description: Run a full thinking-work cycle, ingest inputs, evaluate evidence, make decisions, and record durable outputs across connected tools.
---

# Thinking Work OS

Use this skill when the user wants system-level leverage instead of one-off prompts.

This skill defines a repeatable operating cycle for thinking work across any connected tools.

## Core principle

Do not optimize for faster text generation.
Optimize for faster, safer decision cycles with durable records.

## When to use

- Weekly planning and prioritization
- Product or strategy decisions
- Cross-tool synthesis (docs, tasks, meetings, notes, email, trackers)
- Tool onboarding decisions (add, keep, or remove integrations)

## Operating cycle

### 1) Ingest
- Collect raw inputs from connected sources.
- Cluster by topic, decision owner, and urgency.
- Remove duplicates.

### 2) Evaluate
- Run Evidence Gate on each high-impact topic:
  - confirmed facts
  - unverified gaps
  - confidence

### 3) Decide
- Produce a decision or recommendation only when evidence is explicit.
- For low-confidence items, output "defer with questions" instead of forced decisions.

### 4) Record
- Create durable output in the user's system:
  - decision note
  - task(s) with owners and next step
  - links to supporting context

### 5) Review and prune
- Check which tools or steps produced real leverage.
- Remove or simplify layers that add maintenance but no decision quality.

## Tool integration rule (general)

When evaluating a new tool or connector, approve only if at least one is true:
- It reduces uncertainty in important decisions.
- It improves quality or speed of durable records.
- It materially lowers manual effort in recurring workflows.

If none are true, do not add the tool now.

## Output format

### A) Priority topics
- top items with impact and urgency

### B) Decision list
- one entry per topic:
  - decision or defer
  - confirmed facts
  - open questions
  - confidence

### C) Action plan
- concrete tasks with owner and next step

### D) Record updates
- what must be written back into the system

### E) Tool stack adjustments
- keep, add, pause, or remove with one-line rationale each

## Safety rules

- Never claim certainty when evidence is incomplete.
- Never hide assumptions.
- Always separate facts, assumptions, and actions.

## Notes

- This is a reusable skill.
- Edit `.claude/skills/thinking-work-os/SKILL.md` to adapt cadence, strictness, or output fields.
