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
    by_blocks = data.get("transcript_by_speaker") or []
    map_applied = bool(data.get("speaker_label_map_applied"))
    speaker_label_map = data.get("speaker_label_map") or {}
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
    if by_blocks:
        sp_labels = sorted({str(b.get("speaker") or "?") for b in by_blocks})
        if map_applied and isinstance(speaker_label_map, dict) and speaker_label_map:
            preview = ", ".join(
                f"{k}->{v}"
                for k, v in list(speaker_label_map.items())[:6]
            )
            if len(speaker_label_map) > 6:
                preview += "…"
            lines.append(
                f"- Diarization: **yes** — display names from `speaker_label_map`: {preview}"
            )
        else:
            lines.append(
                f"- Diarization: **yes** — segments in JSON have `speaker`; labels are model ids "
                f"(e.g. {', '.join(sp_labels[:5])}{'…' if len(sp_labels) > 5 else ''}), not person names unless you map them."
            )
    else:
        lines.append("- Diarization: **no** (flat transcript only).")
    lines.append("")
    lines.append("## Short Summary")
    lines.append("")
    if picks:
        for s in picks[:6]:
            lines.append(f"- {s}.")
    else:
        lines.append("- Transcript created, but no summary text could be extracted.")
    lines.append("")
    if by_blocks:
        lines.append("## Dialogue by speaker (diarization excerpt)")
        lines.append("")
        if map_applied:
            lines.append(
                "Below: **who spoke when** using your speaker label map; each segment may include "
                "`speaker_pyannote` with the original pyannote id. Full text: `transcript_speaker_formatted`."
            )
        else:
            lines.append(
                "Below: **who spoke when** per pyannote (SPEAKER_00, …), not names. "
                "Full text in JSON: `transcript_speaker_formatted` and per-segment `speaker`."
            )
        lines.append("")
        max_blocks = 8
        max_chars = 1200
        shown = 0
        for b in by_blocks[:max_blocks]:
            sp = str(b.get("speaker") or "UNKNOWN")
            txt = (b.get("text") or "").strip().replace("\n", " ")
            if not txt:
                continue
            if len(txt) > max_chars:
                txt = txt[: max_chars - 3].rstrip() + "…"
            lines.append(f"- **{sp}:** {txt}")
            shown += 1
        if len(by_blocks) > shown:
            lines.append(
                f"- *(… {len(by_blocks) - shown} more speaker block(s); see JSON `transcript_speaker_formatted`.)*"
            )
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

