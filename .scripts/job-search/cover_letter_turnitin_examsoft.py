#!/usr/bin/env python3
"""Generate Turnitin Product Manager ExamSoft Insights cover letter as Word .docx.
   Output: 00-Inbox/Job_Search/cover_letters/Cover_Letter_Turnitin_Product_Manager_ExamSoft_Insights.docx"""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

vault = Path(__file__).resolve().parent.parent.parent
out_dir = vault / "00-Inbox" / "Job_Search" / "cover_letters"
out_dir.mkdir(parents=True, exist_ok=True)
out_path = out_dir / "Cover_Letter_Turnitin_Product_Manager_ExamSoft_Insights.docx"

doc = Document()
style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(11)

content = [
    "Dear Hiring Manager,",
    "",
    "I am writing to apply for the Product Manager, ExamSoft Insights role at Turnitin. I am a product manager with 12+ years in product development and management across SaaS, assessment-like data and reporting workflows, and complex web platforms. I am interested in Turnitin's mission to ensure the integrity of global education and improve learning outcomes, and in contributing to a reporting platform that helps customers assess exam-taker performance effectively.",
    "",
    "In my experience I have managed a suite of data and reporting workflows and worked closely with UX, engineering, and QA to define requirements, build capabilities, and deliver product features. I support engineering with clear, detailed requirements for product features and enhancements, and I define, manage, and report on roadmap status so that delivery stays aligned with company objectives and market needs. I analyse user feedback, data, and market trends to refine and improve product offerings, and I have integrated requirements from data privacy regulations and interoperability into product administration. I work with sales, marketing, customer success, and executives to align product delivery with business strategy, support releases with accurate market messaging, streamline onboarding, and enable informed, responsive support. I have presented on product releases and roadmaps at webinars and internal meetings, and I am used to working in a remote-first environment with cross-functional teams and with synchronous and asynchronous collaboration.",
    "",
    "I am keen to bring this experience to ExamSoft Insights and to help advance reporting capabilities that further your customers' educational and professional goals. I look forward to discussing how my background in data and reporting workflows, Agile delivery, and cross-functional alignment can support your team.",
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
