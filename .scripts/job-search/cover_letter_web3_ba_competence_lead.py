#!/usr/bin/env python3
"""Create Cover_Letter_Web3_BA_Competence_Lead.docx using python-docx."""
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    print("pip install python-docx", file=sys.stderr)
    sys.exit(1)

content = [
    "Dear Hiring Team,",
    "",
    "I am interested in the Business Analysis Competence Lead role for Web3 projects. With 12+ years in product development and delivery, I have led and mentored business analysts, owned requirements and process in outsourcing environments, and built a solid foundation in blockchain and crypto. I am keen to bring this mix of BA leadership, hands-on execution, and domain interest to your team.",
    "",
    "At Glorium Technologies I oversaw product owners and business analysts on multiple parallel projects and mentored a team of 8 business analysts on the Commercial Real Estate product, driving professional growth and delivery quality. In the role of Business/Data Analyst I built and launched a Data Warehouse from scratch for a healthcare client, covering requirements, data modelling, and BI enablement. I am used to defining and improving standards and practices: I introduced SCRUM and process optimizations that increased team efficiency by 50%, and I hold certifications in requirements prioritisation (BA Toolkit) and Enterprise Blockchain Architect. I am comfortable participating in discovery and pre-sales, structuring scope and assumptions with stakeholders, and stepping in as a hands-on analyst on critical or understaffed initiatives.",
    "",
    "My blockchain and Web3 foundation comes from the Enterprise Blockchain Architect certification, hands-on DeFi experience (portfolio and protocol analytics), and self-taught blockchain and wallet functionality. I have not yet led BA work on Web3 delivery projects, but I am eager to apply my BA leadership and requirements engineering experience in a Web3 context and to close the gap between your current practices and the needs of blockchain-based products.",
    "",
    "Thank you for considering my application. I look forward to discussing how my experience leading BAs, owning process and quality, and working in outsourcing and consultancy can support your Web3 BA competency.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

def main():
    base = Path(__file__).resolve().parent.parent.parent
    out = base / "00-Inbox/Job_Search/cover_letters/Cover_Letter_Web3_BA_Competence_Lead.docx"
    out.parent.mkdir(parents=True, exist_ok=True)

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    for block in content:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    doc.save(str(out))
    print(str(out))

if __name__ == "__main__":
    main()
