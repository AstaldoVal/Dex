#!/usr/bin/env python3
"""One-off: write a list of paragraph strings to a .docx (Calibri 11pt, justified, space_after 6pt)."""
import sys
from pathlib import Path

from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

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
    import json
    out_path = sys.argv[1]
    if len(sys.argv) > 2 and sys.argv[2] == "--stdin":
        data = json.load(sys.stdin)
    else:
        with open(sys.argv[2], "r", encoding="utf-8") as f:
            data = json.load(f)
    write_docx(data, out_path)
    print(out_path)
