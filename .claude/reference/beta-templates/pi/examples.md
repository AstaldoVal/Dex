# Pi Examples - Copy and Try

Real prompts you can use right now. Copy any of these and run them.

---

## Getting Started Examples

### Your First Skill

Start simple. Build something you'll use tomorrow:

```
/pi-build a skill that shows my meetings for today with attendee names
```

**What Pi creates:** A skill called `/my-meetings-today` that pulls calendar data and formats it nicely.

**Try it:** After Pi finishes, run `/my-meetings-today`

---

### Improve What You Built

Not quite right? Iterate:

```
/pi-improve my-meetings-today to also show the meeting description and highlight external attendees
```

---

## Productivity Examples

### Meeting Commitment Extractor

Automatically pull out promises from meeting notes:

```
/pi-build a skill that scans my recent meeting notes and extracts any commitments I made - things like "I'll do X" or "Let me follow up on Y" - and lists them with the meeting they came from
```

**What you get:** A skill that reads through `00-Inbox/Meetings/` and pulls out action items you said you'd do.

---

### Stale Relationship Finder

Find people you haven't connected with:

```
/pi-build a skill that shows me everyone in my People folder that I haven't had a meeting with in the last 30 days, sorted by how long it's been
```

**What you get:** A relationship maintenance tool that checks meeting history against your people pages.

---

### Focus Time Calculator

Understand your meeting load:

```
/pi-build a skill that analyzes my calendar for this week and tells me: total meeting hours, longest focus block, and days with the most meetings
```

**What you get:** A quick way to understand if you have time for deep work.

---

## Sales & Account Management

### Deal Health Dashboard

Quick view of your pipeline:

```
/pi-build a skill that scans my Projects folder for anything tagged as a deal and shows me: last activity date, next scheduled meeting, and any overdue tasks - highlight deals with no activity in 14+ days
```

---

### Pre-Call Briefing Generator

Never walk into a call unprepared:

```
/pi-build a skill called call-prep that takes a company name, finds their page in my vault, pulls recent meeting notes, open tasks, and key contacts, and gives me a one-page briefing I can review in 2 minutes
```

**Usage:** `/call-prep Acme Corp`

---

### Competitor Mention Tracker

Know when competitors come up:

```
/pi-build a skill that searches my meeting notes for mentions of [Competitor1, Competitor2, Competitor3] and shows me which meetings mentioned them and in what context
```

---

### Follow-Up Generator

Turn meeting notes into action:

```
/pi-build a skill that reads the most recent meeting note, extracts action items, identifies who owns each item, and drafts a follow-up email I can send
```

---

## Product & Strategy

### Feature Request Aggregator

Collect asks from across conversations:

```
/pi-build a skill that searches my meeting notes for phrases like "it would be great if", "we need", "can you add", "feature request" and compiles them into a categorized list with source meetings
```

---

### Decision Log

Track what was decided and when:

```
/pi-build a skill that scans meeting notes for decisions - look for phrases like "we decided", "the decision is", "going with", "agreed to" - and creates a running log with dates and context
```

---

### Stakeholder Sentiment Tracker

Gauge how conversations are going:

```
/pi-build a skill that analyzes my meeting notes with a specific person or company and summarizes the general sentiment over time - are things trending positive, negative, or neutral?
```

---

## Personal Productivity

### Morning Briefing

Start your day informed:

```
/pi-build a skill called morning-brief that shows me: today's meetings with attendees, overdue tasks, tasks due today, and any meetings I have with people I haven't met before
```

---

### Weekly Review Prep

Make weekly reviews easier:

```
/pi-build a skill that prepares my weekly review by showing: meetings I had this week, tasks I completed, tasks I added, and people I met with for the first time
```

---

### Energy Management

Track what drains vs. energizes you:

```
/pi-build a skill that lets me tag meetings as "energizing" or "draining" after they happen, stores this in the meeting note, and shows me patterns over time
```

---

### Learning Capture

Don't lose insights:

```
/pi-build a skill called capture-learning that takes a short note about something I learned, tags it with the source (meeting, article, conversation), and saves it to a Learnings file organized by month
```

**Usage:** `/capture-learning The key to good demos is starting with the customer's problem, not the product`

---

## Team & Management

### 1:1 Prep

Never waste a 1:1:

```
/pi-build a skill that takes a person's name, finds their page, shows: last 1:1 notes, open action items for them, open action items from them, and suggests topics based on recent activity
```

---

### Team Meeting Tracker

Know who's meeting with whom:

```
/pi-build a skill that analyzes my calendar for the past month and shows me meeting frequency between team members - who meets a lot, who might be siloed
```

---

### Feedback Collector

Gather feedback for reviews:

```
/pi-build a skill that searches my meeting notes and messages for feedback I've given or received about a specific person, organized by date
```

---

## Custom Workflows

### End of Day Ritual

Automate your shutdown routine:

```
/pi-build a workflow called end-of-day that: moves incomplete daily tasks to tomorrow, captures any quick notes I want to add, shows my first meeting tomorrow, and asks what I'm grateful for today
```

---

### Project Kickoff Template

Start projects consistently:

```
/pi-build a skill that creates a new project page with: standard sections (Overview, Goals, Stakeholders, Timeline, Risks), prompts me to fill in key info, and creates placeholder person pages for stakeholders I mention
```

---

### Meeting to Tasks Pipeline

Never lose action items:

```
/pi-build a workflow that runs after I add a meeting note, extracts action items, creates tasks in Tasks.md, links them to relevant people pages, and updates the meeting note to show the tasks were captured
```

---

## Advanced Examples

### Custom Alert System

Get notified about important patterns:

```
/pi-build a skill that runs daily and alerts me if: any deal has no meeting scheduled in next 14 days, any person marked as "key contact" hasn't been met in 30 days, or any project has overdue tasks
```

---

### Insight Synthesizer

Find patterns across meetings:

```
/pi-build a skill that takes a topic, searches all my meeting notes for mentions of that topic, and synthesizes the key points and evolution of thinking about it over time
```

**Usage:** `/synthesize pricing strategy`

---

### Role-Based Views

See your world through different lenses:

```
/pi-build a skill that shows me my vault from the perspective of [specific role] - what would they care about? What meetings matter? What tasks are relevant?
```

---

## Tips for Better Results

### Be Specific

Instead of:
```
/pi-build a meeting tool
```

Try:
```
/pi-build a skill that summarizes my meeting notes into 3 bullet points with action items clearly marked
```

### Name Things

Give your skill a name:
```
/pi-build a skill called quick-prep that...
```

This makes it easier to use and improve later.

### Describe the Output

Tell Pi what you want to see:
```
/pi-build a skill that shows results as a markdown table with columns for Name, Last Meeting, and Days Since
```

### Start Small, Then Iterate

Build the simplest version first:
```
/pi-build a skill that lists my tasks
```

Then enhance:
```
/pi-improve my-tasks to group by project and highlight overdue items
```

---

## Share What You Build

Created something useful? Share it in the beta channel! Include:
1. The prompt you used
2. What it does
3. Any iterations you made

Your best ideas might become built-in Dex features.
