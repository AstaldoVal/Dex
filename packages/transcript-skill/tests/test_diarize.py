"""Speaker assignment and transcript blocks (no pyannote import)."""

from __future__ import annotations

from transcript_skill.diarize import (
    assign_speakers_to_segments,
    build_transcript_by_speaker,
    format_transcript_by_speaker,
)


def test_assign_speakers_overlap() -> None:
    segments = [
        {"start": 0.0, "duration": 2.0, "text": "hello"},
        {"start": 2.0, "duration": 2.0, "text": "world"},
    ]
    turns = [
        (0.0, 1.5, "SPEAKER_00"),
        (1.5, 4.0, "SPEAKER_01"),
    ]
    out = assign_speakers_to_segments(segments, turns)
    assert out[0]["speaker"] == "SPEAKER_00"
    assert out[1]["speaker"] == "SPEAKER_01"


def test_assign_unknown_when_no_overlap() -> None:
    segments = [{"start": 10.0, "duration": 1.0, "text": "orphan"}]
    turns = [(0.0, 1.0, "SPEAKER_00")]
    out = assign_speakers_to_segments(segments, turns)
    assert out[0]["speaker"] == "UNKNOWN"


def test_build_transcript_by_speaker() -> None:
    segs = [
        {"start": 0.0, "duration": 1.0, "text": "a", "speaker": "S0"},
        {"start": 1.0, "duration": 1.0, "text": "b", "speaker": "S0"},
        {"start": 2.0, "duration": 1.0, "text": "c", "speaker": "S1"},
    ]
    blocks = build_transcript_by_speaker(segs)
    assert len(blocks) == 2
    assert blocks[0]["speaker"] == "S0"
    assert "a" in blocks[0]["text"] and "b" in blocks[0]["text"]
    assert blocks[1]["speaker"] == "S1"


def test_format_transcript_by_speaker() -> None:
    blocks = [{"speaker": "S0", "text": "hi"}]
    s = format_transcript_by_speaker(blocks)
    assert "[S0]" in s
    assert "hi" in s
