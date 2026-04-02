"""Generate i6 Group Product Owner cover letter as Word .docx.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_i6_Group_Product_Owner.docx"""
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    raise SystemExit("Install python-docx: pip install python-docx")

ROOT = Path(__file__).resolve().parents[2]
out_dir = ROOT / "00-Inbox/Job_Search/cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_i6_Group_Product_Owner.docx"

CONTENT = [
    "I am writing to apply for the Product Owner role at i6.",
    "",
    "I have over 12 years of experience in product development and management, including Product Owner and Senior Product Manager roles in SaaS, B2B platforms, and cross-functional delivery. I am a Certified Scrum Product Owner and have owned backlogs, refined requirements into user stories and acceptance criteria, and worked with engineering, QA, and design to deliver value in each sprint.",
    "",
    "In my roles at Glorium, AlphaPrompt, and earlier at Perenio and Route4Me, I engaged directly with clients and stakeholders to gather needs, represent the customer voice, and translate business requirements into clear priorities and artefacts. I have used business process and user-journey techniques such as CJM and UML to align teams and improve customer experience. I am proficient in Agile methodologies and tools including JIRA and Confluence, and I have increased team efficiency through backlog refinement and sprint discipline while keeping customer and business objectives in balance.",
    "",
    "I am keen to bring this experience to i6's aviation fuel management platform and to contribute to operational efficiency, transparency, and a strong customer experience for your clients.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

def write_docx(paragraphs, path):
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for block in paragraphs:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    doc.save(path)

if __name__ == "__main__":
    write_docx(CONTENT, out_path)
    print(out_path)
