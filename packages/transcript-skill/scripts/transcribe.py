#!/usr/bin/env -S python3 -u
"""Backward-compatible entry: run without pip install by prepending src/ to PYTHONPATH."""

from __future__ import annotations

import sys
from pathlib import Path

_SRC = Path(__file__).resolve().parent.parent / "src"
if _SRC.is_dir():
    sys.path.insert(0, str(_SRC))

from transcript_skill.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
