---
name: evidence-gate
description: Audit any AI recommendation against available context, split confirmed facts vs unverified gaps, and produce a checkable decision output.
---

# Evidence Gate

Use this skill when the user asks for a recommendation, decision, plan, or summary and wants to avoid confident guesses.

This skill is tool-agnostic. It works with any source set, notes, tasks, project docs, CRM, email, research files, and meeting notes.

## What this skill enforces

- A recommendation is never final unless it is tied to explicit evidence.
- Missing evidence is surfaced as concrete questions, not hidden in prose.
- Output always stays checkable and reusable.

## Inputs

- Decision request:
  - what decision is needed
  - constraints (time, risk, audience, quality bar)
- Context pack:
  - available facts with source labels (for example: Projects, People, Meetings, Tasks, Reference)
- Optional draft:
  - an existing draft to audit and improve

## Output schema (always use this structure)

### A) Decision summary
- 2-4 sentences, plain language
- no claim without support

### B) Confirmed facts
- bullet list
- each bullet must include:
  - Fact
  - Source label

### C) Unverified gaps
- bullet list
- each bullet is one concrete question needed to remove uncertainty

### D) Next context updates
- bullet list
- for each gap, propose one concrete update action:
  - what to capture
  - where to capture it

### E) Confidence
- high, medium, or low
- confidence is based on evidence coverage, not writing quality

## Workflow

1. Parse the decision request
  - extract objective, constraints, and decision scope
2. Normalize context pack
  - deduplicate facts
  - map each fact to source label
3. Audit claims
  - keep only claims with evidence
  - convert unsupported claims into unverified gaps
4. Build checkable output
  - produce sections A-E in the exact schema
5. Set confidence
  - high: core constraints are covered by confirmed facts
  - medium: partial coverage, key gaps remain
  - low: major claims depend on missing evidence

## Safety rules

- Never fabricate a source or fact.
- Never hide uncertainty in vague wording.
- If evidence is insufficient, say so explicitly and lower confidence.

## Usage trigger examples

- "Give me a recommendation without guesswork"
- "Verify this decision against facts"
- "I need a checkable answer"
- "Audit this draft before I send it"

## Notes

- This is a reusable skill.
- Edit `.claude/skills/evidence-gate/SKILL.md` to tune language or strictness.
