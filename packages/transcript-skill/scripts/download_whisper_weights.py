#!/usr/bin/env python3
"""Pre-download faster-whisper weights without pip install (adds src/ to PYTHONPATH)."""

from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent.parent / "src"
if _SRC.is_dir():
    sys.path.insert(0, str(_SRC))

from transcript_skill.download_weights import main  # noqa: E402

if __name__ == "__main__":
    main()
