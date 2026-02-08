# Job Digest MCP Server

Автоматически генерирует resume summary для вакансий из дайджеста. Определяет тип вакансии (iGaming/compliance vs AI/other) и выбирает подходящее CV.

## Возможности

1. **Определение типа вакансии**: Автоматически определяет, является ли вакансия iGaming/compliance или AI/tech
2. **Выбор CV**: Выбирает правильное резюме на основе типа вакансии:
   - `CV Examples/Roman Matsukatov - CV.md` - для AI/tech вакансий
   - `CV Examples/Product Manager (Gambling Platform, Early-Stage) - Compliance Focus.md` - для iGaming/compliance вакансий
3. **Генерация summary**: Создает 3-параграфный summary с подбором ключевых слов (90-100% match)

## Установка

1. Установите зависимости:
```bash
pip install -r core/mcp/requirements-job-digest.txt
playwright install chromium
```

2. Настройте LinkedIn сессию (требуется для парсинга job description):
```bash
# Используйте linkedin_login MCP tool в Cursor для входа в LinkedIn
```

3. Добавьте MCP сервер в конфигурацию Cursor (уже создан `.claude/mcp/job-digest.json`)

**Примечание**: 
- Парсинг job description выполняется через Playwright (требует LinkedIn сессию)
- Генерация summary выполняется автоматически Claude в Cursor контексте при обработке дайджеста
- Скрипт добавляет специальные маркеры `<!-- AUTO_SUMMARY:... -->` в дайджест
- При открытии/обработке дайджеста в Cursor, summary генерируются автоматически

## Использование

### Через MCP инструменты

#### 1. Определить тип вакансии
```python
detect_job_type(
    job_description="Senior Product Manager for AI-powered search...",
    job_title="Senior Product Manager - AI Search"
)
# Returns: 'ai' or 'igaming'
```

#### 2. Сгенерировать summary для одной вакансии
```python
generate_job_summary(
    job_description="Full job description text...",
    job_title="Senior Product Manager",
    job_url="https://linkedin.com/jobs/view/123456",
    company="Relativity"
)
# Returns: {
#   "job_type": "ai",
#   "cv_path": "...",
#   "summary": "3 paragraphs...",
#   "suggested_questions": ["question 1", "question 2"],
#   "keywords": {...}
# }
```

#### 3. Обработать весь дайджест
```python
generate_digest_summaries("linkedin-jobs-2026-02-06.md")
# Returns: список вакансий с определенными типами и выбранными CV
```

### Интеграция со скриптами

Скрипт `parse-linkedin-job-emails.cjs` автоматически поддерживает добавление summary к вакансиям, если summary доступно в объекте job.

Формат в дайджесте:
```markdown
- [ ] [Title · Company · Type](URL)

[Summary paragraph 1]

[Summary paragraph 2]

[Summary paragraph 3]

**Suggested questions:**
- Question 1
- Question 2
- Question 3
```

## Логика определения типа вакансии

### iGaming/compliance ключевые слова:
- igaming, gambling, casino, sportsbook, betting, wagering
- compliance, regulatory, MGA, UKGC, Curacao
- gaming license, responsible gaming, player protection
- AML, KYC, gaming platform, live casino, bingo, lottery

### AI/tech ключевые слова:
- AI, artificial intelligence, LLM, machine learning, ML
- chatbot, NLP, vector database, semantic search, agentic
- OpenAI, Azure OpenAI, GPT, Claude, generative AI
- data science, data analytics, search, retrieval, RAG

Если найдены iGaming ключевые слова и их количество >= AI ключевых слов → `igaming`
Иначе → `ai`

## Генерация summary

Summary генерируется Claude в контексте Cursor. MCP сервер подготавливает данные:
- Определяет тип вакансии
- Выбирает правильное CV
- Извлекает ключевые слова
- Возвращает структурированные данные

Затем используйте `/job-summary` skill или генерируйте summary напрямую в Cursor, используя подготовленные данные.

### Формат summary:
1. **Первый параграф**: Title/level + 12+ years of experience + 1-2 domains
2. **Второй параграф**: Clear strengths that answer job requirements
3. **Третий параграф**: Additional relevant experience

### Правила:
- Максимум 3 параграфа
- Без bold форматирования
- Только факты из CV и confirmed-facts (не выдумывать опыт)
- Использовать точные ключевые слова из job description
- Output на английском

## Примеры использования

### Пример 1: AI вакансия
```python
result = generate_job_summary(
    job_description="Senior Product Manager for AI Search...",
    job_title="Senior Product Manager - AI Search",
    company="Relativity"
)
# job_type: "ai"
# cv_path: "CV Examples/Roman Matsukatov - CV.md"
```

### Пример 2: iGaming вакансия
```python
result = generate_job_summary(
    job_description="Compliance Product Manager for iGaming platform...",
    job_title="Compliance Product Manager",
    company="Pin-Up"
)
# job_type: "igaming"
# cv_path: "CV Examples/Product Manager (Gambling Platform, Early-Stage) - Compliance Focus.md"
```

## Troubleshooting

### Summary не генерируется автоматически
- MCP сервер подготавливает данные, но не генерирует summary напрямую
- Используйте `/job-summary` skill с job description для генерации summary
- Или используйте данные из `generate_job_summary` для генерации в Cursor контексте

### Неправильный тип вакансии
- Проверьте ключевые слова в job description
- Можно вручную указать тип через параметр `job_type` (если добавить в будущем)

### CV файл не найден
- Убедитесь, что оба CV файла существуют:
  - `CV Examples/Roman Matsukatov - CV.md`
  - `CV Examples/Product Manager (Gambling Platform, Early-Stage) - Compliance Focus.md`
