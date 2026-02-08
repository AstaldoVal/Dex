---
name: email-process
description: Automatically process emails: classify, extract tasks, mark as read, archive, and unsubscribe from unwanted senders
---

Automatically process emails from both personal and work accounts. Classifies emails, extracts action items as tasks, marks important emails as read, archives low-priority emails, and handles unsubscribes.

**Automation rule:** Do everything yourself. Never give the user a list of links or manual steps (e.g. "open these links to unsubscribe"). Use Gmail MCP for mail and **cursor-ide-browser** MCP for any web flow (unsubscribe pages). See `.claude/reference/skill-automation-rule.md`.

## What It Does

- **Classification**: Groups emails by category (Priority, Financial, Shopping, Educational, etc.)
- **Task Extraction**: Finds action items in emails and creates tasks via Work MCP
- **Smart Actions**: Marks priority emails as read, archives marketing emails
- **Unsubscribe**: Automatically finds and processes unsubscribe links
- **Person Linking**: Links emails to person pages when sender is in People/

## Usage

- `/email-process` - Process emails from today (both accounts)
- `/email-process today` - Process today's emails
- `/email-process week` - Process emails from this week
- `/email-process --extract-tasks` - Focus on task extraction only
- `/email-process --unsubscribe` - Focus on unsubscribing from marketing emails

## Arguments

$PERIOD: Optional. "today" | "week" | "all". Default: "today"
$MODE: Optional. "--extract-tasks" | "--unsubscribe" | "all". Default: "all"

---

## Demo Mode Check

Before executing, check if demo mode is active:

1. Read `System/user-profile.yaml` and check `demo_mode`
2. **If `demo_mode: true`:**
   - Display: "Demo Mode Active — Using sample data"
   - Use `System/Demo/` paths instead of root paths
3. **If `demo_mode: false`:** Use normal vault paths

---

## Step 1: Load Strategic Context

Read these files to understand priorities:

1. **Week Priorities**: `02-Week_Priorities/Week_Priorities.md`
   - Extract this week's Top 3 focus items
   - Note keywords and themes

2. **Pillars**: `System/pillars.yaml`
   - Extract pillar IDs and keywords for task categorization

3. **People Index**: Scan `05-Areas/People/Internal/` and `05-Areas/People/External/`
   - Build index of people names and email addresses
   - Used for linking emails to person pages

---

## Step 2: Gather Emails

Fetch emails from both accounts:

1. **Personal email** (gmail-mcp):
   - Query: `after:YYYY/MM/DD` based on $PERIOD
   - Max: 100 messages

2. **Work email** (gmail-work-mcp):
   - Same query and limit

3. **Exclude**:
   - Calendar notifications (already archived)
   - Already archived emails (not in INBOX)

---

## Step 3: Classify Emails

Group emails into categories:

### Priority Categories (Require Attention)
- **Job Application Responses**: Thank you, application confirmations, interview invites
- **Job Alerts (LinkedIn)**: Job notifications from LinkedIn
- **Security & Google Services**: Security alerts, payment confirmations

### Financial & Transactions
- Binance, WhiteBIT, Revolut, KuCoin, banks, brokers

### Shopping & Deliveries
- Amazon, delivery services, shopping notifications

### Educational & Content Newsletters
- AI/ML newsletters, business content, educational content

### Services & Tools
- Discord, Postman, Goodreads, RapidAPI, Supermemory, Eventbrite

### Local Services & Utilities
- McDonald's, Vodafone, RE/MAX, local businesses

### Other Categories
- Language Learning, Gaming & Entertainment, Business & Market Research, Other

**For each email:**
- Mark account (personal/work)
- Extract: subject, from, date, body, snippet
- Check if unread
- Determine category

---

## Step 4: Extract Tasks from Emails

For emails in Priority categories, analyze content for action items:

### Task Detection Patterns

Look for:
- Direct requests: "Can you...", "Please review...", "Need to..."
- Questions requiring action: "When can you...", "Could you..."
- Deadlines: "by Friday", "by EOD", "this week"
- Action verbs: review, approve, respond, prepare, schedule

### Task Creation Rules

1. **Extract action item** from email body
2. **Determine pillar**:
   - Match keywords against `System/pillars.yaml`
   - Default to most relevant pillar
3. **Set priority**:
   - P0: Urgent deadlines (< 24h), security issues
   - P1: Important requests, job-related
   - P2: Normal requests
   - P3: Low priority, informational
4. **Link to person**:
   - If sender is in People/ → add to `people` array
   - Create person page if doesn't exist (if from work domain)
5. **Add context**:
   - Include email snippet
   - Add link to email (Gmail message ID)
   - Include deadline if mentioned

### Task Creation via Work MCP

Use `create_task` tool:
```python
create_task(
    title="[extracted action item]",
    pillar="[matched pillar]",
    priority="[P0/P1/P2/P3]",
    context="From email: [snippet]\nLink: [Gmail message link]",
    people=["[path to person page if sender found]"]
)
```

**Before creating:**
- Check for duplicates (Work MCP does this automatically)
- If ambiguous, ask for clarification
- If duplicate found, show similar tasks and ask: Skip / Merge / Keep Both

---

## Step 5: Smart Actions

### Mark as Read

Automatically mark as read:
- Priority categories (if user confirms or auto-mode enabled)
- Financial transactions (after review)
- Services & Tools notifications

### Archive

Automatically archive:
- Marketing emails (Shopping & Deliveries)
- Educational newsletters (if not priority)
- Local Services marketing

### Unsubscribe

**Rule: Automate fully. Never give the user a list of links or a file to open and click manually.** See `.claude/reference/skill-automation-rule.md`.

Use **cursor-ide-browser** MCP to complete every unsubscribe yourself:

1. **Extract unsubscribe URLs** from each target email (headers + body: "unsubscribe", "remover", "opt-out", "deixar de receber", "отписаться", etc.).
2. **For each URL:**
   - `browser_navigate` to the unsubscribe URL.
   - `browser_wait_for` 2–3 seconds (or until key text appears).
   - `browser_snapshot` to get the page structure.
   - Find and click the confirm/unsubscribe button (e.g. "Confirm", "Unsubscribe", "Remover", "Отписаться") via `browser_click` with the element `ref` from the snapshot.
   - If the page shows a success message or redirects, wait and snapshot again; then move to the next sender.
3. **After processing all:** Archive the corresponding emails via Gmail MCP.
4. **Never:** Create a markdown file with "open these links" or "click these links manually". Never output a list of links as the primary result. If browser MCP is unavailable, say so and propose a debug path (e.g. run with browser available, or add a script that opens URLs), not a manual checklist.

---

## Step 6: Person Page Updates

For emails from people in People/:

1. **Update person page**:
   - Add email to "Recent Emails" section
   - Link to Gmail message
   - Extract context if relevant

2. **Create person page** if:
   - Sender is from work domain (if work email)
   - Email contains important context
   - User explicitly requests

---

## Step 7: Present Results

Show comprehensive report:

```
📧 Email Processing Report - [Date]

=== SUMMARY ===
Total emails: 73 (personal: 72, work: 1)
Processed: 73
Tasks extracted: 5
Marked as read: 17
Archived: 10
Unsubscribed: 3

=== PRIORITY CATEGORIES ===
✅ Job Application Responses: 4
   • Thank you for applying to Rallyware
   • Thank You for Your Interest in Relativity!
   • [Marked as read: 4]

💼 Job Alerts (LinkedIn): 10
   • [Marked as read: 10]

🔒 Security & Google Services: 3
   • [Marked as read: 3]

=== TASKS EXTRACTED ===
1. ^task-20260206-001: Review PR by Friday
   From: John Doe (john@company.com)
   Pillar: job_search
   Priority: P1
   Linked to: 05-Areas/People/External/John_Doe.md

2. ^task-20260206-002: Prepare presentation for Q1 review
   From: Jane Smith (jane@company.com)
   Pillar: land_role
   Priority: P2

=== ACTIONS TAKEN ===
✅ Marked as read: 17 emails
✅ Archived: 10 marketing emails
✅ Unsubscribed: 3 senders
✅ Created: 5 tasks
✅ Updated: 2 person pages
```

---

## Configuration

### Auto-Mode Settings

Create `System/email-processing.yaml` (optional):

```yaml
auto_mark_read:
  priority_categories: true
  financial: true
  
auto_archive:
  marketing: true
  newsletters: false  # Keep educational newsletters
  
auto_extract_tasks:
  enabled: true
  require_confirmation: true  # Ask before creating tasks
  
auto_unsubscribe:
  enabled: true
  marketing_only: true
```

If file doesn't exist, always ask for confirmation before:
- Creating tasks
- Marking emails as read
- Archiving emails

---

## Integration with Daily Plan

When `/daily-plan` runs:
- Check for unread priority emails
- Show count: "You have 5 unread priority emails"
- Suggest running `/email-process` if count > 10

---

## Track Usage (Silent)

Update `System/usage_log.md` to mark email processing as used.

**Analytics (Beta Feature):**
1. Call `check_beta_enabled(feature="analytics")` - if false, skip
2. If beta enabled AND consent given, fire event:
   - Fire event: `email_process_completed`
   - Properties: `emails_processed`, `tasks_extracted`, `emails_archived`, `unsubscribed`
   - Only fires if BOTH: analytics beta activated AND opted in
