#!/usr/bin/env python3
"""
Replace Google Doc sections 4–6 (Markdown) with native Docs tables + styles.

Env (same as google-drive-work-mcp): GOOGLE_DRIVE_CREDENTIALS_PATH,
GOOGLE_DRIVE_TOKEN_PATH, VAULT_PATH
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_MCP_DIR = Path(__file__).resolve().parent
_CORE = _MCP_DIR.parent
if str(_CORE) not in sys.path:
    sys.path.insert(0, str(_CORE))
if str(_MCP_DIR) not in sys.path:
    sys.path.insert(0, str(_MCP_DIR))

import google_drive_server as g  # noqa: E402


DOC_ID = "1SvGtYuNRHfHHraMvPbLchX3em8DGVDiC1QNkhH7SQNw"
DEFAULT_MD_PATH = Path("/tmp/banda_audit_46.md")


@dataclass
class Para:
    lines: list[str]


@dataclass
class CodeBlock:
    body: str


@dataclass
class Table:
    rows: list[list[str]]


Block = Para | CodeBlock | Table


def parse_inline(md: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    i = 0
    n = len(md)
    while i < n:
        if md.startswith("**", i):
            j = md.find("**", i + 2)
            if j != -1:
                out.append(("bold", md[i + 2 : j]))
                i = j + 2
                continue
        if md.startswith("`", i):
            j = md.find("`", i + 1)
            if j != -1:
                out.append(("code", md[i + 1 : j]))
                i = j + 1
                continue
        if md.startswith("*", i) and not md.startswith("**", i):
            j = md.find("*", i + 1)
            if j != -1 and "\n" not in md[i + 1 : j]:
                out.append(("italic", md[i + 1 : j]))
                i = j + 1
                continue
        if md.startswith("_", i) and not md.startswith("__", i):
            j = md.find("_", i + 1)
            if j != -1 and "\n" not in md[i + 1 : j] and "`" not in md[i + 1 : j]:
                out.append(("italic", md[i + 1 : j]))
                i = j + 1
                continue
        nxt = n
        for pat in ("**", "`", "*", "_"):
            k = md.find(pat, i + 1)
            if k != -1 and k < nxt:
                nxt = k
        out.append(("plain", md[i:nxt]))
        i = nxt
    return out


def flatten_segments(segments: list[tuple[str, str]]) -> tuple[str, list[tuple[int, int, dict[str, Any]]]]:
    plain = ""
    spans: list[tuple[int, int, dict[str, Any]]] = []
    for kind, text in segments:
        if kind == "plain":
            plain += text
            continue
        st = len(plain)
        plain += text
        en = len(plain)
        if kind == "bold":
            spans.append((st, en, {"bold": True}))
        elif kind == "code":
            spans.append(
                (
                    st,
                    en,
                    {
                        "weightedFontFamily": {"fontFamily": "Roboto Mono"},
                        "backgroundColor": {
                            "color": {
                                "rgbColor": {"red": 0.94, "green": 0.94, "blue": 0.96}
                            }
                        },
                    },
                )
            )
        elif kind == "italic":
            spans.append((st, en, {"italic": True}))
    return plain, spans


def is_table_row(line: str) -> bool:
    s = line.strip()
    return s.startswith("|") and s.endswith("|") and "|" in s[1:-1]


def is_separator_row(line: str) -> bool:
    if not is_table_row(line):
        return False
    parts = [p.strip() for p in line.strip().strip("|").split("|")]
    return bool(parts) and all(re.fullmatch(r":?-{3,}:?", p) for p in parts)


def split_table_row(line: str) -> list[str]:
    inner = line.strip().strip("|")
    return [c.strip() for c in inner.split("|")]


def parse_blocks(md: str) -> list[Block]:
    lines = md.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[Block] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            i += 1
            continue

        if s.startswith("```"):
            i += 1
            body: list[str] = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            blocks.append(CodeBlock("\n".join(body)))
            continue

        if is_table_row(line):
            rows: list[list[str]] = []
            while i < len(lines) and is_table_row(lines[i]):
                if is_separator_row(lines[i]):
                    i += 1
                    continue
                rows.append(split_table_row(lines[i]))
                i += 1
            if rows:
                blocks.append(Table(rows))
            continue

        if s.startswith("- "):
            bullets: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                bullets.append(lines[i].strip()[2:])
                i += 1
            if bullets:
                blocks.append(Para(["• " + x for x in bullets]))
            continue

        para_lines: list[str] = []
        while i < len(lines):
            ln = lines[i]
            if not ln.strip():
                i += 1
                break
            st = ln.strip()
            if st.startswith("```") or is_table_row(ln) or st.startswith("- "):
                break
            para_lines.append(ln)
            i += 1
        if para_lines:
            blocks.append(Para(para_lines))
    return blocks


def table_cell_insert_index(cell: dict[str, Any]) -> int | None:
    for ce in cell.get("content", []):
        para = ce.get("paragraph")
        if not para:
            continue
        for elem in para.get("elements", []):
            if "startIndex" in elem:
                return int(elem["startIndex"])
    return None


def walk_table_cell_indices(table: dict[str, Any]) -> list[list[int | None]]:
    grid: list[list[int | None]] = []
    for row in table.get("tableRows", []):
        r: list[int | None] = []
        for cell in row.get("tableCells", []):
            r.append(table_cell_insert_index(cell))
        grid.append(r)
    return grid


def find_table_range_at_index(doc: dict[str, Any], cursor: int) -> tuple[int, int]:
    for el in doc.get("body", {}).get("content", []):
        si = el.get("startIndex")
        if si is None or "table" not in el:
            continue
        if int(si) == int(cursor):
            ei = el.get("endIndex")
            if ei is None:
                break
            return int(si), int(ei)
    for el in doc.get("body", {}).get("content", []):
        si = el.get("startIndex")
        if si is None or "table" not in el:
            continue
        if abs(int(si) - int(cursor)) <= 1:
            ei = el.get("endIndex")
            if ei is not None:
                return int(si), int(ei)
    raise RuntimeError(f"No table whose startIndex matches cursor {cursor}")


def requests_for_paragraph(insert_at: int, text: str, heading: bool = False) -> tuple[list[dict[str, Any]], int]:
    segs = parse_inline(text)
    plain, spans = flatten_segments(segs)
    if not plain.endswith("\n"):
        plain += "\n"
    reqs: list[dict[str, Any]] = [
        {"insertText": {"location": {"index": insert_at}, "text": plain}},
    ]
    abs_end = insert_at + len(plain)
    for st, en, style in spans:
        reqs.append(
            {
                "updateTextStyle": {
                    "range": {"startIndex": insert_at + st, "endIndex": insert_at + en},
                    "textStyle": style,
                    "fields": ",".join(sorted(style.keys())),
                }
            }
        )
    if heading:
        reqs.append(
            {
                "updateParagraphStyle": {
                    "range": {"startIndex": insert_at, "endIndex": abs_end - 1},
                    "paragraphStyle": {"namedStyleType": "HEADING_2"},
                    "fields": "namedStyleType",
                }
            }
        )
    return reqs, abs_end


def requests_for_code_block(insert_at: int, body: str) -> tuple[list[dict[str, Any]], int]:
    plain = body.rstrip("\n") + "\n"
    start = insert_at
    end = start + len(plain)
    reqs: list[dict[str, Any]] = [
        {"insertText": {"location": {"index": insert_at}, "text": plain}},
        {
            "updateTextStyle": {
                "range": {"startIndex": start, "endIndex": end},
                "textStyle": {
                    "weightedFontFamily": {"fontFamily": "Roboto Mono"},
                    "backgroundColor": {
                        "color": {"rgbColor": {"red": 0.93, "green": 0.95, "blue": 0.98}}
                    },
                },
                "fields": "weightedFontFamily,backgroundColor",
            }
        },
    ]
    return reqs, end


def chunk(reqs: list[dict[str, Any]], n: int = 45):
    for k in range(0, len(reqs), n):
        yield reqs[k : k + n]


def para_content(el: dict[str, Any]) -> str:
    p = el.get("paragraph") or {}
    return "".join(pe.get("textRun", {}).get("content", "") for pe in p.get("elements", []))


def delete_trailing_1x1_table(docs, doc: dict[str, Any]) -> None:
    els = doc.get("body", {}).get("content", [])
    if not els:
        return
    last = els[-1]
    tbl = last.get("table")
    if not tbl:
        return
    rows = tbl.get("tableRows") or []
    if len(rows) != 1:
        return
    cells = rows[0].get("tableCells") or []
    if len(cells) != 1:
        return
    si, ei = last.get("startIndex"), last.get("endIndex")
    if si is None or ei is None:
        return
    docs.documents().batchUpdate(
        documentId=DOC_ID,
        body={"requests": [{"deleteContentRange": {"range": {"startIndex": int(si), "endIndex": int(ei)}}}]},
    ).execute()


def discover_section4_to_7_range(doc: dict[str, Any]) -> tuple[int, int]:
    """(delete_start inclusive, delete_end exclusive): after §4 title, before §7 paragraph."""
    p4_end: int | None = None
    p7_start: int | None = None
    for el in doc.get("body", {}).get("content", []):
        if "paragraph" not in el:
            continue
        t = para_content(el).lstrip()
        if t.startswith("4.") and "Орієнтовний" in t:
            p4_end = int(el["endIndex"])
        if re.match(r"^7\.\s", t):
            p7_start = int(el["startIndex"])
    if p4_end is None or p7_start is None:
        raise RuntimeError("Could not find §4 title and/or §7 paragraph in document body")
    if p7_start <= p4_end:
        raise RuntimeError(f"Invalid range: delete_end {p7_start} <= delete_start {p4_end}")
    return p4_end, p7_start


def strip_redundant_section4_heading(md: str) -> str:
    lines = md.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    i = 0
    if i < len(lines) and re.match(r"^4\.\s+Орієнтовний", lines[i].strip()):
        i += 1
        while i < len(lines) and not lines[i].strip():
            i += 1
    return "\n".join(lines[i:]).lstrip("\n")


def main() -> None:
    import os

    docs = g._docs_service()
    md_path = Path(os.environ.get("AUDIT_MD_PATH", str(DEFAULT_MD_PATH)))
    if not md_path.exists():
        raise SystemExit(f"Markdown source not found: {md_path} (set AUDIT_MD_PATH)")

    doc = docs.documents().get(documentId=DOC_ID).execute()
    delete_trailing_1x1_table(docs, doc)
    doc = docs.documents().get(documentId=DOC_ID).execute()

    delete_start, delete_end = discover_section4_to_7_range(doc)

    md = md_path.read_text(encoding="utf-8")
    md = strip_redundant_section4_heading(md)
    if not md.strip():
        raise SystemExit("No markdown left after stripping §4 heading")
    blocks = parse_blocks(md.rstrip() + "\n")

    docs.documents().batchUpdate(
        documentId=DOC_ID,
        body={
            "requests": [
                {
                    "deleteContentRange": {
                        "range": {"startIndex": delete_start, "endIndex": delete_end},
                    }
                }
            ]
        },
    ).execute()

    cursor = delete_start
    pending: list[dict[str, Any]] = []

    def flush_pending():
        nonlocal pending
        if not pending:
            return
        for part in chunk(pending):
            docs.documents().batchUpdate(documentId=DOC_ID, body={"requests": part}).execute()
        pending = []

    for block in blocks:
        if isinstance(block, Para):
            joined = "\n".join(block.lines).strip()
            if not joined:
                continue
            heading = bool(re.match(r"^(4|5|6)\.\s", joined))
            reqs, end = requests_for_paragraph(cursor, joined, heading=heading)
            pending.extend(reqs)
            if len(pending) >= 45:
                flush_pending()
            cursor = end
        elif isinstance(block, CodeBlock):
            reqs, end = requests_for_code_block(cursor, block.body)
            pending.extend(reqs)
            if len(pending) >= 45:
                flush_pending()
            cursor = end
        elif isinstance(block, Table):
            flush_pending()
            rows = len(block.rows)
            cols = max((len(r) for r in block.rows), default=0)
            if rows == 0 or cols == 0:
                continue
            padded = [r + [""] * (cols - len(r)) for r in block.rows]
            table_anchor = cursor
            docs.documents().batchUpdate(
                documentId=DOC_ID,
                body={"requests": [{"insertTable": {"rows": rows, "columns": cols, "location": {"index": cursor}}}]},
            ).execute()
            doc = docs.documents().get(documentId=DOC_ID).execute()
            t_si, _t_ei0 = find_table_range_at_index(doc, table_anchor)
            inner = None
            for el in doc.get("body", {}).get("content", []):
                if el.get("startIndex") == t_si and "table" in el:
                    inner = el["table"]
                    break
            if inner is None:
                raise RuntimeError("Inserted table not found in document body")
            grid = walk_table_cell_indices(inner)
            jobs: list[tuple[int, str, list[tuple[int, int, dict[str, Any]]], int]] = []
            for ri, row in enumerate(padded):
                for ci in range(cols):
                    idx = grid[ri][ci] if ri < len(grid) and ci < len(grid[ri]) else None
                    if idx is None:
                        continue
                    cell_md = row[ci]
                    segs = parse_inline(cell_md)
                    plain, spans = flatten_segments(segs)
                    jobs.append((idx, plain, spans, ri))
            jobs.sort(key=lambda t: t[0], reverse=True)
            cell_reqs: list[dict[str, Any]] = []
            for idx, plain, spans, ri in jobs:
                if plain:
                    cell_reqs.append({"insertText": {"location": {"index": idx}, "text": plain}})
                for st, en, style in spans:
                    cell_reqs.append(
                        {
                            "updateTextStyle": {
                                "range": {"startIndex": idx + st, "endIndex": idx + en},
                                "textStyle": style,
                                "fields": ",".join(sorted(style.keys())),
                            }
                        }
                    )
                if ri == 0 and plain:
                    cell_reqs.append(
                        {
                            "updateTextStyle": {
                                "range": {"startIndex": idx, "endIndex": idx + len(plain)},
                                "textStyle": {"bold": True},
                                "fields": "bold",
                            }
                        }
                    )
            for part in chunk(cell_reqs):
                docs.documents().batchUpdate(documentId=DOC_ID, body={"requests": part}).execute()
            doc2 = docs.documents().get(documentId=DOC_ID).execute()
            _, t_end = find_table_range_at_index(doc2, table_anchor)
            cursor = t_end
        else:
            raise TypeError(block)

    flush_pending()
    print("done blocks=", len(blocks))


if __name__ == "__main__":
    main()
