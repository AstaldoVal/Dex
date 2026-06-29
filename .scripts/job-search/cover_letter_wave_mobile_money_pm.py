#!/usr/bin/env python3
"""Create Cover_Letter_Wave_Mobile_Money_Product_Manager.docx using python-docx."""
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    print("pip install python-docx", file=sys.stderr)
    sys.exit(1)

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_Wave_Mobile_Money_Product_Manager.docx"

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

content = [
    "Dear Hiring Team,",
    "",
    "I am applying for the Product Manager role at Wave. Your mission to make Africa the first cashless continent and to build financial services that work for people who need them most is one I want to contribute to. I have 12+ years in product management, with full ownership of product domains, roadmaps, and cross-functional delivery in fast-paced, high-ownership environments including startups and scale-ups.",
    "",
    "I have led product end-to-end: defining goals and roadmaps from user needs, driving user research and data-driven decisions, and shipping both product features and the internal tooling needed to support them. At Glorium I owned product and process for Healthcare and CRE, built a Data Warehouse from scratch in six months, and increased team efficiency by 50% through process and Scrum. At Route4Me I created a comprehensive product development lifecycle that connected Product, Development, Marketing, Sales, and Support and established SCRUM for web teams. At EBET I integrated payment systems and gateways and worked with the Head of Payments on banking solutions across regulated markets. I prioritise based on impact, adjust quickly from feedback and experiments, and over-communicate context and decisions to keep teams aligned.",
    "",
    "I have worked in fintech-adjacent product (payments, Stripe and Plaid integration at INXY, payment providers and gateways at EBET) and in consumer and B2B SaaS. I am comfortable travelling to meet users and would be keen to work from first principles with your in-country and remote teams to solve the biggest problems blocking growth and impact. I look forward to discussing how I can contribute to Wave.",
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
