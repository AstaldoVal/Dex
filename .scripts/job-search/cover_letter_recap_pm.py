#!/usr/bin/env python3
"""Create Cover_Letter_Recap_Product_Manager.docx using python-docx."""
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    print("pip install python-docx", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "00-Inbox/Job_Search/cover_letters/Cover_Letter_Recap_Product_Manager.docx"

content = [
    "re:cap's mission to give founders clarity and control over capital, and your focus on AI-native product features from opportunity discovery to measurable impact, align well with my experience: 12+ years in product management with platform, data, and AI-powered products, and hands-on work building AI-enabled solutions.",
    "I have turned ambiguous problems into shipped product: at AlphaPrompt I led an AI-powered knowledge management system with LLM-based chatbot, vector databases, and document intelligence, and I designed human-in-the-loop workflows for classification and entity extraction using Azure OpenAI. In my current work I design and deploy AI agents and workflow automation with n8n, Make.com, and Python, and deliver end-to-end prototypes with LangChain and RAG so founders can validate concepts quickly. I have revamped data pipelines (e.g. 30% processing time reduction and higher data quality), stood up a Data Warehouse from scratch for a healthcare product, and managed roadmaps for AI-powered SaaS with API integrations and data-driven automation.",
    "I partner closely with engineering, data, and design, and I am used to agile tools such as Jira, Notion, and Linear. I measure and iterate with Power BI, Tableau, and Mixpanel, and I have led product owners and analysts while managing multiple projects of different complexity. I am based in Lisbon, Portugal, with a valid EU work permit, and I am comfortable in remote-first, asynchronous environments.",
    "I look forward to discussing how I can contribute to re:cap's Capital Operating System and your AI product roadmap.",
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
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(OUTPUT))
    print(OUTPUT)

if __name__ == "__main__":
    main()
