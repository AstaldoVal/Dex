# Cursor — use as a skill

Cursor supports **Agent Skills** (SKILL.md with name and description). The Nano Banana Image Guide skill is ready to load.

## Install (recommended)

1. Copy the **standalone folder** (the one that contains `SKILL.md` and `Image_Guide_Playbook.md`) into your Cursor skills directory, for example:
   - **Mac/Linux:** `~/.cursor/skills/nanobanana-image-guide/`
   - Or your project's skills path if you use project-level skills (e.g. `.claude/skills/nanobanana-image-guide/standalone/`).
2. Ensure the folder contains **SKILL.md** and **Image_Guide_Playbook.md**.
3. Restart or reload Cursor so the skill is picked up.

## How to use

- In chat, invoke the skill (e.g. type `/nanobanana-image-guide` if your setup supports slash commands, or say "Use the Nano Banana image guide: I want to create…").
- The assistant will follow the playbook: determine task type → ask questions one at a time → build prompt → generate or output prompt.

## If you don't use a skills folder

- Paste the contents of **Image_Guide_Playbook.md** into the chat and ask the assistant to follow it.
- Or use the one-shot prompt from the main **README.md**.
