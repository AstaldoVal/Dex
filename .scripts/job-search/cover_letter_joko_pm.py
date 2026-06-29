#!/usr/bin/env python3
"""Create Cover_Letter_Joko_Product_Manager.docx using python-docx."""
import sys
from pathlib import Path

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
except ImportError:
    print("pip install python-docx", file=sys.stderr)
    sys.exit(1)

OUTPUT = Path(__file__).resolve().parents[2] / "00-Inbox/Job_Search/cover_letters/Cover_Letter_Joko_Product_Manager.docx"

content = [
    "Joko's mission to help consumers shop smarter, and the build-out of an AI-powered shopping assistant, align closely with where I have been investing my energy: product leadership on consumer-facing and data-driven products, and hands-on work with AI tools and automation.",
    "With over 12 years in product management, I have owned the full lifecycle of features from discovery to launch: defining vision and roadmap, writing specifications, collaborating with design and engineering, testing, and monitoring success post-launch. I have led product in consumer contexts (subscription tracker, B2C digital products) and scaled products to significant user bases. I prioritize based on business needs and impact, stay close to user feedback and trends, and keep stakeholders informed through clear written and verbal communication.",
    "I bring a strong data-driven mindset and experience leading teams (as CPO and senior PM) in fast-paced environments. I am comfortable in technical settings and hands-on with AI: I have built and deployed AI agents and workflow automation, delivered end-to-end prototypes with LLMs and RAG, and completed the Generative AI for Product Managers certification. I am keen to contribute to Joko AI or to your core business lines as you scale globally.",
    "I am based in Portugal and work remotely, with flexibility to align with Paris, Barcelona, and New York. I am fluent in English.",
    "I look forward to discussing how I can contribute to Joko's next chapter.",
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
