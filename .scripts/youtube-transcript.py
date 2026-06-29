#!/usr/bin/env python3
"""Backward-compatible wrapper for the standalone transcript package (Dex repo root)."""

from __future__ import annotations

import sys
from pathlib import Path

# Repo root = parent of .scripts
_ROOT = Path(__file__).resolve().parent.parent
_SRC = _ROOT / "packages" / "transcript-skill" / "src"
if _SRC.is_dir():
    sys.path.insert(0, str(_SRC))

from transcript_skill.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
