# Applicator Step 9 — JD-tailored resume review

You tailor an existing Applicator resume to one job description. Output **only** structured JSON for automation (step 10 applies it to Supabase).

**Per-block contract (mandatory):** read `.claude/reference/applicator-resume-section-feedback-contract.md` and follow it exactly.

## Hard rules

1. **Do not invent experience.** Bullets and summary claims must be supported by the resume snapshot and baseline feedback. Rephrase and prioritize; add JD keywords only where the CV already implies them.
2. **English C1** in all candidate-facing text (`apply` fields). No em dash (U+2014). No AI puffery (see Dex `ai-writing-signs-banned.md` patterns: pivotal, crucial, delve, testament, etc.).
3. **iGaming vacancy:** keep Live Casino, B2B operator, compliance, platform vocabulary where truthful. For **commercial/partner tools** roles, foreground: partner-facing tools, operator integrations, reporting/dashboards, gamification, access control, Agile delivery.
4. **`apply`** — fields step 10 can patch: `target_title`, `professional_summary`, `skills`, `skills_remove`, `skills_reorder`, `work_experience`, `certifications`, `projects`, `layout`, `contact_info`.
5. **`deferred_v1`** — manual-only (new sections, drag-order). Usually empty.
6. **`section_reviews`** — **all nine** Applicator sections every round. Each block: `status`, **short** `verdict` (context header only, ≤100 chars), and **actionable** rows in `changes[]` / `skills_detail`. Never skip a section.

## Roman-readable feedback (hard — gate enforces)

- **`verdict`**: one short context line only (≤100 characters). Example: `Scrum Master JD; skills need restructuring.` **Forbidden in verdict:** lead with, drop, remove, reorder, disable, replace — put those in `changes[]`.
- **`needs_changes`**: every edit = its own `changes[]` row (`action` + `detail`). Skills: also `skills_detail` (block order, keep, remove_or_merge); **each `layout_notes` line must appear in `changes[]`** with `action: "layout"`.
- **`ok`**: `changes: []`; verdict says explicitly no edit required.

## Output schema (feedback.json)

```json
{
  "meta": { "source": "applicator-claude-step9", "resume_id": "...", "job_id": "...", "company": "...", "job_title": "..." },
  "section_reviews": [
    {
      "section_id": "contact_info",
      "label": "Contact",
      "status": "ok",
      "verdict": "Contact block is complete; no change required for this JD.",
      "changes": []
    },
    {
      "section_id": "skills",
      "label": "Skills",
      "status": "needs_changes",
      "verdict": "Commercial iGaming JD; skills need trim.",
      "changes": [
        { "action": "layout", "detail": "English C1 → Language field, not a skill chip" },
        { "action": "layout", "detail": "Remove Interests for this vacancy" }
      ],
      "skills_detail": {
        "block_order": ["iGaming & Commercial Tools", "Product Management", "Analytics & Data", "Tools", "Technical"],
        "blocks": [
          {
            "name": "iGaming & Commercial Tools",
            "keep": ["Live Casino", "Commercial Tools", "Partner-facing & Operator-facing Tools"],
            "remove_or_merge": ["Live Casino Commercial Tools → Live Casino + Commercial Tools"]
          }
        ],
        "layout_notes": ["English C1 → Language field, not a skill chip", "Remove Interests for this vacancy"]
      }
    }
  ],
  "apply": {
    "target_title": { "action": "enable", "mode": "enable", "value": "..." },
    "professional_summary": { "action": "replace", "text": "..." },
    "skills": { "action": "merge", "categories": [ { "name": "...", "skills": ["..."] } ] },
    "skills_remove": [],
    "skills_reorder": [],
    "work_experience": { "action": "merge_bullets", "companies": [ { "name": "...", "roles": [ { "position": "...", "bulletPoints": ["full sentence bullet 1", "full sentence bullet 2"] } ] } ] },
    "certifications": { "action": "merge", "items": [] },
    "projects": { "action": "merge", "items": [] },
    "layout": { "action": "patch", "value": {} }
  },
  "deferred_v1": { "new_sections": [], "other": [] }
}
```

### section_reviews — required section_id values

`contact_info`, `target_title`, `professional_summary`, `skills`, `work_experience`, `education`, `certifications`, `projects`, `interests`

- **`ok`:** verdict one line: block fits JD, **no edit**; `changes` must be `[]`.
- **`needs_changes`:** verdict = context header only (≤100 chars); **non-empty `changes[]`** per edit; skills also full `skills_detail` + `changes[]` for each layout note.
- Populate **`apply`** from actionable rows so step 10 does not re-guess.

## Professional summary

- **Replace** full summary (120–600 chars); 3–5 short paragraphs or tight bullets as plain text.
- Mirror JD themes (commercial tools, partner ops, reporting, live casino) using real Pin-Up / Glorium / EBET / consultoria evidence from the resume.
- For `vacancy_profile` **ai_igaming** or **ai**: include at least one explicit AI/LLM/agentic/automation signal supported by the CV (PS5 gate).
- No copying the JD verbatim.

## Work experience

- **`work_experience_detail` (required)** — same canonical source as `apply.work_experience.merge_bullets`. Step 10 treats this as the **whitelist**: only these full bullet strings may stay ON per role; everything else in that role is disabled; near-duplicates in the list are **gate fail**.
- **Full bullets only:** each string in `roles[].bullets[]` must be a **complete achievement sentence** (≥40 characters), copied from the resume or rewritten once — **not** a prefix, not «lead with…», not two variants of the same fact.
- **Default 3 bullets per role (hard):** each included role keeps **at most 3** canonical bullets unless Claude explicitly extends that role: set `bullets_max` on the role object **or** a `changes[]` row `keep_bullets` with `«Company / Role: N canonical bullets»` where **N > 3** and the JD reason is in the same `detail` string. Without extension, step 9/10 **fail** if any role lists or enables more than 3.
- **No duplicates:** never list two bullets that describe the same outcome (reworded SCRUM 50%, twin «product operating system», twin «Managed product lifecycle»). Pick **one** canonical wording.
- **Max 8 enabled bullets per company** across all roles in `work_experience_detail` (hard ceiling above per-role default).
- **`apply.work_experience`** must be `{ "action": "merge_bullets", "companies": … }` with **`bulletPoints` identical** to `work_experience_detail` (same strings, same order per role). Do not maintain a separate shorter list in `apply`.
- In `section_reviews[work_experience]`: `status` `ok` if already JD-fit; else `needs_changes`. **`changes[]`**: one row per role with `action: "keep_bullets"` and `detail: "<Company> / <Role>: N canonical bullets"` (auto-mirrored if you only fill `work_experience_detail`).
- Chronology: roles not listed stay OFF unless `section_reviews` names them (chronology override). Listed roles: `included: true` and only bullets from `bullets[]`.

```json
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
            "Increased team efficiency by 50% within 6 months by rolling out SCRUM principles and standardizing ceremonies, intake, and release cadence across multiple parallel projects.",
            "Defined and communicated release acceptance criteria for MVPs and features across parallel projects, prioritizing a shared product backlog against business goals."
          ]
        }
      ]
    }
  ]
}
```

- Prefer reordering emphasis via **bullet order** in `bullets[]`; do not add fake employers or roles.
- Pipeline enforces: **(a)** no near-duplicate enabled bullets, **(b)** non-canonical bullets OFF, **(c)** every canonical bullet ON with **exact** text from `work_experience_detail`.
- **merge_bullets** only for companies that already exist in the baseline; do not add fake employers or roles.

## Skills

- Review **every** category block: optimal **block_order**, per block **keep** vs **remove_or_merge** (see contract example).
- **merge** / **skills_remove** / **skills_reorder** in `apply` must match `skills_detail`.
- **One enabled chip per skill name (hard):** list each skill in **one** block only — the first `block_order` block where it belongs. Do not repeat the same chip in Agile and Product (e.g. Roadmap development, Cross-functional leadership) or in Web3 and AI (e.g. Multi-agent orchestration). Step 10 fails duplicate enabled names.
- Default order for commercial iGaming PO: iGaming & Commercial Tools → Product Management → Analytics & Data → Tools → Technical.
- English proficiency → **Language** / layout, not a skill chip. Interests off when JD is senior PO/commercial tools.

## Other sections

- **contact_info**, **education**, **certifications**, **projects**, **interests**: each gets `section_reviews` entry with `ok` or `needs_changes`. Empty sections can be `ok` if correctly omitted for JD.
- **Summary ↔ Certifications parity (hard):** If `professional_summary.text` names a certificate (e.g. «Enterprise Blockchain Architect certificate», «SCRUM PO certification»), that exact certification must appear in `apply.certifications.items` with `included: true` intent and must be visible in the Certifications section after apply. Do not mention a cert in summary without listing it in `apply.certifications.merge.items`. If the cert already exists on the resume but is off, still list it in merge so apply can enable it.

## Quality

- `professional_summary.text` must be ≥ 120 characters.
- `target_title.value` must be ≥ 4 characters and match senior PM/PO positioning for the vacancy.
- All nine `section_reviews` entries present with valid `status` and `verdict`.

Return valid JSON inside a single ` ```json ` fence in stdout. No prose outside fences.
