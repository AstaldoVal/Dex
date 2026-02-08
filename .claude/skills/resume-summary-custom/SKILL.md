---
name: resume-summary-custom
description: Write a short resume summary for a specific job vacancy. Use when user provides a job description and their CV (or asks for a summary for a vacancy). Matches experience to requirements 90–100%, outputs in English, adds suggested interview questions.
---

# Resume Summary for Job Applications

Generate a **short** resume summary tailored to a specific vacancy. Goal: recruiter sees a 90–100% fit in ~40 seconds.

## When to Use

- User pastes a job description and attaches their resume (e.g. "Roman Matsukatov - CV.pdf"), or
- User asks for a summary for a specific vacancy and provides the job text + CV.

## Inputs

1. **Job description** – full or excerpt (requirements, responsibilities, nice-to-have).
2. **Resume/CV** – from attached file (e.g. "Roman Matsukatov - CV.pdf") or from the vault.
3. **Format reference** – see `references/short-summaries-examples.md` for structure and tone (opening line, industries, CSPO, 3–6 short bullets, optional availability line). Use for style only; content must come from CV and confirmed-facts.

## Rules (Strict)

1. **No invented experience.** Use only facts from the attached CV and from `references/confirmed-facts.md`. If something is not stated there or in the CV, do not add it.
2. **Short format.** Summary must be **no more than 3 paragraphs**. Tight set of points that mirror the job’s main requirements. No long paragraphs, no generic filler. Think “40-second scan.”
3. **No bold in summary.** Do not use bold (e.g. **company names** or **keywords**) anywhere in the summary text; plain text only.
4. **90–100% match.** Explicitly align your wording to the vacancy’s keywords (role, domain, tech, methodologies). Prioritize what the job asks for; drop or minimize the rest.
5. **Language.** Write the summary in **English** unless the user explicitly asks for another language.
6. **Output.** Return only the summary and the “Suggested questions” block. Do not cite file names or say “according to the attached file.”

## Format to Follow

- **Opening line:** Title/level + years of experience (never fewer than 12 years) + 1–2 domains that match the job.
- **Body:** No more than **3 paragraphs** in total. Each paragraph = one clear strength or theme that directly answers a requirement. Short sentences; no emoji blocks, no long “Key strengths” sections.
- **Suggested questions:** Under a clear heading, list 2–4 questions that could help the user prepare for the interview but where you are not 100% sure they are relevant (e.g. role-specific, company-specific, or not clearly stated in the CV).

## Good vs Bad

**Good:** Short, in English, each line maps to a job requirement, 12+ years stated, no file references, ends with suggested questions.

**Bad:**
- Long paragraphs, multiple “Key strengths” blocks, emojis.
- Russian (or other language) when English was not waived.
- Generic or irrelevant points that don’t match the vacancy.
- Mentioning “as per the attached file” or similar in the output.

## Reference Data

- **Confirmed facts:** `references/confirmed-facts.md` — use only skills/experience listed there and in the CV.
- **Short summaries format & tone:** `references/short-summaries-examples.md` — opening line, industries list, 3–6 bullets, optional availability line; use for structure and style only. **CSPO:** mention only for Product Owner roles or when the job asks for Scrum/Agile certification; omit for Product Manager roles.
- **Years of experience:** Always use at least **12 years** in the summary (current total experience).

## Process

1. Read the job description and extract must-have and nice-to-have requirements.
2. Read the user’s CV (and confirmed-facts if needed); list only verifiable experience.
3. Map CV + confirmed facts to the job requirements; drop anything that doesn’t support a 90–100% fit.
4. Draft the summary: one short intro line, then 3–5 targeted lines/bullets.
5. Add “Suggested questions” (2–4 items) for uncertain but potentially useful interview prep.
6. Output the summary and questions only, in English, with no file references.

If the user suggests changes (e.g. tone, length, or emphasis), apply them and re-output.
