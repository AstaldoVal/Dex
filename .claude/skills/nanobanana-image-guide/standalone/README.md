# Nano Banana Image Guide — use in any AI assistant

This folder is a **standalone product**: the same image-creation workflow works in Claude, Cursor, Gemini, or any other AI chat that can use Nano Banana (Gemini Create Image). No dependency on a specific app or file system.

**Preferred way:** use it as a **skill** (or equivalent) on your platform so the assistant always follows the step-by-step prompting workflow. If the platform doesn't support skills, use the workarounds below.

---

## What's inside

- **SKILL.md** — Agent Skills–compatible skill (Cursor). References the full playbook. Use when the platform supports loading a skill file or folder.
- **Image_Guide_Playbook.md** — Full workflow as plain markdown; for pasting or attaching when you're not using a skill.
- **platforms/** — Ready-to-use instructions or install steps per platform.
- **README.md** — This file.

---

## By platform

### Cursor (skills supported)

**Use as skill:** Copy the standalone folder (or the parent that contains `SKILL.md` and `Image_Guide_Playbook.md`) into your Cursor skills directory (e.g. `~/.cursor/skills/nanobanana-image-guide/`). Reload Cursor; invoke e.g. `/nanobanana-image-guide` or "use the Nano Banana image guide".

**Details:** [platforms/Cursor/README.md](platforms/Cursor/README.md)

**If you don't use a skills folder:** Paste **Image_Guide_Playbook.md** into the chat, or use the one-shot prompt under "All platforms" below.

---

### Claude (claude.ai)

**Use as skill:** Enable *Code execution and file creation* in Settings > Capabilities. Then **Customize > Skills** → upload this folder as ZIP. Claude uses it automatically when you ask to create or edit an image.

**Details:** [platforms/Claude/README.md](platforms/Claude/README.md)

**Alternative:** Create a Project and paste instructions from **Project_Instructions.md**, or attach **Image_Guide_Playbook.md** in chat.

---

### Gemini (Custom Gem = "skill")

**Use as skill:** Create a **Gem** in Gemini. In the Gem's **Instructions**, paste the content of **platforms/Gemini/Custom_Instructions.md**.

**Details:** [platforms/Gemini/README.md](platforms/Gemini/README.md)

**If you don't use Gems:** Paste **Image_Guide_Playbook.md** in the chat and ask Gemini to follow it.

---

### OpenClaw (skills are code-based)

**Workaround:** Paste **platforms/OpenClaw/Custom_Instructions.md** into custom instructions, or attach **Image_Guide_Playbook.md** in chat.

**Details:** [platforms/OpenClaw/README.md](platforms/OpenClaw/README.md)

---

## All platforms: one-shot prompt (no skill, no files)

If you can't use a skill or attach files, paste this into your first message:

```
You are an image prompt expert. When I want to create or edit an image, follow this workflow:
1) Ask what type: generate from scratch, with references, edit existing, real-time data, text rendering, or creative direction.
2) For my type, ask questions one at a time: subject, action/pose, location/context, composition, style (as relevant).
3) Build a flowing prose prompt (no bullet lists), starting with a strong verb. Be specific and use positive framing.
4) Output the final prompt for me to paste into Google AI Studio (Nano Banana / Gemini Create Image).

Start by asking what image I want to create.
```

Then add your request (e.g. "I need a product mockup for a ceramic mug").

---

## Output

The AI returns a structured prompt (and optionally generates the image if the platform supports it). You can paste the prompt into Google AI Studio (Nano Banana / Gemini Create Image).

---

## License and reuse

You can copy this folder into another repo, share it, or ship it as a standalone guide. The workflow is generic; no trademark or platform lock-in. Source: [The ultimate Nano Banana prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana) (Google Cloud, March 2026).
