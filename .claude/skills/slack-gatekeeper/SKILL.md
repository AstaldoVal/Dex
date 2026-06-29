---
name: slack-gatekeeper
description: Batch-triage Slack inbound (with or without Slack integration) using vault context, producing digest + draft replies + tasks.
---

## What this skill is for

When Slack messages are constant and context switching kills the day, run a batch triage that:

- pulls context from the vault (people, projects, week priorities)
- classifies messages into action buckets
- drafts replies in your voice
- creates tasks when a message is a task

This skill supports two modes:

- **Mode A (Slack integration available)**: read messages/threads via Slack MCP.
- **Mode B (Slack integration blocked)**: process Slack **email notifications** via Gmail MCP.

## Inputs

- Time window: `last_4h` | `today` | `since:HH:MM`
- Optional: channels/users allowlist

## Step 1: Load strategic context (vault)

Read:

- `02-Week_Priorities/Week_Priorities.md`
- `System/pillars.yaml`
- `System/user-profile.yaml`

Build a lightweight index:

- people: `05-Areas/People/Internal/`, `05-Areas/People/External/`
- projects: `04-Projects/`
- companies: `05-Areas/Companies/`

## Step 2A: Gather Slack messages (Mode A)

Use Slack MCP to fetch:

- unread DMs and mentions
- or messages since the chosen time window

Group by thread when possible.

## Step 2B: Gather Slack notifications (Mode B)

Use Gmail MCP to fetch Slack notifications:

- Query for Slack sender domains and common Slack notification subjects.
- Filter to INBOX and within the chosen time window.

Extract per notification:

- author (if present)
- channel/DM (if present)
- message snippet
- link to message/thread

## Step 3: Triage logic

For each unit (thread/message/notification):

1) Classify:

- FYI
- question
- request
- clarification
- noise

2) Decide action:

- ignore
- acknowledge_only
- needs_reply
- create_task
- defer

3) Create drafts (only for `needs_reply`):

- short and direct
- if you need time, state when you will return
- avoid AI-writing patterns (see `.claude/reference/ai-writing-signs-banned.md`)

4) Create tasks (only for `create_task`):

- create via Work MCP
- link to the person page if you can infer it
- include message context + link

## Step 4: Output

Write a digest markdown file:

- Path: `00-Inbox/Slack/digest-YYYY-MM-DD-HHMM.md`
- Sections:
  - Summary
  - Triage list
  - Draft replies
  - Tasks created
  - Sanity check (missing context, duplicates, docable answers)

## Safety and trust rules

- Never auto-send replies without explicit confirmation (even in Mode A).
- Prefer one combined reply when multiple items can be answered together.
- If context is missing, make a best guess and mark it as low confidence.

