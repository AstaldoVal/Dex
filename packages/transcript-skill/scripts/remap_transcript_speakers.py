#!/usr/bin/env python3
"""Apply a speaker label map to an existing transcript JSON (no Whisper re-run)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from transcript_skill.diarize import apply_speaker_label_map


def _parse_map_pairs(pairs: list[str]) -> dict[str, str]:
    m: dict[str, str] = {}
    for p in pairs:
        s = str(p).strip()
        if not s:
            continue
        if "=" not in s:
            raise ValueError(f"Invalid --speaker-map: {p!r} (expected KEY=VAL)")
        a, b = s.split("=", 1)
        ks = a.strip()
        if ks:
            m[ks] = b.strip()
    return m


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Map pyannote speaker ids (SPEAKER_00, …) to display names on segments in transcript JSON."
        )
    )
    parser.add_argument("input_json", type=Path)
    parser.add_argument("output_json", type=Path)
    parser.add_argument(
        "--speaker-map-json",
        metavar="PATH",
        default="",
        help='JSON file: {"SPEAKER_00": "Alexei", …}. Merged with --speaker-map (CLI wins on duplicate keys).',
    )
    parser.add_argument(
        "--speaker-map",
        action="append",
        default=[],
        metavar="KEY=VAL",
        help="Repeatable KEY=VAL pairs; merged after --speaker-map-json.",
    )
    args = parser.parse_args()

    inp = args.input_json.expanduser().resolve()
    if not inp.is_file():
        print(f"Not found: {inp}", file=sys.stderr)
        return 1
    data = json.loads(inp.read_text(encoding="utf-8"))
    segments = data.get("segments") or []

    merged: dict[str, str] = {}
    raw_path = (args.speaker_map_json or "").strip()
    if raw_path:
        p = Path(raw_path).expanduser()
        if not p.is_file():
            print(f"--speaker-map-json: not found: {p}", file=sys.stderr)
            return 1
        raw = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            print("--speaker-map-json: root must be a JSON object", file=sys.stderr)
            return 1
        for k, v in raw.items():
            ks = str(k).strip()
            if ks:
                merged[ks] = str(v).strip()
    try:
        merged.update(_parse_map_pairs(list(args.speaker_map or [])))
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    if not merged:
        print(
            "No speaker map: pass --speaker-map-json PATH and/or --speaker-map SPEAKER_00=Name.",
            file=sys.stderr,
        )
        return 1

    segs2, blocks, fmt = apply_speaker_label_map(segments, merged)
    data["segments"] = segs2
    data["transcript_by_speaker"] = blocks
    data["transcript_speaker_formatted"] = fmt
    data["transcript"] = " ".join(str(s.get("text") or "") for s in segs2).strip()
    data["speaker_label_map"] = merged
    data["speaker_label_map_applied"] = True

    outp = args.output_json.expanduser().resolve()
    outp.parent.mkdir(parents=True, exist_ok=True)
    outp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {outp}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
