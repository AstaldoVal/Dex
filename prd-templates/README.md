# PRD Templates Collection

A curated collection of **Product Requirements Document (PRD)** templates from product leaders, tools, and frameworks. Use with AI assistants, in your product workflow, or as reference when structuring requirements.

Each folder is a source (person, company, or method). Templates are in `.txt` or `.md` for readability and version control.

---

## Structure

| Folder | Source | Description |
|--------|--------|-------------|
| **prdgpt** | prdgpt.com | Full PRD structure with Document Control, Executive Summary, Problem & Opportunity, Requirements, Success Metrics |
| **aha** | aha.io | Agile PRD, PRD Presentation (executives), Release Requirements, general PRD guide |
| **atlassian** | atlassian.com/confluence | 5-step Confluence PRD: Objective, Assumptions, Options, Docs, Open Questions |
| **monday** | monday.com | 10 components, 6 sections (overview, objectives, stakeholders, personas, functional/non-functional reqs) |
| **ofri-yehuda** | medium.com (Design Bootcamp) | "The Only PRD Template You Need" — lean structure |
| **amazon** | Working Backwards | Press Release + FAQ (alternative to traditional PRD) |
| **bmad** | BMAD Method | Full PRD template with placeholders for BMAD workflow |
| **alirezarezvani** | claude-skills (product-team) | Standard / Epic / One-Page / Feature Brief variants |
| **chatprd** | chatprd.ai | 6-section (Background, Objectives, Features, UX, Milestones, Technical) and full variant |
| **aakash-gupta** | aakashg.com | Core framework (Problem, Goals, User Stories, Acceptance Criteria) and 14-section variant |
| **peter-yang** | Peter Yang (Roblox) | 7-section summary and full template (Problem, Goals, Requirements, Launch plan) |

---

## Installation

Clone or copy this repository. Point your AI assistant, PRD tool, or product docs at the templates:

```bash
git clone https://github.com/YOUR_ORG/prd-templates.git
cd prd-templates
```

**With prd-advisor skill (Dex):** Run `/prd-advisor` for context-driven recommendations; it references templates in this folder.

---

## Usage

**With prd-advisor skill (Dex):** Run `/prd-advisor`. Answer a few questions (product type, audience, domain). The skill recommends a matching template or a hybrid mix of sections, then gives you a personalized outline. Use the recommended folder/file here as reference.

**Manual:** Pick a folder by source (e.g. `aakash-gupta/` for PM-heavy PRDs, `amazon/` for Working Backwards), open the template file, and copy the structure. Combine sections from multiple folders for hybrid PRDs.

---

## Adding templates

1. Create a folder: `author-name/` (lowercase, hyphen-separated).
2. Add template file(s) as `.txt` or `.md`.
3. Add a `README.md` in the folder with: source URL, author, license if known, short description.
4. Update this README and `SOURCES.md` with attribution.

---

## License and attribution

This repository is under [MIT License](LICENSE). Templates are attributed to their original authors. Each template may be subject to its original author's terms. See [SOURCES.md](SOURCES.md) for URLs and attribution. This repo aggregates for convenience; it does not replace the originals.
