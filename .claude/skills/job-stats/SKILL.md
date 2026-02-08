---
name: job-stats
description: Track job applications and view analytics. Add applications, update statuses, add feedback, and view detailed statistics with Response Rate, conversion rates, and insights by source/role/industry.
---

# Job Stats — Application Tracking & Analytics

**Command:** `/job-stats`

Track job applications with detailed metrics and analytics. Based on LinkedIn post insights about measuring job search effectiveness.

## When You Run This Command

The user wants to:
- View statistics about their job applications
- Add a new application
- Update application status (responded, interview, offer, rejected)
- Add feedback to an application
- See recommendations based on data

## Core Metrics Tracked

1. **Response Rate** — How many companies responded and how many days it took
2. **Interview Conversion** — From responses, how many led to interviews
3. **Offer Conversion** — From interviews, how many led to offers
4. **Feedback Quality** — Auto rejection vs personalized feedback vs positive
5. **Hypotheses** — Which roles, countries, industries "read" the profile best
6. **Channels** — What works: LinkedIn, job boards, referrals

## Workflow

### View Stats (Default)

When user runs `/job-stats` without additional input:

1. **Load tracker** from `00-Inbox/Job_Search/applications-tracker.json`
2. **Generate report** using `.scripts/job-search/generate-job-stats.js`
3. **Display** the markdown report from `00-Inbox/Job_Search/job-stats.md`
4. **Highlight key insights**:
   - Response Rate and trends
   - Conversion funnel (applied → responded → interview → offer)
   - Best performing sources/roles/industries
   - Recommendations based on data

### Add Application

When user says "add application" or "track application" or provides application details:

1. **Extract details**:
   - Role (required)
   - Company (required)
   - URL (optional)
   - Source (default: linkedin)
   - Date (default: today)
   - Location, industry, notes (optional)

2. **Call script**: `node .scripts/job-search/track-application.js add <role> <company> [url] [source]`

3. **Confirm** with application ID

4. **Optionally sync** with `Applied.md` if user wants backward compatibility

### Update Status

When user says "update status" or "mark as responded/interview/offer/rejected":

1. **Find application** by:
   - Application ID (if provided)
   - Role + Company (fuzzy match)
   - Most recent application if ambiguous

2. **Update status** using script:
   ```bash
   node .scripts/job-search/track-application.js status <id> <status> [date] [notes]
   ```

3. **Available statuses**:
   - `applied` — Application sent
   - `responded` — Got a response
   - `interview` — Interview scheduled/happening
   - `offer` — Received offer
   - `rejected` — Rejected
   - `withdrawn` — Withdrawn application

### Add Feedback

When user says "add feedback" or provides feedback about a response:

1. **Find application** (same logic as status update)

2. **Extract feedback type**:
   - `auto_rejection` — Automatic rejection
   - `generic_rejection` — Generic rejection without details
   - `personalized_rejection` — Personalized rejection with feedback
   - `positive_feedback` — Positive feedback (even if rejected)
   - `no_response` — No response (for tracking)

3. **Call script**: `node .scripts/job-search/track-application.js feedback <id> <type> [text]`

### Quick Actions

- **"Show stats"** → Generate and display full report
- **"List applications"** → Show all applications with IDs and statuses
- **"Show active"** → Show applications without response > 7 days
- **"Best sources"** → Show which sources have highest response rates
- **"Best roles"** → Show which roles have highest response rates

## Integration with Existing System

- **Applied.md**: When adding applications, optionally add entry to `Applied.md` for backward compatibility
- **Job digests**: When user marks `[x]` in digest, offer to add to tracker
- **Job summary**: When generating summary with `/job-summary`, offer to track if user applies

## Output Format

When displaying stats, show:

1. **Key Metrics** (big numbers, easy to scan)
2. **Conversion Funnel** (visual representation)
3. **Hypotheses** (grouped by source/role/industry)
4. **Recommendations** (actionable insights)
5. **Quick Actions** (links to update status, add feedback)

## Example Interactions

**User:** `/job-stats`  
**You:** Generate report, show key metrics, highlight insights

**User:** `/job-stats add Senior PM at VistaCreate`  
**You:** Add application, confirm with ID, ask for URL if not provided

**User:** `/job-stats VistaCreate responded`  
**You:** Find VistaCreate application, update status to responded, calculate response days

**User:** `/job-stats add feedback for VistaCreate - personalized rejection, said not enough gaming experience`  
**You:** Find application, add feedback type and text

## Files Used

- `00-Inbox/Job_Search/applications-tracker.json` — Main data store
- `.scripts/job-search/track-application.js` — CLI tool for tracking
- `.scripts/job-search/generate-job-stats.js` — Report generator
- `00-Inbox/Job_Search/job-stats.md` — Generated report
- `00-Inbox/Job_Search/data/Applied.md` — Legacy tracking (optional sync)
