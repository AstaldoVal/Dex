# Applicator — Work Experience top-3 bullet pick (focused Claude round)

Use when Roman or the pipeline needs **per-role bullet curation** without a full step 9 pass.

## Policy (enforce)

- **Default: exactly 3 bullets** per **included** role (`roles[].bullets[]` length ≤ 3).
- **>3 bullets** on a role only if the JD clearly requires it **and** you set either:
  - `roles[].bullets_max` (number > 3) on that role in `work_experience_detail`, **or**
  - `changes[]` row: `{ "action": "keep_bullets", "detail": "<Company> / <Role>: N canonical bullets — <one-line JD reason>" }` with **N > 3**.
- Pick bullets **verbatim** from the inventory (full strings). Do not invent employers, metrics, or tools not in the list.
- One fact once — no near-duplicate wordings of the same outcome.
- Prefer JD fit for the vacancy (title + description). For Scrum Master / agile delivery: ceremonies, impediments, cross-functional coordination, rollout — de-emphasize deep compliance/iGaming unless the role block is kept for coordination only.
- Roles with **no** JD-relevant bullets: set `included: false` on the role (or entire company if policy/chronology says off).

## Output (single ```json fence)

```json
{
  "work_experience_detail": {
    "companies": [
      {
        "name": "Company",
        "included": true,
        "roles": [
          {
            "position": "Title",
            "included": true,
            "bullets": ["full sentence 1", "full sentence 2", "full sentence 3"]
          }
        ]
      }
    ]
  },
  "section_reviews_work_experience": {
    "status": "needs_changes",
    "verdict": "≤100 chars context only",
    "changes": [
      { "action": "keep_bullets", "detail": "Company / Title: 3 canonical bullets" }
    ]
  }
}
```

Optional `section_reviews_work_experience` updates `section_reviews[work_experience]` when merged by the script.

No prose outside the JSON fence.
