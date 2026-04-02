#!/usr/bin/env python3
"""Generate Cision Product Manager (SaaS) cover letter as Word .docx.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_Cision_Product_Manager_SaaS.docx"""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_Cision_Product_Manager_SaaS.docx"

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

content = [
    "Dear Hiring Team,",
    "",
    "I am writing to apply for the Product Manager (SaaS) role at Cision. I have 12+ years in product management across enterprise software, SaaS, and complex web platforms, managing the full product lifecycle from ideation and strategy through development, launch, and ongoing enhancements. I am keen to bring this experience to Cision and to help shape products that drive authentic connections and business results for your customers.",
    "",
    "In my recent roles I have defined and executed product strategies and roadmaps aligned with business goals and customer needs, conducted market and customer research to identify opportunities and inform prioritization, and partnered with engineering, design, sales, marketing, and customer success to translate vision into requirements and delivery. At Glorium I led product and data initiatives for Healthcare and Commercial Real Estate: I increased team efficiency by 50% through SCRUM and process improvements, revamped data pipelines (reducing processing time by 30% and improving data quality), and launched a Data Warehouse from scratch in six months to enable better BI and governance. I have managed backlog prioritization, release planning, and launch readiness, and I monitor product performance using Power BI, Tableau, and Mixpanel to adjust strategy and improve adoption.",
    "",
    "I am comfortable acting as a subject matter expert on complex problems, working independently toward long-range goals, and mentoring less experienced colleagues. I have presented to executive audiences and collaborated with internal and external stakeholders on go-to-market and product enablement. I hold a Master's degree in Statistics and certifications in product management and Agile practices. I would be glad to discuss how my background in SaaS product management and cross-functional delivery can support Cision's product and communications cloud objectives.",
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
