#!/usr/bin/env python3
"""Generate mc2i Product Owner Retail Luxe cover letter as Word .docx.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_mc2i_Product_Owner_Retail_Luxe.docx"""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_mc2i_Product_Owner_Retail_Luxe.docx"

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

content = [
    "I am writing to apply for the Product Owner / Business Analyst role within the Retail & Luxe practice at mc2i. With over 12 years in product management and product ownership across healthcare, logistics, marketplace platforms, and SaaS, I am keen to contribute to your clients' digital transformation programmes in retail and luxury.",
    "",
    "My experience aligns with the activities you describe: product management and project cadrage, business case and opportunity studies, supporting métiers in defining needs, and writing user stories. I have led backlog prioritization and arbitrage on new features, facilitated agile ceremonies, and worked with both business and technical stakeholders. I hold a Certified Scrum Product Owner certification and have implemented SCRUM in development teams, achieving measurable gains in delivery efficiency. I am used to risk analysis, cost estimation, planning, and solution validation.",
    "",
    "I am interested in joining a consultancy that combines an entrepreneurial mindset with strong expertise in retail and luxury, and in applying my product and agile background to omnicanality, e-commerce, and customer experience initiatives. I would be glad to discuss how my experience can support mc2i's teams and clients.",
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
