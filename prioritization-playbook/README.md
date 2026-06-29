# Prioritization Playbook

**One workflow. Eleven methods. Any AI assistant.**

A ready-to-use prioritization skill and playbook for product and engineering teams. Use it in **Cursor**, **Manus**, **ChatGPT**, **Claude**, **Grok**, or **ClawdBot** to prioritize features, initiatives, or tasks with the right method (RICE, MoSCoW, Value vs Effort, ICE, WSJF, and more) and get a clear, documented order.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What this is

- **Structured workflow:** Context → method choice → items → run → documented result (markdown).
- **11 methods:** RICE, MoSCoW, Value vs Effort, ICE, Weighted Scoring, Kano, Cost of Delay, WSJF, Opportunity Scoring, Story Mapping, Stack Ranking.
- **Platform-agnostic:** Use as a **skill** where supported (Cursor, Manus), or as **Custom GPT / Project / custom instructions** elsewhere. No lock-in.

Best for: PMs, product leads, and anyone who needs to prioritize a list with a clear rationale and a reusable process.

---

## Table of contents

- [Installation by platform](#-installation-by-platform)
- [What's inside the repo](#-whats-inside-the-repo)
- [How to use](#-how-to-use)
- [Methods at a glance](#-methods-at-a-glance)
- [Fallback: one-shot prompt](#-fallback-one-shot-prompt)
- [License](#-license)

---

## Installation by platform

Choose your assistant and follow the steps. Prefer **skill / Custom GPT / Project** when available so the assistant always follows the playbook.

---

### Cursor

| Type | Description |
|------|-------------|
| **Skill** | Agent Skills (SKILL.md) supported |

**Install**

1. Clone or download this repo.
2. Copy the repo folder into your Cursor skills directory:
   - **macOS / Linux:** `~/.cursor/skills/prioritization-playbook/`
   - Or your project’s skills path if you use project-level skills.
3. Ensure the folder contains at least **SKILL.md**. Optionally keep **Methods_Reference.md** in the same folder.
4. Restart or reload Cursor.

**Use:** In chat, invoke the skill (e.g. `/prioritization` or *“Use the prioritization skill: I want to prioritize …”*).

**Fallback:** Paste [Prioritization_Playbook.md](Prioritization_Playbook.md) into the chat, or use the [one-shot prompt](#-fallback-one-shot-prompt) below.

**Details:** [platforms/Cursor/README.md](platforms/Cursor/README.md)

---

### Manus

| Type | Description |
|------|-------------|
| **Skill** | Upload folder or .zip with SKILL.md |

**Install**

1. Clone or download this repo.
2. In Manus, open **Skills** → **Upload**.
3. Select this repo folder (or a .zip of it). The skill will appear in chat (e.g. `/prioritization`).
4. If only a single file is accepted, use **SKILL.md**.

**Use:** Start a chat and invoke the skill (e.g. `/prioritization`). For formulas and details, attach **Methods_Reference.md** in the same chat.

**Fallback:** Paste [Prioritization_Playbook.md](Prioritization_Playbook.md) in the chat, or use the [one-shot prompt](#-fallback-one-shot-prompt) below.

**Details:** [platforms/Manus/README.md](platforms/Manus/README.md)

---

### ChatGPT

| Type | Description |
|------|-------------|
| **Custom GPT** | Instructions + optional Knowledge file |

**Install**

1. In ChatGPT: **Explore GPTs** → **Create** (or edit an existing GPT).
2. In **Instructions**, paste the full content of **[platforms/ChatGPT/Custom_GPT_Instructions.md](platforms/ChatGPT/Custom_GPT_Instructions.md)** (the block marked “Instructions to paste”).
3. (Optional) In **Knowledge**, upload **Methods_Reference.md** from this repo.
4. Save. Name the GPT e.g. “Prioritization Playbook”.

**Use:** Open this GPT and write e.g. *“I want to prioritize [what] for [horizon].”*

**Fallback:** In any chat, attach **Prioritization_Playbook.md** and say *“Use this playbook to help me prioritize…”*, or use the [one-shot prompt](#-fallback-one-shot-prompt) below.

**Details:** [platforms/ChatGPT/Custom_GPT_Instructions.md](platforms/ChatGPT/Custom_GPT_Instructions.md)

---

### Claude (claude.ai)

| Type | Description |
|------|-------------|
| **Project** | Project instructions + Knowledge files |

**Install**

1. In Claude, create a **Project** (or open an existing one).
2. In **Project settings** → **Custom instructions**, paste the content of **[platforms/Claude/Project_Instructions.md](platforms/Claude/Project_Instructions.md)**.
3. In **Knowledge**, add **Prioritization_Playbook.md** and optionally **Methods_Reference.md** from this repo.
4. Save.

**Use:** Use this Project when you want to prioritize; say e.g. *“I want to prioritize [what] for [horizon].”*

**Fallback:** In any chat, attach **Prioritization_Playbook.md** (and optionally **Methods_Reference.md**) and ask Claude to follow it, or use the [one-shot prompt](#-fallback-one-shot-prompt) below.

**Details:** [platforms/Claude/Project_Instructions.md](platforms/Claude/Project_Instructions.md)

---

### Grok

| Type | Description |
|------|-------------|
| **Custom instructions** | No skill upload; use “Customize Grok” or Workspace |

**Install**

1. Open **Customize Grok** (from the chat interface).
2. In **“How would you like Grok to respond?”**, paste the content of **[platforms/Grok/Custom_Instructions.md](platforms/Grok/Custom_Instructions.md)**.
3. Save.

**Alternative:** Create a **Workspace** and set the same instructions there so they apply only in that workspace.

**Use:** In chat (or in that Workspace), say e.g. *“I want to prioritize [what] for [horizon].”*

**Fallback:** In the first message, paste the [one-shot prompt](#-fallback-one-shot-prompt) below and add your situation; or paste **Prioritization_Playbook.md** if the interface allows.

**Details:** [platforms/Grok/README.md](platforms/Grok/README.md)

---

### ClawdBot

| Type | Description |
|------|-------------|
| **Workaround** | Skills are code-based (manifest + index); use custom instructions or paste |

**Install**

- If ClawdBot supports **custom instructions**: paste the content of **[platforms/ClawdBot/Custom_Instructions.md](platforms/ClawdBot/Custom_Instructions.md)**.
- Otherwise, no install; use the fallback below when you need to prioritize.

**Use:** With custom instructions set, say e.g. *“I want to prioritize [what] for [horizon].”*

**Fallback:** In a new conversation, attach or paste **Prioritization_Playbook.md** and say *“Use this playbook to help me prioritize. [Your situation.]”* Or use the [one-shot prompt](#-fallback-one-shot-prompt) below.

**Details:** [platforms/ClawdBot/README.md](platforms/ClawdBot/README.md)

---

## What's inside the repo

```
prioritization-playbook/
├── README.md                    ← You are here (install & overview)
├── LICENSE                      ← MIT
├── SKILL.md                     ← Agent Skills format (Cursor, Manus)
├── Prioritization_Playbook.md   ← Workflow as markdown (paste/attach)
├── Methods_Reference.md        ← 11 methods: formulas, when-to-use, pros/cons
└── platforms/
    ├── Cursor/
    │   └── README.md
    ├── Manus/
    │   └── README.md
    ├── ChatGPT/
    │   └── Custom_GPT_Instructions.md
    ├── Claude/
    │   └── Project_Instructions.md
    ├── Grok/
    │   ├── README.md
    │   └── Custom_Instructions.md
    └── ClawdBot/
        ├── README.md
        └── Custom_Instructions.md
```

- **SKILL.md** — For Cursor and Manus: one file with the full workflow and a short methods table.
- **Prioritization_Playbook.md** — Same workflow; use when you paste or attach in chat.
- **Methods_Reference.md** — Detailed reference; attach in chat when the AI needs formulas or when-to-use.
- **platforms/** — Ready-to-paste instructions and short READMEs per platform.

---

## How to use

1. **Context:** The assistant asks what you’re prioritizing, for which horizon, and any constraints.
2. **Method:** It suggests one or two methods (e.g. Value vs Effort, RICE, MoSCoW) based on your answers.
3. **Items:** You provide a list (or the assistant helps you build one).
4. **Run:** The assistant runs the method and returns an **ordered result**.
5. **Output:** You get a markdown block: title, context, method used, ordered list, assumptions, next steps. Copy it into your doc, Notion, or save as a file.

---

## Methods at a glance

| Method | Best for |
|--------|----------|
| **RICE** | Feature backlog with reach; need a numeric score |
| **MoSCoW** | One release/scope; commit Must / Should / Could / Won't |
| **Value vs Effort** | Quick 2×2; stakeholder discussion |
| **ICE** | Ideas, experiments, hypotheses |
| **Weighted Scoring** | Strategy/OKRs; custom criteria and weights |
| **Kano** | Satisfaction types; what to improve first |
| **Cost of Delay** | Time-sensitive; commercial pressure |
| **WSJF** | Agile/SAFe; balance value and job size |
| **Opportunity Scoring** | Discovery; importance vs satisfaction data |
| **Story Mapping** | Release/MVP; order by user journey |
| **Stack Ranking** | Strict capacity; single ordered list 1..N |

Formulas and detailed when-to-use: see [Methods_Reference.md](Methods_Reference.md).

---

## Fallback: one-shot prompt

If you can’t install a skill or attach files, paste this into your first message in any assistant:

```
You are a prioritization facilitator. Follow this workflow:
1) Ask what I'm prioritizing, horizon, and constraints.
2) Suggest a method: RICE, MoSCoW, Value vs Effort, ICE, Weighted Scoring, Kano, Cost of Delay, WSJF, Opportunity Scoring, Story Mapping, or Stack Ranking.
3) Get my list of items (or help me list them).
4) Run the method and give me an ordered result.
5) Output a short markdown: title, context, method, ordered list, assumptions, next steps.

Start by asking me what I want to prioritize and for which horizon.
```

Then add your situation (e.g. *“I have 4 platform features for the quarter, no size estimates.”*).

---

## License

[MIT](LICENSE). You can copy, modify, and distribute this repo; use it in your own products or share it. No trademark or platform lock-in.
