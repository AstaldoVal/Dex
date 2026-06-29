---
name: logo-mark-design
description: Logo and wordmark workflow for Head of Design — emotive brief, concept generation, PNG-to-SVG tracing, favicon-size validation, lockups, and usage rules. Use when the task is logo, mark, wordmark, favicon, brand icon, or visual identity mark (not general UI screens).
---

# Logo Mark Design

For a full brand system (tokens, master brand doc, iOS+web), start with **brand** (b1rdmania `brand-skill` folder); this skill is the **logo-only** path and links into brand Phase 3–4 when needed.

## When to use

- Logo, mark, wordmark, favicon, app icon, brand symbol
- "Design a logo for [product]"
- Refine or replace an existing mark

**Do not use alone for:** full brand guidelines, design system tokens only, or in-app UI layout (use ui-design-system + anthropic-frontend-design).

## Required tools (install or fallback before claiming done)

| Tool | Purpose | Install (macOS) |
|------|---------|-----------------|
| **vtracer** or **potrace** | PNG → SVG trace | `brew install vtracer` or `brew install potrace` |
| **SVGO** | Optimize SVG (only if fidelity preserved) | `npx svgo@latest input.svg -o output.svg` |
| **rsvg-convert** or **qlmanage** | Render-verify every SVG | `brew install librsvg` or built-in `qlmanage -t -s 512 -o /tmp mark.svg` |

**Rule:** Never deliver an SVG you have not rendered at **256, 64, 32, and 16px**. Attach PNG previews to the issue.

## Pipeline (logo ticket)

### 0. Emotive anchor + Roman references (blocking)

One paragraph: human moment, transformation, personality. Test every concept: *does this mark express the narrative?*

**Before diverging:** Roman must supply **2 liked marks + 2 anti-references** OR explicitly skip in the issue thread. Without that, stop at `blocked` with assignee Roman — do not burn Cursor quota on Round N loops.

If missing narrative, read **brand** `06-Resources/External/b1rdmania-claude-brand-skills/brand-skill/Workflows/00-EmotiveNarrative.md`.

**Genufit anti-pattern (do not repeat):** navy rounded-square icon + abstract seam/nest/dial geometry without literal «vacancy ↔ person fit» read — board rejected as «не ассоциируется ни с чем».

### 1. Diverge — max 3 concepts (not color swaps)

Use **nanobanana-image-guide** (Type 1, logo mode below) or hand-coded geometric SVG if the mark is simple (circle, monogram, stroke mark).

Generate **structurally different** directions; name what convention each fights (e.g. "not another gradient orb", **not another navy rounded-square app icon**).

**Default:** hand-coded SVG or sketch from references — not Nano Banana — unless Roman approved AI exploration.

Save concepts under `04-Projects/<project>/docs/design-system/assets/round-N-logos/` (Applicator: see `GENUFIT_LOGO_ROUND_*.md`).

### 1b. Roman private preview (before board)

Build login-context comparison (`mark + wordmark` on auth chrome) via repo script pattern:

- Applicator: `04-Projects/Applicator/scripts/build-logo-round4-comparison.mjs`

Attach to issue for **Roman only**. Board interaction **only** after Roman approves in thread.

### 2. Kill — user or CEO picks one direction

Binary: alive or dead. No blending averages.

### 3. Vectorize

**Simple geometry:** hand-code SVG, `viewBox="0 0 64 64"`, consistent stroke weights.

**Complex curves / letterforms:** trace reference PNG:

```bash
vtracer --input concept-v3.png --output mark-traced.svg
npx svgo@latest mark-traced.svg -o mark-v1.svg
# If SVGO degrades the mark, keep the unoptimized file.
```

### 4. Render-verify loop (every iteration)

```bash
rsvg-convert -w 256 -h 256 mark-v1.svg -o mark-v1-256.png
rsvg-convert -w 32 -h 32 mark-v1.svg -o mark-v1-32.png
rsvg-convert -w 16 -h 16 mark-v1.svg -o mark-v1-16.png
```

If detail vanishes at 32px, **simplify** — do not add more detail.

### 5. Wordmark lockups

Follow **brand** `Workflows/04-Wordmark.md` under `06-Resources/External/b1rdmania-claude-brand-skills/brand-skill/`:

- Horizontal, stacked, mark-only
- Text height ~60–75% of mark height; gap 0.25–0.75× mark width per brand density

### 6. Critique and rationale

- **design-critique** — observation → impact → suggestion (WCAG contrast on mark+background)
- **develop-design-rationale** — document alternatives rejected and tradeoffs
- **verification-before-completion** — attach all size previews before marking done

## Nano Banana prompts (logo concepts)

Use with **nanobanana_generate**, `image_size: 1:1`, high contrast, **flat vector style**:

> Generate a minimalist logo mark for [brand]: [one-sentence emotive anchor]. Flat vector, no photorealism, no 3D, no mockup on business card. Single color [hex] on white AND reversed on dark. Bold simple silhouette readable at 32px. No text unless wordmark phase. Style: [geometric | organic | letterform] — distinct from generic tech gradient logos.

Run **3–5 prompts** with different structural logic, not hue swaps.

## Quality gate (all must pass)

- [ ] Reads at 256, 64, 32, 16 px (PNG previews attached)
- [ ] Works as single-color silhouette
- [ ] Not generic AI-slop (purple gradient orb, meaningless wireframe globe)
- [ ] Clear space rule documented (minimum padding = X)
- [ ] `[brand]-mark-final.svg` + `favicon-32.png` in deliverable folder
- [ ] **develop-design-rationale** or comment with alternatives considered

## Iteration limits

| Round | Action |
|-------|--------|
| v1–v5 | Explore |
| v6–v10 | Direction must be clear |
| v11+ on same approach | **Pivot to tracing** or new concept |

## Handoff

- Engineering: SVG paths, favicon PNG, min size, light/dark backgrounds
- CMO: voice only if wordmark typography affects external brand
- Full brand kit: escalate to **brand** Phases 5–7

## References in DEX

- Full brand system: `06-Resources/External/b1rdmania-claude-brand-skills/brand-skill/`
- Image prompts: `.claude/skills/nanobanana-image-guide/SKILL.md`
- Nano Banana MCP: `.claude/reference/nanobanana-figma-mcp.md`
