#!/usr/bin/env python3
"""Generate cover letter for Evoplay — Licensing & Regulatory Specialist.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_Evoplay_Licensing_Regulatory_Specialist.docx"""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_Evoplay_Licensing_Regulatory_Specialist.docx"

content = [
    "Dear Evoplay Hiring Team,",
    "",
    "I am writing to apply for the Licensing & Regulatory Specialist position at Evoplay. With 12+ years in product and compliance and 5+ years in iGaming, I have focused on regulatory compliance, licensing readiness, and embedding compliance across business operations—aligning closely with your mission to support global market expansion while ensuring full regulatory compliance across multiple jurisdictions.",
    "",
    "At Pin-Up Entertainment I established the compliance product function from scratch: I led MGA Pre-certification and readiness for full certification and market entry, coordinated with legal, architecture, and third-party auditors to streamline compliance audits, and reduced regulatory issues by 30% through proactive risk identification and mitigation. I act as the primary liaison between legal, product, and external auditors—drafting and supporting responses to regulatory inquiries, providing consultations and guidance on regulatory topics to internal stakeholders, and translating complex regulatory requirements and licensing procedures into actionable specifications. I have worked with UKGC, MGA, Curacao, Ontario, Anjouan, Tobique, and New Jersey, and I am used to monitoring regulatory updates and meeting strict deadlines across multiple projects.",
    "",
    "Previously, at EBET I maintained compliance across $10M+ in global wagering and multiple regulated territories while leading platform migrations. I am comfortable collaborating with Legal, Product, Technology, and Commercial teams, and I have strong written and verbal communication skills when interacting with regulators and internal teams. I would welcome the opportunity to contribute to Evoplay's growth and to help ensure your products continue to meet the highest standards across all active jurisdictions.",
    "",
    "Thank you for considering my application. I look forward to discussing how my experience can support your compliance and licensing goals.",
    "",
    "Yours sincerely,",
    "Roman Matsukatov",
]

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

for block in content:
    p = doc.add_paragraph(block)
    p.paragraph_format.space_after = Pt(6) if block else Pt(0)
    if block:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

doc.save(out_path)
print("Saved:", out_path)
