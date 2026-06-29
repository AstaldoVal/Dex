# Transcript Skill Package

Standalone package for media transcription and summarization input across:

- YouTube URLs
- Apple Podcasts URLs
- Local audio/video files

## Why this package exists

This folder isolates transcript-related logic so it can be versioned and pushed independently from broader Dex changes.

## Structure

- `src/transcript_skill/` — library (`engine`, `cli`).
- `scripts/transcribe.py` — thin wrapper (adds `src/` to `PYTHONPATH`) for running without install; shebang uses **`python3 -u`** to reduce stderr buffering when redirecting.
- `scripts/transcribe_to_log.sh` — optional bash helper: JSON to a file, stderr to **terminal and** append to a log (see below).
- `scripts/download_whisper_weights.py` — pre-download Whisper weights into HF cache (same as `download-whisper-weights`).
- `pyproject.toml` — package metadata; console script **`transcript-media`**.
- `requirements.txt` — pins same deps as `pyproject.toml` (for `pip install -r`).
- `tests/` — pytest (routing/parsing only; no network).
- `SKILL.md` — package-level skill spec and workflow.

## Install

**Recommended (editable install + CLI on PATH):**

```bash
cd packages/transcript-skill
pip install -e ".[dev]"
transcript-media "https://www.youtube.com/watch?v=VIDEO_ID"
```

**Without install** (from repo root):

```bash
pip install -r packages/transcript-skill/requirements.txt
python3 packages/transcript-skill/scripts/transcribe.py "URL_OR_PATH"
```

Required system dependency:

```bash
ffmpeg -version
```

If `ffmpeg` is missing, install it first (for example via Homebrew on macOS).

## Whisper model weights (not included in this repo)

**Important:** This package ships **code only**. **Whisper checkpoints are never committed** to the repository and are **not** part of the skill folder. They are **downloaded separately** (on demand or ahead of time) into the **Hugging Face cache** on your machine, typically under `~/.cache/huggingface/hub` (or `$HF_HOME/hub` if you set `HF_HOME`).

1. **Default for local audio and Apple Podcasts:** `faster-whisper` model **`small`** (lighter disk and RAM than large checkpoints).
2. **Higher quality (Whisper Large v3):** use **`--model large-v3`** for local files, podcast URLs, and **YouTube when using `--youtube-audio` or `--diarize`** (those paths download audio and run Whisper).
3. **YouTube default:** site **captions** (no Whisper) unless you pass **`--youtube-audio`** or **`--diarize`** (diarization always needs downloaded audio).
4. **Rough disk footprint (downloads, order of magnitude):**
   - **`small`:** on the order of **hundreds of MB**.
   - **`large-v3`:** on the order of **~3 GB** for the Systran CTranslate2 build (exact size varies with revision and on-disk layout).

**Pre-download Large v3** (recommended before offline use or to avoid waiting on first transcription):

```bash
# After: pip install -e packages/transcript-skill
download-whisper-weights large-v3
```

Without installing the package (from repo root):

```bash
python3 packages/transcript-skill/scripts/download_whisper_weights.py large-v3
```

The command prints the **local directory path** where weights were saved (Hugging Face cache). The same cache is used when you run `transcript-media --model large-v3 ...`. If you skip pre-download, the **first** run with `--model large-v3` will **download** weights automatically (needs network once).

Optional: set **`--cache-dir PATH`** on `download-whisper-weights` to match a custom Hugging Face cache location.

## CLI usage

```bash
transcript-media "https://www.youtube.com/watch?v=VIDEO_ID"
transcript-media "https://podcasts.apple.com/.../id..."
transcript-media "/path/to/local-file.mp4"
# Optional Whisper model for local / podcast paths (default: small):
transcript-media --model large-v3 "/path/to/file.mp3"
# Optional: mono 16 kHz preprocess (noisy / music-heavy audio):
transcript-media --preprocess-audio "/path/to/file.mp3"
# Optional: split long media into M-minute chunks (Whisper only; M = 3–240):
transcript-media --chunk-minutes 45 "/path/to/long.mp3"
# Default --compute-type auto (RAM + accelerator): CUDA -> float16; Apple MPS and CPU -> int8
# (float16 on MPS often fails with faster-whisper; do not force it unless you know your build supports it).
transcript-media --no-auto-tune --compute-type int8 "/path/to/file.mp3"
# Progress percent on stderr (default on); turn off:
transcript-media --no-progress "/path/to/file.mp3"
# Progress format: default --progress-format rich (Rich bar on TTY; with pipe/2>log/tee: ASCII bar + ETA;
# use --progress-format lines only for throttled multiline logs; --progress-format rewrite for \r without a bar).
# Reliable terminal + log: use scripts/transcribe_to_log.sh OUT.json OUT.log -- --model large-v3 "file.mp4"
# (tee shows progress in the window; no reliance on /dev/tty alone.)
# With plain `2>file.log`: stderr is mirrored to the terminal (/dev/tty, then stdin tty as fallback);
# Rich progress bar also targets /dev/tty when stderr is a file so the bar updates in the window.
# Disable mirror: TRANSCRIPT_NO_TTY_MIRROR=1. Pipe redirects (e.g. `2> >(tee -a log)`) are not mirrored to avoid double output.
# Optional: packages/transcript-skill/scripts/transcribe_to_log.sh out.json out.stderr.log -- ...
# With 2>file.log, stderr is line-buffered where the platform allows it; transcribe.py uses python3 -u.
# Plan text: plain sections in log files; Rich panels only on a TTY (set TRANSCRIPT_RICH=1 for Rich to file).
# Explicit: --progress-format rich | rewrite | lines
# Log-friendly lines (e.g. tee, 2> log.txt):
transcript-media --progress-format lines --model large-v3 "/path/to/file.mp3"
# Before transcription, stderr uses Rich panels/tables when available (fallback: plain text).
# Order: CLI flags -> resolved Whisper plan (or YouTube captions) -> yt-dlp preface -> loading weights banner.
# Disable Rich UI only: TRANSCRIPT_NO_RICH=1
# Speaker diarization after Whisper (needs HF token + pip install -e ".[diarize]"):
export HF_TOKEN=...
transcript-media --diarize "/path/to/meeting.m4a"
# Local file only: print plan to stderr, exit without loading Whisper (JSON includes plan_only: true):
transcript-media --plan-only "/path/to/file.mp3"
# YouTube: Whisper + diarization (downloads audio; same as --youtube-audio when diarize is on):
transcript-media --diarize --model large-v3 "https://www.youtube.com/watch?v=VIDEO_ID"
# YouTube: Whisper only, no captions (no diarization):
transcript-media --youtube-audio --model large-v3 "https://www.youtube.com/watch?v=VIDEO_ID"
```

Same via script path:

```bash
python3 packages/transcript-skill/scripts/transcribe.py "https://www.youtube.com/watch?v=VIDEO_ID"
```

## Tests

```bash
cd packages/transcript-skill
pytest -q
```

## Cloud ASR benchmarks (context)

The [Artificial Analysis Speech-to-Text leaderboard](https://artificialanalysis.ai/speech-to-text) compares **hosted** models (AA-WER, USD per 1000 minutes, speed factor). This package defaults to **local `faster-whisper` with model `small`**, which is **not** the same row as **Whisper Large v2/v3** on that page.

1. **YouTube with captions:** No per-minute API cost; quality follows YouTube captions (not AA-WER Whisper).
2. **YouTube with `--youtube-audio` or `--diarize`:** Same as local Whisper (download + **faster-whisper**); diarization uses pyannote on the same audio.
3. **Local files / Apple Podcasts via Whisper:** You pay **compute** (electricity/GPU time), not a per-minute cloud rate. **`small`** is faster and lighter than **`large-v3`** but lower accuracy than large checkpoints on the leaderboard.
4. **Leaderboard anchors (hosted, from the public table):** Whisper Large v2 is listed around **4.2%** AA-WER and **~$6 / 1000 min**; top accuracy tiers include models like **ElevenLabs Scribe v2** (~**2.3%** AA-WER) and several **Gemini 3** variants at **~2.9–3.1%** AA-WER with different price/speed tradeoffs. Cheapest listed endpoints include **Gemini 2.0 Flash Lite** (~**$0.19 / 1000 min**) with **~4.0%** AA-WER in their table.

Use the leaderboard to pick a **cloud** API when you need minimum WER and predictable latency; use **`faster-whisper` here** when you want **offline** processing and no per-minute API bill.

## JSON output contract

**Schema version:** success payloads include **`schema_version`** (currently **`"4"`**). Downstream tools can branch on it.

Success (fields vary slightly by `source_type`; always present: `ok`, `schema_version`, `transcript`, `segments`):

1. **Common**
   - `ok`: `true`
   - `schema_version`: `"4"`
   - `source_type`: `youtube` | `apple_podcast` | `local_file`
   - `transcript`: full text
   - `segments`: `[{"start": 0.0, "duration": 1.2, "text": "..."}, ...]`; with **`--diarize`**, each segment also has **`speaker`** (label from pyannote, overlap-matched to Whisper).

2. **Whisper paths** (`local_file`, `apple_podcast`): `transcription_mode` = `whisper_local`; plus `whisper_model`, `compute_type`, `compute_type_request`, `compute_type_resolution`, `language_requested`, `language_used`, `vad_filter`, `preprocess_audio`, `chunk_minutes` (or `null`), `chunk_minutes_resolution`, `auto_tune`, `tuning` (runtime snapshot when auto-tune is on), `media_duration_seconds_approx`, `quality_hints` (list of strings). When diarization ran: **`diarization_applied`:** `true`, **`transcript_by_speaker`**, **`transcript_speaker_formatted`**, and **`diarization_skipped_reason`:** `null`.

3. **YouTube captions:** `transcription_mode` = `youtube_captions`; `whisper_model` / `compute_type` are `null`; **`diarization_applied`:** `false`, **`diarization_skipped_reason`:** `youtube_captions_no_speaker_labels`.

4. **YouTube downloaded audio (Whisper):** `transcription_mode` = `youtube_audio_whisper`; **`youtube_audio_download`:** `true`; **`source_path`:** `null` (temp file removed after processing); same Whisper/diarization fields as `local_file`. Use **`--youtube-audio`** or **`--diarize`** on a YouTube URL to enter this mode.

Error (stderr, exit code 1):

```json
{
  "ok": false,
  "error": "description"
}
```
