"""CLI validation for --chunk-minutes (no transcription, no network)."""

from __future__ import annotations

import json

import pytest

from transcript_skill.cli import main


def test_cli_rejects_chunk_minutes_too_small(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        main(["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "--chunk-minutes", "2"])
    assert exc.value.code == 1
    err = capsys.readouterr().err
    payload = json.loads(err.strip())
    assert payload.get("ok") is False
    assert "chunk" in (payload.get("error") or "").lower()


def test_cli_rejects_chunk_minutes_too_large(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit) as exc:
        main(["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "--chunk-minutes", "500"])
    assert exc.value.code == 1
    err = capsys.readouterr().err
    payload = json.loads(err.strip())
    assert payload.get("ok") is False
