---
name: transcript-media
description: Транскрибировать YouTube, Apple Podcasts и локальные медиафайлы в текст и отдавать структурированное саммари.
---

## Purpose

Единый независимый скилл транскрибации для внешнего использования вне Dex-специфики:

- YouTube URL
- Apple Podcasts URL
- Локальный аудио/видео файл

## Usage

- `/transcript-media` — затем передать URL или путь к файлу.
- Можно сразу: `/transcript-media https://www.youtube.com/watch?v=...`
- Можно сразу: `/transcript-media https://podcasts.apple.com/...`
- Можно сразу: `/transcript-media /Users/.../audio.mp3`

## Dependency

```bash
pip install -r packages/transcript-skill/requirements.txt
```

или:

```bash
pip install -e packages/transcript-skill
```

После editable-установки доступна команда **`transcript-media`** (тот же JSON, что у скрипта). Для предзагрузки весов Whisper (в репозиторий они **не** входят): **`download-whisper-weights large-v3`** или `python3 packages/transcript-skill/scripts/download_whisper_weights.py large-v3`.

Системно нужен `ffmpeg`:

```bash
ffmpeg -version
```

## Правила для агента (Dex / Cursor, обязательно)

1. **Вход пользователя:** не подменять файл или URL **тихим тестовым WAV** или другим образцом, если пользователь не просил именно проверку UI на фиктивном аудио.
2. **Сводка параметров:** `transcript-media` **всегда** печатает в **stderr** блок **«выбранные параметры»** перед планом (включая строку про **HF-токен** при необходимости диаризации). Не направлять **stderr** в `/dev/null`. Для JSON в файл использовать **`scripts/transcribe_to_log.sh`**, чтобы параметры и прогресс дублировались в терминал и в `.log`.
3. **Rich progress bar:** для полосы **`--progress-format rich`** (или **`auto`** в интерактивном терминале).
4. **Прозрачность:** в сообщении пользователю повторить **ту же** команду с явными флагами, что и у запуска.
5. **Перед `--diarize`:** проверить **`HF_TOKEN` / `HUGGINGFACE_HUB_TOKEN`** (или **`--hf-token`**). Иначе процесс падает на старте: таблица параметров в stderr будет, но **Rich progress** и Whisper не начнутся. Указать пользователю на пустой токен и на **`transcript-skill[diarize]`** + принятие условий pyannote на Hugging Face.

## Process

1. Принять вход (YouTube, Apple Podcasts, локальный файл).
2. Запустить:

```bash
python3 packages/transcript-skill/scripts/transcribe.py "URL_ИЛИ_ПУТЬ"
# или: transcript-media "URL_ИЛИ_ПУТЬ"
```

**JSON в файл и прогресс в терминале (долгие файлы).** Итоговый JSON — в **stdout** (`> файл.json`). План и прогресс — в **stderr**.

1. **Надёжно (рекомендуется):** скрипт **`packages/transcript-skill/scripts/transcribe_to_log.sh`** — stderr идёт в **`tee`**, поэтому строки видны **в окне терминала** и дописываются в лог без зависимости от **`/dev/tty`**:

```bash
packages/transcript-skill/scripts/transcribe_to_log.sh 00-Inbox/out.json 00-Inbox/out.stderr.log -- \
  --model large-v3 --compute-type float32 "/path/to/recording.mp4"
```

Перед запуском скрипт печатает в терминал пути к JSON/логу и строку аргументов. Сразу после старта Python в **stderr** идёт блок **«выбранные параметры»** (включая **путь к входному файлу**, `--model`, `--compute-type`, `--progress`, `--plan-only` и остальные флаги). Внутри скрипта **`tee` направлен в stderr оболочки (`>&2`)**, иначе копия stderr ошибочно попадала бы в тот же файл, что и JSON.

2. **Вручную `2> лог`:** по умолчанию тот же текст **дублируется в терминал** (сначала **`/dev/tty`**, при ошибке — **tty stdin**). Для **pipe** (`2> >(tee -a лог)`) отдельное зеркало **не** включается. Отключить зеркало: **`TRANSCRIPT_NO_TTY_MIRROR=1`**. Если зеркало не сработало, в начале **лога** будет строка **`TTY mirror failed`** — используйте **`transcribe_to_log.sh`** или **`tail -f лог`**. Скрипт **`transcribe.py`** с **`python3 -u`**.

Для **локальных файлов и Apple Podcasts** (не для YouTube с субтитрами) при необходимости:

- **`--language CODE`** — явный язык речи (стабильнее автоопределения).
- **`--model NAME`** — модель faster-whisper (например `large-v3`).
- **`--compute-type auto`** (по умолчанию) или `int8` / `float16` / … — авто-подбор: **CUDA** обычно **float16**, **Apple MPS и CPU** — **int8** (на MPS float16 у faster-whisper часто не поддерживается); **`--no-auto-tune`** отключает подстройку.
- **`--preprocess-audio`** — перед Whisper привести весь файл к mono 16 kHz WAV (полезно при шуме или музыке под речь).
- **`--chunk-minutes M`** — если длительность больше M минут, резать на куски (M от 3 до 240); таймкоды в `segments` склеены в глобальные; при авто-подстройке длина чанка может сузиться под память.
- **`--progress`** (по умолчанию) — процент выполнения в **stderr**; **`--no-progress`** выключает.
- **`--progress-format auto|rewrite|lines|rich`** — **`auto`**: полоса **Rich** (спиннер, процент, фаза), если доступен интерактивный терминал (**`stderr` — TTY** или открывается **`/dev/tty`** / tty **stdin**); иначе режим **lines** (строки `[transcript-media] …% …`). При **`2>log`** полоса всё равно возможна, если сессия видит TTY (отдельный **`Console`** для `Progress`). **`rewrite`** — одна строка с `\r`; **`rich`** — как **`auto`**, но без fallback на `rewrite`. Полный план параметров (CLI и итоговый план Whisper) пишется в **stderr**: на TTY — Rich-панели, в **файл** — тот же текст **без Rich** (читаемые секции и ключ/значение), чтобы в логе были все детали без escape-кодов. Для живого прогресса при записи в файл: **`tail -f log`**. Принудительно Rich в файл (ANSI в логе): **`TRANSCRIPT_RICH=1`**. Только plain: **`TRANSCRIPT_NO_RICH=1`**.
- **`--youtube-audio`** — для ссылок YouTube: скачать аудио и Whisper вместо субтитров; **`--diarize`** для YouTube включает этот путь автоматически.
- **`--diarize`** — разделение по говорящим после Whisper (нужны **`pip install -e ".[diarize]"`** и токен Hugging Face: **`HF_TOKEN`** или **`--hf-token`**). Для локального **видеофайла** (`.mp4` и т.д.) достаточно пути к файлу и этого флага.
- **`--plan-only`** — только для **существующего локального файла**: напечатать план в **stderr** и выйти **без** Whisper (быстрая проверка лога и зеркала в терминале; в JSON будет **`plan_only: true`**).

3. Получить JSON:
   - `ok: true` -> использовать `transcript` и `segments`; при **`--diarize`** также **`transcript_by_speaker`**, **`transcript_speaker_formatted`**, поле **`speaker`** в сегментах.
   - `ok: false` -> вернуть пользователю `error`, без выдумок.
4. Сформировать саммари:
   - краткое содержание;
   - ключевые темы;
   - опорные моменты по порядку (с временем, если есть сегменты);
   - практические action items (если явно следуют из содержания).

## Output style

- Саммари на языке исходного транскрипта.
- Без домыслов, только по фактическому тексту.

## Errors

- Missing dependency -> показать команду установки.
- Нет транскрипта/субтитров -> вернуть текст ошибки как есть.
- Некорректный URL/путь -> попросить корректный источник.
