#!/usr/bin/env python3
"""Create Winter Bridge cover letters: Casino Manager and Product Manager."""
import sys
from pathlib import Path

# Add repo root so we can use write_cover_docx or inline logic
repo_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(repo_root))

from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

COVER_LETTERS_DIR = repo_root / "00-Inbox/Job_Search/cover_letters"


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


# Casino Manager
casino_content = [
    "I am writing to apply for the Casino Manager role at Winter Bridge, focused on Tier-1 markets and remote work.",
    "I have 12+ years of experience in product and operations, including 5+ years in iGaming. I have managed online casino verticals end to end: Live Casino, Bingo, Lottery, and TV Games. I am used to working with core metrics such as GGR, LTV, and retention, and have driven measurable results: a 10% increase in player retention and a 7% increase in Live Games turnover through data-led hypothesis testing and A/B experiments. I have designed promo economics with game providers and aligned them with antifraud, retention, and marketing so as not to over-bonus while maximising LTV.",
    "I have collaborated closely with providers and marketing teams, and have operated in regulated markets such as UKGC, MGA, and Curacao. In a previous iGaming role at EBET I worked with third-party vendors on product migrations and integrations, and the product delivered more than $10M in wagering across multiple jurisdictions. I am comfortable coordinating with legal and auditors and working fully remote from Portugal.",
    "I am keen to bring this experience to Winter Bridge and contribute to your Tier-1 casino operations.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]

# Product Manager
pm_content = [
    "I am writing to apply for the Product Manager role at Winter Bridge.",
    "I have 12+ years of experience in product management and IT/digital products, with a strong focus on roadmap ownership, hypothesis-driven development, metrics, and user and market analysis. I have led task prioritisation and cross-functional teams in B2C and iGaming. At my most recent iGaming role I owned the Live Casino, Bingo, Lottery, and TV Games verticals: I ran data analysis on game and behavioural data, identified drop-off points, and improved retention and turnover through A/B testing. I have also led compliance and product alignment, data-driven audit evidence, and reporting. Earlier, as a senior product leader in an outsourcing company, I oversaw multiple POs and BAs, increased team efficiency through process improvements, and launched a Data Warehouse from scratch to support BI and analytics.",
    "I am used to working with data (SQL, Tableau, product analytics), defining success metrics, and coordinating with development, marketing, and legal. My iGaming experience is a direct fit for roles where domain knowledge is a plus. I am based in Portugal and work fully remote.",
    "I am keen to bring this mix of product depth and iGaming experience to Winter Bridge.",
    "",
    "Best regards,",
    "Roman Matsukatov",
]


if __name__ == "__main__":
    COVER_LETTERS_DIR.mkdir(parents=True, exist_ok=True)
    write_docx(casino_content, COVER_LETTERS_DIR / "Cover_Letter_Winter_Bridge_Casino_Manager.docx")
    write_docx(pm_content, COVER_LETTERS_DIR / "Cover_Letter_Winter_Bridge_Product_Manager.docx")
    print("Cover_Letter_Winter_Bridge_Casino_Manager.docx")
    print("Cover_Letter_Winter_Bridge_Product_Manager.docx")
