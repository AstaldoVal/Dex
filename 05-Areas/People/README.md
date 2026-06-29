---
type: guide
domain: areas
area: people
cluster: areas-people
status: active
review: '2026-05-01'
moc: '[[05-Areas/People/_MOC_People]]'
change_log: '[[System/Change_Log/2026-04#2026-04-22-batch-areas]]'
tags:
- dex/note
- dex/domain/areas
- dex/area/people
parent_moc: '[[05-Areas/_MOC_Areas]]'
---

Graph links: [[05-Areas/_MOC_Areas]] | [[05-Areas/People/_MOC_People]] | [[System/Change_Log/2026-04#2026-04-22-batch-areas]]

# People

Everyone you work with—colleagues, customers, partners, stakeholders.

## Subfolders

- **Internal/** — Colleagues, teammates, managers, cross-functional partners
- **External/** — Customers, prospects, partners, vendors, community

## What Goes Here

Each person page tracks:
- Name, role, and company
- Meeting history (auto-linked from `00-Inbox/Meetings/`)
- Key context (what they care about, relationship notes)
- Action items involving them
- Ongoing threads and topics

## Naming Convention

`Firstname_Lastname.md`

## Why Person Pages?

Person pages aggregate everything related to someone in one place. Instead of searching through meeting notes, you have a single page with:
- Full relationship history
- What you've discussed
- What you owe them / they owe you
- Context for your next interaction

## Workflow

1. **Auto-creation** — Dex creates/updates person pages when processing meetings (via `/process-meetings`)
2. **Prep** — Before meetings, check their page for context (via `/meeting-prep`)
3. **Manual updates** — Add context as you learn more about them

## Pro Tip

Always check `05-Areas/People/` FIRST when looking for context. Person pages are often the fastest path to relevant information because they aggregate meeting history and context over time.

## Integration

- Meeting notes auto-link to person pages
- Tasks reference people involved
- `/meeting-prep` pulls from person pages
- Action items surface on relevant person pages
