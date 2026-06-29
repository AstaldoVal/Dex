"""TTY helpers shared by CLI and terminal_output (no circular imports)."""

from __future__ import annotations

import os
import sys
from typing import TextIO


def open_tty_mirror() -> TextIO | None:
    """Writable handle to the interactive terminal when stderr is not the user's screen.

    Order: ``/dev/tty``, then stdin's tty (Cursor / some wrappers deny ``/dev/tty``).
    """
    enc = getattr(sys.stderr, "encoding", None) or "utf-8"
    err = "replace"
    try:
        return open("/dev/tty", "w", encoding=enc, errors=err)
    except OSError:
        pass
    try:
        if os.isatty(0):
            return open(os.ttyname(0), "w", encoding=enc, errors=err)
    except OSError:
        pass
    return None


def interactive_tty_available() -> bool:
    """True if stderr is a TTY or we can open the session TTY (Rich bar / panels when stderr is a file)."""
    if sys.stderr.isatty():
        return True
    # cli._maybe_mirror_stderr_to_tty wraps stderr in _TeeStderr: primary is still a file, so isatty() is
    # False, but writes also go to the real terminal — Rich Progress must run (same as plain TTY).
    if getattr(sys.stderr, "_tty", None) is not None:
        return True
    tty = open_tty_mirror()
    if tty is None:
        return False
    try:
        tty.close()
    except Exception:
        pass
    return True


def stderr_has_tty_mirror() -> bool:
    """True when ``cli._maybe_mirror_stderr_to_tty`` wrapped stderr (writes also go to a real terminal)."""
    return getattr(sys.stderr, "_tty", None) is not None
