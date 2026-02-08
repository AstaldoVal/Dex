---
name: daily-plan
description: Generate context-aware daily plan with calendar, tasks, and priorities. Includes midweek awareness, meeting intelligence, commitment tracking, and smart scheduling suggestions.
---

## Purpose

Generate your daily plan with full context awareness. Automatically gathers information from your calendar, tasks, meetings, relationships, and weekly progress to create a focused plan with genuine situational awareness.

## Usage

- `/daily-plan` — Create today's daily plan
- `/daily-plan tomorrow` — Plan for tomorrow (evening planning)
- `/daily-plan --setup` — Re-run integration setup

---

## Tone Calibration

Before executing this command, read `System/user-profile.yaml` → `communication` section and adapt tone accordingly (see CLAUDE.md → "Communication Adaptation").

---

## Step 0: Demo Mode Check

Before anything else, check if demo mode is active:

1. Read `System/user-profile.yaml`
2. Check `demo_mode` value
3. **If `demo_mode: true`:**
   - Display banner: "Demo Mode Active — Using sample data from System/Demo/"
   - Use demo paths and skip live integrations
4. **If `demo_mode: false`:** Proceed normally

---

## Step 1: Background Checks (Silent)

Run these silently without user-facing output:

1. **Update check**: `check_for_updates(force=False)` - store notification if available
2. **Self-learning checks**: Run changelog and learning review scripts if due

---

## Step 2: Morning Journal Check (If Enabled)

If `journaling.morning: true` in user-profile.yaml, check for today's morning journal and prompt if missing.

---

## Step 3: Monday Weekly Planning Gate

If today is Monday and week isn't planned, offer to run `/week-plan` first.

---

## Step 4: Yesterday's Review Check (Soft Gate)

Check for yesterday's review and extract context (open loops, tomorrow's focus, blocked items).

---

## Step 5: Context Gathering (ENHANCED)

Gather context from all available sources. **This is where the magic happens.**

### 5.1 Midweek Progress Check (NEW)

```
Use: get_week_progress()
```

This is critical for genuine situational awareness. Extract:
- Day of week and days remaining
- Weekly priority status (complete / in_progress / not_started)
- Warnings for priorities with no activity

**Surface this prominently:**

> "It's **Wednesday**. Here's where you are on this week's priorities:
> 
> 1. ✅ **Ship pricing page** — Complete (finished Monday)
> 2. 🔄 **Review proposal** — In progress (2 of 5 tasks done)
> 3. ⚠️ **Customer interviews** — Not started (no activity yet)
> 
> You have 2 days left this week. Priority 3 needs attention."

### 5.2 Calendar Capacity Analysis (NEW)

```
Use: analyze_calendar_capacity(days_ahead=1, events=[...from calendar MCP...])
```

Understand the *shape* of today:

- **Day type**: stacked / moderate / open
- **Meeting count and hours**
- **Free blocks available**
- **Recommendation**: What kind of work fits today

**Surface this:**

> "📅 **Today's shape:** Moderate (4 meetings, 3 hours total)
> 
> **Free blocks:**
> - 8:00-9:30 AM (90 min) — Morning focus time
> - 2:00-4:00 PM (120 min) — Afternoon block
> 
> **Recommendation:** Good for medium tasks and meeting prep. Deep work fits the 2-4pm block."

### 5.2.1 Time-slot table (mandatory)

**Always** build a **Расписание по слотам** table so the user sees which time slots are free vs busy at a glance. The table must include events from **both** personal and work calendar (merge all sources).

**Calendar sources to use:**
- **Apple Calendar:** Fetch today (or target day) from both a work calendar (e.g. Work) and a personal one (e.g. Home, Family) via `calendar_get_today` / `calendar_get_events` for each.
- **Google Calendar:** Fetch from both `gcal_get_today` (or get_events) for **primary** (personal) and for the **work** account's primary calendar if available (e.g. gmail-work MCP or second Google calendar).
- Merge all events from these sources, deduplicate by title+start if needed, sort by start time.

**How to build the table:**
1. Take all events for the day (from both personal and work calendars as above), sort by start time.
2. For each segment of the day, add a row:
   - **Free:** from day start (00:00 or first event minus preceding gap) to first event; between events when there's a gap; from last event end to end of day (e.g. 24:00 or 23:59).
   - **Busy:** one row per event with time range, event title, and duration.
3. Use table columns: **Время** (HH:MM–HH:MM), **Слот** (Свободно / Занято), **Событие** (title or —), **Длительность** (e.g. 30 min, 2h 45min, or "до HH:MM" / "вечер" for open-ended free blocks).

**Example:**

| Время       | Слот     | Событие              | Длительность |
|-------------|----------|----------------------|--------------|
| 00:00–10:30 | Свободно | —                    | до 10:30     |
| 10:30–11:00 | Занято   | Отвезти Мию на танцы | 30 min       |
| 11:00–13:45 | Занято   | CRM-проект           | 2h 45min     |
| 13:45–15:00 | Занято   | Забрать Мию          | 1h 15min     |
| 15:00–16:30 | Свободно | —                    | 1h 30min     |
| 16:30–18:30 | Занято   | Compliance проект    | 2h           |
| 18:30–24:00 | Свободно | —                    | вечер        |

If there are **no events** for the day, output one row: 00:00–24:00 | Свободно | — | весь день.

### 5.3 Meeting Intelligence (NEW)

For each meeting today:

```
Use: get_meeting_context(meeting_title="...", attendees=[...])
```

Get genuine context, not just attendee names:
- **Related project**: What project is this connected to?
- **Project status**: What's outstanding? What's blocked?
- **Outstanding tasks with attendees**: What do you owe them? What do they owe you?
- **Prep suggestions**: What should you review before this meeting?

**Surface this with surprise and delight:**

> "📍 **Meeting: Acme Quarterly Review** (2pm with Sarah Chen, Mike Ross)
> 
> **Related project:** Acme Implementation (Phase 2)
> - Status: On track, but pricing section still in draft
> - Outstanding: You owe Sarah the pricing proposal
> 
> **Prep suggestion:** Review proposal draft, prepare pricing options. Block 30 min before this meeting?"

### 5.4 Commitment Tracking (NEW)

```
Use: get_commitments_due(date_range="today")
```

Surface things you said you'd do:

> "⚡ **Commitments due today:**
> 
> - You told Mike you'd get back to him by Wednesday (from Monday 1:1)
> - Follow up on competitive analysis (from Acme meeting)"

### 5.5 Task Scheduling Suggestions (NEW)

```
Use: suggest_task_scheduling(include_all_tasks=False, calendar_events=[...])
```

Match tasks to available time based on effort classification:

> "📋 **Scheduling suggestions:**
> 
> | Task | Effort | Suggested Time |
> |------|--------|----------------|
> | Write Q1 strategy doc | Deep work (2-3h) | Tomorrow (you have a 3h morning block) |
> | Review Sarah's proposal | Medium (1h) | Today 2-3pm (before Acme meeting) |
> | Reply to Mike | Quick (15min) | Between meetings |
> 
> ⚠️ **Heads up:** You have 2 deep work tasks but today's too fragmented. Consider protecting tomorrow morning."

### 5.6 Email Check (NEW)

Check for new unread emails from both personal and work accounts:

```
Use: gmail_get_unread(max_results=50) for both gmail-mcp and gmail-work-mcp
Then: gmail_classify_emails(message_ids=[...]) to categorize
```

**Process:**
1. Calculate date range: today and yesterday (format: `YYYY/MM/DD`)
2. Try to get unread emails using `gmail_search` with query: `is:unread after:YYYY/MM/DD` (where date is yesterday)
   - Try `gmail-mcp` (personal) first
   - Try `gmail-work-mcp` (work) second
   - If either fails, continue without that account (graceful degradation)
   - Use `max_results=50` to limit results
3. If emails found, extract message IDs and classify using `gmail_classify_emails(message_ids=[...])`
4. Count emails per category
5. Identify priority categories requiring attention:
   - Job Application Responses
   - Job Alerts (LinkedIn)
   - Security & Google Services
   - Financial & Transactions (if urgent)

**If Gmail MCPs are not available:**
- Skip email section entirely (no error, just omit)
- Continue with rest of daily plan

**Surface this prominently:**

> "📧 **New Emails** ({{total}} unread)
> 
> **Priority Categories:**
> - 💼 **Job Application Responses:** 4 (Thank you emails, interview invites)
> - 🔒 **Security & Google Services:** 2 (Payment confirmations)
> 
> **Other Categories:**
> - 💰 **Financial & Transactions:** 3
> - 🛒 **Shopping & Deliveries:** 5
> - 📚 **Educational & Content Newsletters:** 8
> 
> **Quick actions:**
> - Extract tasks from priority emails? (`/email-process --extract-tasks`)
> - Mark priority categories as read?
> - Archive marketing emails?"

**If email count is high (>20):**
> "⚠️ You have {{X}} unread emails. Consider running `/email-process` to organize them."

**If no unread emails:**
> "✅ Inbox is clean — no unread emails."

### 5.7 Standard Context Gathering

Also gather:
- **Calendar**: Today's meetings with times and attendees
- **Tasks**: P0, P1, started-but-not-completed, overdue
- **Week Priorities**: This week's Top 3
- **Work Summary**: Quarterly goals context (if enabled)
- **People**: Context for meeting attendees
- **Self-Learning Alerts**: Changelog updates, pending learnings

---

## Step 6: Synthesis

Combine all gathered context into actionable recommendations:

### Focus Recommendation

Generate 3 recommended focus items based on:
- P0 tasks (highest weight)
- Weekly priority alignment (especially lagging priorities!)
- Meeting prep needs
- Commitments due
- Priority emails requiring action (Job Applications, Security alerts)

**The system should actively recommend, not just list:**

> "Based on your week progress and today's shape, I recommend focusing on:
> 
> 1. **Prep for Acme meeting** — Priority 2 is lagging and this meeting is critical
> 2. **Reply to Mike** — Commitment due today
> 3. **Process priority emails** — 4 job application responses need attention
> 
> (or)
> 
> 3. **Task X from Priority 1** — Keeps momentum on your shipped priority"

### Meeting Prep (Enhanced)

For each meeting, show:
- Who's attending + People/ context
- Related project status
- Outstanding tasks with attendees
- Suggested prep time and what to prepare

### Email Summary (NEW)

Show categorized email overview:
- Priority categories requiring attention (Job Applications, Security)
- Count of emails per category
- Quick action suggestions (extract tasks, mark as read, archive)

### Heads Up (Enhanced)

Flag potential issues:
- Weekly priorities with no activity (midweek warning)
- Commitments due today
- Back-to-back meetings
- P0 items with no time blocked
- Deep work tasks with no suitable slot this week
- High unread email count (>20) — suggest `/email-process`

---

## Step 7: Generate Daily Plan

Create `07-Archives/Plans/YYYY-MM-DD.md`.

**Output rule (mandatory):** After saving the plan file, **always output the full plan content in the chat** — the user should be able to read the daily plan in the conversation without opening the file. Keep saving to the file as usual; then paste or render the plan (TL;DR, week progress, time-slot table, focus, events, emails, heads up) in your reply so it's readable in chat.

```markdown
---
date: YYYY-MM-DD
type: daily-plan
integrations_used: [calendar, tasks, people, work-intelligence]
---

# Daily Plan — {{Day}}, {{Month}} {{DD}}

## TL;DR
- {{1-2 sentence summary including week progress}}
- {{X}} meetings today, day is {{stacked/moderate/open}}
- {{Key focus area based on week priorities}}
- {{If emails found:}} {{X}} unread emails ({{priority_count}} priority) — {{action suggestion if high}} {{Else:}} Inbox is clean {{End if}}

---

## 📊 Week Progress (Midweek Check)

**Day {{X}} of 5** — {{days_remaining}} days left this week

| Priority | Status | Notes |
|----------|--------|-------|
| {{Priority 1}} | ✅ Complete | Finished {{day}} |
| {{Priority 2}} | 🔄 In progress | {{X}} of {{Y}} tasks done |
| {{Priority 3}} | ⚠️ Not started | Needs attention |

**This week's focus:** {{Recommendation based on lagging priorities}}

---

## 📅 Today's Shape

**Day type:** {{stacked/moderate/open}} ({{X}} meetings, {{Y}} hours)

### Расписание по слотам (сегодня)

| Время       | Слот     | Событие   | Длительность |
|-------------|----------|-----------|--------------|
| {{HH:MM–HH:MM}} | Свободно/Занято | {{Event title or —}} | {{duration or "до HH:MM"/"вечер"}} |
| … one row per segment (free blocks and events) for the full day … |

*Build this table from events from **both** personal and work calendars: merge, sort by start time, then add a row for each free block (Свободно, Событие: —) and each event (Занято, Событие: title, Длительность: e.g. 30 min). If no events: one row 00:00–24:00 Свободно.*

**Свободные блоки:** {{list free ranges}}. Остальное — занято календарём (или: день свободен).

**Best for:** {{Quick tasks only / Medium tasks / Deep work opportunity}}

---

## ⚡ Commitments Due Today

- [ ] {{Commitment}} — from {{source}}
- [ ] {{Commitment}} — from {{source}}

---

## 🎯 Today's Focus

**If I only do three things today:**

1. [ ] {{Focus item 1}} — {{Pillar}} *(supports Week Priority #X)*
2. [ ] {{Focus item 2}} — {{Pillar}} *(supports Week Priority #Y)*
3. [ ] {{Focus item 3}} — {{Pillar}}

---

## 📍 Meetings (with Context)

### {{Time}} — {{Meeting Title}}

**Attendees:** {{Names}}
**Related project:** {{Project name}} ({{status}})
**Outstanding with them:**
- {{Task/commitment}}

**Prep needed:** {{What to review/prepare}}
**Suggested prep time:** {{Block X min before}}

---

### {{Time}} — {{Meeting Title}}

[Repeat for each meeting]

---

## 📋 Task Scheduling

| Task | Effort | Suggested Slot | Reason |
|------|--------|----------------|--------|
| {{Task}} | Deep work | {{Day/time}} | {{Reason}} |
| {{Task}} | Medium | {{Day/time}} | {{Reason}} |
| {{Task}} | Quick | Between meetings | Batch these |

{{If deep work capacity warning}}
> ⚠️ You have {{X}} deep work tasks but only {{Y}} suitable slots this week. Consider protecting time or deferring.

---

## 📧 New Emails

*Only include this section if emails were found. If no emails or Gmail MCP unavailable, skip entirely.*

**{{Total}} unread emails** ({{personal_count}} personal, {{work_count}} work)

### Priority Categories

**💼 Job Application Responses:** {{count}}
- {{Email subject}} — {{from}} *(show max 3, then "... and X more")*
- {{Email subject}} — {{from}}

**🔒 Security & Google Services:** {{count}}
- {{Email subject}} — {{from}}

### Other Categories

**💰 Financial & Transactions:** {{count}}
**🛒 Shopping & Deliveries:** {{count}}
**📚 Educational & Content Newsletters:** {{count}}
**🔧 Services & Tools:** {{count}}

**Quick actions:**
- Extract tasks from priority emails? (`/email-process --extract-tasks`)
- Mark priority categories as read?
- Process all emails? (`/email-process`)

{{If email count > 20:}}
> ⚠️ You have {{X}} unread emails. Consider running `/email-process` to organize them.

---

## ⚠️ Heads Up

- {{Warning about lagging weekly priority}}
- {{Commitment due today}}
- {{Back-to-back meetings}}
- {{High unread email count warning if applicable}}
- {{Other flags}}

---

*Generated: {{timestamp}}*
*Week progress: {{X}}/{{Y}} priorities on track*
```

**Then:** Output the full plan (same content as above) in the chat so the user can read it without opening the file.

---

## Step 8: Track Usage (Silent)

Update `System/usage_log.md` to mark daily planning as used.

**Analytics (Beta Feature):**
1. Call `check_beta_enabled(feature="analytics")` - if false, skip analytics entirely
2. If beta enabled, check consent and fire event if opted in:
   - Event: `daily_plan_completed`
   - Properties: `meetings_count`, `tasks_surfaced`, `priorities_count`
3. Only fires if BOTH: analytics beta activated AND `analytics.enabled: true`

---

## Graceful Degradation

The plan works at multiple levels:

### Full Context (All MCPs available)
- Complete week progress, meeting intelligence, scheduling suggestions
- Email categorization and priority detection
- Maximum "surprise and delight"

### Partial Context (Work MCP + Gmail MCP)
- Week progress and task scheduling
- Email categorization
- No meeting context (prompt user to add manually)

### Minimal Context (Work MCP only)
- Week progress and task scheduling
- No email or meeting context (prompt user to add manually)

### No MCPs
- Interactive flow asking about priorities
- Basic daily note

**Calendar and Gmail must work in every chat.** When running /daily-plan, always call the calendar and Gmail MCP tools (see table below) so the plan includes real meetings and inbox. If those tools are not available in this session, tell the user once in your reply (not in the plan file): to get calendar and email in every new chat they must run `python3 .scripts/cursor-sync-mcp.py` from the repo root and then fully quit and reopen Cursor. See "Calendar & Gmail in every Cursor chat" below and `.claude/reference/gmail-mcp-setup.md`.

---

## MCP Dependencies (Updated)

| Integration | MCP Server | Tools Used |
|-------------|------------|------------|
| Calendar (Apple) | dex-calendar-mcp | `calendar_get_today`, `calendar_get_events_with_attendees` |
| Calendar (Google) | dex-google-calendar-mcp | `gcal_get_today`, `gcal_get_events_with_attendees` — use when user uses Google Calendar MCP only |
| Granola | dex-granola-mcp | `get_recent_meetings` |
| Work | dex-work-mcp | `list_tasks`, `get_week_progress`, `get_meeting_context`, `get_commitments_due`, `analyze_calendar_capacity`, `suggest_task_scheduling` |
| Gmail (Personal) | gmail-mcp | `gmail_search`, `gmail_get_unread`, `gmail_classify_emails` |
| Gmail (Work) | gmail-work-mcp | `gmail_search`, `gmail_get_unread`, `gmail_classify_emails` |### Calendar & Gmail in every Cursor chatCursor often does not load project-level `.cursor/mcp.json` in chats (known bug). To ensure calendar and Gmail MCPs are available in **every new chat**:1. From the Dex repo root run: `python3 .scripts/cursor-sync-mcp.py` — this copies the project MCP config to `~/.cursor/mcp.json` with absolute paths.
2. **Fully quit Cursor** (Quit, not just Reload Window) and reopen.
3. After that, new chats will have Work, Calendar, Gmail, Google Calendar and other MCPs. If you add new MCPs to `.cursor/mcp.json`, run the script again and restart Cursor.
