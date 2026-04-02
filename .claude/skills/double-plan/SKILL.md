---
name: double-plan
description: Stress-test the first plan with a "research team" pass; find weak spots and upgrade the plan to 10/10. Applied automatically after any planning skill delivers its first plan.
---

## Purpose

The **double plan** is a second pass on any plan (daily, weekly, quarterly, project, roadmap). Instead of "approve or give feedback," you run a stress-test: assume the first plan is a 6/10, find weak spots, fix them, and deliver a 10/10 version. Focus on **value and robustness**, not implementation complexity or hours.

**When it runs:** Automatically after you have produced and presented the first plan in any planning skill (e.g. `/daily-plan`, `/week-plan`, `/quarter-plan`, `/project-health`, `/roadmap`). You do not wait for the user to approve; you run the Double Plan phase as part of the same flow.

---

## The Double Plan Phase (Mandatory in Planning Skills)

After you have generated and shown the **first plan** (Plan A):

1. **Run a stress-test in your reasoning:**
   - Act as a team of critical researchers on this plan.
   - Find weak spots: missing dependencies, optimistic assumptions, unclear success criteria, low-value items, misalignment with goals, risks, and blind spots.
   - Do **not** focus on "how many hours" or "implementation complexity." Focus on **value, impact, and robustness**.

2. **Upgrade the plan:**
   - Assume the current plan is 6/10. Fix the weak spots.
   - Produce an upgraded plan (Plan B) that is 10/10 on value and clarity.

3. **Present the result:**
   - **Option A (preferred for daily/week):** Add a short section **"Double Plan: stress-test"** in your reply with:
     - 2–4 bullet points: what was weak, what was strengthened.
     - Any concrete changes to the plan (revised focus, added heads-up, moved/added task).
   - **Option B (for week/quarter):** If the stress-test yields non-trivial changes, update the plan file and then show a brief "What I strengthened" summary plus the key edits.
   - Keep the Double Plan output concise; avoid re-pasting the entire plan.

4. **Skip only if:** The user explicitly says "no stress-test," "skip double plan," or "plan is fine as is" before you run it. Otherwise, run it automatically.

---

## Prompt to Yourself (Internal)

When running the stress-test, use this lens:

> "Stress-test this plan. Run a deep research pass. Find the weak spots, fix them. Assume this plan is 6/10 right now; make it 10/10. Don't think about implementation complexity and hours; focus on value."

---

## Scope

**Applies to:** Any planning output, including:
- `/daily-plan` — after the daily plan is generated and shown
- `/week-plan` — after the week priorities file is generated and summarized
- `/quarter-plan` — after quarter goals are generated and summarized
- `/project-health` — after the project health summary is delivered
- `/roadmap` — after the roadmap review is delivered

**Does not apply to:** Non-planning skills (e.g. job-summary, cover-letter, triage).

---

## Integration

Planning skills reference this skill and include a step like:

**Step N: Double Plan (stress-test)**  
After presenting the plan, run the Double Plan phase per `.claude/skills/double-plan/SKILL.md`: stress-test the plan, fix weak spots, assume 6/10 → 10/10, focus on value. Then add a short "Double Plan: stress-test" summary (what was weak, what was strengthened) to your reply; optionally update the plan file if changes are non-trivial.
