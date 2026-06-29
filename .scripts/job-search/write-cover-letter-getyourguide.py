#!/usr/bin/env python3
"""Generate GetYourGuide Senior PM Communications Platform cover letter as .docx."""
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    raise SystemExit("Install python-docx: pip install python-docx")

content = [
    "Dear Hiring Team,",
    "",
    "I am applying for the Senior Product Manager, Communications Platform role at GetYourGuide. With 12+ years in product management—platform operations, B2B SaaS, integrations, and cross-functional leadership—I am drawn to your mission to build and scale the core infrastructure that powers consistent, personalized communications across every channel and language.",
    "",
    "Your team’s scope aligns closely with what I have done before: consolidating platforms and infrastructure, designing scalable systems, and orchestrating workflows across multiple stakeholders. At Glorium I led product for healthcare and commercial real estate: I revamped data pipelines (reducing processing time by 30% and improving data quality), launched a Data Warehouse from scratch in six months to enable BI and governance, and drove alignment across 20-person cross-functional teams. I defined strategy, set KPIs, owned roadmaps, and delivered measurable impact—including a 50% efficiency gain within six months after introducing SCRUM and process improvements. At AlphaPrompt I owned the product lifecycle for an AI-powered SaaS solution, from API integrations and user-facing tools to document intelligence and LLM-based workflows. That experience—building platforms that other teams and systems depend on—maps well to owning the vision for your communications and localization platform.",
    "",
    "I am used to partnering with UX, engineering, and data: defining requirements, prioritizing with data and experiments, and keeping stakeholders aligned. I run A/B tests and use analytics to validate hypotheses and guide investment; I have worked with Mixpanel, Power BI, and Tableau and care deeply about customer and business impact. In past roles I have integrated third-party services and payment systems, maintained a customer-first mindset with auditors and partners, and fostered a culture of continuous improvement. I am keen to bring this mindset to GetYourGuide—to advocate for users, turn a bold vision into reality, and help deliver extraordinary journeys for millions of travellers.",
    "",
    "I look forward to the possibility of discussing how my background in platform product management and cross-functional execution can contribute to the Localization and Communications Platform team.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

def main():
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    for block in content:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    out_dir = Path(__file__).resolve().parent.parent.parent / "00-Inbox" / "Job_Search" / "cover_letters"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "Cover_Letter_GetYourGuide_Senior_PM_Communications_Platform.docx"
    doc.save(str(out_path))
    print(out_path)

if __name__ == "__main__":
    main()
