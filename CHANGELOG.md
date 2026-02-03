# Changelog

All notable changes to Dex will be documented in this file.

**For users:** Each entry explains what was frustrating before, what's different now, and why you'll care.

---

## [Unreleased]

### 🎉 Safe Personalization — Make Dex Yours Without Fear of Updates

This release solves one of the biggest tensions in using Dex: **wanting to customize it, but worrying that updates will undo your work.**

Previously, personalizing Dex felt risky. You might add custom instructions, connect your own tools, or tweak how things work — but then an update would come along and overwrite everything. You'd have to choose: stay stuck on an old version, or lose your customizations.

**Now you can have both.** Customize freely, update confidently.

---

#### What's Protected

**Your personal instructions in CLAUDE.md**

Before: Any text you added to CLAUDE.md would get overwritten when you updated Dex.

Now: Add your personal instructions between the `USER_EXTENSIONS_START` and `USER_EXTENSIONS_END` markers. Everything inside stays exactly as you wrote it, no matter how many times you update.

---

**Your custom integrations (MCP servers)**

Before: If you connected Gmail, Notion, or any other tool, updates might overwrite your configuration. You'd have to set it up again.

Now: Name your integrations with `user-` or `custom-` prefix (like `user-gmail` or `custom-notion`), and they're automatically protected. Updates will never touch them.

**New skill: `/dex-add-mcp`** — Adds integrations the safe way automatically. No config files to edit, no prefixes to remember. Just run the command and your integration is protected by default.

**New safeguard:** If you try to add an integration without protection, Dex will gently remind you and suggest the safe approach.

---

**Guided conflict resolution**

Before: When your changes overlapped with an update, you'd see a scary "merge conflict" screen with cryptic symbols. Most people would panic or give up.

Now: Dex walks you through any conflicts with simple choices:
- "Keep my version" — preserve what you had
- "Use Dex version" — take the update
- "Keep both" — rename one so nothing is lost

No technical knowledge needed. Just pick what you want, and Dex handles the rest.

---

#### Why This Matters

Dex gets better over time. New features, bug fixes, improvements. But those updates are only valuable if you can actually use them.

With safe personalization, you're no longer stuck choosing between "my customizations" and "latest features." You get both. Update whenever you want, knowing your personal setup is protected.

**This is how Dex should have worked from the start.** Now it does.

---

### Background Meeting Sync (Granola Users)

**Before:** To get your Granola meetings into Dex, you had to manually run `/process-meetings`. Each time, you'd wait for the MCP server to start, watch it process, then continue your work. Easy to forget, tedious when you remembered.

**Now:** A background job syncs your meetings from Granola every 30 minutes automatically. One-time setup, then it just runs.

**To enable:** Run `.scripts/meeting-intel/install-automation.sh`

**Result:** Your meeting notes are always current. When you run `/daily-plan` or look up a person, their recent meetings are already there — no manual step needed.

---

### Prompt Improvement Works Everywhere

**Before:** The `/prompt-improver` skill required an Anthropic API key configured separately. In restricted environments or when the API was unavailable, it just failed.

**Now:** It automatically uses whatever AI is available — no special configuration needed.

**Result:** Prompt improvement just works, regardless of your setup.

---

### Easier First-Time Setup

**Before:** New users hit cryptic error messages during setup. "Python version mismatch" or "pip install failed" with no guidance on what to do next. Many got stuck and needed help.

**Now:**
- Clear error messages explain exactly what's wrong and how to fix it
- Python 3.10+ requirement is checked upfront with installation instructions
- MCP server configuration is streamlined with fewer manual steps

**Result:** New users get up and running faster with less frustration.

---

## [1.0.0] - 2026-01-25

### Initial Release

Dex is your AI-powered personal knowledge system. It helps you organize your professional life — meetings, projects, people, ideas, and tasks — with an AI assistant that learns how you work.

**Core features:**
- **Daily planning** (`/daily-plan`) — Start each day with clear priorities
- **Meeting capture** — Extract action items, update person pages automatically
- **Task management** — Track what matters with smart prioritization
- **Person pages** — Remember context about everyone you work with
- **Project tracking** — Keep initiatives moving forward
- **Weekly and quarterly reviews** — Reflect and improve systematically

**Requires:** Cursor IDE with Claude, Python 3.10+, Node.js
