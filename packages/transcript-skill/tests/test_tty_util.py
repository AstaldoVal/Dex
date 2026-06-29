"""TTY helpers: mirror detection for Rich progress."""

from __future__ import annotations

import io
import sys

import pytest

from transcript_skill import tty_util


def test_interactive_tty_available_true_when_stderr_has_tty_mirror(monkeypatch):
    """When cli wraps stderr in _TeeStderr, isatty() is False but Rich must still run."""
    primary = io.StringIO()
    fake_tty = io.StringIO()

    class _FakeTee:
        _tty = fake_tty

        def isatty(self) -> bool:
            return False

    monkeypatch.setattr(sys, "stderr", _FakeTee())
    assert tty_util.interactive_tty_available() is True


def test_interactive_tty_available_false_when_no_tty_and_no_mirror(monkeypatch):
    monkeypatch.setattr(sys, "stderr", io.StringIO())
    monkeypatch.setattr(tty_util, "open_tty_mirror", lambda: None)
    assert tty_util.interactive_tty_available() is False
