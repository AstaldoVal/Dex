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

1. **Anti-AI-writing.** Follow `.claude/reference/ai-writing-signs-banned.md`: no AI-vocabulary clusters (pivotal, crucial, underscore, tapestry, delve, foster, showcase), no puffery (testament, vital role, evolving landscape, commitment to, vibrant), no weasel attributions, no formulaic "Not only... but..." or "Despite X... faces challenges". Prefer "is/are/has" over "serves as/boasts/features". No meta phrases in the output.
2. **No invented experience.** Use only facts from the attached CV and from `references/confirmed-facts.md`. If something is not stated there or in the CV, do not add it. **Do not use the CV's Summary/headline as a source of facts:** that block is tailored per vacancy and may contain aspirational titles that are not actual job titles from Work Experience. Use only Work Experience, Projects, Skills, Education, and confirmed-facts.
3. **Short format.** Summary must be **no more than 3 paragraphs**. Tight set of points that mirror the job’s main requirements. No long paragraphs, no generic filler. Think “40-second scan.”
4. **No em dashes (—).** The character — (Unicode U+2014) is forbidden in the summary. Use only commas, periods, or separate sentences. **Before output:** scan for —; if any appear, replace with a comma or period. Never deliver a summary containing —.
5. **No bold in summary.** Do not use bold (e.g. **company names** or **keywords**) anywhere in the summary text; plain text only.
6. **No repeated paragraph openers or duplicated themes.** Do not start more than one paragraph with the same leading word or stock phrase (e.g. "Solid…", "Extensive…", "Strong…", "Proven…") unless the job description itself requires that exact repetition. Do not restate the same idea in two paragraphs (e.g. data governance + analytics described twice with near-identical sentences). Each paragraph should advance a distinct angle: role and scope, then a second theme (e.g. domain or data), then delivery or stakeholder impact. **Before output:** scan the three paragraphs; if two paragraphs share the same first word (ignoring articles *the*, *a*, *an*) or repeat a long phrase, rewrite one of them.
7. **No tautology and no keyword laundry lists.** Within a single sentence or two adjacent sentences, do not express the same concept twice with overlapping words (e.g. "lifecycles" and "the full development lifecycle" together; "roadmap", "vision", and "planning" stacked as three parallel nouns with no verb tying them to one idea). Prefer one clear formulation per idea. Do not write sentences that are only a comma-separated run of JD keywords; each sentence should read like normal prose (subject + predicate), with keywords woven in where they fit, not strung together for ATS alone. **Before output:** read aloud mentally; if a phrase sounds like the same thing said twice, or like a tag cloud, rewrite.
8. **Clear subject, no colon-led tag stacks, no vague comparatives.** The summary must read as **the candidate’s experience**, not a pasted job responsibility. Use *I*, *I have*, *my experience*, or *In my roles* when describing actions and outcomes. Do **not** use impersonal one-liners that sound like a JD (*Work connects…* with no *I* / *my*). Do **not** build a paragraph as *Experience spans A and B: noun, noun, noun, noun*; use full sentences with verbs. Avoid *stronger* / *better* without a clear baseline; prefer concrete verbs (*tightened*, *aligned definitions*, *delivered reporting that…*). Avoid ambiguous stacks like *reporting people can trust*; write *reporting that stakeholders rely on* or *reliable reporting for decisions*. See `.claude/reference/job-summary-keyword-rules.md` → section on whose experience and how to present it.
9. **90–100% match.** Align wording to the vacancy’s keywords, but never at the cost of rules 6–8: prefer fewer exact phrases in readable sentences over many exact phrases in garbage prose.
10. **Language.** Write the summary in **English** unless the user explicitly asks for another language.
11. **Output.** Return only the summary and the “Suggested questions” block. Do not cite file names or say “according to the attached file.”

## Format to Follow

- **Opening line:** Title/level + years of experience (never fewer than 12 years) + 1–2 domains that match the job.
- **Body:** No more than **3 paragraphs** in total. Each paragraph = one clear strength or theme that directly answers a requirement. Short sentences; no emoji blocks, no long “Key strengths” sections. Vary how paragraphs begin; do not reuse the same stock opener or duplicate a whole theme across paragraphs.
- **Suggested questions:** Under a clear heading, list 2–4 questions that could help the user prepare for the interview but where you are not 100% sure they are relevant (e.g. role-specific, company-specific, or not clearly stated in the CV).

## Good vs Bad

**Good:** Short, in English, each line maps to a job requirement, 12+ years stated, no file references, ends with suggested questions.

**Bad:**
- Long paragraphs, multiple “Key strengths” blocks, emojis.
- Russian (or other language) when English was not waived.
- Generic or irrelevant points that don’t match the vacancy.
- Mentioning “as per the attached file” or similar in the output.
- Tautology (e.g. lifecycles + development lifecycle in one breath) or sentences that are only a list of keywords from the JD.
- Impersonal JD-style lines (*Work connects…*) with no clear *I* / *my experience*, or a whole paragraph that is *Spanned X: a, b, c, d* (tag list after a colon).
- Vague *stronger/better* without baseline, or broken collocations (*reporting people can trust*).

## Reference Data

- **Confirmed facts:** `references/confirmed-facts.md` — use only skills/experience listed there and in the CV.
- **Short summaries format & tone:** `references/short-summaries-examples.md` — opening line, industries list, 3–6 bullets, optional availability line; use for structure and style only. **CSPO:** mention only for Product Owner roles or when the job asks for Scrum/Agile certification; omit for Product Manager roles.
- **Years of experience:** Always use at least **12 years** in the summary (current total experience).

## Process

1. Read the job description and extract must-have and nice-to-have requirements.
2. Read the user’s CV (and confirmed-facts if needed); list only verifiable experience from Work Experience, Projects, Skills, Education; do not take titles or claims from the CV's Summary/headline.
3. Map CV + confirmed facts to the job requirements; drop anything that doesn’t support a 90–100% fit.
4. Draft the summary: opening line plus up to two more paragraphs, each with a distinct theme; check that no two paragraphs share the same leading word (after stripping *the*/*a*/*an*) and that no idea is copy-pasted between paragraphs. Ensure the candidate is the clear subject (*I* / *my experience* where actions are described); no colon-led keyword runs; no vague *stronger* without anchor.
5. Add “Suggested questions” (2–4 items) for uncertain but potentially useful interview prep.
6. Output the summary and questions only, in English, with no file references.

If the user suggests changes (e.g. tone, length, or emphasis), apply them and re-output.
