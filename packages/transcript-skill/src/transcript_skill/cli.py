"""CLI: transcript-media — JSON to stdout; progress on stderr."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import stat
import sys
import time
from pathlib import Path
from typing import TextIO

from transcript_skill.tty_util import interactive_tty_available, open_tty_mirror
from transcript_skill.engine import (
    MAX_CHUNK_MINUTES,
    MIN_CHUNK_MINUTES,
    WHISPER_MODEL_CHOICES,
    emit_stderr_cli_summary,
    output_json,
    transcribe_from_input,
)


def _stderr_should_mirror_to_tty() -> bool:
    """True for shell `2>file` redirects; False for FIFO/pipes (`2> >(tee …)`), sockets, /dev/null, etc.

    If `fstat` fails (unusual wrappers), we still try mirroring: opening `/dev/tty` will no-op in CI.
    Previously we required S_ISREG only; a failed fstat returned False and mirroring never ran.
    """
    try:
        mode = os.fstat(sys.stderr.fileno()).st_mode
    except Exception:
        return True
    if stat.S_ISFIFO(mode) or stat.S_ISSOCK(mode):
        return False
    if stat.S_ISREG(mode):
        return True
    # Character devices (e.g. /dev/null), block devices: do not duplicate to TTY.
    return False


def _progress_console():
    """Rich Console for Progress: always render on stderr (forced terminal)."""
    from rich.console import Console

    try:
        w = min(120, max(80, shutil.get_terminal_size((0, 0)).columns))
    except OSError:
        w = 100
    if sys.stderr.isatty():
        return Console(stderr=True, width=w, force_terminal=True), None
    return Console(stderr=True, width=w, force_terminal=True), None


def _maybe_mirror_stderr_to_tty() -> None:
    """Duplicate stderr to the real terminal when stderr is a file redirect so plan + progress show.

    Skipped when stderr is already a TTY, when TRANSCRIPT_NO_TTY_MIRROR=1, when redirect is a pipe
    (user likely uses `2> >(tee …)`), or when no terminal handle is available (CI).
    """
    if sys.stderr.isatty():
        return
    if os.environ.get("TRANSCRIPT_NO_TTY_MIRROR", "").strip().lower() in ("1", "true", "yes"):
        return
    if not _stderr_should_mirror_to_tty():
        return

    primary = sys.stderr
    tty = open_tty_mirror()
    if tty is None:
        # Only nag in real interactive use: mirror failed but user has a terminal on stdin.
        # Never prefix during pytest (even when stdin is a tty) so error-only stderr stays JSON.
        try:
            if (
                os.isatty(0)
                and os.environ.get("PYTEST_CURRENT_TEST") is None
                and os.environ.get("TRANSCRIPT_SUPPRESS_TTY_MIRROR_HINT") is None
            ):
                primary.write(
                    "[transcript-media] TTY mirror failed (/dev/tty and stdin tty). "
                    "Progress stays in this log file only. "
                    "For terminal + log use: packages/transcript-skill/scripts/transcribe_to_log.sh "
                    "OUT.json OUT.log -- --model … \"path.mp4\"\n"
                )
                primary.flush()
        except Exception:
            pass
        return
    try:
        if hasattr(tty, "reconfigure"):
            tty.reconfigure(line_buffering=True)
    except Exception:
        pass

    class _TeeStderr:
        __slots__ = ("_primary", "_tty", "_tty_bad")

        def __init__(self, p, t):
            self._primary = p
            self._tty = t
            self._tty_bad = False

        def write(self, s: str) -> int:
            n = self._primary.write(s)
            if not self._tty_bad and self._tty:
                try:
                    self._tty.write(s)
                    # Ensure the interactive terminal updates immediately (same as line-buffered file).
                    self._tty.flush()
                except Exception:
                    self._tty_bad = True
            return n

        def flush(self) -> None:
            try:
                self._primary.flush()
            except Exception:
                pass
            if self._tty and not self._tty_bad:
                try:
                    self._tty.flush()
                except Exception:
                    self._tty_bad = True

        def isatty(self) -> bool:
            return self._primary.isatty()

        def fileno(self) -> int:
            return self._primary.fileno()

        def reconfigure(self, **kwargs):  # noqa: ANN003
            if hasattr(self._primary, "reconfigure"):
                return self._primary.reconfigure(**kwargs)
            return None

        def __getattr__(self, name: str):
            return getattr(self._primary, name)

    sys.stderr = _TeeStderr(primary, tty)


def _hf_auth_display(diarize: bool, hf_cli: str | None) -> str:
    """Строка для блока «выбранные параметры»: источник HF-токена без утечки значения."""
    if not diarize:
        return "не используется (нет --diarize)"
    if hf_cli:
        return "задан через --hf-token (значение не печатается)"
    if (os.environ.get("HF_TOKEN") or "").strip() or (
        os.environ.get("HUGGINGFACE_HUB_TOKEN") or ""
    ).strip():
        return "задан через окружение (HF_TOKEN или HUGGINGFACE_HUB_TOKEN)"
    return "не задан (без него --diarize обычно падает на pyannote)"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="transcript-media",
        description="Transcribe YouTube (captions), Apple Podcasts, or local media. Prints JSON to stdout.",
    )
    p.add_argument(
        "input",
        nargs="?",
        default="",
        help="YouTube URL, Apple Podcasts URL, or path to local audio/video",
    )
    p.add_argument(
        "--model",
        default="small",
        metavar="NAME",
        help=f"faster-whisper model for local/podcast paths (default: small). Choices: {', '.join(WHISPER_MODEL_CHOICES)}",
    )
    p.add_argument(
        "--language",
        default="",
        metavar="CODE",
        help="Optional Whisper language code (e.g. en, ru). Empty = auto-detect.",
    )
    p.add_argument(
        "--compute-type",
        default="auto",
        metavar="TYPE",
        help="faster-whisper compute_type: auto (default), int8, float16, float32, int8_float16, …",
    )
    p.add_argument(
        "--no-auto-tune",
        action="store_true",
        help="Disable RAM-based defaults for --compute-type auto and long-file chunk length.",
    )
    p.add_argument(
        "--preprocess-audio",
        action="store_true",
        help="Before Whisper: convert full file to mono 16 kHz WAV (better for noisy or music-heavy audio).",
    )
    p.add_argument(
        "--chunk-minutes",
        type=float,
        default=None,
        metavar="M",
        help=(
            f"If media is longer than M minutes, split into M-minute chunks (Whisper only). "
            f"Allowed range: {MIN_CHUNK_MINUTES:g}–{MAX_CHUNK_MINUTES:g}. "
            "When omitted, auto-tune may pick a chunk size on long files."
        ),
    )
    p.add_argument(
        "--progress",
        dest="progress",
        action="store_true",
        default=True,
        help="Show percent complete on stderr during Whisper/diarization (default: on).",
    )
    p.add_argument(
        "--no-progress",
        dest="progress",
        action="store_false",
        help="Disable stderr progress lines.",
    )
    p.add_argument(
        "--progress-format",
        choices=("auto", "rewrite", "lines", "rich"),
        default="auto",
        metavar="MODE",
        help=(
            "Progress: rich = bar + spinner + percent (uses stderr TTY or /dev/tty when stderr is a file); "
            "rewrite = one updating line; lines = one line per update; "
            "auto = rich bar when an interactive terminal is available, else lines. "
            "With 2>log, stderr is not a TTY but bar still works if /dev/tty or stdin tty is available."
        ),
    )
    p.add_argument(
        "--youtube-audio",
        action="store_true",
        help=(
            "For YouTube URLs: download audio and run Whisper instead of captions. "
            "Also implied when --diarize is set (diarization needs audio)."
        ),
    )
    p.add_argument(
        "--diarize",
        action="store_true",
        help=(
            "Run speaker diarization (pyannote) after Whisper; requires HF_TOKEN and pip install [diarize]. "
            "For YouTube, automatically downloads audio (see --youtube-audio)."
        ),
    )
    p.add_argument(
        "--hf-token",
        default="",
        metavar="TOKEN",
        help="Hugging Face token for pyannote (optional if HF_TOKEN / HUGGINGFACE_HUB_TOKEN is set).",
    )
    p.add_argument(
        "--plan-only",
        action="store_true",
        help=(
            "Existing local file only: print the transcription plan to stderr, then exit without "
            "loading Whisper (smoke test for logging and TTY mirror; pairs with 2>file)."
        ),
    )
    return p


def main(argv: list[str] | None = None) -> None:
    # When stderr is a file (e.g. 2>transcript.stderr.log), CPython uses block buffering by default:
    # plan and progress lines would only flush in large chunks or at exit. Line-buffer so tail -f works.
    try:
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass

    _maybe_mirror_stderr_to_tty()

    args = build_parser().parse_args(argv)
    raw = (args.input or "").strip()
    if not raw:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Missing input. Provide YouTube URL, Apple Podcasts URL, or local media path.",
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    if bool(getattr(args, "plan_only", False)):
        if not Path(raw).expanduser().is_file():
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": (
                            "--plan-only requires an existing local media file path "
                            "(not a URL or missing file)."
                        ),
                    },
                    ensure_ascii=False,
                ),
                file=sys.stderr,
            )
            sys.exit(1)

    model = args.model.strip()
    if model not in WHISPER_MODEL_CHOICES:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"Invalid --model {model!r}. Use one of: {', '.join(WHISPER_MODEL_CHOICES)}",
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        sys.exit(1)

    lang = args.language.strip() or None

    try:
        _inp = Path(raw).expanduser()
        input_display = str(_inp.resolve()) if _inp.is_file() else raw
    except Exception:
        input_display = raw

    chunk_minutes = args.chunk_minutes
    if chunk_minutes is not None:
        if chunk_minutes < MIN_CHUNK_MINUTES or chunk_minutes > MAX_CHUNK_MINUTES:
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": (
                            f"Invalid --chunk-minutes {chunk_minutes}. "
                            f"Use a value between {MIN_CHUNK_MINUTES} and {MAX_CHUNK_MINUTES}."
                        ),
                    },
                    ensure_ascii=False,
                ),
                file=sys.stderr,
            )
            sys.exit(1)

    fmt = (args.progress_format or "auto").strip()
    tty_ok = interactive_tty_available()
    if fmt == "auto":
        use_rich_progress = tty_ok
        use_lines = not use_rich_progress
    elif fmt == "lines":
        use_lines = True
        use_rich_progress = False
    elif fmt == "rewrite":
        use_lines = False
        use_rich_progress = False
    elif fmt == "rich":
        # Explicit rich: always use Rich Progress (Console on stderr TTY or /dev/tty via _progress_console).
        # Do not fall back to lines when stderr is a pipe/file; tty_ok can be wrong before mirror fix.
        use_rich_progress = True
        use_lines = False
    else:
        use_lines = False
        use_rich_progress = False

    _line_state = {"last_pct": -999.0, "last_phase": "", "last_time": 0.0}

    def progress_cb(pct: float, phase: str) -> None:
        if not getattr(args, "progress", True):
            return
        if use_lines:
            now = time.monotonic()
            # Редкие строки в лог: без «шторма» процентов (fallback без TTY / Rich).
            should_emit = (
                phase != _line_state["last_phase"]
                or pct - _line_state["last_pct"] >= 4.0
                or now - _line_state["last_time"] >= 3.0
                or pct >= 99.5
            )
            if not should_emit:
                return
            sys.stderr.write(f"[transcript-media] {pct:5.1f}%  {phase}\n")
            sys.stderr.flush()
            _line_state["last_pct"] = pct
            _line_state["last_phase"] = phase
            _line_state["last_time"] = now
        else:
            sys.stderr.write(f"\r[transcript-media] {pct:5.1f}%  {phase}   ")
            sys.stderr.flush()

    auto_tune = not bool(args.no_auto_tune)
    hf = (args.hf_token or "").strip() or None

    if use_rich_progress:
        eff_inner = "rich"
    elif use_lines:
        eff_inner = "lines"
    else:
        eff_inner = "rewrite"
    eff_progress = f"{fmt}->{eff_inner}" if fmt == "auto" else eff_inner
    lang_disp = lang if lang else "∅ (авто)"
    show_progress = bool(getattr(args, "progress", True))
    emit_stderr_cli_summary(
        input_display=input_display,
        model=model,
        compute_type=(args.compute_type.strip() or "auto"),
        language_display=lang_disp,
        preprocess_audio=bool(args.preprocess_audio),
        chunk_minutes=chunk_minutes,
        no_auto_tune=bool(args.no_auto_tune),
        youtube_audio=bool(args.youtube_audio),
        diarize=bool(args.diarize),
        hf_auth_display=_hf_auth_display(bool(args.diarize), hf),
        progress_format=fmt,
        eff_progress=eff_progress,
        show_progress=show_progress,
        plan_only=bool(getattr(args, "plan_only", False)),
    )
    use_rich_ok = show_progress and use_rich_progress
    if use_rich_ok:
        try:
            from rich.progress import (
                BarColumn,
                Progress,
                SpinnerColumn,
                TextColumn,
                TimeElapsedColumn,
                TimeRemainingColumn,
            )

            # Rich 14 removed PercentageColumn; TaskProgressColumn shows the same %.
            try:
                from rich.progress import PercentageColumn as _PercentageOrTaskColumn
            except ImportError:
                from rich.progress import TaskProgressColumn as _PercentageOrTaskColumn
        except ImportError as exc:
            # One-time debug. Without this, fallback is silent and the user only sees [transcript-media] % lines.
            use_rich_ok = False
            try:
                sys.stderr.write(
                    f"[transcript-media] Rich progress disabled (ImportError): {exc}\n"
                )
                sys.stderr.flush()
            except Exception:
                pass

    try:
        if use_rich_ok:
            # Rich live-rendering doesn't always work when stderr is captured/redirected
            # (common with `transcribe_to_log.sh` + `tee`): Rich may print only the final bar.
            # To keep progress visually obvious, we fallback to a text bar with ETA when
            # stderr isn't an actual interactive terminal.
            rich_live = bool(sys.stderr.isatty())
            if not rich_live:
                try:
                    cols = shutil.get_terminal_size((0, 0)).columns
                except OSError:
                    cols = 80
                bar_width = max(20, min(50, cols // 2))

                start_t = time.monotonic()
                _bar_state = {"last_pct": -999.0, "last_phase": "", "last_emit_t": 0.0}

                def _fmt_eta(sec: float) -> str:
                    if sec < 0 or sec == float("inf"):
                        return "--:--"
                    m = int(sec // 60)
                    s = int(sec % 60)
                    return f"{m}:{s:02d}"

                def progress_cb_rich_textbar(pct: float, phase: str) -> None:
                    if not getattr(args, "progress", True):
                        return
                    now = time.monotonic()
                    # With coarse Whisper % updates, pct can sit at e.g. 1.5 for minutes while ETA moves.
                    # Longer heartbeat avoids log spam; first lines still show phase/% jumps.
                    pct_stuck = (
                        _bar_state["last_pct"] > -100.0
                        and abs(pct - _bar_state["last_pct"]) < 0.06
                        and phase == _bar_state["last_phase"]
                    )
                    hb = 25.0 if pct_stuck else 4.0
                    should_emit = (
                        phase != _bar_state["last_phase"]
                        or pct - _bar_state["last_pct"] >= 2.0
                        or now - _bar_state["last_emit_t"] >= hb
                        or pct >= 99.5
                    )
                    if not should_emit:
                        return

                    elapsed = max(0.0, now - start_t)
                    eta_s = "--:--"
                    if pct > 0.5:
                        eta = elapsed * (100.0 - pct) / pct
                        eta_s = _fmt_eta(eta)

                    p = min(100.0, max(0.0, float(pct)))

                    def _bar_for_progress(v: float) -> str:
                        if v >= 100.0:
                            return "=" * bar_width
                        base = min(bar_width, max(0, int(bar_width * v / 100.0)))
                        if v > 0.0 and base == 0:
                            base = 1
                        frac = (bar_width * v / 100.0) - base
                        # Sub-cell head improves perceived movement at low %
                        heads = ("▏", "▎", "▍", "▌", "▋", "▊", "▉")
                        head = ">"
                        if base < bar_width and frac > 0.0:
                            idx = max(0, min(len(heads) - 1, int(frac * len(heads))))
                            head = heads[idx]
                        if base <= 0:
                            return "-" * bar_width
                        if base >= bar_width:
                            return "=" * bar_width
                        return "=" * (base - 1) + head + "-" * (bar_width - base)

                    # Explicitly close load_model when we first move to whisper.
                    if (
                        _bar_state["last_phase"] == "load_model"
                        and phase != "load_model"
                    ):
                        load_done = "[transcript-media] [{}] {:5.1f}% ETA {}  {}".format(
                            _bar_for_progress(100.0), 100.0, "0:00", "load_model"
                        )
                        pad_done = max(0, cols - len(load_done) - 1)
                        # Persist completed load_model line before switching to whisper line.
                        sys.stderr.write(f"\r{load_done}{' ' * pad_done}\n")
                        sys.stderr.flush()

                    # Keep progress on a single terminal line (carriage return update).
                    # Padding clears remnants when the next line is shorter.
                    bar = _bar_for_progress(p)
                    line = f"[transcript-media] [{bar}] {p:5.1f}% ETA {eta_s}  {phase}"
                    pad = max(0, cols - len(line) - 1)
                    sys.stderr.write(f"\r{line}{' ' * pad}")
                    sys.stderr.flush()

                    _bar_state["last_pct"] = p
                    _bar_state["last_phase"] = phase
                    _bar_state["last_emit_t"] = now

                out = transcribe_from_input(
                    raw,
                    whisper_model=model,
                    language=lang,
                    compute_type=args.compute_type.strip() or "auto",
                    preprocess_audio=bool(args.preprocess_audio),
                    chunk_minutes=chunk_minutes,
                    auto_tune=auto_tune,
                    progress_callback=progress_cb_rich_textbar,
                    diarize=bool(args.diarize),
                    hf_token=hf,
                    youtube_audio=bool(getattr(args, "youtube_audio", False)),
                    plan_only=bool(getattr(args, "plan_only", False)),
                )
                if getattr(args, "progress", True):
                    sys.stderr.write("\n")
                    sys.stderr.flush()
            else:
                console_err, tty_for_progress = _progress_console()
                try:
                    with Progress(
                        SpinnerColumn(),
                        TextColumn("[bold]{task.description}[/]"),
                        BarColumn(
                            bar_width=None,
                            style="bar.back",
                            complete_style="bold cyan",
                            finished_style="bold green",
                        ),
                        _PercentageOrTaskColumn(),
                        TimeElapsedColumn(),
                        TimeRemainingColumn(),
                        console=console_err,
                        expand=True,
                    ) as progress:
                        task_id = progress.add_task("…", total=100.0)

                        def progress_cb_rich(pct: float, phase: str) -> None:
                            progress.update(
                                task_id,
                                completed=min(100.0, max(0.0, pct)),
                                description=phase,
                            )

                        out = transcribe_from_input(
                            raw,
                            whisper_model=model,
                            language=lang,
                            compute_type=args.compute_type.strip() or "auto",
                            preprocess_audio=bool(args.preprocess_audio),
                            chunk_minutes=chunk_minutes,
                            auto_tune=auto_tune,
                            progress_callback=progress_cb_rich,
                            diarize=bool(args.diarize),
                            hf_token=hf,
                            youtube_audio=bool(getattr(args, "youtube_audio", False)),
                            plan_only=bool(getattr(args, "plan_only", False)),
                        )
                finally:
                    if tty_for_progress is not None:
                        try:
                            tty_for_progress.close()
                        except Exception:
                            pass
        else:
            out = transcribe_from_input(
                raw,
                whisper_model=model,
                language=lang,
                compute_type=args.compute_type.strip() or "auto",
                preprocess_audio=bool(args.preprocess_audio),
                chunk_minutes=chunk_minutes,
                auto_tune=auto_tune,
                progress_callback=progress_cb if show_progress else None,
                diarize=bool(args.diarize),
                hf_token=hf,
                youtube_audio=bool(getattr(args, "youtube_audio", False)),
                plan_only=bool(getattr(args, "plan_only", False)),
            )
        print(output_json(out))
        if show_progress and not use_rich_ok:
            sys.stderr.write("\n")
    except Exception as exc:
        print(
            json.dumps(
                {"ok": False, "error": str(exc).strip() or "Transcription failed."},
                ensure_ascii=False,
            ),
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
