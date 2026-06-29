---
name: banda-google-slides
description: This skill should be used when Roman asks to create, edit, evaluate, or finalize Banda pitch decks in Google Slides (municipal deck, typography, bounds, Drive sync). Covers work-account OAuth, rebuild from pptx template, and automated layout eval.
---

# Banda Google Slides (pitch master)

## When to use

- Municipal / investor pitch decks for **Banda** / **Eighty85**
- «Довести презентацию до финала», «проверить заголовки», «блоки наезжают»
- После правок в `create_municipal_pitch_slides_ru.py` или ручных правок в Slides UI

## Read first

1. [banda-presentation-eval.md](../../reference/banda-presentation-eval.md) — workflow cases + gate codes
2. [2. Banda Presentations Bundle/README.md](../../../04-Projects/Banda/banda-drive-import/2.%20Banda%20Presentations%20Bundle/README.md) — Drive folder IDs
3. `.cursor/rules/banda-presentations-drive-source-of-truth.mdc` — не плодить лишние папки на Drive
4. `.cursor/rules/google-slides-oauth-self-heal.mdc` — при `invalid_grant`

Registry: `04-Projects/Banda/presentation-eval-registry.json`

## Default deck (Roman, municipal pitch — canonical in registry)

- **ID:** `1GC9k5-Zl0tDGH2WrWbCyRG3o0HScpB9jRuG4RHf0pOY`
- **Edit link:** `https://docs.google.com/presentation/d/1GC9k5-Zl0tDGH2WrWbCyRG3o0HScpB9jRuG4RHf0pOY/edit`
- **Account:** work (`r.matsukatov@banda.io`) — Drive token `Credentials/google-work/google_drive_token.json`

## Standard finalize workflow (agent runs all steps)

1. **Confirm account** — Banda Slides/Drive = **work**, not personal Gmail.
2. **Rebuild from template** (applies copy, layout, bounds fit, uploads to existing Slides file):

```bash
python3 .scripts/banda/create_municipal_pitch_slides_ru.py
```

Expect stderr: `BOUNDS_OK`, `TEXT_FIT_OK`, `UPDATE_OK`, and `slides_edit:` URL.

3. **Automated eval** (Slides API, work auth):

```bash
npm run banda:slides-eval
```

Or one shot:

```bash
npm run banda:municipal-pitch-finalize
```

4. **If eval fail** — read `04-Projects/Banda/banda-drive-import/presentation-eval-latest.json`, fix `create_municipal_pitch_slides_ru.py` (preferred) or note manual UI steps for Roman, then repeat steps 2–3.
5. **Drive bundle sync** — only if local `Municipal pitch decks (Drafts)/` media or `Obsidian/` notes changed:

```bash
npm run banda:presentations-bundle-drive-sync:media-only
```

Do **not** upload `.obsidian/`, root README, or repo meta to bundle roots.

## Workflow cases (summary)

| Case | Action |
|------|--------|
| create_deck | Template pptx → new or existing Slides via Drive API |
| edit_text | Update `REPLACEMENTS` / layout helpers in Python, rebuild |
| add_block | Extend template indices + layout function; rebuild |
| resize_block | `fit_content_within_slide_bounds`, card layout functions |
| copy_deck | Drive UI duplicate file; new ID in registry if second variant |
| municipal_pitch | UK copy, no global TAM; gate `MUNICIPAL_FOCUS` |
| typography_pass | Gates `HEADING_HIERARCHY`, `SUBTITLE_HIERARCHY` |

## MCP tools (optional)

When `user-google-slides-mcp` works: `get_presentation`, `batch_update_presentation`, `get_page`. Prefer **rebuild script** for bulk text/layout; MCP for small targeted batch updates.

## Manual checks after green eval

- Cmd+R in browser — cache
- **Slide 1** — wordmark не перекрывает украинский H1; логотип в углу (`TITLE_SLIDE_*`)
- **Slide 13** — «Екосистема учасників»: иконки в карточках, подписи выровнены, Trust Layer светлый на hub (`ICON_INSIDE_CARD_BOUNDS`, `LABEL_ICON_ALIGNMENT`, `CONTRAST_ON_FILLED_SHAPES`)
- Slides 2, 6, 12 — cards vs subtitle visually
- No «контур» in customer-facing copy (use «канал», «процес»)

## Anti-patterns

- Do not put automation README on Drive bundle roots
- Do not delete OAuth token files to fix auth
- Do not report «done» without `presentation-eval-latest.json` with `"ok": true` or explicit manual follow-ups
