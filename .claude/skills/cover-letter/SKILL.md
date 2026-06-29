---
name: cover-letter
description: Generate a cover letter for a vacancy and save it as a Word .docx file. Run with /cover-letter; paste or attach the job description. Uses CV from vault and always outputs .docx.
---

# Cover Letter (always .docx)

**Command:** `/cover-letter`

Generate a **cover letter** for a specific vacancy and **save it as a Word .docx file**. Do not output only plain text in chat.

## When You Run This Command

1. **If the user already pasted or attached the job description** in the same message as `/cover-letter` → use it immediately.
2. **If no job description in context** → ask once: "Paste the job description (or attach the file), and I'll generate the cover letter."

Then generate the letter and create the .docx. Do not ask for confirmation before generating.

## Inputs (Use Automatically)

| Input | Source |
|-------|--------|
| **Job description** | User's message or attached file. |
| **CV / Resume** | `CV Examples/Roman Matsukatov - CV.md` (preferred). If missing, try `CV Examples/Roman Matsukatov - CV.pdf` and extract text, or ask user to attach CV. |
| **Confirmed facts** | `.claude/skills/resume-summary-custom/references/confirmed-facts.md` — use only these + CV; do not invent. |
| **Format & rules** | `.claude/skills/job-summary/cover-letter-format.md` — path, font, alignment, banned phrases, no contacts in body. |

## Rules (Strict)

- **Anti-AI-writing.** Follow `.claude/reference/ai-writing-signs-banned.md`: no AI-vocabulary clusters (pivotal, crucial, underscore, tapestry, delve, foster, showcase), no puffery (testament, vital role, commitment to, nestled, vibrant), no weasel attributions, no formulaic "Not only... but...". Prefer "is/are/has" over "serves as/boasts/features". No meta phrases in the letter.
- **No invented experience.** Only facts from the CV and `confirmed-facts.md`.
- **iGaming / Pin-Up:** Do not name Pin-Up or other iGaming employers. Use "in iGaming (e.g. at EBET)", "at EBET", or "in iGaming roles" instead.
- **No em dashes (—).** Use commas, periods, or separate sentences.
- **No informal self-references.** No "как и я", "like me", "same as I do"; keep tone professional.
- **Banned phrase:** Do not use "I am drawn to". Use "I am keen to", "I am interested in", or "I want to".
- **Closing:** Do not use "I would welcome the opportunity". Use "I look forward to…", "I am keen to…", etc.
- **Contacts:** Do not include email, phone, or LinkedIn in the letter. End with "Best regards," and name only.

## Output: Always .docx

1. **Generate the letter text** from CV + confirmed-facts + JD (paragraphs as list).
2. **Create the .docx file** using Python and `python-docx` as in `.claude/skills/job-summary/cover-letter-format.md`:
   - Path: `00-Inbox/Job_Search/cover_letters/Cover_Letter_{Company}_{Role}.docx` (derive Company and Role from the job description, e.g. CHILI_Publish, Product_Management).
   - Font: Calibri, 11 pt. Paragraphs: justified, space_after 6 pt.
3. **Tell the user:** "Cover letter saved to `00-Inbox/Job_Search/cover_letters/Cover_Letter_….docx`. Open in Word; paragraphs are justified."

## Relation to /job-summary

- **`/job-summary`** — generates a **resume summary** (and suggested questions) for a vacancy; if the user explicitly asks for a **cover letter** in the same message, it also generates the cover letter as .docx (same format as here).
- **`/cover-letter`** — generates **only** the cover letter and **always** saves it as .docx. Use this when you want the letter file without the summary.

Nothing is overwritten: summary and cover letter can be requested together via `/job-summary` ("summary and cover letter"), or you can use `/cover-letter` for the letter only.
