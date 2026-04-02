#!/usr/bin/env python3
"""Generate Calyptus Product Manager cover letter as Word .docx.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_Calyptus_Product_Manager.docx"""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_Calyptus_Product_Manager.docx"

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

content = [
    "Dear Hiring Team,",
    "",
    "I am writing to apply for the Product Manager role at Calyptus. I have 12+ years in product management with hands-on experience in fintech-adjacent SaaS (payments, revenue cycle management, treasury visibility), enterprise delivery, and logistics. I am a builder who partners deeply with Engineering and have shipped both core product features and net-new offerings from concept to scale.",
    "",
    "I have delivered enterprise-grade outcomes with measurable impact. At Glorium I owned Revenue Cycle Management and introduced a billing structure that reduced revenue leakage by 3% and gave finance teams greater visibility and control; I also built a Data Warehouse from scratch in six months, enabling BI and reducing load on production systems. As Lead PM at Route4Me I led the logistics product for enterprise customers and established cross-functional processes that improved execution. At EBET I integrated payment systems and gateways (Nuvei, AstroPay, and others) and worked closely with the Head of Payments on banking solutions. I set quality bars, mentor PMs, and drive collaboration with Engineering, Design, and GTM without relying on formal authority.",
    "",
    "I am AI-savvy and use modern AI tooling in my product work. I led an AI-powered knowledge management product at AlphaPrompt (LLM-based chatbot, vector search, document intelligence) and deliver AI-driven workflow automation and prototypes in my current practice. I am certified in Generative AI for Product Managers and am keen to apply this to accelerate research, prototyping, and responsible AI productisation at Calyptus. I look forward to discussing how I can contribute to your AP Finance vision and logistics-focused offering.",
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
