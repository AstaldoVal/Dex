---
name: physical-check-custom
description: Check current physical state, calculate readiness score, and get personalized exercise/recovery recommendations. Reads today's log from 05-Areas/Physical/logs/. For filling the log first, use /physical-daily-checkin. Use when asking about physical state, what to do for exercise today, recovery protocols, or /physical-check.
---

## Purpose

Assess today's physical state and give a concrete, actionable prescription for movement, exercise, or recovery. Based on the daily log data and the exercise library.

## Trends dashboard (charts)

- **Regenerate:** `npm run physical:dashboard` — rebuilds `.scripts/physical/dashboard.html` (readiness, sleep, energy, steps, HRV, resting HR, weight when present) and opens it in the default browser.
- **Text snapshot** (recommendations in prose, maintained manually or by assistant): `05-Areas/Physical/Dashboard_Recommendations.md`

## Usage

- `/physical-check` — Full check based on today's log
- `/physical-check --yesterday` — Check yesterday's data
- `/physical-check --date YYYY-MM-DD` — Specific date
- `/physical-check --log` — Prompt for quick manual input if no log exists yet
- `/physical-check --week` — Weekly summary of state and patterns

---

## Step 1: Load Today's Data

1. Determine target date (default: today `YYYY-MM-DD`)
2. Read `05-Areas/Physical/logs/{date}.json`
3. Read `05-Areas/Physical/profile.md` for personal context
4. Read `05-Areas/Physical/exercise-library.md` for protocol library

**If log file doesn't exist:**
- **Preferred:** run **`/physical-daily-checkin`** (full questionnaire in chat, merge-safe with Health) — see `.claude/skills/physical-daily-checkin/SKILL.md`
- Or run `npm run physical:health-sync` then `npm run physical:checkin` (terminal)
- Fallback: quick inline check-in (6 core questions in chat), same as `--short` scope

---

## Step 2: Calculate Readiness Score

**Single source of truth:** `.scripts/physical/physical-readiness.cjs` — function `calculateReadiness(data)`. Do not duplicate formulas in chat; if the log already has `readiness_score` after sync or check-in, you may use it as-is when it matches the same inputs.

**Base signal (subjective + body):** sleep quality, energy, muscle soreness average, posture/tension, nutrition — combined into a 0–100 base (see module).

**Adjustments (defaults 5/10 if missing):** stress, mood, mental fatigue pull the score when load is high psychologically.

**Penalties:** active illness; alcohol (units-based light penalty).

**Score tiers (readinessLabel in module):**
1. 80–100: High — train hard
2. 60–79: Moderate — normal training, listen to the body
3. 40–59: Low — light movement only
4. 0–39: Very Low — rest and recovery first

---

## Step 3: Identify Active Conditions

Based on log data, flag which conditions apply:

- Low energy: `energy ≤ 4`
- High energy: `energy ≥ 8`
- Poor sleep: `sleep_hours < 6` OR `sleep_quality ≤ 4`
- Good sleep: `sleep_hours ≥ 7` AND `sleep_quality ≥ 7`
- Neck/upper back tension: posture_tension includes neck, upper_back, shoulders
- Lower back tension: posture_tension includes lower_back
- Leg soreness: muscle_soreness zones include legs, quads, hamstrings, calves
- Upper body soreness: muscle_soreness zones include chest, back, shoulders, arms
- Full body soreness: soreness in 3+ zones with avg intensity ≥ 2
- Low nutrition: `nutrition ≤ 4`
- High stress: energy ≤ 4 AND notes contain stress/burnout/anxiety/exhausted

---

## Step 4: Build Today's Prescription

Based on readiness tier and active conditions, select relevant protocols from the exercise library.

**Structure the prescription as:**

1. **Morning Routine** — 5-15 min (pick tier-appropriate from library)
2. **Main Movement** — 0-60 min (based on readiness)
3. **Tension Relief** — specific protocols for active tension zones
4. **Desk Break Protocol** — always include if working day
5. **Evening** — sleep/wind-down protocol if sleep was poor

Be specific: name the protocol, give duration, explain the key benefit in one sentence.

---

## Step 5: Pattern Alert (if week data available)

Check if logs for the past 3-7 days exist and detect:
- Declining readiness trend (3+ days)
- Persistent tension zones (same zone 3+ days)
- Chronic poor sleep (4+ days sleep_quality < 5)
- Low energy streak (3+ days energy < 5)

If a pattern is detected, flag it with a brief note:
> ⚠️ Pattern: Neck tension for 4 consecutive days — desk break protocol must become non-negotiable.

---

## Step 6: Save Recommendation to Log

After generating the prescription, save it to the log:

1. Read the existing `logs/{date}.json`
2. Add `recommendation` field with a brief summary (2-4 sentences, plain text)
3. Save updated JSON
4. Regenerate the MD file using the format below

**MD format for updated log:**

```markdown
# Physical State — {date}

## Readiness Score: {score}/100 {emoji} {label}

*{description}*

---

## Metrics

- **Energy:** {energy}/10
- **Sleep:** {sleep_hours}h — Quality {sleep_quality}/10
- **Muscle Soreness:** {soreness_zones or None}
- **Posture / Tension zones:** {tension_zones or None}
- **Nutrition:** {nutrition}/10
{if steps: - **Steps:** {steps}}
{if active_minutes: - **Active Minutes:** {active_minutes}}

---

## Notes

{notes or —}

---

## Today's Prescription

{recommendation text, formatted with bullet list of protocols}

---

*Logged: {logged_at}*
```

---

## Step 7: Output in Chat

Present the result clearly:

```
## 🏃 Physical Check — {date}

**Readiness: {score}/100 {emoji} {label}**
{description}

---

### Today's State
- Energy: {energy}/10
- Sleep: {sleep_hours}h (quality {sleep_quality}/10)
- Soreness: {soreness_summary}
- Tension: {tension_summary}
- Nutrition: {nutrition}/10
{if apple health data: - Steps: {steps} | Active: {active_minutes} min}

---

### Active Conditions
{list of flagged conditions}

---

### 🎯 Today's Prescription

**Morning ({duration}):**
{protocols}

**Main Movement ({duration}):**
{protocols}

**Tension Relief ({duration}):**
{protocols}

**Desk Breaks (every 90 min):**
{desk break protocol}

**Tonight:**
{evening protocols if relevant}

---

{if pattern detected:}
⚠️ **Pattern Detected:** {description}

---

*Run `npm run physical:checkin` tomorrow morning to keep tracking.*
```

---

## Inline Check-in (fallback when no log)

If the log doesn't exist and user says "just check me now" or `/physical-check --log`, ask these questions directly in chat:

1. Energy (1-10)?
2. Sleep last night: hours and quality (1-10)?
3. Any muscle soreness? Where and how strong (1=mild, 3=strong)?
4. Any tension from sitting? (neck / upper back / lower back / shoulders)
5. Nutrition today so far (1-10)?
6. Anything else to note?

Then proceed with the assessment using those answers. At the end, offer to save it: "Want me to save this as today's log?"

---

## Week View (`/physical-check --week`)

If 7+ daily logs exist:

1. Load all logs for the past 7 days
2. Calculate average readiness, energy, sleep
3. Show **day-by-day trend as a numbered list** (date, readiness, energy, sleep hours, soreness summary, tension summary — no markdown tables)
4. Flag patterns
5. Recommend focus for next week

Example shape (lists only):

- **2026-03-20:** Readiness 72, energy 6, sleep 6.5h, soreness legs 2, tension neck
- **2026-03-21:** Readiness 65, energy 5, sleep 5h, soreness legs 1, tension neck
- **7-day averages:** Readiness 68, energy 5.8, sleep 6.1h
- **Patterns:** Neck tension 5 of 7 days — desk breaks non-negotiable
- **Trend:** Readiness down across the week — consider a rest day
