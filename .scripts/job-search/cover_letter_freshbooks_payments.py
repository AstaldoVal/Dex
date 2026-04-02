#!/usr/bin/env python3
"""Create Cover_Letter_FreshBooks_Senior_Product_Manager_Payments.docx using python-docx."""
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    print("pip install python-docx", file=sys.stderr)
    sys.exit(1)

CONTENT = [
    "I am applying for the Senior Product Manager role focused on FreshBooks Payments. I bring 12+ years in product management, including hands-on experience with payment systems, gateways, and cross-functional delivery in fintech and regulated environments. I am keen to contribute a product vision and data-driven execution that helps small businesses get paid and manage their finances with less friction.",
    "",
    "At EBET I worked closely with the Head of Payments, integrating payment providers and gateways (e.g. Nuvei, AstroPay, MuchBetter, Interac, Netbanking UPI, Boleto, PagoEfectivo) and banking solutions across multiple regulatory territories. I have owned major product areas with measurable impact: increased Live Games turnover by 7% and player retention by 10% through data analysis and A/B testing, reduced regulatory issues by 30% via compliance product leadership, and improved team efficiency by 50% through Scrum and process improvements. I define roadmaps, prioritize using clear frameworks, build business cases, and use analytics (Power BI, Tableau, Mixpanel) to guide strategy and adapt plans.",
    "",
    "I lead cross-functional teams of developers and designers, mentor junior product managers (I developed 8 POs and BAs at Glorium), and spend time with customers and stakeholders to articulate the customer journey and align deliverables. I am interested in bringing this mix of payments experience, strategic ownership, and customer empathy to FreshBooks Payments and would value the chance to discuss how I can support your vision for small business owners.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

def main():
    out_path = Path(__file__).resolve().parent.parent.parent / "00-Inbox/Job_Search/cover_letters/Cover_Letter_FreshBooks_Senior_Product_Manager_Payments.docx"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for block in CONTENT:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    doc.save(out_path)
    print(str(out_path))

if __name__ == "__main__":
    main()
