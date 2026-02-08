#!/usr/bin/env python3
"""Generate SOFTSWISS Product Manager cover letter as Word .docx.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_SOFTSWISS_Product_Manager.docx"""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_SOFTSWISS_Product_Manager.docx"

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

content = [
    "Dear Hiring Manager,",
    "",
    "I am writing to apply for the Product Manager role at SOFTSWISS. I am a Senior Product Manager with 12+ years in product development and 5+ years in iGaming. I am drawn to the opportunity to drive product growth by analyzing partner performance, guiding data-driven improvements, and acting as the key link between partners and internal teams.",
    "",
    "In my iGaming roles I have done exactly that. At Pin-Up Entertainment I owned Live Casino, Bingo, Lottery, and TV Games: I analyzed game data to find drop-off points, formulated hypotheses, and ran A/B tests with the growth team, which increased Live Games turnover by 7% and player retention by 10%. I monitored performance using Tableau and worked with analytics to prioritize product improvements and growth initiatives based on data and business impact. At EBET I was the main point of contact with third-party vendors during platform migrations (Betconstruct, UltraPlay, Aspire), aligned their requirements with our capabilities, and supported over $10M in global wagering across UKGC, MGA, and Curacao. I have collaborated closely with development and design to implement features, evaluated decisions from a business and profitability perspective, and used Power BI, Tableau, and Mixpanel for data-driven decision making.",
    "",
    "I have a strong understanding of end-to-end product funnels and user journeys, hands-on experience in product analytics and interpreting data, and fluency in both English and Russian. I would welcome the chance to discuss how my background in iGaming product management and partner-facing, data-led growth can support SOFTSWISS and your team.",
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
