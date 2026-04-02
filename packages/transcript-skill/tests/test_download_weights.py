"""download_weights CLI validation (no network)."""

from __future__ import annotations

import pytest

from transcript_skill.download_weights import main


def test_download_weights_rejects_unknown_model() -> None:
    with pytest.raises(SystemExit) as excinfo:
        main(["not-a-whisper-model"])
    assert excinfo.value.code == 1
