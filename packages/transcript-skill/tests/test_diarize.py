"""Speaker assignment and transcript blocks (no pyannote import)."""

from __future__ import annotations

import tempfile
import wave
from pathlib import Path

from transcript_skill.diarize import (
    _diarization_result_to_annotation,
    apply_speaker_label_map,
    assign_speakers_to_segments,
    build_transcript_by_speaker,
    format_transcript_by_speaker,
    load_waveform_for_pyannote,
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


def test_apply_speaker_label_map() -> None:
    segments = [
        {"start": 0.0, "duration": 1.0, "text": "a", "speaker": "SPEAKER_00"},
        {"start": 1.0, "duration": 1.0, "text": "b", "speaker": "SPEAKER_01"},
    ]
    mapping = {"SPEAKER_00": "Alexei", "SPEAKER_01": "Roman"}
    out, blocks, fmt = apply_speaker_label_map(segments, mapping)
    assert out[0]["speaker"] == "Alexei"
    assert out[0].get("speaker_pyannote") == "SPEAKER_00"
    assert out[1]["speaker"] == "Roman"
    assert blocks is not None
    assert blocks[0]["speaker"] == "Alexei"
    assert "Alexei" in (fmt or "")


def test_apply_speaker_label_map_uses_speaker_pyannote_on_rerun() -> None:
    segments = [
        {
            "start": 0.0,
            "duration": 1.0,
            "text": "x",
            "speaker": "Alexei",
            "speaker_pyannote": "SPEAKER_00",
        },
    ]
    out, _, _ = apply_speaker_label_map(segments, {"SPEAKER_00": "Roman"})
    assert out[0]["speaker"] == "Roman"
    assert out[0]["speaker_pyannote"] == "SPEAKER_00"


def test_load_waveform_for_pyannote_mono_s16() -> None:
    """16-bit mono PCM WAV -> [1, T] float tensor, sample rate preserved."""
    samples = bytes([0, 0, 0xFF, 0x7F])  # two int16 little-endian frames
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        path = Path(f.name)
    try:
        with wave.open(str(path), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(samples)
        w, sr = load_waveform_for_pyannote(path)
        assert sr == 16000
        assert tuple(w.shape) == (1, 2)
        assert abs(float(w[0, 0])) < 1e-5
        assert abs(float(w[0, 1]) - (32767 / 32768.0)) < 1e-5
    finally:
        path.unlink(missing_ok=True)


def test_diarization_result_to_annotation() -> None:
    class _Fake:
        speaker_diarization = "annotation"

    assert _diarization_result_to_annotation(_Fake()) == "annotation"
    assert _diarization_result_to_annotation("direct") == "direct"
