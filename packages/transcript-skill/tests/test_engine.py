"""Unit tests for routing and parsing (no network, no Whisper load)."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from transcript_skill.engine import (
    extract_video_id,
    is_apple_podcast_url,
    is_local_media_path,
    transcribe_from_input,
)


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("dQw4w9WgXcQ", "dQw4w9WgXcQ"),
        ("not-a-url", None),
    ],
)
def test_extract_video_id(url: str, expected: str | None) -> None:
    assert extract_video_id(url) == expected


def test_is_apple_podcast() -> None:
    assert is_apple_podcast_url("https://podcasts.apple.com/us/podcast/id123")
    assert not is_apple_podcast_url("https://youtube.com/watch?v=x")


def test_is_local_media_path() -> None:
    assert is_local_media_path("/tmp/a.mp3")
    assert not is_local_media_path("https://x.com")


def test_transcribe_from_input_invalid() -> None:
    with pytest.raises(RuntimeError, match="Invalid input"):
        transcribe_from_input("totally-not-a-url-or-file-xyz123")


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not in PATH")
def test_transcribe_from_input_plan_only_no_whisper_import(tmp_path: Path) -> None:
    wav = tmp_path / "smoke.wav"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=16000:cl=mono",
            "-t",
            "0.5",
            str(wav),
        ],
        check=True,
        capture_output=True,
    )
    out = transcribe_from_input(str(wav), plan_only=True, whisper_model="tiny")
    assert out.get("ok") is True
    assert out.get("plan_only") is True
    assert out.get("whisper_model") == "tiny"
    assert str(wav) in (out.get("source_path") or "")
