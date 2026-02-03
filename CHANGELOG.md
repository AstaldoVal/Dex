# Changelog

All notable changes to Dex will be documented in this file.

**For users:** This changelog tells you what's new and why it matters to you. Each entry explains the benefit, not just what changed technically.

---

## [Unreleased]

### Your Customizations Are Now Protected

**What changed:** When you run `/dex-update`, Dex now carefully preserves things you've personalized:

- **Your personal instructions in CLAUDE.md** — Any text you add between the `USER_EXTENSIONS_START` and `USER_EXTENSIONS_END` markers stays exactly as you wrote it, even after updates.

- **Your custom integrations** — If you've added MCP servers with names starting with `user-` or `custom-` (like `user-gmail` or `custom-hubspot`), they won't be touched during updates.

- **Smoother conflict handling** — If your changes overlap with a Dex update, you'll get a simple choice menu instead of a confusing merge screen. Pick "Keep mine", "Use Dex version", or "Keep both" — no technical knowledge needed.

**Why this matters:** You can safely customize Dex without worrying that updates will erase your work. Personalize freely, update confidently.

---

### Prompt Improvement Works Everywhere

**What changed:** The `/prompt-improver` skill now works even without an Anthropic API key. It automatically uses whatever AI is available.

**Why this matters:** If you're in an environment with restricted API access, prompt improvement still works. No configuration needed — it just adapts.

---

### Background Meeting Sync (Granola Users)

**What changed:** New automation that syncs your meetings from Granola every 30 minutes in the background. One-time setup, then it just works.

**To enable:** Run the setup script in `.scripts/meeting-intel/install-automation.sh`

**Why this matters:** Your meeting notes stay current without you doing anything. When you run `/daily-plan` or look up a person, their recent meetings are already there.

---

### Easier First-Time Setup

**What changed:**
- Clearer error messages when Python version is too old (now requires 3.10+)
- Better guidance when pip packages fail to install
- Streamlined MCP server configuration

**Why this matters:** New users hit fewer roadblocks during setup. If something goes wrong, the error message tells you exactly what to do.

---

### New Skill: `/dex-add-mcp`

**What it does:** Adds new integrations (MCP servers) with the right settings automatically. Names them with `user-` prefix so they're protected during updates.

**Why this matters:** When you want to connect a new tool (Gmail, Notion, etc.), this skill handles the technical setup correctly. Your integrations stay safe during future updates.

---

## [1.0.0] - 2026-01-25

### Initial Release

Dex is your AI-powered personal knowledge system. It helps you organize your professional life — meetings, projects, people, ideas, and tasks — with an AI assistant that learns how you work.

**Core features:**
- **Daily planning** (`/daily-plan`) — Start each day with a clear focus
- **Meeting capture** — Extract action items, update person pages automatically
- **Task management** — Track what matters with smart prioritization
- **Person pages** — Remember context about everyone you work with
- **Project tracking** — Keep initiatives moving forward
- **Weekly and quarterly reviews** — Reflect and improve systematically

**Requires:** Cursor IDE with Claude, Python 3.10+, Node.js
