# Summary writing checklist (single source of truth)

Purpose: central rules for writing and rewriting resume summaries, Teal Professional Summary, cover-letter summary blocks, and short recruiter intros.

This checklist is the primary reference. Other files may add context, but they should not contradict this one.

## Core writing rules

- Keep language plain and direct. No inflated or promotional tone.
- One concept, one term. Avoid repeating the same meaning with different wording.
- No tautology and no repeated root words in neighboring phrases.
- Ban root-word variants in one clause (e.g. `leadership, leadership skills`); keep one strongest version.
- Use short, readable sentences with clear subject-action-result.
- Keep ATS keywords natural in full sentences. No keyword stuffing.
- Never claim skills or experience that are not supported by CV/evidence.

## Mandatory bans

- No em dash character (`—`) in summary or application text.
- No AI-style puffery, template rhetoric, or formulaic contrasts.
- No meta chat phrases in deliverables ("I hope this helps", etc.).

Reference for banned patterns:
- `.claude/reference/ai-writing-signs-banned.md`

## ATS integration rules

- Preserve strong matched terms already present in the target JD.
- Add missing terms only when they are supported by real experience.
- Prefer exact JD wording for critical terms when possible.
- If two keywords overlap semantically, include the clearer one once.

## Quality gate before final output

- Is there any duplicated meaning across adjacent sentences?
- Are there repeated root words that make phrasing clumsy?
- Is every claimed skill grounded in CV/evidence?
- Are keywords embedded naturally rather than listed?
- Is the text free of `—` and banned AI-writing patterns?
- Does the first 2-3 lines show role-relevant signal immediately?

## Scope and precedence

- Applies to:
 - Resume summaries
 - Teal Professional Summary
 - Cover letter summary/opening blocks
 - Recruiter intro paragraphs

- If any other local rule conflicts, keep this file as the base and apply stricter user-specific constraints from `AGENTS.md` and `CLAUDE.md`.
