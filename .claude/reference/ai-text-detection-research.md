# Ресерч: проверка «текст написан AI или человеком»

Обзор доступного функционала (API, open-source, self-hosted) для детекции AI-текста и варианты интеграции в Dex.

---

## 1. Облачные API (SaaS)

### GPTZero

- **Что даёт:** вероятность AI по документу, по предложениям и параграфам; поддержка batch-файлов (PDF, DOCX и др.).
- **Точность:** по независимым тестам — ~99.3% accuracy, ~0.24% false positive; умеет детектировать GPT-5, Gemini 2.5, Claude Sonnet.
- **API:** REST, доки — [gptzero.stoplight.io](https://gptzero.stoplight.io/), примеры на Node, Python, C#, Java, PHP. Ключ: app.gptzero.me/api.
- **Лимиты:** до 150k символов на документ, batch до 50 файлов.
- **Цена:** от **$45/мес** (300k слов), далее $135 / $250 / $550 / $1000 / $1850 за 1M / 2M / 5M / 10M / 20M слов; свыше квоты — $150 за 1M слов.
- **Плюсы:** сильная точность и низкий false positive, актуальные модели.
- **Минусы:** дорого при больших объёмах.

### Copyleaks

- **Что даёт:** AI Text Detection API; смешанный контент (AI внутри человеческого); объяснения, почему фрагмент помечен как AI; уровни чувствительности (1–3); 30+ языков; PDF, DOCX.
- **Точность:** в разных тестах 90–99%; низкий false positive; независимые исследования.
- **API:** [docs.copyleaks.com](https://docs.copyleaks.com/concepts/products/ai-text-detection-api) — гайды и reference; обнаружение манипуляций (спиннеры, скрытые символы и т.д.).
- **Цена:** план **AI Detector ~$9.99/мес** (API включён, 2 пользователя); AI + Plagiarism ~$16.99/мес. Лимиты до ~300 сканов/мин (сотни тысяч кредитов в день).
- **Плюсы:** дёшево для старта, объяснения (AI Logic), манипуляции, enterprise (SOC 2, GDPR).
- **Минусы:** точность в отдельных бенчмарках ниже GPTZero.

### Sapling.ai

- **Что даёт:** один score 0–1 по тексту; опционально — по предложениям и по токенам; heatmap (HTML) для визуализации; до 200k символов на запрос.
- **Модели:** GPT, Gemini, Claude, Llama, Mistral и др.
- **API:** POST `api.sapling.ai/api/v1/aidetect`, JSON (key, text, sent_scores, score_string). Доки: [sapling.ai/docs/api/detector](https://sapling.ai/docs/api/detector/).
- **Цена:** бесплатный tier — **50k символов/день, 250k/месяц**. Продакшен — usage-based, детали по sales@sapling.ai.
- **Плюсы:** бесплатный лимит для тестов и лёгкой интеграции; токен- и sentence-level.
- **Минусы:** на длинных текстах рекомендуют чанковать; точность как у всех — есть trade-off false positive/negative.

### Originality.ai

- **Что даёт:** AI detection, plagiarism, readability, factual accuracy, grammar; scan URL и batch scan.
- **Точность:** заявлено ~95% по AI; в сторонних тестах ~83% accuracy, ~4.79% false positive; слабее на новых моделях (например, Gemini).
- **API:** v3, доки — [docs.originality.ai](https://docs.originality.ai/); эндпоинты: Scan, Scan URL, Batch Scan, Get Scan Results, Credit Balance.
- **Плюсы:** один API для AI + plagiarism + качество контента; удобно для контент-редакций.
- **Минусы:** не лидер по одной лишь AI-детекции; чувствительность может давать лишние срабатывания.

### Pangram

- **Что даёт:** Python SDK и REST API для детекции AI-контента.
- **Цена:** гибкая по объёму; для некоммерческих/исследовательских проектов — бесплатные кредиты (уточнять на [pangram.com](https://www.pangram.com/solutions/api)).
- **Плюсы:** возможность бесплатного использования в research.
- **Минусы:** меньше публичных бенчмарков и отзывов.

---

## 2. Open-source / self-hosted

### HumanMark

- Open-source детектор AI-контента (текст, изображения, аудио, видео).
- Self-hosted, офлайн, без облачных зависимостей, есть Docker.
- Репозиторий: искать по названию (на момент ресерча ссылка не открылась — проверить актуальный URL).

### Desklib AI Text Detector (GitHub)

- Классификатор «human vs AI» на базе fine-tuned **microsoft/deberta-v3-large** (английский текст).
- Устойчивость к некоторым adversarial-изменениям текста.
- Подходит для self-hosted или своего пайплайна.

### SuperAnnotate Generated Text Detector

- Open-source модель для детекции AI-текста; в бенчмарках показывала высокие результаты.
- Статья: [superannotate.com/blog/ai-content-detection](https://www.superannotate.com/blog/ai-content-detection-superannotate).

### AI Text Detection Tool (MichaelShpyl, GitHub)

- Стек: FastAPI, fine-tuned RoBERTa, веб-UI, Plotly Dash, React, Chrome extension.
- LIME-объяснимость: какие слова сильнее влияют на предсказание.
- Развёртывание через Docker.

### Итог по open-source

- Плюсы: нет ежемесячной платы, данные не уходят в облако, можно дообучить под свой домен.
- Минусы: нужно поднимать и поддерживать инфраструктуру; модели чаще под английский; отставание от коммерческих по новым LLM.

---

## 3. Ограничения детекции в принципе

- Любой детектор даёт **false positives** (человеческий текст помечен как AI) и **false negatives** (AI пропущен).
- Небольшие правки AI-текста могут снижать срабатывание.
- Шаблонный/формальный человеческий текст чаще помечается как AI.
- По мере эволюции LLM детекторы требуют обновлений; коммерческие сервисы обычно быстрее адаптируются.

---

## 4. Бесплатные варианты для кросс-чека (без бюджета)

Несколько независимых бесплатных источников дают возможность сверять результаты: если 2–3 детектора сходятся — выше уверенность; если расходятся — повод переписать или не полагаться на один вывод.

### Вариант A: Sapling.ai (API, free tier)

- **Лимиты:** 50 000 символов/день, 250 000/месяц.
- **Регистрация:** бесплатный аккаунт, API key в [sapling.ai](https://sapling.ai) → API.
- **Формат:** POST `https://api.sapling.ai/api/v1/aidetect`, body `{ "key": "<API_KEY>", "text": "..." }`.
- **Ответ:** `score` 0–1 (1 = уверенность что AI), опционально `sentence_scores`, `tokens` + `token_probs`.
- **Доки:** [sapling.ai/docs/api/detector](https://sapling.ai/docs/api/detector/).

### Вариант B: ZeroGPT (через RapidAPI, free tier)

- **Лимиты:** 100 запросов/месяц на бесплатном плане RapidAPI (Basic).
- **Регистрация:** аккаунт RapidAPI, подписка на API «ZeroGPT» (mediarayekme/api/zerogpt).
- **Формат:** POST на эндпоинт RapidAPI для ZeroGPT, body `{ "input_text": "..." }`.
- **Ответ:** `is_human_written` (0–100), `is_gpt_generated` (0–100), `gpt_generated_sentences`, `feedback_message`.
- **Ссылки:** [zerogpt.net/api-integration](https://zerogpt.net/api-integration), [rapidapi.com/mediarayekme/api/zerogpt](https://rapidapi.com/mediarayekme/api/zerogpt) (pricing: 100 req/mo free).

### Вариант C: Локальная модель (Hugging Face Transformers)

- **Лимиты:** нет (зависит только от своего железа).
- **Регистрация:** не нужна; нужен Python, `pip install transformers torch`.
- **Модели (на выбор одна для кросс-чека):**
  - `roberta-base-openai-detector` (OpenAI, под GPT-2-стиль; MIT).
  - `ahmediqbal/ai-text-detector-model` (DistilBERT, ChatGPT/GPT-2/3; Apache 2.0).
  - `JinalShah2002/distilbert-detector` (эссе LLM vs human; порог ~0.7).
- **Формат:** скрипт загружает модель, принимает текст, возвращает метку или вероятность (AI/human).
- **Плюсы:** полная бесплатность, данные не уходят в облако; разный «движок» относительно A и B.
- **Минусы:** английский ориентированность; модели слабее на новейших LLM (Claude, Gemini и т.д.).

### Вариант D: Pangram (по запросу, research)

- **Лимиты:** бесплатные кредиты для некоммерческих/исследовательских проектов — уточнять у Pangram.
- **Регистрация:** запрос на [pangram.com](https://www.pangram.com/solutions/api).
- Удобен как третий/четвёртый источник, если одобрят грант.

### Схема кросс-чека в Dex

1. **Минимум два источника:** например Sapling (A) + ZeroGPT (B). Один скрипт или MCP: отправить один и тот же текст в оба API, вывести оба результата (score / % AI) и краткий вердикт (согласны / расходятся).
2. **Третий источник:** локальная модель (C) — без лимитов по запросам, другой тип модели; или Pangram (D), если есть доступ.
3. **Интерпретация:** если A и B оба дают «высокий AI» — текст скорее всего воспримется как AI; если один «human», другой «AI» — считать неуверенным и при необходимости переписать/отредактировать (например, по anti-ai-voice).

Переменные окружения для скрипта/MCP: `SAPLING_API_KEY`, `RAPIDAPI_KEY` (и подписка на ZeroGPT на RapidAPI). Локальная модель — без ключей.

---

## 5. Варианты использования в Dex

| Вариант | Когда уместен | Реализация |
|--------|----------------|------------|
| **Кросс-чек бесплатно** | Нет бюджета; нужна проверка cover letter, summary, постов. | Один скрипт/MCP: запрос к Sapling + ZeroGPT (и опц. локальная модель); вывести оба результата и сводку. |
| **Sapling (free tier)** | Редкие проверки: до 50k символов/день. | POST текст → score + опционально sentence_scores. |
| **ZeroGPT (RapidAPI free)** | Второй голос в кросс-чеке: до 100 запросов/мес. | POST input_text → is_gpt_generated %, gpt_generated_sentences. |
| **Локальная модель (HF)** | Третий голос, без лимитов и облака; английский. | Python + transformers, скрипт или локальный API. |
| **Copyleaks** | Платный, но дёшево; объяснения и смешанный контент. | REST API, API key в env. |
| **GPTZero** | Максимальная точность; платный. | API по их доке. |

Рекомендация при **нулевом бюджете**: связка **Sapling (A) + ZeroGPT (B)** для кросс-чека; при желании добавить **локальную модель (C)** как третий независимый источник.

---

## 6. Ссылки

- GPTZero API: [gptzero.me/developers](https://gptzero.me/developers), [gptzero.stoplight.io](https://gptzero.stoplight.io/)
- Copyleaks AI Detection: [docs.copyleaks.com/concepts/products/ai-text-detection-api](https://docs.copyleaks.com/concepts/products/ai-text-detection-api)
- Sapling AI Detector: [sapling.ai/docs/api/detector](https://sapling.ai/docs/api/detector/), [sapling.ai/docs/usage-pricing](https://sapling.ai/docs/usage-pricing/)
- ZeroGPT API (RapidAPI): [zerogpt.net/api-integration](https://zerogpt.net/api-integration), [rapidapi.com/mediarayekme/api/zerogpt](https://rapidapi.com/mediarayekme/api/zerogpt)
- Hugging Face: [roberta-base-openai-detector](https://huggingface.co/openai-community/roberta-base-openai-detector), [ai-text-detector-model](https://huggingface.co/ahmediqbal/ai-text-detector-model), [distilbert-detector](https://huggingface.co/JinalShah2002/distilbert-detector)
- Originality.ai API: [docs.originality.ai](https://docs.originality.ai/)
- Pangram: [pangram.com/solutions/api](https://www.pangram.com/solutions/api)
- Сравнение точности (GPTZero vs Copyleaks vs Originality): [gptzero.me/news](https://gptzero.me/news/gptzero-vs-copyleaks-vs-originality/)
