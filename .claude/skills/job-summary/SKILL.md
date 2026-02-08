---
name: job-summary
description: Generate a resume summary for a job vacancy. Run with /job-summary; paste or attach the job description. Uses CV from vault, targets 90–100% keyword match, outputs summary + suggested interview questions in English.
---

# Job Summary — Resume Summary for Vacancy

**Command:** `/job-summary`

Generate a **short** resume summary tailored to a specific vacancy. Goal: 90–100% keyword match so ATS and recruiters see a strong fit in ~40 seconds.

## When You Run This Command

1. **If the user already pasted or attached the job description** in the same message as `/job-summary` → use it immediately.
2. **If no job description in context** → ask once: "Paste the job description (or attach the file), and I'll generate the summary."

Then run the process below. Do not ask for confirmation before generating; output the summary and questions directly.

## Inputs (Use Automatically)

| Input | Source |
|-------|--------|
| **Job description** | User's message or attached file. |
| **CV / Resume** | `CV Examples/Roman Matsukatov - CV.md` (preferred). If missing, try `CV Examples/Roman Matsukatov - CV.pdf` and extract text, or ask user to attach CV. |
| **Confirmed facts** | `.claude/skills/resume-summary-custom/references/confirmed-facts.md` — use only these + CV; do not invent. |
| **Format & tone** | `.claude/skills/resume-summary-custom/references/short-summaries-examples.md` — structure and style only. |

## Keyword Match (90–100% on First Try)

**Rule: ATS and keyword tools score exact or near-exact phrases from the JD. Paraphrasing lowers match score. Use the JD's own wording.**

Before drafting the summary:

1. **Extract keywords from the actual job description** (do not rely on a fixed list). List explicit phrases from the JD for: product/role terms, requirements, responsibilities, soft skills, qualifications. Include multi-word phrases (e.g. business intelligence, user feedback, revenue targets, software development process, agile environment, leverage data, attention to detail).

2. **Map to CV + confirmed-facts:** For each keyword, note where it appears (or a close equivalent). If something is not in CV or confirmed-facts, do not invent it.

3. **Weave keywords into the summary using exact JD phrasing.** Prefer the exact phrase from the JD over a synonym (e.g. use "leverage data" not "use data", "user feedback" not "feedback from users", "business intelligence" not "BI teams"). This maximizes ATS and keyword-report match on first pass.

## Keyword analysis report (Red / Yellow / Green)

When the user provides a **keyword analysis report** (e.g. from a resume-vs-JD tool) with color-coded keywords:

- **Red (Missing):** Present in JD, absent in resume. Do not claim in summary unless we have honest support in CV or confirmed-facts. If we do have support (e.g. related experience), add the **exact JD phrase once** in the summary to close the gap.
- **Yellow (Present but not visible/optimally phrased):** We have the experience but it is not phrased like the JD. In the summary, **use the exact JD phrasing** for these keywords (backed by CV/confirmed-facts). Do not paraphrase: e.g. "leverage data", "user feedback", "business intelligence", "attention to detail" must appear as in the JD so the tool scores them.
- **Green (Matched + Active):** Already aligned. **Keep these phrases in the summary** in the same or very close wording so the match is preserved.

**Before finalizing:** Check that every Yellow and every supported Red from the report appears in the summary as an exact (or near-exact) phrase from the JD; every Green remains present.

Full rule: `.claude/reference/job-summary-keyword-rules.md`

## Rules (Strict)

- **No invented experience.** Only facts from the CV and `confirmed-facts.md`. Do not claim specific tools, products, or employers (e.g. Braze, Salesforce, Segment) unless they appear in the CV or confirmed-facts.
- **Short format.** No more than **3 paragraphs**. No long blocks, no emoji sections.
- **No bold in summary.** Do not use bold (e.g. **company names** or **keywords**) anywhere in the summary text; plain text only.
- **No em dashes.** Do not use em dashes (—) in the summary or in any generated description text. Use commas, periods, or rephrase into separate sentences instead.
- **Language.** Summary and questions in **English** unless the user explicitly asks for another language.
- **Output.** Return only:
  1. The summary (3 paragraphs max).
  2. A **Suggested questions** section with 2–4 interview-prep questions.
- Do not cite file names or say “according to the attached file” in the output.

## Format to Follow

- **Opening line:** Title/level + 12+ years of experience + 1–2 domains that match the job.
- **Body:** Remaining paragraphs = clear strengths that answer the job’s requirements. Short sentences. **CSPO:** mention only for Product Owner roles or when the job asks for Scrum/Agile certification; omit for Product Manager roles.
- **Suggested questions:** 2–4 questions that help prepare for the interview (role-specific, company-specific, or not clearly stated in the CV).

## Process (Run in Order)

1. Get job description from user message or attachment (or ask once if missing).
2. Read CV from `CV Examples/Roman Matsukatov - CV.md` (or PDF if MD missing); if user attached another CV (e.g. compliance-focused), use that.
3. Read `resume-summary-custom/references/confirmed-facts.md` and, for style only, `short-summaries-examples.md`.
4. Extract from the **actual JD** all requirement and responsibility phrases (keywords). If the user provided a **keyword analysis report** (Red/Yellow/Green), list Red, Yellow, and Green terms from it.
5. Map keywords to CV + confirmed-facts; note gaps (no inventing). For Yellow: plan where to insert **exact JD phrasing**. For Red: note which ones we can support and add with exact JD phrase once.
6. Draft summary: intro (12+ years) + up to 3 paragraphs. Use **exact JD phrases** for every Yellow and supported Red; keep Green phrases. Do not paraphrase key terms.
7. If a keyword report was provided: verify each Yellow and supported Red appears in the summary with exact JD wording; verify Green phrases are still present.
8. Add **Suggested questions** (2–4 items).
9. Output summary + Suggested questions only, in English.

If the user later asks for changes (tone, length, emphasis), apply and re-output.

---

## Cover Letter

When the user asks for a **cover letter** for a vacancy, do not reply with plain text only. **Always deliver the cover letter as a Word .docx file** so that paragraph structure and formatting are preserved when opened in Word.

- **Rule:** Generate the letter from CV + confirmed-facts + JD, then create a `.docx` file (Calibri 11 pt, paragraphs justified, proper paragraph breaks).
- **Path:** `00-Inbox/Job_Search/Cover_Letter_{Company}_{Role}.docx`.
- **Details:** See `cover-letter-format.md` in this skill folder.
- After saving, tell the user the file path and that they can open it in Word.
