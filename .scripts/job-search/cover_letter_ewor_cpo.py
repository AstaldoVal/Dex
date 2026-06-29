#!/usr/bin/env python3
"""Generate EWOR AI Infrastructure Co-Founder / CPO cover letter as .docx."""
import sys
from pathlib import Path

# Add repo root for write_cover_docx
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

OUT_DIR = ROOT / "00-Inbox/Job_Search/cover_letters"
OUT_PATH = OUT_DIR / "Cover_Letter_EWOR_AI_Infrastructure_Co-Founder_CPO.docx"

CONTENT = [
    "I am applying for the AI Infrastructure Co-Founder / CPO role at EWOR. The chance to build and scale my own startup with a salary or funding, plus weekly sparring with unicorn founders and access to your community and hiring network, aligns closely with how I have worked for over twelve years: owning product from zero to scale and leading teams in fast-paced environments.",
    "",
    "I have 12+ years in product leadership. I led the development of an AI-powered knowledge management system at AlphaPrompt (Azure OpenAI, vector databases, document intelligence) and delivered end-to-end AI prototypes and workflow automation for clients using n8n, Make.com, and Python. As CPO at INXY I led the full product function, managing three product managers and a development department of twenty, and drove product strategy that increased execution efficiency by 30%. At Glorium I built a Data Warehouse from scratch in six months, introduced SCRUM so the team gained 50% efficiency within six months, and revamped pipelines cutting processing time by 30%. I have shipped products that generated $10M+ in outcomes and have experience taking full responsibility for P&L, roadmap, and team building.",
    "",
    "I am based in Europe (Portugal), communicate in English at a professional level, and am keen to take full responsibility for building and scaling a startup to €100M+ in revenues. I am keen to iterate to product-market fit and prepare for a multi-million euro funding round with EWOR’s coaching and network. I look forward to discussing how I can contribute as an EWOR Fellow.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]


def write_docx(paragraphs, out_path):
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for block in paragraphs:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    doc.save(out_path)


if __name__ == "__main__":
    write_docx(CONTENT, OUT_PATH)
    print(OUT_PATH)
