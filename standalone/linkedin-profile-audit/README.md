# linkedin-profile-audit (standalone skill bundle)

Claude Code / Cursor skill: LinkedIn profile audit (onboarding, /50 scoring, rewrites). Sources and examples are in `references/`.

## Install in another repository

1. Copy the whole `linkedin-profile-audit` folder (this directory) into your project:

   - **Claude Code:** `.claude/skills/linkedin-profile-audit/`
   - **Same layout:** `SKILL.md` at the skill root, `references/` beside it.

2. Invoke with `/linkedin-profile-audit` or ask for a LinkedIn profile audit.

3. **Optional:** If you use a vault (PARA, Obsidian, Dex), point the model at your Career folder and any anti-AI / writing rules you keep locally. The bundled `SKILL.md` uses relative paths under this folder only.

## Contents

- `SKILL.md` — skill instructions (Dex-specific lines removed or generalized).
- `references/SOURCE.md` — what the originals were (PDFs/docx not shipped; extracted text is included).
- `references/profile-audit-examples-extracted.txt` — full **Profile Audit Examples** extract.
- `references/claude-x-linkedin-auditor-docx-extracted.txt` — **Your Claude X LinkedIn Profile Auditor** docx extract.

## Updating from a new PDF

Re-extract **Profile Audit Examples** into `references/profile-audit-examples-extracted.txt` and adjust `SKILL.md` if the playbook changes.

## License / attribution

Built from user-provided materials (LinkedIn X Claude Profile Audit playbook and examples). Use and redistribute in line with your rights to those sources.
