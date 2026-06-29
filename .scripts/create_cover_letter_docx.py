#!/usr/bin/env python3
"""Create cover letter .docx with Calibri 11pt, justified, space_after 6pt."""
from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

def create_cover_letter(filepath: str, content: list) -> None:
    """content = list of paragraph strings (empty string = blank line)."""
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for block in content:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    doc.save(filepath)

if __name__ == "__main__":
    import sys
    path = sys.argv[1]
    # stdin: one paragraph per line; empty line = blank
    lines = sys.stdin.read().split("\n")
    content = []
    for line in lines:
        content.append(line)
    create_cover_letter(path, content)
