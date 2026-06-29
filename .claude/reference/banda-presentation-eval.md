# Banda: eval презентаций Google Slides

Канон для Roman и агента. Автопроверка: `npm run banda:slides-eval` (см. `.scripts/banda/eval_google_slides_deck.mjs`). Сборка: `.venv/bin/python` (создать: `python3 -m venv .venv && .venv/bin/pip install python-pptx google-api-python-client google-auth-oauthlib`).

## Дефолтная презентация (пятничный municipal pitch)

- **Название на Drive:** `Eighty85 - Municipal Pitch Deck (UK) - Strategic Call`
- **Presentation ID:** `1GC9k5-Zl0tDGH2WrWbCyRG3o0HScpB9jRuG4RHf0pOY`
- **Папка:** `Municipal pitch decks (Drafts)/Презентація для Муніціпалітета/` (work Google, `r.matsukatov@banda.io`)
- **Сборка из репо:** `python3 .scripts/banda/create_municipal_pitch_slides_ru.py` → заливает PPTX на существующий Slides ID
- **Финализация одной командой:** `npm run banda:municipal-pitch-finalize`

## Рабочие кейсы (workflow)

| ID | Сценарий | Что делает человек / агент | Автопроверка |
|----|----------|----------------------------|--------------|
| W1 | **create_deck** | Создать презентацию из шаблона Banda (pptx → Drive → native Slides) | `DECK_EXISTS` |
| W2 | **edit_text** | Заменить заголовки и тезисы по брифу | `EDIT_TEXT`, `COPY_EMPTY` |
| W3 | **add_block** | Добавить карточку / буллет / слайд | частично `BOUNDS`, `NO_OVERLAP` |
| W4 | **resize_block** | Подогнать размеры фигур и шрифта | `BOUNDS`, `TEXT_OVERFLOW` (pptx), `HEADING_HIERARCHY` |
| W5 | **copy_deck** | Копия файла на Drive для варианта (RU/EN) | ручной чеклист в skill |
| W6 | **municipal_pitch** | Муниципальный угол, без внутренней операционки | `MUNICIPAL_FOCUS` |
| W7 | **sync_bundle** | После правок Obsidian/медиа в bundle — синк на Drive | `npm run banda:presentations-bundle-drive-sync:media-only` |
| W8 | **typography_pass** | Одинаковые уровни заголовков по слайдам | `HEADING_HIERARCHY`, `SUBTITLE_HIERARCHY` |

## Gate-коды (автоматические)

| Gate | pass | fail (пример) |
|------|------|----------------|
| `DECK_EXISTS` | API вернул ≥8 слайдов | 401 / пустая дека |
| `EDIT_TEXT` | На каждом слайде ≥1 текстовый блок ≥15 символов | пустой слайд |
| `HEADING_HIERARCHY` | Размер главного заголовка (shape 1 или max в верхней трети) на слайдах 2–10 в пределах ±4 pt от медианы | 32 pt vs 22 pt |
| `SUBTITLE_HIERARCHY` | Подзаголовки (второй по величине шрифт на слайде) ±3 pt между слайдами | разброс >3 pt |
| `BOUNDS` | Текстовые фигуры внутри полей: слева ≥48 pt, справа ≤ ширина−48 pt, низ ≤ высота−48 pt | элемент за краем |
| `NO_OVERLAP` | Пары текстовых блоков с площадью >25k EMU²: пересечение <12% меньшей площади | два абзаца друг на друге |
| `TITLE_SLIDE_TEXT_OVERLAP` | **Слайд 1:** любые два текстовых блока — пересечение <5% меньшей площади | H1 и подзаголовок/футер наезжают |
| `TITLE_SLIDE_LOGO_TEXT_OVERLAP` | **Слайд 1:** картинка логотипа vs верхние текстовые блоки — пересечение <3% площади текста | «Eighty85» визуально режет заголовок |
| `TITLE_SLIDE_HERO_LOGO` | **Слайд 1:** есть крупный (≥72 pt) логотип по центру **над** H1 | нет hero или логотип под заголовком |
| `TITLE_SLIDE_NO_CORNER_LOGO` | **Слайд 1:** нет компактного логотипа в правом верхнем углу | угловой mark как на слайдах 2+ |
| `TITLE_SLIDE_STACK_GAPS` | **Слайд 1:** отступ заголовок↔подзаголовок = подзаголовок↔линия (24 pt ±3) | слипшийся H1/sub или разный зазор до полоски |
| `TITLE_SLIDE_MIDDLE_VOID` | **Слайд 1:** блок logo+H1+sub над футером; подзаголовок→линия ≤30 pt; H1 не перекрывает центр логотипа | пустота или «Eighty85» под текстом |
| `COPY_LENGTH` | Нет абзаца >360 символов; строка заголовка ≤100 символов | простыня текста |
| `COPY_EMPTY` | Нет `$393`, `393T`, `580B`, `TAM`, `lorem` | шаблонный TAM не переписан |
| `MUNICIPAL_FOCUS` | В тексте деки есть «громад» или «муніципал»; нет глобального TAM | не тот фокус |
| `ICON_INSIDE_CARD_BOUNDS` | **Слайд «Екосистема учасників»:** иконки внутри белых карточек с отступом ≥8 pt | иконка выступает из карточки |
| `LABEL_ICON_ALIGNMENT` | Подпись роли справа от иконки, по вертикали ±9 pt с центром иконки | текст над/под иконкой или наезжает |
| `CONTRAST_ON_FILLED_SHAPES` | На фиолетовом hub нет тёмного текста (Trust Layer — светлый) | чёрный текст на brand purple |
| `MUNICIPAL_ASK_CARD_ORDER` | **Слайд 12:** слева направо заголовки `1.` … `4.` (Підписати → Призначити → Передати → Підтвердити); в колонке 1 нет «2.» | «3.» во 2-й колонке, пункт 2 в карточке 1 |
| `CARD_CHECKLIST_FONT_UNIFORM` | **Слайд 12:** в каждой карточке тело/подпункты одного размера (±1 pt); крупнее только заголовок `N.` | скачок 10 pt vs 14 pt в одной карточке |

## Ручные критерии (после зелёного eval)

1. Заголовки читаются с расстояния 2 м (нет 3+ строк в title без переноса).
2. На слайдах с карточками подзаголовок не наезжает на карточки (визуально в UI).
3. Нет служебных фраз про vault, markdown, Cursor, eval.
4. **Слайд 1:** крупный логотип по центру **над** H1; без углового логотипа; H1+подзаголовок под логотипом; тонкая линия → «Презентація…» → «Eighty85 • …» внизу — без пустоты и пересечений (gates `TITLE_SLIDE_*`, визуально в UI).
5. **Слайд 12:** четыре карточки 1–4; в карточке 2 подпункты с отступом под «2. Призначити», не отдельным пунктом «2.» в карточке 1.
6. **Слайд 13 «Екосистема учасників»:** иконки внутри карточек, подписи в одну линию с иконкой, Trust Layer белым на фиолетовом hub.

## Отчёт

- JSON: `04-Projects/Banda/banda-drive-import/presentation-eval-latest.json`
- Exit 0 — все gate pass; exit 1 — есть fail (список в stderr и JSON).

## OAuth

- **Сборка / Drive upload:** work token `Credentials/google-work/google_drive_token.json` (как в `create_municipal_pitch_slides_ru.py`).
- **Slides API read для eval:** по умолчанию `--auth work`; fallback `--auth slides` (`GOOGLE_SLIDES_REFRESH_TOKEN` в `.env`).

При `invalid_grant` на work: обновить work Drive OAuth (не трогать personal Slides token). При slides — `.cursor/rules/google-slides-oauth-self-heal.mdc`.
