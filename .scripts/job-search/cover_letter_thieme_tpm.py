#!/usr/bin/env python3
"""Create Cover_Letter_Thieme_Tech_Lead_Technical_Product_Manager.docx using python-docx."""
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
    "Dear Hiring Manager,",
    "",
    "I am writing to apply for the Tech Lead / Technical Product Manager role at Thieme. With over 12 years in product and technical leadership, I have shaped AI-powered search and knowledge systems, led cross-functional teams, and delivered solutions that serve healthcare and education workflows. I am keen to contribute to Thieme's strategic direction for AI-powered search and decision support and to help build the team and roadmap that will keep your medical products at the forefront for professionals and students.",
    "",
    "At AlphaPrompt I led the development of an AI-powered knowledge management system that integrated LLM-based chatbot solutions, vector databases, and document intelligence for structured data retrieval. I designed AI-driven workflows for document classification, entity extraction, and contextual query processing using Azure OpenAI and advanced search parameters. In my recent work as an AI Product Manager I have delivered end-to-end prototypes using LangChain and RAG, and I have experience defining product and technology roadmaps and aligning them with business goals. I am comfortable owning the full lifecycle of search-related products, from classic keyword and semantic retrieval to RAG-based systems and chat frontends.",
    "",
    "In healthcare contexts at Glorium I built a data warehouse from scratch, established revenue cycle management processes, and improved reporting and operational visibility for telehealth and related products. I have led teams of product owners, business analysts, and developers, increased delivery efficiency by 50% through process and Scrum adoption, and mentored analysts and PMs. I combine a data-driven mindset with a hands-on approach to building and shipping products, and I am prepared to evaluate technical options and lead the team toward the best solution for Thieme's users.",
    "",
    "I would be glad to discuss how my experience in AI search, healthcare product delivery, and team leadership can support Thieme's digital transformation and the mission to provide the right information and services to medical students, physicians, and healthcare organisations.",
    "",
    "Best regards,",
    "",
    "Roman Matsukatov",
]

def main():
    base = Path(__file__).resolve().parent.parent.parent
    out_path = base / "00-Inbox/Job_Search/cover_letters/Cover_Letter_Thieme_Tech_Lead_Technical_Product_Manager.docx"
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
