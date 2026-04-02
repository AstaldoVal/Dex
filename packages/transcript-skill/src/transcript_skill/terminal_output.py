"""stderr: Rich panels/tables when available; plain text fallback.

Bubble Tea (Go) is not embedded here; layout matches that style via Rich tables + one progress bar in cli.
"""

from __future__ import annotations

import os
import shutil
import sys
import textwrap
from pathlib import Path
from typing import Any

from transcript_skill.tty_util import interactive_tty_available, open_tty_mirror, stderr_has_tty_mirror

_STDERR_RULE = "─" * 68


def _rich_progress_bar_hint(eff_progress: str) -> str | None:
    """If stderr summary says progress is not Rich UI, return a one-line hint (Rich lives in cli.py only)."""
    if eff_progress == "rich" or eff_progress.endswith("->rich"):
        return None
    return (
        "Полоса Rich (спиннер, бар, проценты, ETA) сейчас не используется — см. «прогресс» в строке "
        "--progress-format выше. Для бара: --progress-format rich. "
        "При auto Rich включается только если stderr — TTY, зеркало в TTY или открывается /dev/tty; "
        "иначе будет lines/rewrite и префикс [transcript-media]."
    )


def _stderr_emit_lines(lines: list[str]) -> None:
    sys.stderr.write("\n".join(lines) + "\n")
    sys.stderr.flush()


def _stderr_banner(*lines_body: str) -> list[str]:
    out: list[str] = ["", _STDERR_RULE]
    for ln in lines_body:
        out.append(f"  {ln}")
    out.append(_STDERR_RULE)
    return out


def _stderr_section_heading(title: str) -> list[str]:
    return ["", f"  [{title}]"]


def _stderr_kv(key: str, value: str) -> list[str]:
    """Одна строка: ``ключ: значение`` (читаемо в логе и в терминале)."""
    pad = "      "
    val = (value or "").strip()
    return [pad + f"{key}: {val}"]


def _stderr_kv_hang(key: str, value: str) -> list[str]:
    """Одна пара «ключ: значение» с переносом длинного значения.

    Два визуальных уровня (не вложенность секций): (1) строка с ключом — 6 пробелов + «ключ: »
    + текст; (2) продолжения того же значения — отступ ``6 + len(f"{key}: ")`` пробелов, чтобы
    текст совпал с колонкой начала значения на первой строке.
    """
    pad = "      "
    val = (value or "").strip()
    tw = max(52, min(120, _stderr_console_width()))
    key_colon = f"{key}: "
    hang = " " * (len(pad) + len(key_colon))
    first = pad + key_colon + val
    if len(first) <= tw:
        return [first]
    value_width = tw - len(pad) - len(key_colon)
    value_width = max(24, value_width)
    chunks = textwrap.wrap(val, width=value_width, break_long_words=False, break_on_hyphens=False)
    if not chunks:
        return [pad + key_colon]
    out = [pad + key_colon + chunks[0]]
    for c in chunks[1:]:
        out.append(hang + c)
    return out


def _stderr_console_width() -> int:
    try:
        w = shutil.get_terminal_size().columns
    except OSError:
        w = 100
    return max(60, min(120, w))


def _stderr_rich_console():
    """Rich Console: stderr if TTY or Tee mirror; else direct /dev/tty so ANSI не заливает только файл."""
    from rich.console import Console

    w = _stderr_console_width()
    if sys.stderr.isatty():
        return Console(stderr=True, width=w, force_terminal=True), None
    if stderr_has_tty_mirror():
        return Console(stderr=True, width=w, force_terminal=True), None
    tty = open_tty_mirror()
    if tty is not None:
        return Console(file=tty, width=w, force_terminal=True), tty
    return Console(stderr=True, width=w), None


def _print_rich_safe(renderable: Any) -> None:
    console, fh = _stderr_rich_console()
    try:
        console.print(renderable)
    finally:
        if fh is not None:
            try:
                fh.close()
            except Exception:
                pass


def _rich_enabled() -> bool:
    """Rich when stderr is interactive, Tee mirror duplicates to terminal, or /dev/tty exists.

    Set TRANSCRIPT_RICH=1 to force Rich even without a terminal (ANSI in the log).
    Set TRANSCRIPT_NO_RICH=1 to disable Rich.
    """
    v = os.environ.get("TRANSCRIPT_NO_RICH", "").strip().lower()
    if v in ("1", "true", "yes"):
        return False
    if os.environ.get("TRANSCRIPT_RICH", "").strip().lower() in ("1", "true", "yes"):
        return True
    if sys.stderr.isatty():
        return True
    if stderr_has_tty_mirror():
        return True
    return interactive_tty_available()


def _rich_param_table(title: str, pairs: list[tuple[str, str]], border_style: str = "blue"):
    """Две колонки: параметр и значение, без «прыгающих» отступов как у голого Group."""
    from rich import box
    from rich.panel import Panel
    from rich.table import Table

    cw = _stderr_console_width()
    inner = max(52, cw - 4)
    table = Table(
        show_header=False,
        box=box.SIMPLE,
        pad_edge=False,
        collapse_padding=True,
        width=inner,
    )
    table.add_column("key", style="cyan", overflow="fold", max_width=max(22, inner // 3))
    table.add_column("value", style="white", overflow="fold")
    for k, v in pairs:
        table.add_row(k, (v or "").strip())
    return Panel(
        table,
        title=f"[bold]{title}[/]",
        border_style=border_style,
        width=cw,
    )


def emit_cli_summary(
    *,
    input_display: str,
    model: str,
    compute_type: str,
    language_display: str,
    preprocess_audio: bool,
    chunk_minutes: float | None,
    no_auto_tune: bool,
    youtube_audio: bool,
    diarize: bool,
    hf_auth_display: str,
    progress_format: str,
    eff_progress: str,
    show_progress: bool,
    plan_only: bool,
) -> None:
    chunk_s = "∅ (авто)" if chunk_minutes is None else f"{chunk_minutes:g}"
    rows = [
        ("ввод (positional)", input_display),
        ("--model", model),
        ("--compute-type", compute_type),
        ("--language", language_display),
        ("--preprocess-audio", "да" if preprocess_audio else "нет"),
        ("--chunk-minutes", chunk_s),
        ("--no-auto-tune", "да" if no_auto_tune else "нет"),
        ("--youtube-audio", "да" if youtube_audio else "нет"),
        ("--diarize", "да" if diarize else "нет"),
        ("HF-токен (--hf-token / env)", hf_auth_display),
        ("--progress", "да" if show_progress else "нет"),
        ("--plan-only", "да" if plan_only else "нет"),
        ("--progress-format", f"{progress_format}  (прогресс: {eff_progress})"),
    ]
    if _rich_enabled():
        try:
            from rich import box
            from rich.panel import Panel
            from rich.table import Table

            cw = _stderr_console_width()
            table = Table(
                show_header=True,
                box=box.ROUNDED,
                border_style="cyan",
                header_style="bold cyan",
                width=cw - 2,
                pad_edge=False,
            )
            table.add_column("Параметр", style="cyan", no_wrap=True)
            table.add_column("Значение", style="white", overflow="fold")
            for k, v in rows:
                table.add_row(k, v)
            _print_rich_safe(
                Panel(
                    table,
                    title="[bold]transcript-media[/] · выбранные параметры · stderr",
                    border_style="cyan",
                    width=cw,
                )
            )
            hint = _rich_progress_bar_hint(eff_progress)
            if hint:
                sys.stderr.write("\n" + hint + "\n")
                sys.stderr.flush()
            return
        except Exception:
            pass

    lines: list[str] = []
    lines.extend(
        _stderr_banner(
            "transcript-media",
            "выбранные параметры (stderr, видно в терминале и в логе при 2>file + tee)",
        )
    )
    lines += _stderr_section_heading("Параметры")
    for k, v in rows:
        lines.extend(_stderr_kv(k, v))
    lines.append("")
    hint = _rich_progress_bar_hint(eff_progress)
    if hint:
        lines.extend(_stderr_kv("прогресс (подсказка)", hint))
    lines.append("")
    _stderr_emit_lines(lines)


def emit_loading_whisper(whisper_model: str, compute_resolved: str) -> None:
    # Two lines (not one long line): terminal soft-wrap would start the continuation at column 0,
    # so "…Hugging Face…" looked like a new unindented line. _stderr_banner adds 2 spaces each.
    line_model = f"Модель {whisper_model!r}, compute_type={compute_resolved}."
    line_hf = "Первый запуск может скачать чекпоинт с Hugging Face (несколько минут)."
    body = f"{line_model}\n{line_hf}"
    if _rich_enabled():
        try:
            from rich.panel import Panel

            cw = _stderr_console_width()
            _print_rich_safe(
                Panel(
                    body,
                    title="[bold]Далее[/]: загрузка весов и распознавание",
                    border_style="yellow",
                    width=cw,
                )
            )
            return
        except Exception:
            pass

    lines: list[str] = []
    lines.extend(
        _stderr_banner(
            "Далее: загрузка весов и распознавание",
            line_model,
            line_hf,
        )
    )
    lines.append("")
    _stderr_emit_lines(lines)


def emit_audio_pipeline_preface(*, title: str, subtitle: str) -> None:
    if _rich_enabled():
        try:
            from rich.panel import Panel

            cw = _stderr_console_width()
            _print_rich_safe(
                Panel(
                    subtitle,
                    title=f"[bold]{title}[/]",
                    border_style="magenta",
                    width=cw,
                )
            )
            return
        except Exception:
            pass

    lines: list[str] = []
    lines.extend(_stderr_banner(title, subtitle))
    lines.append("")
    _stderr_emit_lines(lines)


def emit_local_whisper_plan(
    *,
    source_context: str,
    source_path: Path,
    whisper_model: str,
    lang_s: str,
    compute_type: str,
    compute_resolved: str,
    compute_why: str,
    pre_s: str,
    dia_s: str,
    vch: str,
    chunk_detail: str,
    duration: float,
    auto_tune_s: str,
    hf_weights: str,
) -> None:
    if _rich_enabled():
        try:
            from rich.console import Group
            from rich.panel import Panel

            cw = _stderr_console_width()
            group = Group(
                _rich_param_table(
                    "Источник",
                    [("контекст", source_context), ("файл", str(source_path))],
                ),
                _rich_param_table(
                    "Модель",
                    [("faster-whisper", whisper_model), ("чекпоинт Hugging Face", hf_weights)],
                ),
                _rich_param_table("Язык", [("режим", lang_s)]),
                _rich_param_table(
                    "compute_type",
                    [
                        ("запрос (CLI / API)", compute_type),
                        ("итог у faster-whisper", compute_resolved),
                        ("почему так", compute_why),
                    ],
                ),
                _rich_param_table(
                    "Нарезка (chunk)",
                    [("сводка", vch), ("детали", chunk_detail)],
                ),
                _rich_param_table(
                    "Дополнительно",
                    [
                        ("предобработка (ffmpeg)", pre_s),
                        ("диаризация", dia_s),
                        ("VAD", "включён (vad_filter=True)"),
                        ("длительность (ffprobe)", f"{duration:.1f} с (~{duration / 60.0:.2f} мин)"),
                        ("авто-подстройка RAM/чанки", auto_tune_s),
                    ],
                ),
            )
            _print_rich_safe(
                Panel(
                    group,
                    title="[bold]transcript-media[/] · План · faster-whisper (локально)",
                    border_style="blue",
                    width=cw,
                )
            )
            return
        except Exception:
            pass

    lines: list[str] = []
    lines.extend(
        _stderr_banner("transcript-media", "План транскрибации · faster-whisper (локальное распознавание)")
    )
    lines += _stderr_section_heading("Источник")
    lines.extend(_stderr_kv("контекст", source_context))
    lines.extend(_stderr_kv("файл", str(source_path)))
    lines += _stderr_section_heading("Модель")
    lines.extend(_stderr_kv("faster-whisper", whisper_model))
    lines.extend(_stderr_kv("чекпоинт Hugging Face", hf_weights))
    lines += _stderr_section_heading("Язык")
    lines.extend(_stderr_kv("режим", lang_s))
    lines += _stderr_section_heading("compute_type")
    lines.extend(_stderr_kv("запрос (CLI / API)", compute_type))
    lines.extend(_stderr_kv("итог у faster-whisper", compute_resolved))
    lines.extend(_stderr_kv_hang("почему так", compute_why))
    lines += _stderr_section_heading("Нарезка (chunk)")
    lines.extend(_stderr_kv("сводка", vch))
    lines.extend(_stderr_kv_hang("детали", chunk_detail))
    lines += _stderr_section_heading("Дополнительно")
    lines.extend(_stderr_kv("предобработка (ffmpeg)", pre_s))
    lines.extend(_stderr_kv("диаризация", dia_s))
    lines.extend(_stderr_kv("VAD", "включён (vad_filter=True)"))
    lines.extend(_stderr_kv("длительность (ffprobe)", f"{duration:.1f} с (~{duration / 60.0:.2f} мин)"))
    lines.extend(_stderr_kv("авто-подстройка RAM/чанки", auto_tune_s))
    lines.append("")
    _stderr_emit_lines(lines)


def emit_youtube_captions_plan(
    *,
    video_id: str,
    whisper_model: str,
    compute_type: str,
    chunk_minutes: float | None,
    preprocess_audio: bool,
    diarize: bool,
    youtube_audio: bool,
) -> None:
    chunk_s = "∅" if chunk_minutes is None else f"{chunk_minutes:g}"
    if _rich_enabled():
        try:
            from rich.console import Group
            from rich.panel import Panel

            cw = _stderr_console_width()
            t1 = _rich_param_table(
                "Режим",
                [
                    ("источник", "встроенные субтитры на странице видео"),
                    ("faster-whisper", "не вызывается"),
                    ("video_id", video_id),
                    ("условие", "без --youtube-audio и без --diarize; берётся текст субтитров"),
                ],
                border_style="green",
            )
            t2 = _rich_param_table(
                "Флаги Whisper в этом режиме",
                [
                    ("загрузчик субтитров", "ниже перечисленные опции не читает"),
                    ("--model", whisper_model),
                    ("--compute-type", compute_type),
                    ("--chunk-minutes", chunk_s),
                    ("--preprocess-audio", str(preprocess_audio)),
                    ("--diarize", str(diarize)),
                    ("--youtube-audio", str(youtube_audio)),
                    ("включить Whisper", "--youtube-audio или --diarize"),
                    ("процесс", "скачивание аудио, затем локальное распознавание"),
                ],
                border_style="dim",
            )
            _print_rich_safe(
                Panel(
                    Group(t1, t2),
                    title="[bold]transcript-media[/] · План · субтитры YouTube (без Whisper)",
                    border_style="green",
                    width=cw,
                )
            )
            _print_rich_safe(
                Panel(
                    "Загрузка субтитров с YouTube…",
                    title="[bold]Далее[/]",
                    border_style="yellow",
                    width=cw,
                )
            )
            return
        except Exception:
            pass

    lines: list[str] = []
    lines.extend(_stderr_banner("transcript-media", "План транскрибации · субтитры YouTube (без Whisper)"))
    lines += _stderr_section_heading("Режим")
    lines.extend(_stderr_kv("источник", "встроенные субтитры на странице видео"))
    lines.extend(_stderr_kv("faster-whisper", "не вызывается"))
    lines.extend(_stderr_kv("video_id", video_id))
    lines.extend(
        _stderr_kv(
            "условие",
            "без --youtube-audio и без --diarize; берётся текст субтитров",
        )
    )
    lines += _stderr_section_heading("Флаги Whisper в этом режиме")
    lines.extend(_stderr_kv("загрузчик субтитров", "ниже перечисленные опции не читает"))
    lines.extend(_stderr_kv("--model", whisper_model))
    lines.extend(_stderr_kv("--compute-type", compute_type))
    lines.extend(_stderr_kv("--chunk-minutes", chunk_s))
    lines.extend(_stderr_kv("--preprocess-audio", str(preprocess_audio)))
    lines.extend(_stderr_kv("--diarize", str(diarize)))
    lines.extend(_stderr_kv("--youtube-audio", str(youtube_audio)))
    lines.extend(_stderr_kv("включить Whisper", "--youtube-audio или --diarize"))
    lines.extend(_stderr_kv("процесс", "скачивание аудио, затем локальное распознавание"))
    lines.extend(_stderr_banner("Далее: загрузка субтитров с YouTube"))
    lines.append("")
    _stderr_emit_lines(lines)
