#!/usr/bin/env python3
"""Generate GR8 Tech Lead Product (FE Platform) cover letter as .docx."""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

CONTENT = [
    "GR8 Tech builds B2B iGaming platforms that power operators at scale. I am keen to lead the FE Platform product team and bring 12+ years of product leadership and 5+ years in iGaming, with a track record of strategic product decisions, scaling products, and managing relationships with business partners and stakeholders.",
    "",
    "At EBET I led platform migrations across Betconstruct, UltraPlay, and Aspire, integrated payment systems and third-party services, and supported $10M+ in wagering across UKGC, MGA, and Curacao. In later iGaming roles I owned a multi-vertical product portfolio (Live Casino, Bingo, Lottery, TV Games), used A/B testing and customer insights to drive growth, increased Live Games turnover by 7% and player retention by 10%, and drove compliance and MGA Pre-certification. I have hands-on experience integrating platforms into complex product ecosystems and aligning roadmaps with business goals and measurable outcomes.",
    "",
    "I have led and mentored Product Managers in several roles: at INXY I led a product team of 3 and a development department of 20; at Glorium I oversaw product owners, business analysts, and PMs on multiple projects and mentored 8 analysts; at Route4Me I spearheaded the Product Managers department and created end-to-end product development processes across Product, Development, Marketing, Sales, and Support. I use market analysis and identifying trends to inform product decisions, define and communicate product requirements clearly, and keep communication transparent with leadership and cross-functional teams.",
    "",
    "I would like to bring this mix of iGaming platform experience, strategic execution, and team leadership to GR8 Tech and help the FE Platform team deliver on business goals with measurable results.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

OUTPUT_PATH = Path(__file__).resolve().parent.parent.parent / "00-Inbox/Job_Search/cover_letters/Cover_Letter_GR8_Tech_Lead_Product_FE_Platform.docx"


def main():
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for block in CONTENT:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
