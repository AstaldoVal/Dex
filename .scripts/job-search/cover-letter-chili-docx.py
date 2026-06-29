#!/usr/bin/env python3
"""Create Cover_Letter_CHILI_Publish_Product_Management.docx using python-docx."""
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    print("pip install python-docx", file=sys.stderr)
    sys.exit(1)

# Content: list of paragraph strings (empty string = blank line)
content = [
    "Dear Hiring Team at CHILI publish,",
    "",
    "I am keen to connect regarding your Open Call For Product Management Talent. With more than twelve years of experience in SaaS product management, platform operations, and regulated environments, I have consistently connected strategy to execution and helped teams turn complex problems into clear, deliverable roadmaps. My background spans healthcare, logistics, real estate, subscription management, and iGaming, with a strong focus on discovery, prioritization, and outcome driven delivery.",
    "",
    "In my recent roles as Senior Product Manager at Glorium Technologies and Product Manager at Route4Me and EBET, I owned and prioritized product backlogs aligned with business and customer goals, led discovery with stakeholders across sales, marketing, customer success, and operations, and guided cross functional teams through agile delivery. I worked closely with engineering and design to translate product vision and user insights into wireframes, detailed user stories, and release plans, using tools such as Jira, Confluence, Figma, and analytics platforms. This included launching a data warehouse from scratch to enable better BI, redesigning complex workflows in telehealth and commercial real estate products, and driving process changes that improved team efficiency by up to fifty percent.",
    "",
    "Today, as an AI Product Manager and automation consultant, I design and ship AI powered workflows and internal tools that reduce manual work and help teams scale content and data intensive processes. This work strengthened my ability to work in fast moving environments, make trade offs under uncertainty, and use experimentation and data to inform product decisions. I am based in Lisbon and work comfortably in distributed teams across European time zones, with regular travel to a headquarters when needed.",
    "",
    "At CHILI publish, I see the biggest impact for me in a senior product management role, partnering with design and engineering to evolve your cloud platform for brands and agencies, especially around complex content creation workflows and automation. I would be excited to own a slice of the product, drive discovery with customers and internal stakeholders, and help translate your strategy into clear, incremental releases that make it easier to create, automate, and scale digital content.",
    "",
    "Thank you for considering my application. I look forward to the possibility of discussing how my experience with SaaS products, cross functional stakeholder management, and discovery driven delivery could support the next stage of CHILI publish.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

def main():
    base = Path(__file__).resolve().parent.parent.parent
    out = base / "00-Inbox/Job_Search/cover_letters/Cover_Letter_CHILI_Publish_Product_Management.docx"
    out.parent.mkdir(parents=True, exist_ok=True)

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    for block in content:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    doc.save(str(out))
    print(str(out))

if __name__ == "__main__":
    main()
