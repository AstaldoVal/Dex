---
name: job-apply
description: One command for job applications: generates resume summary + suggested questions and cover letter as .docx. Run with /job-apply; paste or attach the job description.
---

# Job Apply — Summary + Cover Letter in One Run

**Command:** `/job-apply`

One command that produces **both**:
1. **Resume summary** (3 paragraphs, keyword-matched to the JD) + **suggested interview questions** (in chat).
2. **Cover letter** saved as a Word **.docx** file in `00-Inbox/Job_Search/cover_letters/`.

No need to say "and cover letter". Run `/job-apply`, paste the job description, and you get summary, questions, and the .docx file.

## When You Run This Command

1. **If the user already pasted or attached the job description** in the same message as `/job-apply` → use it immediately.
2. **If no job description in context** → ask once: "Paste the job description (or attach the file), and I'll generate the summary and cover letter."

Then run the full process below. Do not ask for confirmation before generating.

## Inputs (Use Automatically)

| Input | Source |
|-------|--------|
| **Job description** | User's message or attached file. |
| **CV / Resume** | `CV Examples/Roman Matsukatov - CV.md` (preferred). If missing, `CV Examples/Roman Matsukatov - CV.pdf` or ask user to attach. **Use only Work Experience and other body sections (Projects, Skills, Education); do not use the CV's Summary/headline block as a source of facts.** |
| **Confirmed facts** | `.claude/skills/resume-summary-custom/references/confirmed-facts.md`. |
| **Summary style** | `.claude/skills/resume-summary-custom/references/short-summaries-examples.md` (structure only). |
| **Cover letter format** | `.claude/skills/job-summary/cover-letter-format.md` (path, font, rules). |

## Process (Run in Order)

1. **Get job description** from user message or attachment (or ask once if missing).
2. **Read CV** from vault; read `confirmed-facts.md` and `short-summaries-examples.md` (for summary); read `cover-letter-format.md` (for letter).
3. **Extract JD keywords** and map to CV + confirmed-facts (same logic as job-summary: exact JD phrasing, no inventing).
4. **Generate the resume summary** (max 3 paragraphs, 12+ years, keyword match) and **2–4 suggested questions**. Use job-summary rules: no bold, no em dashes, English, iGaming wording as in confirmed-facts.
5. **Generate the cover letter text** (paragraphs as list). Use cover-letter rules: no em dashes, no "I would welcome the opportunity", no contacts in body, end with "Best regards," and name only, iGaming wording as in cover-letter-format.
6. **Create the .docx** with Python and `python-docx`: path `00-Inbox/Job_Search/cover_letters/Cover_Letter_{Company}_{Role}.docx` (derive Company and Role from the JD). Font Calibri 11 pt, paragraphs justified, space_after 6 pt.
7. **Output in chat:**
   - The **summary** (3 paragraphs).
   - **Suggested questions** (2–4 items).
   - A line: "Cover letter saved to `00-Inbox/Job_Search/cover_letters/Cover_Letter_….docx`. Open in Word."

## Rules (Summary)

- **No invented experience.** Only CV + confirmed-facts for both summary and letter.
- **Do not use the CV's Summary/headline as a source of facts.** That block is tailored per vacancy and may contain aspirational or role-specific titles (e.g. "Head of AI") that are not actual job titles from Work Experience. Use only Work Experience, Projects, Skills, Education, and confirmed-facts.
- **Summary:** no bold, no em dashes (—); character — (U+2014) is forbidden. Before output, scan the summary for — and replace with comma or period. 3 paragraphs max, exact JD phrasing where supported. **Teal paste:** use exactly three line breaks between paragraphs (so pasting into Teal shows correct spacing).
- **Cover letter:** no em dashes, no informal self-references, no "I am drawn to", no "I would welcome the opportunity"; no email/phone/LinkedIn in body.

## Relation to Other Commands

- **`/job-apply`** — summary + questions + cover letter .docx in **one run**.
- **`/job-summary`** — only summary + questions (or summary + cover letter if user explicitly adds "and cover letter").
- **`/cover-letter`** — only cover letter .docx.
