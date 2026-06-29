# Cover Letter — Always .docx

When the user asks for a **cover letter** for a vacancy:

1. **Generate the letter** from CV + confirmed-facts + job description (no invented experience).
2. **Save as Word .docx** — do not output only plain text in chat. Create a file so structure is preserved in Word.
3. **iGaming / Pin-Up:** Do not name Pin-Up or other iGaming employers in the cover letter. Use "in iGaming (e.g. at EBET)", "at EBET", or "in iGaming roles" instead. Mention "5 years in iGaming" only when the resume type is iGaming; for AI or non-iGaming roles do not mention iGaming tenure (it is not relevant for that resume).
4. **Closing:** Never use the phrase "I would welcome the opportunity" in the summary or closing. Use alternatives (e.g. "I am keen to…", "I look forward to…").
5. **Contacts:** Do not include email, phone, or LinkedIn in the cover letter. End with "Best regards," and name only.
6. **No em dashes (—).** The character — (em dash, U+2014) is forbidden in cover letters. Use only commas, periods, or separate sentences. **Before saving:** scan the full text for — (and en dash – if used as punctuation); replace every occurrence with a comma or period. Do not save the .docx until it contains no —.
7. **Tone:** Do not use informal or colloquial self-references (e.g. "как и я", "like me", "same as I do") in cover letters or any other generated application text. Keep tone consistently professional.
8. **Banned phrase:** Do not use "I am drawn to". Replace with alternatives (e.g. "I am keen to", "I am interested in", "I want to").

**Format:**
- **File path:** `00-Inbox/Job_Search/cover_letters/Cover_Letter_{Company}_{Role}.docx` (e.g. `Cover_Letter_VistaCreate_Senior_PM.docx`).
- **Font:** Calibri, 11 pt.
- **Alignment:** Justified (align to width) for all non-empty paragraphs.
- **Structure:** Normal paragraph breaks; one blank line between paragraphs (space_after ~6 pt).

**How to create the .docx:** Use Python with `python-docx`. Example pattern (adapt content per vacancy):

```python
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

# content = list of paragraph strings (empty string = blank line)
for block in content:
    p = doc.add_paragraph(block)
    p.paragraph_format.space_after = Pt(6) if block else Pt(0)
    if block:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

doc.save("00-Inbox/Job_Search/Cover_Letter_Company_Role.docx")
```

Tell the user: "Cover letter saved to `00-Inbox/Job_Search/Cover_Letter_….docx`. Open in Word; paragraphs are justified."
