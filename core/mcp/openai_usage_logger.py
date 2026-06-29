"""
OpenAI API usage and quality logging for Dex.

Logs each OpenAI call to System/openai-usage/YYYY-MM-DD.jsonl with:
- Token usage vs limit, request_id, iteration (for multi-call flows), eval score.
Daily stats can be computed by openai-usage-daily-summary script.
"""

import os
import re
import json
from collections import Counter
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

# Vault root; same as job_digest_server
VAULT_PATH = Path(os.environ.get("VAULT_PATH", Path.cwd()))
USAGE_DIR = VAULT_PATH / "System" / "openai-usage"


def _ensure_dir() -> Path:
    USAGE_DIR.mkdir(parents=True, exist_ok=True)
    return USAGE_DIR


def _today_file() -> Path:
    _ensure_dir()
    return USAGE_DIR / f"{datetime.utcnow().strftime('%Y-%m-%d')}.jsonl"


def log_openai_call(
    operation: str,
    model: str,
    *,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
    total_tokens: Optional[int] = None,
    max_tokens_limit: Optional[int] = None,
    request_id: Optional[str] = None,
    iteration: Optional[int] = None,
    summary_round: Optional[int] = None,
    eval_score: Optional[int] = None,
    eval_notes: Optional[str] = None,
    input_chars: Optional[int] = None,
    fallback_used: bool = False,
    truncation_risk: bool = False,
) -> None:
    """Append one JSON line to the day's usage log. Sets truncation_risk when completion_tokens >= 80% of max_tokens_limit."""
    if max_tokens_limit and completion_tokens is not None and completion_tokens >= 0.8 * max_tokens_limit:
        truncation_risk = True
    entry = {
        "ts": datetime.utcnow().isoformat() + "Z",
        "operation": operation,
        "model": model,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "max_tokens_limit": max_tokens_limit,
        "request_id": request_id,
        "iteration": iteration,
        "summary_round": summary_round,
        "eval_score": eval_score,
        "eval_notes": eval_notes,
        "input_chars": input_chars,
        "fallback_used": fallback_used,
        "truncation_risk": truncation_risk,
    }
    # Drop None values for smaller lines; keep truncation_risk only when True
    entry = {k: v for k, v in entry.items() if v is not None and v != "" and (k != "truncation_risk" or v)}
    try:
        path = _today_file()
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def eval_job_summary(summary: str, job_type: str) -> tuple[int, str]:
    """
    Score job summary quality 0-100 and short notes.
    Criteria: structure (paragraphs, SUGGESTED_QUESTIONS), no em dash, no forbidden words for AI type.
    """
    if not summary or not summary.strip():
        return 0, "empty"
    score = 50  # base
    notes = []
    # 3 paragraphs expected
    paragraphs = [p.strip() for p in summary.split("\n\n") if p.strip()]
    if len(paragraphs) >= 2:
        score += 15
    if len(paragraphs) >= 3:
        score += 10
    # Same first significant word in 2+ paragraphs (e.g. "Solid…" twice); skip articles the/a/an
    if len(paragraphs) >= 2:
        leads: list[str] = []
        for p in paragraphs:
            words = re.findall(r"[A-Za-z']+", p)
            if not words:
                continue
            i = 0
            while i < len(words) and words[i].lower() in ("the", "a", "an"):
                i += 1
            if i < len(words):
                leads.append(words[i].lower())
            else:
                leads.append(words[0].lower())
        if leads:
            top = Counter(leads).most_common(1)
            if top and top[0][1] >= 2:
                score -= 12
                notes.append("repeated_paragraph_opener")
    if "---SUGGESTED_QUESTIONS---" in summary:
        score += 10
    else:
        notes.append("no_questions")
    if "—" in summary:
        score -= 15
        notes.append("em_dash")
    # Length sanity
    if 200 <= len(summary) <= 2500:
        score += 5
    elif len(summary) > 3000:
        score -= 5
        notes.append("long")
    # For AI type: no compliance/Pin-Up
    if job_type == "ai":
        forbidden = ("compliance", "pin-up", "pin up", "regulatory", "risk reduction")
        lower = summary.lower()
        for w in forbidden:
            if w in lower:
                score -= 20
                notes.append("forbidden_ai")
                break
    return max(0, min(100, score)), ";".join(notes) if notes else "ok"


def eval_cover_letter(raw: str) -> tuple[int, str]:
    """Score cover letter quality 0-100: paragraphs, no em dash, length."""
    if not raw or not raw.strip():
        return 0, "empty"
    score = 50
    notes = []
    paragraphs = [p.strip() for p in raw.split("\n\n") if p.strip()]
    if len(paragraphs) >= 3:
        score += 20
    elif len(paragraphs) >= 2:
        score += 10
    if "—" in raw:
        score -= 15
        notes.append("em_dash")
    if 300 <= len(raw) <= 2000:
        score += 15
    elif len(raw) > 2500:
        score -= 5
        notes.append("long")
    if "I am drawn to" in raw:
        score -= 10
        notes.append("banned_phrase")
    return max(0, min(100, score)), ";".join(notes) if notes else "ok"


def get_last_eval_notes_for_request(request_id: str, operation: str = "job_summary") -> Optional[str]:
    """Read today's log and return eval_notes from the last entry with this request_id and operation. For feeding into next iteration."""
    try:
        path = _today_file()
        if not path.exists():
            return None
        lines = path.read_text(encoding="utf-8").strip().split("\n")
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
                if e.get("request_id") == request_id and e.get("operation") == operation and e.get("eval_notes"):
                    return e.get("eval_notes")
            except Exception:
                continue
    except Exception:
        pass
    return None
