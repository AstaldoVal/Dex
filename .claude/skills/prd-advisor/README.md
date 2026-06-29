# PRD Structure Advisor

Context-aware skill that helps you choose the right PRD structure based on your use case, audience, and product stage. Recommends which sections to include or skip for maximum effectiveness.

## What It Does

- Asks 3–4 questions about product type, audience, and domain
- Recommends a base template (Peter Yang, Aakash Gupta, ChatPRD, Aha, Amazon PR/FAQ, etc.)
- Suggests must-have vs optional vs skip sections
- Generates a personalized PRD outline with placeholders

## Installation

### Cursor / Claude Code

1. Copy this folder into your skills directory:
   - Cursor: `.cursor/skills/prd-advisor/` or project `.claude/skills/prd-advisor/`
   - Claude Code: `~/.claude/skills/prd-advisor/` or `<project>/.claude/skills/prd-advisor/`

2. Restart the IDE or reload the window.

3. Invoke with `/prd-advisor`.

### As Standalone Repo

This skill is designed to work independently. To publish:

1. Create a repo with this folder as root (or in a `skill/` subfolder).
2. Include: `SKILL.md`, `README.md`, `references/` (decision-matrix.md, section-catalog.md).
3. Add installation instructions for each target platform (Cursor, Claude Code, ChatGPT, Gemini, etc.).

### Other AI Providers

The skill uses standard Markdown instructions. For ChatGPT Custom Instructions, Gemini instructions, or similar: paste the content of `SKILL.md` and ensure the assistant can read `references/` when making recommendations. Alternatively, embed the decision matrix and section catalog into the instructions if the platform does not support multi-file context.

## Usage

```
/prd-advisor
```

Then answer the questions about:
- Product type (MVP, feature, new product, release)
- Audience (dev, exec, investors, cross-functional)
- Domain (consumer, B2B, enterprise)
- Optional: constraints (speed, experiment, compliance)

## Structure

```
prd-advisor/
├── SKILL.md              # Main skill instructions
├── README.md             # This file
└── references/
    ├── decision-matrix.md   # Use case → template/sections
    └── section-catalog.md   # Section descriptions
```

## License

Use and adapt as needed. When sharing, credit the template sources (Aakash Gupta, Peter Yang, ChatPRD, Aha, Amazon, Ofri Yehuda, Atlassian, Monday).
