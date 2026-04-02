# Anthropic Skills — маркетплейс и плагины

Репозиторий: https://github.com/anthropics/skills

В маркетплейсе **anthropic-agent-skills** доступны **два плагина**. Каждый плагин — это набор skills.

---

## 1. document-skills (набор для документов)

**Описание:** Обработка документов: Excel, Word, PowerPoint, PDF.

**Skills в плагине:**
- docx — создание и редактирование .docx
- pptx — презентации .pptx
- xlsx — таблицы .xlsx
- pdf — извлечение текста/таблиц, формы, объединение PDF

**В Dex уже установлено** (локальные копии в `.claude/skills/`):
- anthropic-docx
- anthropic-pptx
- anthropic-pdf
- anthropic-xlsx

Дополнительно ставить в Cursor не нужно: эти skills уже доступны по имени (например, «используй docx skill» или работа с .docx/.pptx/.xlsx/.pdf).

**Установка в Claude Code** (если пользуешься):
```bash
/plugin marketplace add anthropics/skills
# затем: Browse and install plugins → anthropic-agent-skills → document-skills → Install now
```
или одной командой:
```bash
/plugin install document-skills@anthropic-agent-skills
```

---

## 2. example-skills (примеры и дизайн/разработка) — 12 skills

**Описание:** Примеры навыков: создание skills, MCP, визуальный дизайн, алгоритмическое искусство, внутренние коммьюникейшн, тестирование веб-приложений, артефакты, Slack GIF, темы.

**Полный список 12 skills в плагине:**
1. algorithmic-art
2. brand-guidelines
3. canvas-design
4. doc-coauthoring
5. frontend-design
6. internal-comms
7. mcp-builder
8. skill-creator
9. slack-gif-creator
10. theme-factory
11. web-artifacts-builder
12. webapp-testing

**Соответствие репо ↔ Dex и назначение:**

| Skill в репо | В Dex (если есть) | Назначение |
|--------------|-------------------|------------|
| algorithmic-art | anthropic-algorithmic-art | Алгоритмическое искусство (p5.js и т.п.) |
| brand-guidelines | anthropic-brand-guidelines | Бренд-гайдлайны и стиль |
| canvas-design | anthropic-canvas-design | Визуальный дизайн на «холсте» |
| doc-coauthoring | anthropic-doc-coauthoring | Совместное написание документов |
| frontend-design | anthropic-frontend-design | Фронтенд-дизайн и вёрстка |
| internal-comms | anthropic-internal-comms | Внутренние коммуникации (статусы, апдейты) |
| mcp-builder | anthropic-mcp-builder | Создание MCP-серверов |
| skill-creator | anthropic-skill-creator | Создание новых skills |
| slack-gif-creator | anthropic-slack-gif-creator | GIF для Slack |
| theme-factory | anthropic-theme-factory | Темы оформления (слайды, доки, лендинги) |
| web-artifacts-builder | anthropic-web-artifacts-builder | Сложные веб-артефакты (React, Tailwind, shadcn) |
| webapp-testing | anthropic-webapp-testing | Тестирование веб-приложений (Playwright) |

**В Dex уже установлено:** все перечисленные выше есть в `.claude/skills/` с префиксом `anthropic-*`.

**Установка в Claude Code:**
```bash
/plugin install example-skills@anthropic-agent-skills
```

---

## Все skills в репозитории Anthropic (по папкам)

- algorithmic-art
- brand-guidelines
- canvas-design
- doc-coauthoring
- docx
- frontend-design
- internal-comms
- mcp-builder
- pdf
- pptx
- skill-creator
- slack-gif-creator
- theme-factory
- web-artifacts-builder
- webapp-testing
- xlsx

**Итого:** 16 skills; в маркетплейсе они сгруппированы в 2 плагина: **document-skills** (4) и **example-skills** (12).

---

## Сводка

- **document-skills** — docx, pptx, xlsx, pdf. В Dex уже есть как anthropic-docx, anthropic-pptx, anthropic-pdf, anthropic-xlsx.
- **example-skills** — остальные 12 skills. В Dex уже есть как anthropic-algorithmic-art, anthropic-brand-guidelines, … anthropic-webapp-testing.

Устанавливать плагины в Cursor/Dex не требуется: соответствующие skills уже скопированы в воркспейс. Команды `/plugin install` нужны только для Claude Code или claude.ai.
