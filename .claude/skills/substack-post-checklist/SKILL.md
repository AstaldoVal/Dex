---
name: substack-post-checklist
description: Mandatory checklist and validation steps for Substack posts (1% AI Better Every Day and similar). Run after every edit to a post in One_Percent_AI_Better_Every_Day/posts/; use when writing, editing, or finalising any post before publish.
---

# Substack post checklist

Use this skill when you **write**, **edit**, or **finalise** a Substack post (especially for 1% AI Better Every Day). Run the checklist **after the first draft** and **after every round of edits** so nothing slips through.

When the user asks for wording changes, apply them directly in the post file. Do not ask for confirmation before simple rephrasing edits.

**Trigger (mandatory):** After **any** edit to a post in `04-Projects/One_Percent_AI_Better_Every_Day/posts/` (e.g. `Day_04.md`), run the **Validation procedure** below on the edited file. No exception: every edit is followed by the checklist pass.
**Quality contract (mandatory):** Do not hand off a draft with known issues. If validation finds issues, fix them immediately and re-run validation until clean.

Full newsletter context and writing rules: `.claude/skills/one-percent-ai-substack/SKILL.md`.  
Banned vocabulary and style: `.claude/reference/ai-writing-signs-banned.md`.

---

## Mandatory checklist (nothing ships without this)

### 1. No em dash (—)
- **Rule:** The character — (Unicode U+2014) is **forbidden** in post body and title.
- **Fix:** Replace every — with a comma or period (or rephrase). In UI paths like "X — Y" use ". " or ", " (e.g. "**Google Auth Platform**. Here's what you'll see").
- **Note:** File may use typographic apostrophes/quotes (`'` U+2019, `"` U+201C/U+201D). If search/replace fails, use a unique substring without the apostrophe or use replace_all for the character — only.

### 2. No arrow (→) in body
- **Rule:** Do not use → in the post. Use "->" (minus + greater-than) or rephrase.
- **Applies to:** Menu paths, breadcrumbs, step labels (e.g. "**Cursor** -> **Cursor Settings**", "**APIs & Services** -> **Library**").

### 3. One CTA at the end
- **Rule:** Regular daily posts have **exactly one** clear call-to-action at the end (e.g. "Reply with your role", "Reply with what you connected first").
- **Check:** Section "What to do next" (or equivalent) contains one CTA; no second CTA in a bonus/annex block after the main close.

### 4. Normal capitalization
- **Rule:** No mid-sentence emphasis caps. Only sentence start and proper nouns. Use lowercase for common terms (e.g. revenue growth, conversions, retention).

### 5. No banned phrases or clusters
- **Banned phrase:** "I am drawn to" → use "I am keen to", "I want to", "I am interested in".
- **Banned style:** Clusters of AI vocabulary (pivotal, crucial, underscore, tapestry, delve, foster, showcase, testament, vital role, evolving landscape, commitment to, etc.). See `.claude/reference/ai-writing-signs-banned.md` for the full list.
- **Tone:** No promotional puff; prefer "is/are/has" over "serves as/boasts/features/offers".

### 6. Post header order and tags (1% AI Better)
- **First line of the post:** Must be the metadata line: `**Day X of 30** | **Type:** ... | **Pillar:** ...`. Nothing comes before it. Then **Tags:** `**Tags:** tag1, tag2, tag3, ...` (mandatory for every post). Then the title (`# [Day X of 30] ...`), then the optional subtitle in italics. See `.claude/skills/one-percent-ai-substack/SKILL.md` -> Post template -> Post header (canonical order).
- **Tags:** Every post must have a Tags line (comma-separated topics/keywords). If missing, add one before publish.

### 7. No technical config in body
- **Rule:** No raw config (JSON, YAML, `.env` snippets, file paths like `.cursor/mcp.json` or `core/mcp/*.py`) in the post. The reader gets the result by **prompting**: "Ask in chat: ...", "Open Settings -> ...", or one official link. See one-percent-ai-substack -> Writing rules -> No technical config in the body.

### 8. Post-specific (1% AI Better)
- **Free vs paid:** If the post offers a ready-made artifact, that artifact is for **paid** subscribers; free readers get the idea and steps to build themselves.
- **Language:** Posts in English. No informal self-references.
- **If integrations/tools are mentioned:** include explicit connect/install paths for both apps:
  - Cursor: `Plugin -> Browse Marketplace -> search Slack -> select Slack -> Add to Cursor`
  - Claude Code: `Connectors -> Browse Connectors -> search Slack -> select Slack -> Connect`
  Plus clear “what to click” steps (find integration, Connect/Add, OAuth).
- **Setup flow style:** describe setup through agent flow or app menu paths. Do not include file-level config, scripts, or raw JSON/YAML in post body.
- **Reader reality:** default flow must work for a reader with zero prior setup. If a custom skill is referenced, no-skill path is primary, with-skill path is optional.

---

## Validation procedure (run every time)

After drafting or editing the post file:

1. **Grep for em dash:** Search the post file for the character `—` (U+2014). If any match: replace each with comma or period (or rephrase), then re-run this step until zero matches.
2. **Grep for arrow:** Search the post file for `→`. Replace every occurrence with `->`, then re-run until zero matches.
3. **Grep for banned phrases:** Search for (e.g.) `I am drawn to`, `testament`, `pivotal`, `crucial`, `underscore`, `tapestry`, `delve`, `foster`, `showcase`, `vital role`, `evolving landscape`, `commitment to`, `nestled`, `boasts`, `showcasing`. Remove or rephrase.
4. **Confirm one CTA:** Read the closing section. Ensure a single clear CTA (e.g. in "What to do next"); no extra CTAs in annexes.
5. **Spot-check caps:** Scan for mid-sentence capitalized common words; fix to sentence case.
6. **Post header order and tags:** Confirm the first line is `**Day X of 30** | **Type:** ... | **Pillar:** ...`; then a `**Tags:** ...` line (mandatory); then the title (`# [Day X of 30] ...`) and optional subtitle. If Tags is missing, add a comma-separated list of topics. If title or subtitle appear before the metadata line, reorder so the metadata line is first.
7. **No technical config:** Scan for JSON blocks, YAML, `.env` examples, or editor config paths in the body. Replace with prompt-based steps (what to ask the AI, what to click in Settings) or one official link.
8. **Integration setup completeness:** If post mentions integrations, confirm it includes install/connect flow for both:
   - Cursor path: `Plugin -> Browse Marketplace -> search Slack -> select Slack -> Add to Cursor`
   - Claude Code path: `Connectors -> Browse Connectors -> search Slack -> select Slack -> Connect`
   Ensure there are concrete click steps and OAuth mention.

Only after all steps pass consider the post ready to paste into Substack or to hand off.
If one step fails:
- fix the draft
- re-run the full validation procedure
- repeat until all steps pass

---

## Quick reference: replace patterns

| Find | Replace with |
|------|----------------|
| `—` (em dash) | `, ` or `. ` (or rephrase) |
| `→` (arrow) | `->` |
| "I am drawn to" | "I am keen to" / "I want to" / "I am interested in" |

---

## Where posts live (1% AI Better)

- **Project and backlog:** `04-Projects/One_Percent_AI_Better_Every_Day.md`
- **Draft posts:** e.g. `04-Projects/One_Percent_AI_Substack_Day3_MCP_Calendar.md`
- **Template mapping:** `04-Projects/One_Percent_AI_Substack_Template_Mapping.md`

When in doubt, run the validation procedure on the draft file path before saying the post is done.
