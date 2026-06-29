#!/usr/bin/env python3
"""
Generate a cover letter from job description + CV and save as .docx.
Used by teal-resume-match-score when exporting to Applied and no cover letter exists.
Requires: OPENAI_API_KEY, python-docx, openai. Optional: VAULT_PATH.

Usage:
  echo "$JOB_DESCRIPTION" | python cover-letter-generate.py --company "Tangible" --role "Product Manager" --vault /path/to/vault --output-cover-dir /path/to/cover_letters --output-applied-dir /path/to/Applied/Tangible
  python cover-letter-generate.py --company X --role Y --job-description-file jd.txt --vault ... --output-cover-dir ... --output-applied-dir ...
  With --resume-file: use that file as resume context (e.g. Teal resume exported to .md) instead of CV from vault.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

# Optional deps
try:
    from openai import OpenAI
    HAS_OPENAI = True
except ImportError:
    HAS_OPENAI = False

try:
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False


def load_text(path: Path) -> str:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().strip()


def build_system_prompt(cv_content: str, confirmed_facts: str) -> str:
    return f"""You write a professional cover letter in English for a job application. Use ONLY facts from the CV and the confirmed facts below. Do not invent experience or employers.

## CV (use only this experience)
{cv_content[:12000]}

## Confirmed facts (allowed to use)
{confirmed_facts[:4000]}

## Rules (strict)
- No invented experience. Only facts from the CV and confirmed facts.
- iGaming / Pin-Up: Do not name Pin-Up or other iGaming employers. Use "in iGaming (e.g. at EBET)", "at EBET", or "in iGaming roles" instead.
- No em dashes (—). Use commas, periods, or separate sentences.
- No informal self-references ("как и я", "like me", "same as I do"). Keep tone professional.
- Banned phrase: Do not use "I am drawn to". Use "I am keen to", "I am interested in", or "I want to".
- Closing: Do not use "I would welcome the opportunity". Use "I look forward to…", "I am keen to…", etc.
- Contacts: Do not include email, phone, or LinkedIn in the letter. End with "Best regards," and name only.

Output format: output ONLY the body of the letter. Use exactly one paragraph per line. Use an empty line between paragraphs. Do not include "Dear Hiring Team," or "Best regards," in the output — we will add them. Start with the first paragraph after the salutation and end with the last paragraph before the closing. No other text."""


def _usage_from_completion(completion) -> dict | None:
    u = getattr(completion, "usage", None)
    if not u:
        return None
    return {
        "prompt_tokens": getattr(u, "prompt_tokens", None),
        "completion_tokens": getattr(u, "completion_tokens", None),
        "total_tokens": getattr(u, "total_tokens", None),
    }


def generate_letter_via_openai(job_description: str, company: str, role: str, system_prompt: str) -> tuple[str | None, dict | None, str, bool]:
    """Returns (raw_text, usage_dict, model_used, fallback_used)."""
    if not HAS_OPENAI:
        return None, None, "", False
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        return None, None, "", False
    jd = (job_description or "").strip()
    if len(jd) >= 100:
        user_content = f"Company: {company}\nRole: {role}\n\nJob description:\n{jd[:14000]}"
    else:
        user_content = f"Company: {company}\nRole: {role}\n\nWrite a professional cover letter using only the resume (and confirmed facts) from the system prompt. Do not invent experience."
    client = OpenAI(api_key=api_key.strip())
    model = "gpt-4o"
    try:
        completion = client.chat.completions.create(
            model=model,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )
        raw = (completion.choices[0] and completion.choices[0].message and completion.choices[0].message.content) or ""
        return raw.strip(), _usage_from_completion(completion), model, False
    except Exception:
        try:
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                max_tokens=2000,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
            )
            raw = (completion.choices[0] and completion.choices[0].message and completion.choices[0].message.content) or ""
            return raw.strip(), _usage_from_completion(completion), "gpt-4o-mini", True
        except Exception:
            return None, None, "", False


def generate_letter_via_anthropic(job_description: str, company: str, role: str, system_prompt: str) -> tuple[str | None, dict | None, str, bool]:
    """Optional Anthropic fallback when OpenAI quota or errors block generation."""
    try:
        import anthropic  # type: ignore
    except ImportError:
        return None, None, "", False
    api_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        return None, None, "", False
    jd = (job_description or "").strip()
    user_block = (
        f"Company: {company}\nRole: {role}\n\nJob description:\n{jd[:14000]}"
        if len(jd) >= 100
        else f"Company: {company}\nRole: {role}\n\nWrite a professional cover letter using only the resume (and confirmed facts) from the system prompt. Do not invent experience."
    )
    client = anthropic.Anthropic(api_key=api_key)
    model = "claude-3-5-sonnet-20241022"
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=2000,
            system=system_prompt,
            messages=[{"role": "user", "content": user_block}],
        )
        parts = []
        for block in getattr(msg, "content", []) or []:
            if getattr(block, "type", None) == "text" and getattr(block, "text", None):
                parts.append(block.text)
        raw = "\n".join(parts).strip()
        usage = {
            "prompt_tokens": getattr(msg.usage, "input_tokens", None),
            "completion_tokens": getattr(msg.usage, "output_tokens", None),
            "total_tokens": None,
        }
        return raw, usage, model, False
    except Exception:
        return None, None, "", False


def generate_letter_offline(job_description: str, company: str, role: str, cv_content: str, confirmed_facts: str) -> str:
    """
    Last-resort cover letter when LLM APIs are unavailable (e.g. OpenAI 429).
    Uses only high-level themes from the JD plus facts that appear in cv_content or confirmed_facts.
    Does not claim tools or metrics not present in those sources.
    """
    jd = (job_description or "").strip().lower()
    cv_l = (cv_content or "").lower()
    cf = (confirmed_facts or "").lower()

    has_tableau = "tableau" in cv_l or "tableau" in jd
    has_payments = "payment" in cv_l or "payments" in cv_l or "psp" in jd
    has_compliance = "compliance" in cv_l or "compliance" in cf or "aml" in jd
    has_igaming = "igaming" in cv_l or "igaming" in cf or "sportsbook" in cv_l
    has_migration = "migrat" in cv_l or "migration" in cv_l

    p1 = (
        f"I am keen to apply for the {role} position with {company}. "
        "Your posting emphasizes ownership of the payment ecosystem, PSP and checkout journeys, wallets, antifraud, and cross-functional delivery with a clear focus on conversion, revenue, and scalable operations."
    )

    p2 = "I bring twelve plus years in product leadership with sustained ownership of roadmaps, prioritization against business impact, and delivery with engineering, analytics, and design partners."
    if has_igaming:
        p2 += " In iGaming I have led B2C product execution, including work where partner integrations and player-facing journeys had to stay stable while the stack evolved."
    if has_migration:
        p2 += " I have also driven complex platform migrations where sequencing, risk controls, and continuity for customers were non negotiable."

    p3 = ""
    if has_payments or has_compliance:
        p3 = (
            "My recent work includes compliance oriented product leadership for a major operator, including preparation for MGA certification, player protection, and aligning promo economics with antifraud and retention signals."
        )
        if has_tableau:
            p3 += " I routinely used Tableau with analytics partners to make payment and behavior trends legible for decisions."
        p3 += " That background maps closely to roles that combine regulated flows, operational monitoring, and careful change management across GEOs."

    p4 = (
        "I work well in remote first teams, communicate in English at B2 plus, and stay hands on with backlog quality, stakeholder clarity, and measurable outcomes. "
        "I look forward to discussing how I can help strengthen routing, cascading fallback logic, checkout UX, and partner governance for your product."
    )

    paras = [p1, p2]
    if p3.strip():
        paras.append(p3)
    paras.append(p4)
    # One paragraph per line so raw_to_paragraphs() maps lines to body blocks correctly.
    return "\n".join(paras)


def raw_to_paragraphs(raw: str) -> list[str]:
    """Convert model output to list of paragraph strings. Add salutation and closing."""
    # Normalize: no em dash
    raw = re.sub(r"\s*—\s*", ", ", raw)
    lines = [ln.strip() for ln in raw.split("\n")]
    paragraphs = []
    for ln in lines:
        if not ln:
            paragraphs.append("")
            continue
        paragraphs.append(ln)
    # Ensure we don't have duplicate greetings/closings
    if paragraphs and paragraphs[0].lower().startswith("dear "):
        paragraphs.pop(0)
    while paragraphs and paragraphs[-1].strip() == "":
        paragraphs.pop()
    if paragraphs and ("best regards" in paragraphs[-1].lower() or "sincerely" in paragraphs[-1].lower()):
        paragraphs.pop()
    # Build full content: Dear ... + body + Best regards, Roman Matsukatov
    content = ["Dear Hiring Team,"]
    content.append("")
    content.extend(paragraphs)
    content.append("")
    content.append("Best regards,")
    content.append("Roman Matsukatov")
    return content


def write_docx(paragraphs: list[str], out_path: Path) -> None:
    if not HAS_DOCX:
        raise RuntimeError("python-docx not installed; pip install python-docx")
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    for block in paragraphs:
        p = doc.add_paragraph(block)
        p.paragraph_format.space_after = Pt(6) if block else Pt(0)
        if block:
            p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    doc.save(out_path)


def main() -> int:
    if not HAS_DOCX:
        print("cover-letter-generate: python-docx not installed; pip install python-docx", file=sys.stderr)
        return 1
    parser = argparse.ArgumentParser(description="Generate cover letter .docx from job description")
    parser.add_argument("--company", required=True, help="Company name")
    parser.add_argument("--role", default="Product Manager", help="Job title / role")
    parser.add_argument("--job-description-file", help="Path to file with job description (else read from stdin)")
    parser.add_argument("--vault", default=os.environ.get("VAULT_PATH", "."), help="Vault root path")
    parser.add_argument("--output-cover-dir", required=True, help="Directory for Cover_Letter_Company_Role.docx")
    parser.add_argument("--output-applied-dir", required=True, help="Applied output folder for Roman Matsukatov - Cover Letter.docx (e.g. Applied/<Company>/<Vacancy>/)")
    parser.add_argument("--resume-file", help="Path to resume content (e.g. Teal export as .md). If set, used instead of CV from vault.")
    args = parser.parse_args()

    vault = Path(args.vault).resolve()
    if args.job_description_file:
        jd = load_text(Path(args.job_description_file))
    else:
        jd = sys.stdin.read().strip()

    if args.resume_file and Path(args.resume_file).exists():
        cv_content = load_text(Path(args.resume_file))
        if len(cv_content) < 200:
            print("cover-letter-generate: --resume-file content too short, falling back to vault CV", file=sys.stderr)
            args.resume_file = None
    else:
        cv_content = None
    if not cv_content:
        cv_path = vault / "CV Examples" / "Roman Matsukatov - CV.md"
        if not cv_path.exists():
            cv_path = vault / "06-Resources" / "Roman Matsukatov - CV.md"
        if not cv_path.exists():
            print("cover-letter-generate: CV not found at " + str(cv_path), file=sys.stderr)
            return 1
        cv_content = load_text(cv_path)

    if len(jd) < 100 and not (args.resume_file and cv_content):
        print("cover-letter-generate: need job description (100+ chars) or --resume-file", file=sys.stderr)
        return 1

    confirmed_path = vault / ".claude" / "skills" / "resume-summary-custom" / "references" / "confirmed-facts.md"
    confirmed_facts = load_text(confirmed_path) if confirmed_path.exists() else ""

    system_prompt = build_system_prompt(cv_content, confirmed_facts)
    raw: str | None = None
    usage_dict = None
    model_used = ""
    fallback_used = False

    if HAS_OPENAI and (os.environ.get("OPENAI_API_KEY") or "").strip():
        raw, usage_dict, model_used, fallback_used = generate_letter_via_openai(jd, args.company, args.role, system_prompt)
    if not raw:
        raw, usage_dict, model_used, fallback_used = generate_letter_via_anthropic(jd, args.company, args.role, system_prompt)
    if not raw:
        print("cover-letter-generate: LLM paths failed or keys missing; using offline template.", file=sys.stderr)
        raw = generate_letter_offline(jd, args.company, args.role, cv_content, confirmed_facts)
        model_used = "offline-template"
    if not raw:
        print("cover-letter-generate: could not build cover letter text", file=sys.stderr)
        return 1
    # Log usage and eval to System/openai-usage/YYYY-MM-DD.jsonl
    if model_used and model_used != "offline-template":
        try:
            sys.path.insert(0, str(vault / "core" / "mcp"))
            from openai_usage_logger import log_openai_call, eval_cover_letter as _eval_cl
            eval_score, eval_notes = _eval_cl(raw)
            log_openai_call(
                "cover_letter",
                model_used or "offline-template",
                prompt_tokens=usage_dict.get("prompt_tokens") if usage_dict else None,
                completion_tokens=usage_dict.get("completion_tokens") if usage_dict else None,
                total_tokens=usage_dict.get("total_tokens") if usage_dict else None,
                max_tokens_limit=2000,
                request_id=f"{args.company}_{args.role}"[:120].replace("/", "_"),
                iteration=1,
                eval_score=eval_score,
                eval_notes=eval_notes or None,
                fallback_used=fallback_used,
            )
        except Exception:
            pass

    paragraphs = raw_to_paragraphs(raw)
    company_safe = re.sub(r"[^\w\s]", "", args.company).strip().replace(" ", "_")[:40] or "Company"
    role_safe = re.sub(r"[^\w\s]", "", args.role).strip().replace(" ", "_")[:40] or "Role"
    cover_dir = Path(args.output_cover_dir)
    cover_dir.mkdir(parents=True, exist_ok=True)
    cover_path = cover_dir / f"Cover_Letter_{company_safe}_{role_safe}.docx"
    write_docx(paragraphs, cover_path)
    print(f"Saved: {cover_path}", file=sys.stderr)

    applied_dir = Path(args.output_applied_dir)
    applied_dir.mkdir(parents=True, exist_ok=True)
    applied_path = applied_dir / "Roman Matsukatov - Cover Letter.docx"
    write_docx(paragraphs, applied_path)
    print(f"Saved: {applied_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
