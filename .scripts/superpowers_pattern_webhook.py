#!/usr/bin/env python3
"""
Detect repeated user-request patterns in chat logs and propose new
Superpowers Playbook use-cases automatically.

Trigger rule:
- same intent-like pattern appears >= 3 times during last 14 days
- pattern is not already covered by standard playbook scenarios

Outputs:
- System/superpowers-playbook-pending.md (proposal file)
- macOS notification when a new pattern crosses threshold
- .scripts/state/superpowers-pattern-webhook-state.json (dedupe state)
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple


ROOT = Path(__file__).resolve().parent.parent
CHAT_LOGS_DIR = ROOT / "System" / "Chat_logs"
OUTPUT_FILE = ROOT / "System" / "superpowers-playbook-pending.md"
STATE_FILE = ROOT / ".scripts" / "state" / "superpowers-pattern-webhook-state.json"

THRESHOLD = 3
WINDOW_DAYS = 14

RU_EN_STOPWORDS = {
    "что",
    "чтобы",
    "когда",
    "после",
    "перед",
    "нужно",
    "надо",
    "сделай",
    "давай",
    "проверить",
    "проверка",
    "сделать",
    "через",
    "который",
    "которые",
    "using",
    "superpowers",
    "dex",
    "cursor",
    "chat",
    "это",
    "этот",
    "эта",
    "для",
    "как",
    "with",
    "from",
    "that",
    "this",
    "make",
    "please",
    "посмотри",
}

# Scenarios already covered in the Superpowers playbook.
STANDARD_SCENARIO_KEYWORDS = {
    "new_script": {"скрипт", "script"},
    "bug": {"баг", "ошибк", "error", "fail", "debug"},
    "refactor": {"рефактор", "refactor"},
    "integration": {"интеграц", "mcp", "api", "webhook"},
    "release": {"релиз", "release", "merge", "branch"},
}


@dataclass
class RequestSignal:
    date: str
    raw: str
    key: str


def load_state() -> Dict[str, Dict[str, int]]:
    if not STATE_FILE.exists():
        return {"notified": {}}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"notified": {}}


def save_state(state: Dict[str, Dict[str, int]]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def extract_request_summaries(content: str) -> List[str]:
    pattern = re.compile(r"^- Запрос пользователя \(суть одной-двумя фразами\):\s*(.+)$", re.MULTILINE)
    return [m.group(1).strip() for m in pattern.finditer(content) if m.group(1).strip()]


def normalize_text(text: str) -> str:
    t = text.lower()
    t = re.sub(r"https?://\S+", " ", t)
    t = re.sub(r"[^a-zа-яё0-9\s-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def is_standard_playbook_case(normalized: str) -> bool:
    for keywords in STANDARD_SCENARIO_KEYWORDS.values():
        if any(k in normalized for k in keywords):
            return True
    return False


def build_key(normalized: str) -> str:
    tokens = []
    for token in normalized.split():
        if len(token) < 4:
            continue
        if token in RU_EN_STOPWORDS:
            continue
        tokens.append(token)
    if not tokens:
        return ""
    # Stable lightweight intent key: top 4 lexical tokens.
    uniq = sorted(set(tokens))
    return "|".join(uniq[:4])


def collect_signals(today: dt.date) -> List[RequestSignal]:
    min_date = today - dt.timedelta(days=WINDOW_DAYS)
    signals: List[RequestSignal] = []

    if not CHAT_LOGS_DIR.exists():
        return signals

    for file in sorted(CHAT_LOGS_DIR.glob("*.md")):
        date_match = re.match(r"(\d{4}-\d{2}-\d{2})\.md$", file.name)
        if not date_match:
            continue
        day = dt.date.fromisoformat(date_match.group(1))
        if day < min_date:
            continue
        content = file.read_text(encoding="utf-8")
        for summary in extract_request_summaries(content):
            norm = normalize_text(summary)
            if not norm:
                continue
            if is_standard_playbook_case(norm):
                continue
            key = build_key(norm)
            if not key:
                continue
            signals.append(RequestSignal(date=day.isoformat(), raw=summary, key=key))
    return signals


def aggregate(signals: List[RequestSignal]) -> Dict[str, List[RequestSignal]]:
    grouped: Dict[str, List[RequestSignal]] = {}
    for s in signals:
        grouped.setdefault(s.key, []).append(s)
    return grouped


def suggest_skill_route() -> str:
    return (
        "`using-superpowers` -> `brainstorming` -> `writing-plans` -> "
        "`executing-plans` -> `verification-before-completion`"
    )


def write_pending_file(today: dt.date, candidates: List[Tuple[str, List[RequestSignal]]]) -> None:
    lines: List[str] = []
    lines.append("# Superpowers Playbook Candidates")
    lines.append("")
    lines.append(f"- Generated at: {today.isoformat()}")
    lines.append(f"- Window: last {WINDOW_DAYS} days")
    lines.append(f"- Threshold: {THRESHOLD} repeats")
    lines.append("")

    if not candidates:
        lines.append("- No new repeated non-standard patterns found.")
        lines.append("")
        OUTPUT_FILE.write_text("\n".join(lines), encoding="utf-8")
        return

    for idx, (key, group) in enumerate(candidates, start=1):
        samples = group[:3]
        lines.append(f"## Candidate {idx}")
        lines.append("")
        lines.append(f"- Pattern key: `{key}`")
        lines.append(f"- Repeats in window: {len(group)}")
        lines.append("- Sample user requests:")
        for s in samples:
            lines.append(f" - [{s.date}] {s.raw}")
        lines.append("- Proposed default route:")
        lines.append(f" - {suggest_skill_route()}")
        lines.append("- Action:")
        lines.append(
            " - Add this scenario into `.claude/reference/superpowers-operational-playbook.md` "
            "with name, skill order, and readiness criteria."
        )
        lines.append("")

    OUTPUT_FILE.write_text("\n".join(lines), encoding="utf-8")


def notify_new_candidates(new_keys: List[str], dry_run: bool) -> None:
    if not new_keys:
        return
    title = "Dex Superpowers webhook"
    body = f"Найдено {len(new_keys)} новых повторяемых паттернов (>=3 за 14 дней)."
    if dry_run:
        print(f"[dry-run] notify: {title} | {body}")
        return
    script = f'display notification "{body}" with title "{title}"'
    subprocess.run(["osascript", "-e", script], check=False)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Do not write state or send notifications")
    args = parser.parse_args()

    today = dt.date.today()
    signals = collect_signals(today)
    grouped = aggregate(signals)
    candidates = [(k, v) for k, v in grouped.items() if len(v) >= THRESHOLD]
    candidates.sort(key=lambda item: len(item[1]), reverse=True)

    write_pending_file(today, candidates)

    state = load_state()
    notified = state.setdefault("notified", {})

    new_keys: List[str] = []
    for key, group in candidates:
        prev_count = int(notified.get(key, 0))
        if prev_count < THRESHOLD:
            new_keys.append(key)
        if not args.dry_run:
            notified[key] = len(group)

    # Keep state compact: remove keys no longer candidates.
    live_keys = {key for key, _ in candidates}
    for stale in list(notified.keys()):
        if stale not in live_keys and not args.dry_run:
            notified.pop(stale, None)

    notify_new_candidates(new_keys, args.dry_run)

    payload = {
        "ok": True,
        "signals": len(signals),
        "candidates": len(candidates),
        "new_candidates": len(new_keys),
        "candidate_keys": [k for k, _ in candidates[:5]],
        "new_candidate_keys": new_keys[:5],
        "output_file": str(OUTPUT_FILE),
    }
    print(json.dumps(payload, ensure_ascii=False))

    if not args.dry_run:
        save_state(state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
