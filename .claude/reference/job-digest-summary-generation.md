# Job Digest Summary Generation

Система автоматически генерирует resume summary для каждой вакансии в дайджесте.

## Как это работает

1. **Парсинг LinkedIn страницы**: При создании дайджеста система автоматически парсит страницу каждой вакансии на LinkedIn и извлекает полное job description

2. **Определение типа вакансии**: Система анализирует job description и определяет тип:
   - **iGaming/compliance** → использует `CV Examples/Product Manager (Gambling Platform, Early-Stage) - Compliance Focus.md`
   - **AI/tech** → использует `CV Examples/Roman Matsukatov - CV.md`

3. **Генерация summary**: После парсинга job description автоматически генерируется 3-параграфный summary с подбором ключевых слов (90-100% match)

4. **Добавление к вакансии**: Summary автоматически добавляется к каждой вакансии в дайджесте

## Использование

### Автоматическая генерация

При запуске `/job-digest`:
1. Система парсит страницы вакансий на LinkedIn и извлекает job description
2. Автоматически определяет тип вакансии (iGaming/compliance vs AI/tech)
3. Выбирает правильное CV
4. Генерирует summary для каждой вакансии
5. Добавляет summary к вакансиям в дайджесте

**Требования:**
- LinkedIn сессия должна быть настроена (используйте `linkedin_login` MCP tool)
- Playwright должен быть установлен: `pip install playwright && playwright install chromium`
- Summary генерируются автоматически Claude в Cursor контексте при обработке дайджеста

### Ручная генерация через MCP

Используйте MCP инструменты для генерации summary:

```python
# Определить тип вакансии
detect_job_type(
    job_description="Full job description...",
    job_title="Senior Product Manager"
)

# Сгенерировать summary
generate_job_summary(
    job_description="Full job description...",
    job_title="Senior Product Manager",
    company="Relativity",
    job_url="https://linkedin.com/jobs/view/123456"
)
```

### Ручная генерация через skill

Используйте `/job-summary` skill с полным job description:

```
/job-summary [вставить job description]
```

Система автоматически определит тип вакансии и выберет правильное CV.

## Формат в дайджесте

```markdown
- [ ] [Senior Product Manager - AI Search · Relativity · Remote](URL)

Senior Product Manager with 12+ years building AI-powered...

[Summary paragraph 2]

[Summary paragraph 3]

**Suggested questions:**
- Question 1
- Question 2
- Question 3
```

## Требования

1. **MCP сервер**: Убедитесь, что `job-digest` MCP сервер подключен (`.claude/mcp/job-digest.json`)

2. **Зависимости**: Установите Python зависимости:
   ```bash
   pip install -r core/mcp/requirements-job-digest.txt
   ```

3. **Генерация summary**: Выполняется Claude в контексте Cursor через `/job-summary` skill или напрямую в Cursor. MCP сервер подготавливает данные (тип вакансии, выбор CV, ключевые слова), а сам summary генерируется в Cursor.

## Логика определения типа

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

**Правило**: Если найдены iGaming ключевые слова и их количество >= AI ключевых слов → `igaming`, иначе → `ai`

## Troubleshooting

### Summary не генерируется автоматически
- Проверьте, что LinkedIn сессия активна (используйте `linkedin_login` MCP tool)
- Убедитесь, что Playwright установлен: `pip install playwright && playwright install chromium`
- Пайплайн: step1 (парсер) → step2 (фильтр remote + компании) → step3 (саммари) → step4 (Teal). Без пропусков.
- Если парсинг не работает, используйте `/job-summary` skill с job description для ручной генерации

### Неправильный тип вакансии
- Проверьте ключевые слова в job description
- Можно вручную указать нужное CV при использовании `/job-summary` skill

### CV файл не найден
- Убедитесь, что оба CV файла существуют:
  - `CV Examples/Roman Matsukatov - CV.md`
  - `CV Examples/Product Manager (Gambling Platform, Early-Stage) - Compliance Focus.md`

## Дополнительная информация

См. `core/mcp/JOB_DIGEST_README.md` для полной документации MCP сервера.
