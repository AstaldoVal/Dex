# Applicator Step 9 — section feedback contract (Claude)

Roman reads **actionable per-section edits**, not narrative rollups. Step 10 still uses `apply`; `section_reviews` is the human + gate contract for **every** resume block.

**Hard shape (Roman):**

1. **`verdict`** — only a **short context header** (≤100 characters): why this block matters for the JD. **No** “lead with…”, “drop…”, “reorder…” instructions in `verdict`.
2. **`needs_changes`** — **every** required edit is a **separate** row in `changes[]` (non-skills) or in `skills_detail` + mirrored `changes[]` (skills layout). Roman/traceability ignore rollup prose.
3. **`ok`** — `changes: []`; one-line `verdict` that no edit is required.

## Mandatory: `section_reviews[]`

Claude **must** output one object per Applicator section (all nine, every round):

| `section_id` | Label |
|---|---|
| `contact_info` | Contact |
| `target_title` | Target Title |
| `professional_summary` | Professional Summary |
| `skills` | Skills |
| `work_experience` | Work Experience |
| `education` | Education |
| `certifications` | Certifications |
| `projects` | Projects |
| `interests` | Interests |

Each entry:

```json
{
  "section_id": "skills",
  "label": "Skills",
  "status": "ok",
  "verdict": "One or two sentences: fit vs JD or why no change.",
  "changes": []
}
```

- **`status`**: `ok` | `needs_changes` only.
- **`ok`**: JD fit is sufficient; **`changes` must be `[]`**; `verdict` one line: no edit required.
- **`needs_changes`**: `verdict` = short context only (≤100 chars); **all** edits in **`changes[]`** and/or **`skills_detail`** (skills). Gate **fails** if actionable text lives only in `verdict`.

Non-skills `changes[]` items:

```json
{ "action": "replace", "detail": "…" }
{ "action": "enable", "detail": "…" }
{ "action": "disable", "detail": "…" }
{ "action": "reorder", "detail": "…" }
```

Mirror the same intent in `apply` when step 10 can patch automatically.

## Work Experience + chronology cutoff

Roman policy: positions **at or older than** Route4Me Lead PM default **OFF** (`cutoff_after_route4me_lead_pm`).

**Override (automatic):** any `work_experience` row in `section_reviews.changes[]` that names a company/role (reorder, keep bullets, lead with, etc.) is treated as **JD-relevant**. Step 10 inject sets `chronology_override: true` on matching `apply.work_experience` rows **before** chronology inject — Claude feedback wins over default cutoff for that role only.

Roles **not** mentioned in `section_reviews` stay OFF by chronology policy.

## Skills: `skills_detail` (required when `section_id` === `skills`)

Use Roman's review shape — **block order**, then per block **Keep** / **Убрать или слить**.

```json
{
  "section_id": "skills",
  "label": "Skills",
  "status": "needs_changes",
  "verdict": "Scrum Master JD; skills need restructuring.",
  "changes": [
    { "action": "layout", "detail": "Remove Interests section for this vacancy" },
    { "action": "layout", "detail": "English C1 → Language field, not a skill chip" }
  ],
  "skills_detail": {
    "block_order": [
      "iGaming & Commercial Tools",
      "Product Management",
      "Analytics & Data",
      "Tools",
      "Technical"
    ],
    "blocks": [
      {
        "name": "iGaming & Commercial Tools",
        "keep": ["Live Casino", "Commercial Tools", "Partner-facing & Operator-facing Tools"],
        "remove_or_merge": [
          "Live Casino Commercial Tools → Live Casino + Commercial Tools",
          "User Roles & Permissions → Access Control & Role-based Permissions"
        ]
      }
    ],
    "layout_notes": [
      "English C1 → Language field, not a skill chip",
      "Remove Interests section for this vacancy"
    ]
  }
}
```

When **`status`: `ok`**, still include **`skills_detail.block_order`** (current optimal order) and **`blocks`** with **`keep`** only (no remove list), or empty `blocks` if unchanged.

**`layout_notes`**: cross-cutting (Language line, Interests off, 2-page budget) — not duplicated inside every block.

Populate **`apply.skills`**, **`apply.skills_remove`**, **`apply.skills_reorder`**, **`apply.layout`** from `skills_detail` + `layout_notes` so step 10 can apply without re-interpretation.

**Step 10 (universal):** apply runs `pruneSkillsContentToDetail`; eval runs `verifySkillsStep10CanonicalGates` — **SK19** same-block duplicate, **SK20** cross-block duplicate / wrong canonical block, **SK21** chip outside `keep` or removed layout block still ON. Failures appear in `step-10-eval.json` with those prefixes; step 10 does not pass until clean.

## Work Experience: `work_experience_detail` (required)

Same role as `skills_detail` for skills: **canonical whitelist** for step 10. Every JD-relevant role that should appear on the resume must be listed with **full bullet strings** (complete sentences, ≥40 characters). Step 10 will:

1. Turn **OFF** every bullet in that role not listed in `bullets[]`.
2. Turn **ON** each listed bullet with **exact** text (no near-duplicate siblings).
3. Fail eval if enabled bullets do not match `work_experience_detail` byte-for-byte (normalized whitespace).
4. **Default ≤3 bullets per included role** in `bullets[]`. More than 3 only when Claude sets `roles[].bullets_max` or `changes[]` `keep_bullets` names **N > 3** with JD reason in the same line. Step 9 `validateWorkExperienceDetail` and step 10 `verifyEnabledBulletsPerRoleLimit` enforce this.

```json
{
  "section_id": "work_experience",
  "label": "Work Experience",
  "status": "needs_changes",
  "verdict": "Scrum Master JD; trim and reorder experience.",
  "changes": [
    { "action": "keep_bullets", "detail": "Glorium Technologies / Senior Product Manager/Product Owner: 3 canonical bullets" }
  ],
  "work_experience_detail": {
    "companies": [
      {
        "name": "Glorium Technologies",
        "included": true,
        "roles": [
          {
            "position": "Senior Product Manager/Product Owner",
            "included": true,
            "bullets": [
              "Increased team efficiency by 50% within 6 months by rolling out SCRUM principles and standardizing ceremonies, intake, and release cadence across multiple parallel projects."
            ]
          }
        ]
      }
    ]
  }
}
```

**Claude rules:**

- **`bullets[]`**: final copy-paste strings for the resume — not summaries, not «keep top 4», not two wordings of the same fact.
- **`apply.work_experience.merge_bullets`**: must mirror `work_experience_detail` (`bulletPoints` = `bullets` per role, same order).
- **`ok`**: still include `work_experience_detail` reflecting current optimal ON set; `changes: []`.
- **Gate:** near-duplicate strings inside any `bullets[]` → step 9 fail; >8 bullets per company → fail; **>3 bullets per role without Claude extension** → fail; bullet &lt;40 chars → fail.

`normalizeSectionReviews` syncs `work_experience_detail` → `apply.work_experience` and mirrors `keep_bullets` rows into `changes[]`.

**Parallel work_experience sub-agents (per company):** If the model returns empty `bullets[]`, missing `roles`, invalid JSON, or `included: false` without JD-specific reason, the orchestrator **keeps baseline** from `apply.work_experience` / `work_experience_detail` — never a false “experience gap”. Sub-agent prompt: `.claude/reference/applicator-section-subagent-prompt.md`.

## Skills block naming (iGaming / commercial PO vacancies)

Default order when JD matches commercial/partner/live-casino tools:

1. iGaming & Commercial Tools (or iGaming & Compliance)
2. Product Management
3. Analytics & Data (merge analytics platforms here; not "Analytics Tools" + separate PM noise)
4. Tools (Jira, Confluence, …)
5. Technical (optional; REST APIs, Webhooks, GraphQL, SQL only)

## Quality gate (scripts enforce)

- All nine `section_id`s present.
- Valid `status` + non-empty `verdict` each.
- `needs_changes` → `verdict.length` ≤ 100 (context header only).
- `ok` → empty `changes`; skills `ok` → no `remove_or_merge` entries.
- `needs_changes` on skills → `skills_detail.block_order` + blocks with `keep`/`remove_or_merge` + **`changes[]` includes every `layout_notes` item** (action `layout`).
- `work_experience` → **`work_experience_detail.companies[]` required** (all rounds); `validateWorkExperienceDetail` + step 10 parity check.
- `needs_changes` on other sections (except skills) → non-empty `changes[]` (one row per concrete edit).

## `feedback.md` (human)

Pipeline renders `## Section reviews` from `section_reviews` (verdict + skills Keep/Remove per block). Not a substitute for JSON — gate reads JSON only.
