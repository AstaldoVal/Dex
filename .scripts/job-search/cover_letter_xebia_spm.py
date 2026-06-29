#!/usr/bin/env python3
"""Create Cover_Letter_Xebia_Scientific_Product_Manager.docx."""
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / ".scripts"))

from create_cover_letter_docx import create_cover_letter

OUT_DIR = root / "00-Inbox/Job_Search/cover_letters"
OUT_PATH = OUT_DIR / "Cover_Letter_Xebia_Scientific_Product_Manager.docx"

CONTENT = [
    "I am applying for the Scientific Product Manager role at Xebia. I have 12+ years in product management: product vision, roadmaps, product planning, and structured product requirements in healthcare, data, and AI. I lead cross-functional execution with engineering, data science, and design in an Agile environment and focus on high-value use cases from discovery to adoption.",
    "",
    "At Glorium I led product and data for healthcare and commercial real estate: launched a Data Warehouse from scratch in six months, revamped pipelines to cut processing time by 30%, and improved data quality and reporting. I worked with revenue cycle management, BI, data analysis, and cross-functional teams in an Agile setup. I drive adoption and continuous improvement based on user feedback.",
    "",
    "In AI product roles I turned complex domain needs into scalable products and clear product requirements. At AlphaPrompt I led an AI-powered knowledge management system with LLM-based retrieval and document intelligence; as an AI PM consultant I delivered agents and workflow automation with Python and low-code tools. I build partnerships with customers and internal teams and use strong analytical and leadership skills to prioritize and ship measurable outcomes.",
    "",
    "I am keen to bring this mix of product leadership, data analysis, and AI product delivery to Xebia's GenAI work for scientific domains. I look forward to discussing how I can contribute.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

if __name__ == "__main__":
    create_cover_letter(str(OUT_PATH), CONTENT)
    print(OUT_PATH)
