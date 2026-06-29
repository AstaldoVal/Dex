---
name: substack-audio
description: Озвучка текстов Substack в MP3 — голос Verse, vibe art-instructor, скорость 1.0. Используй при запросе озвучить пост или обновить аудио для 1% Better at AI.
---

# Substack audio (1% Better at AI)

Как мы озвучиваем посты и страницы Substack в один MP3: скрипт, голос, настройки, файлы.

## Когда использовать

- Пользователь просит озвучить пост Substack, обновить аудио для «Start Here» или аналогичного поста.
- Нужно сгенерировать или перегенерировать MP3 из текста поста.

## Скрипт

- **Путь:** `.scripts/tts-export-mp3.cjs`
- **Зависимости:** `OPENAI_API_KEY` в `.env`, ffmpeg (паузы и склейка).

## Настройки озвучки (фиксированные для Substack)

- **Голос:** `verse` (OpenAI TTS).
- **Модель:** `gpt-4o-mini-tts` (поддерживает Verse и instructions).
- **Vibe (instructions):** пресет `art-instructor` — текст в `.scripts/tts-vibe-art-instructor.txt` (тон преподавателя: один акцент на предложение, плавная подача, без резких акцентов).
- **Скорость:** `1` (нормальная).

## Файлы

- **Текст поста (вход):** `04-Projects/One_Percent_AI_Start_Here_post.txt` (или другой .txt с текстом поста).
- **Инструкции по тону (vibe):** `.scripts/tts-vibe-art-instructor.txt`.
- **Выходной MP3:** по умолчанию `04-Projects/One_Percent_AI_Start_Here_audio.mp3` (можно указать другим аргументом).

## Команда

Из корня репо:

```bash
node .scripts/tts-export-mp3.cjs --voice verse --vibe art-instructor --speed 1 04-Projects/One_Percent_AI_Start_Here_post.txt 04-Projects/One_Percent_AI_Start_Here_audio.mp3
```

С другим входом/выходом:

```bash
node .scripts/tts-export-mp3.cjs --voice verse --vibe art-instructor --speed 1 <входной.txt> [выходной.mp3]
```

Если выходной файл не указан, используется `04-Projects/One_Percent_AI_Start_Here_audio.mp3`.

## Поведение скрипта

- Текст разбивается на сегменты: заголовки (например «1. What I'm committing to») и абзацы.
- Заголовки озвучиваются целиком; после заголовков и после абзацев перед следующим заголовком вставляется пауза 0.6 с (нужен ffmpeg).
- Markdown упрощается (поля, списки) перед отправкой в TTS.
- Для голоса Verse и vibe используется модель `gpt-4o-mini-tts`; instructions обрезаются до 1000 символов.

## Изменение текста перед озвучкой

Если пользователь прислал обновлённый текст поста:

1. Обновить `04-Projects/One_Percent_AI_Start_Here_post.txt` (или нужный .txt).
2. Запустить команду выше.
3. Итоговый файл: `04-Projects/One_Percent_AI_Start_Here_audio.mp3`.

## Другие голоса и скорость

- Полный список опций скрипта — в комментариях в начале `.scripts/tts-export-mp3.cjs`.
- Для Substack используем только: `--voice verse --vibe art-instructor --speed 1`.
