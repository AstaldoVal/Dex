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
| **CV / Resume** | `CV Examples/Roman Matsukatov - CV.md` (preferred). If missing, try `CV Examples/Roman Matsukatov - CV.pdf` and extract text, or ask user to attach CV. **Use only Work Experience and other body sections (Projects, Skills, Education); do not use the CV's Summary/headline as a source of facts.** |
| **Confirmed facts** | `.claude/skills/resume-summary-custom/references/confirmed-facts.md` — use only these + CV; do not invent. |
| **Format & tone** | `.claude/skills/resume-summary-custom/references/short-summaries-examples.md` — structure and style only. |

## Keyword Match (90–100% on First Try)

**Rule: ATS and keyword tools score exact or near-exact phrases from the JD. Paraphrasing lowers match score. Use the JD's own wording.**

Before drafting the summary:

1. **Extract keywords from the actual job description** (do not rely on a fixed list). List explicit phrases from the JD for: product/role terms, requirements, responsibilities, soft skills, qualifications. Include multi-word phrases (e.g. business intelligence, user feedback, revenue targets, software development process, agile environment, leverage data, attention to detail).

2. **Map to CV + confirmed-facts:** For each keyword, note where it appears (or a close equivalent). If something is not in CV or confirmed-facts, do not invent it.

3. **Weave keywords into the summary using exact JD phrasing where it fits natural prose.** Prefer the exact phrase from the JD over a synonym (e.g. use "leverage data" not "use data") when it does not create tautology or a keyword laundry list. Do not stack overlapping synonyms in one sentence (e.g. "lifecycles" and "full development lifecycle" together). Do not sacrifice readable sentences for ATS: one well-formed sentence with two exact phrases beats a sentence that repeats the same idea or lists ten terms. See `resume-summary-custom` rule **No tautology and no keyword laundry lists.**

## Keyword analysis report (Red / Yellow / Green)

When the user provides a **keyword analysis report** (e.g. from a resume-vs-JD tool) with color-coded keywords:

- **Red (Missing):** Present in JD, absent in resume. Do not claim in summary unless we have honest support in CV or confirmed-facts. If we do have support (e.g. related experience), add the **exact JD phrase once** in the summary to close the gap.
- **Yellow (Present but not visible/optimally phrased):** We have the experience but it is not phrased like the JD. In the summary, **use the exact JD phrasing** for these keywords (backed by CV/confirmed-facts). Do not paraphrase: e.g. "leverage data", "user feedback", "business intelligence", "attention to detail" must appear as in the JD so the tool scores them.
- **Green (Matched + Active):** Already aligned. **Keep these phrases in the summary** in the same or very close wording so the match is preserved.

**Before finalizing:** Check that every Yellow and every supported Red from the report appears in the summary as an exact (or near-exact) phrase from the JD; every Green remains present.

Full rule: `.claude/reference/job-summary-keyword-rules.md`

## Rules (Strict)

- **Anti-AI-writing.** Follow `.claude/reference/ai-writing-signs-banned.md`: no AI-vocabulary clusters (pivotal, crucial, underscore, tapestry, delve, foster, showcase), no puffery (testament, vital role, evolving landscape, commitment to, vibrant), no weasel attributions (experts argue, several sources), no formulaic structures (Despite X... faces challenges; Not only... but...). Prefer "is/are/has" over "serves as/boasts/features". No meta phrases in the deliverable.
- **No invented experience.** Only facts from the CV and `confirmed-facts.md`. Do not claim specific tools, products, or employers (e.g. Braze, Salesforce, Segment) unless they appear in the CV or confirmed-facts.
- **Do not use the CV's Summary/headline as a source of facts.** That block is tailored per vacancy and may contain aspirational titles (e.g. "Head of AI") that are not actual job titles from Work Experience. Use only Work Experience, Projects, Skills, Education, and confirmed-facts.
- **iGaming / Pin-Up (summary):** Do not name Pin-Up or other iGaming employers in the summary. Use "in iGaming (e.g. at EBET)", "at EBET", or "in iGaming roles" instead.
- **5 years in iGaming:** Mention "5 years in iGaming" or "5+ years in iGaming" **only when the resume type is iGaming**. For AI resume (or any non-iGaming role/template) do not mention iGaming tenure; it is usually irrelevant and the AI resume does not highlight iGaming experience.
- **Short format.** No more than **3 paragraphs**. No long blocks, no emoji sections.
- **No repeated paragraph openers or duplicated themes.** Do not start more than one paragraph with the same leading word or stock phrase (e.g. "Solid…", "Extensive…", "Strong…", "Proven…") unless the JD requires that exact repetition. Do not paste the same block twice (e.g. data governance described in two paragraphs with overlapping sentences). Each paragraph should cover a different angle: role and scope, then domain or data, then delivery or impact. **Before output:** if two paragraphs share the same first word (ignoring *the*, *a*, *an*) or repeat a long phrase, rewrite.
- **No tautology and no keyword laundry lists.** Same as `resume-summary-custom`: within one or two adjacent sentences, do not say the same thing twice with different words (lifecycles + full development lifecycle; parallel strings of nouns from the JD). Sentences must be prose, not a tag cloud. **Before output:** if it sounds like the same concept twice, or like a list of terms, rewrite.
- **Clear subject; no colon-led skill stacks; no vague comparatives.** Same as `resume-summary-custom` rule 8: use *I* / *my experience* / *In my roles* for what the candidate does; avoid impersonal *Work connects…* lines that read like job requirements. Do not write *Experience spans X: a, b, c, d* as the paragraph body. Avoid *stronger/better* without a baseline; fix ambiguous phrases like *reporting people can trust*. Full detail: `.claude/reference/job-summary-keyword-rules.md` (section on whose experience and how to present it).
- **No bold in summary.** Do not use bold (e.g. **company names** or **keywords**) anywhere in the summary text; plain text only.
- **No em dashes (—).** The character — (Unicode U+2014) is forbidden in the summary and in any generated description text. Use only commas, periods, or separate sentences. **Before output:** scan the summary for —; if any appear, replace with a comma or period and re-output. Never deliver a summary that contains —.
- **Language.** Summary and questions in **English** unless the user explicitly asks for another language.
- **Output.** Return only:
  1. The summary (3 paragraphs max).
  2. A **Suggested questions** section with 2–4 interview-prep questions.
- Do not cite file names or say “according to the attached file” in the output.

## Format to Follow

- **Opening line:** Title/level + 12+ years of experience + 1–2 domains that match the job.
- **Body:** Remaining paragraphs = clear strengths that answer the job’s requirements. Short sentences. **CSPO:** mention only for Product Owner roles or when the job asks for Scrum/Agile certification; omit for Product Manager roles.
- **Teal paste:** Use exactly three line breaks between paragraphs so that when the user copies the summary into Teal, spacing displays correctly. See `short-summaries-examples.md` → Paragraph breaks (Teal editor).
- **Suggested questions:** 2–4 questions that help prepare for the interview (role-specific, company-specific, or not clearly stated in the CV).

## Process (Run in Order)

1. Get job description from user message or attachment (or ask once if missing).
2. Read CV from `CV Examples/Roman Matsukatov - CV.md` (or PDF if MD missing); if user attached another CV (e.g. compliance-focused), use that. **Ignore the CV's Summary/headline for factual content;** use only Work Experience, Projects, Skills, Education.
3. Read `resume-summary-custom/references/confirmed-facts.md` and, for style only, `short-summaries-examples.md`.
4. Extract from the **actual JD** all requirement and responsibility phrases (keywords). If the user provided a **keyword analysis report** (Red/Yellow/Green), list Red, Yellow, and Green terms from it.
5. Map keywords to CV + confirmed-facts; note gaps (no inventing). For Yellow: plan where to insert **exact JD phrasing**. For Red: note which ones we can support and add with exact JD phrase once.
6. Draft summary: intro (12+ years) + up to 3 paragraphs. Use **exact JD phrases** for Yellow and supported Red and keep Green phrases, but integrate them without tautology or enumeration-only sentences (see rules above).
7. If a keyword report was provided: verify Yellow and supported Red appear where honest; verify Green phrases are still present; if a phrase would force duplicate meaning, use one formulation or split across sentences.
8. Add **Suggested questions** (2–4 items).
9. **Final check:** Scan the summary for the character — (em dash). If any appear, replace each with a comma or period and repeat this check until the summary contains no —.
10. **Variety check:** Ensure paragraph openings differ and no theme is duplicated across paragraphs (same rule as resume-summary-custom and as Teal match-score / `generate_job_summary` in MCP).
11. **Tautology check:** No sentence pairs "lifecycles" + "development lifecycle"; no keyword-only runs. Rewrite if needed.
12. **Subject and structure check:** Candidate is explicit subject where describing actions; no whole paragraph as list after colon; no *stronger* without anchor; no broken collocations.
13. Output summary + Suggested questions only, in English.

If the user later asks for changes (tone, length, emphasis), apply and re-output.

---

## Cover Letter

When the user asks for a **cover letter** for a vacancy, do not reply with plain text only. **Always deliver the cover letter as a Word .docx file** so that paragraph structure and formatting are preserved when opened in Word.

- **Rule:** Generate the letter from CV + confirmed-facts + JD, then create a `.docx` file (Calibri 11 pt, paragraphs justified, proper paragraph breaks).
- **iGaming / Pin-Up (cover letter):** Do not name Pin-Up or other iGaming employers in cover letters. Use "in iGaming (e.g. at EBET)", "at EBET", or "in iGaming roles" instead.
- **5 years in iGaming (cover letter):** Same as summary: mention "5 years in iGaming" only when the resume type is iGaming; for AI/non-iGaming roles omit it.
- **No em dashes (—) in cover letters.** Use commas or periods instead; never use — or – as punctuation.
- **No informal self-references.** Do not use "как и я", "like me", "same as I do", or similar colloquial phrases; keep tone professional.
- **Path:** `00-Inbox/Job_Search/cover_letters/Cover_Letter_{Company}_{Role}.docx` (or as in `cover-letter-format.md`).
- **Details:** See `cover-letter-format.md` in this skill folder.
- After saving, tell the user the file path and that they can open it in Word.
