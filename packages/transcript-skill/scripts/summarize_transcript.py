#!/usr/bin/env python3
"""Create a lightweight markdown summary from transcript JSON."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _mmss(sec: float) -> str:
    sec_i = max(0, int(sec))
    return f"{sec_i // 60}:{sec_i % 60:02d}"


def _pick_sentences(text: str) -> list[str]:
    parts = [s.strip() for s in text.replace("\n", " ").split(". ") if s.strip()]
    if not parts:
        return []
    head = parts[:8]
    mid = parts[len(parts) // 2 : len(parts) // 2 + 6]
    tail = parts[max(0, len(parts) - 8) :]
    seen: set[str] = set()
    out: list[str] = []
    for s in head + mid + tail:
        k = s.lower()
        if k not in seen and len(s) > 25:
            seen.add(k)
            out.append(s.rstrip("."))
        if len(out) >= 10:
            break
    return out


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: summarize_transcript.py INPUT.json OUTPUT.summary.md", file=sys.stderr)
        return 2

    in_path = Path(sys.argv[1]).expanduser().resolve()
    out_path = Path(sys.argv[2]).expanduser().resolve()
    if not in_path.exists():
        print(f"Input not found: {in_path}", file=sys.stderr)
        return 1

    data = json.loads(in_path.read_text())
    transcript = (data.get("transcript") or "").strip()
    segments = data.get("segments") or []
    picks = _pick_sentences(transcript)

    markers: list[tuple[str, str]] = []
    if segments:
        total = len(segments)
        for ratio in (0.1, 0.25, 0.5, 0.75, 0.9):
            idx = min(total - 1, max(0, int(total * ratio)))
            seg = segments[idx]
            ts = _mmss(float(seg.get("start", 0)))
            snippet = (seg.get("text") or "").strip().replace("\n", " ")
            if snippet:
                markers.append((ts, snippet[:180]))

    lines: list[str] = []
    lines.append("# Video Summary")
    lines.append("")
    lines.append(f"- Source transcript: `{in_path}`")
    lines.append(
        f"- Approx duration: `{_mmss(float(data.get('media_duration_seconds_approx') or 0))}`"
    )
    lines.append(f"- Model: `{data.get('whisper_model') or 'unknown'}`")
    lines.append("")
    lines.append("## Short Summary")
    lines.append("")
    if picks:
        for s in picks[:6]:
            lines.append(f"- {s}.")
    else:
        lines.append("- Transcript created, but no summary text could be extracted.")
    lines.append("")
    lines.append("## Key Moments (sampled)")
    lines.append("")
    if markers:
        for ts, s in markers:
            lines.append(f"- `{ts}` {s}")
    else:
        lines.append("- No segment markers available.")
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append("- Automatic first-pass summary from transcript text.")
    lines.append(
        "- For higher quality, generate a structured summary with decisions, action items, risks, and next steps."
    )

    out_path.write_text("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

