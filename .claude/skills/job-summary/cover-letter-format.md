# Cover Letter — Always .docx

When the user asks for a **cover letter** for a vacancy:

1. **Generate the letter** from CV + confirmed-facts + job description (no invented experience).
2. **Save as Word .docx** — do not output only plain text in chat. Create a file so structure is preserved in Word.

**Format:**
- **File path:** `00-Inbox/Job_Search/Cover_Letter_{Company}_{Role}.docx` (e.g. `Cover_Letter_VistaCreate_Senior_PM.docx`).
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
