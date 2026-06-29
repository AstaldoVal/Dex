---
name: context-manager
description: Manage author context for inbox items, refresh the right vault context, and output a triage-ready Context Pack for the next stage.
---

## What this skill is for
When inbox questions and requests arrive, the fastest way to answer well is not to draft faster.

The fastest way is to make the assistant work from up-to-date context about the author and the related work you already track in your PPM/PMS (Projects, People, Meetings, Tasks, and planning).

This skill:
- resolves the inbox author into your vault person page (or recommends creating it)
- refreshes what it can from already-synced meeting notes and related project/task context
- produces a Context Pack that the next skill uses to do triage and draft replies

It is designed for extension. Today it manages inbox author context. Tomorrow you can add more context scopes.

---

## Inputs
- Inbox item(s), including:
  - author name (if present)
  - message text or snippet
  - link or permalink (if you have one)
- Optional:
  - context scope (default: `inbox_author_question`)
  - days back for refreshing context (default: 30)

---

## Output (triage-ready Context Pack)
The skill outputs a markdown block with these sections:
- Author resolution
  - person page found or recommended creation
  - internal vs external (if inferrable)
- Context sources checked
  - which vault areas it used (projects, person pages, meetings, tasks, priorities, calendar-shaped planning, reference docs)
- Facts confirmed from your vault (bullet list)
- Unverified gaps (bullet list)
  - each gap becomes one precise question for triage
- Next context update suggestion (only if needed)
  - a short recommendation like “run meeting processing for last 30 days” when synced meeting context is missing

---

## Workflow
1. Resolve the author
  - Extract the author identity from the inbox item
  - Match it to a person page in your People area
  - If no person page is found, recommend creating it (do not invent)

2. Refresh context from what is already in the vault
  - Check the author person page for relationship history and recent interactions
  - Pull related meeting notes already stored in Meetings
  - Pull project status and decisions from the related active project notes
  - Pull tasks and priorities that already reference the author
  - Pull planning context that keeps “now” aligned (week priorities and schedule-shaped planning)

3. Produce the Context Pack
  - List facts it can confirm from the vault
  - List gaps it cannot confirm from the vault
  - Convert gaps into one-question-per-gap prompts for triage and reply drafting

4. Safety rules
  - Never fabricate facts
  - If something is missing, output it as an unverified gap

---

## Extensibility model (future scopes)
- `inbox_author_question` (default): author context for inbox messages
- `meeting_followup`: context refresh specifically for meeting follow-ups
- `email_sender`: context refresh for email sender questions

If you add new scopes, keep the same output schema so triage and reply skills stay reusable.

---

## Analytics (optional, anonymous feature adoption)
At completion:
- If Dex analytics is enabled and consent is opted in:
  - fire event: `context_manager_completed`
  - properties: `items_processed`, `context_scope`, `mode`

