"""Runtime tuning helpers."""

from __future__ import annotations

from transcript_skill.resources import (
    AUTO_CHUNK_IF_LONGER_THAN_SEC,
    detect_runtime_settings,
    resolve_chunk_minutes,
    resolve_compute_type,
)


def test_resolve_compute_type_explicit() -> None:
    ct, note = resolve_compute_type("float16", auto_tune=True)
    assert ct == "float16"
    assert note == "explicit"


def test_resolve_compute_type_auto_no_tune() -> None:
    ct, note = resolve_compute_type("auto", auto_tune=False)
    assert ct == "int8"
    assert note == "auto_fallback_no_tune"


def test_auto_tune_apple_mps_recommends_int8(monkeypatch) -> None:
    """MPS + float16 often fails in faster-whisper; auto must prefer int8."""
    monkeypatch.setattr(
        "transcript_skill.resources._torch_devices",
        lambda: (False, True),
    )
    rt = detect_runtime_settings()
    assert rt.has_mps is True
    assert rt.has_cuda is False
    assert rt.recommended_compute_type == "int8"


def test_auto_tune_cuda_recommends_float16(monkeypatch) -> None:
    monkeypatch.setattr(
        "transcript_skill.resources._torch_devices",
        lambda: (True, False),
    )
    rt = detect_runtime_settings()
    assert rt.has_cuda is True
    assert rt.recommended_compute_type == "float16"


def test_resolve_chunk_short_media() -> None:
    cm, note = resolve_chunk_minutes(None, AUTO_CHUNK_IF_LONGER_THAN_SEC - 1.0, auto_tune=True)
    assert cm is None
    assert "short" in note


def test_resolve_chunk_long_auto() -> None:
    cm, note = resolve_chunk_minutes(None, AUTO_CHUNK_IF_LONGER_THAN_SEC + 60.0, auto_tune=True)
    assert cm is not None
    assert cm >= 3.0
    assert "auto_tune" in note
