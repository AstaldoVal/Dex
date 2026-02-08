#!/usr/bin/env python3
"""Generate VistaCreate cover letter as Word .docx with proper paragraphs.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_VistaCreate_Senior_PM.docx"""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_VistaCreate_Senior_PM.docx"

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

content = [
    "Dear Hiring Manager,",
    "",
    "I am writing to apply for the Senior Product Manager role at VistaCreate. I am a product manager with 12+ years in SaaS and e-commerce who focuses on continuous discovery, data-driven roadmaps, and cross-functional delivery. I am drawn to Vista's mission of making design and marketing accessible to small businesses and would like to contribute to a product that helps creators and businesses bring ideas to life.",
    "",
    "In my recent roles I have run ongoing customer discovery, turned user insights into problem statements and shipped changes, and used product data to guide the roadmap. At Pin-Up I used Tableau and behavioral data to find drop-off points, formed and tested hypotheses with the growth team, and ran A/B tests that improved player retention and turnover. At Perenio I led product workshops (including CJM), implemented a structured PRD process, and improved user experience and onboarding. I have maintained prioritized backlogs aligned with product goals, defined user stories and acceptance criteria, and worked daily with Engineering, Design, Marketing, and Sales to ship value iteratively and align on go-to-market and launches. I am comfortable with experimentation and growth (onboarding, activation, upsells), with presenting and sharing insights to technical and non-technical stakeholders, and with working in fluent English in distributed, remote setups. I monitor competitors and trends to inform strategy and care about consistent, high-quality UX and attention to detail.",
    "",
    "I am keen to bring this experience to VistaCreate and to help shape a design tool that serves small businesses and creators. I would welcome the chance to discuss how my background in discovery, experimentation, and cross-functional delivery can support your product and team.",
    "",
    "Thank you for considering my application.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

for block in content:
    p = doc.add_paragraph(block)
    p.paragraph_format.space_after = Pt(6) if block else Pt(0)
    if block:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

doc.save(out_path)
print(f"Saved: {out_path}")
