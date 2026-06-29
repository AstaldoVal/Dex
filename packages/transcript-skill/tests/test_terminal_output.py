"""Tests for stderr plain-text helpers."""

from transcript_skill.terminal_output import _stderr_kv_hang


def test_stderr_kv_hang_continuation_aligns_with_value_column(monkeypatch):
    """Продолжения многострочного значения начинаются в колонке len(pad)+len('ключ: ')."""
    monkeypatch.setattr(
        "transcript_skill.terminal_output._stderr_console_width",
        lambda: 56,
    )
    key = "почему так"
    val = "слово " * 30
    lines = _stderr_kv_hang(key, val)
    assert len(lines) >= 2
    pad = "      "
    hang_w = len(pad) + len(f"{key}: ")
    assert lines[1][:hang_w] == " " * hang_w


def test_stderr_kv_hang_short_key_uses_shorter_hang(monkeypatch):
    monkeypatch.setattr(
        "transcript_skill.terminal_output._stderr_console_width",
        lambda: 50,
    )
    key = "детали"
    val = "chunk " * 25
    lines = _stderr_kv_hang(key, val)
    assert len(lines) >= 2
    pad = "      "
    hang_w = len(pad) + len(f"{key}: ")
    assert hang_w == 14
    assert lines[1][:hang_w] == " " * hang_w


def test_emit_loading_whisper_plain_two_body_lines_indented(monkeypatch, capsys):
    """Две строки тела (модель и Hugging Face), по 2 пробела; без одной длинной строки (нет срыва отступа при wrap)."""
    monkeypatch.setattr("transcript_skill.terminal_output._rich_enabled", lambda: False)
    from transcript_skill.terminal_output import emit_loading_whisper

    emit_loading_whisper("small", "int8")
    err = capsys.readouterr().err
    model_lines = [ln for ln in err.splitlines() if "Модель" in ln]
    hf_lines = [ln for ln in err.splitlines() if "Hugging Face" in ln]
    assert len(model_lines) == 1, err
    assert len(hf_lines) == 1, err
    assert model_lines[0].startswith("  Модель"), repr(model_lines[0])
    assert hf_lines[0].startswith("  Первый запуск"), repr(hf_lines[0])
