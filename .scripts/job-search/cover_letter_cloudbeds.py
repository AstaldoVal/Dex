#!/usr/bin/env python3
"""Generate Cloudbeds Product Manager (Financial & Accounting Platform) cover letter as Word .docx.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_Cloudbeds_Product_Manager_Financial_Accounting.docx"""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_Cloudbeds_Product_Manager_Financial_Accounting.docx"

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

content = [
    "Dear Hiring Team,",
    "",
    "I am writing to apply for the Product Manager – Financial & Accounting Platform role at Cloudbeds. I have 12+ years in product management building SaaS and platform operations in finance, payments, and high-trust systems, and I am drawn to the chance to own the financial backbone of a platform that powers tens of thousands of properties worldwide.",
    "",
    "I have led financial and accounting-related product work end to end: defining strategy, writing clear requirements, and shipping with a strong focus on accuracy and auditability. At Glorium (Healthcare/Telehealth), I owned Revenue Cycle Management (RCM), introduced a billing structure that cut revenue leakage by 3% and removed double-billing automation issues, and gave finance teams better visibility and control. I also built a Data Warehouse from scratch in six months, improving reporting accuracy and data quality while reducing load on production systems—experience that maps directly to folio transactions, money movement, and closing the books at scale. In iGaming (e.g. at EBET), I integrated payment systems and gateways (Nuvei, AstroPay, and others), coordinated with legal and auditors for certifications, and reduced regulatory issues by 30% through structured compliance and documentation. I am used to mission-critical systems where correctness and audit trails are non-negotiable.",
    "",
    "I am equally at home leading integrations and partner experience. I have driven accounting and payment integrations with an emphasis on clear documentation, extensibility, and working closely with engineering and third parties. I rely on user discovery to understand workflows and constraints, use data to validate hypotheses and justify decisions, and define and track success metrics through the product lifecycle. I work effectively in fully remote, async-first environments and am comfortable creating structure from ambiguity and aligning cross-functional teams.",
    "",
    "I would welcome the opportunity to bring this experience to Cloudbeds and to help shape the financial operations and accounting products that hotel operators and finance teams rely on every day.",
    "",
    "Best regards,",
    "Roman Matsukatov",
    "r.matsukatov@gmail.com | +351 919 191 596",
    "linkedin.com/in/roman-matsukatov",
]

for block in content:
    p = doc.add_paragraph(block)
    p.paragraph_format.space_after = Pt(6) if block else Pt(0)
    if block:
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

doc.save(out_path)
print(f"Saved: {out_path}")
