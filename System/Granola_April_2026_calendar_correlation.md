# Granola × Google Calendar (primary), April 2026

Granola titles come from the local Granola cache export. Calendar titles from `gcal_get_events` (primary) for 2026-04-01 … 2026-04-30.

Matching rule: take `google_calendar_event.start` when present, else note creation time; among primary calendar events starting within ±12 minutes (same local wall clock as MCP `start` strings), prefer the one whose title equals `google_calendar_event.summary` from Granola when that summary exists, otherwise the closest start time.

## Vault display titles (Roman, 2026-05-10)

В заметках добавлено поле `vault_display_title` и переименованы файлы под новый slug. Исходное `granola_title` из кэша сохранено в frontmatter.

- **2026-04-21** — `Interview with Company` → **Interview with Company (Brainrocket)** — `00-Inbox/Meetings/Granola-2026-04/2026-04-21--interview-with-company-brainrocket--3b0aedcf.md`
- **2026-04-22** — `2 Interview — Roman Matsukatov — Product Manager` → **2 Interview — Roman Matsukatov — Product Manager (Brainrocket)** (компания по контексту рядом с Brainrocket 21 и 24 апреля; в заметке есть оговорка) — `.../2026-04-22--2-interview-roman-matsukatov-product-manager-brainrocket--ac3c2a6e.md`
- **2026-04-22** — `Identity graph...` → **Kyrylo / Roman (Banda) — identity graph and user resolution** — `.../2026-04-22--kyrylo-roman-banda-identity-graph--04f9ebd3.md`
- **2026-04-24** — `Roman Matsukatov // Product Lead // HR screen` → с суффиксом **(Darya — madeofstorm.com)** — `.../2026-04-24--roman-matsukatov-product-lead-hr-screen-darya-madeofstorm--50ad923f.md`
- **2026-04-24** — `Interview with Company` → **Interview with Company (Brainrocket)** — `.../2026-04-24--interview-with-company-brainrocket--2e592da1.md`
- **2026-04-28** — `Короткая прогулка или зарядка` (календарь) → **Product Manager - HR (Roman Matsukatov) (Dinarys)** — `.../2026-04-28--product-manager-hr-roman-matsukatov-dinarys--3078289d.md`
- **2026-04-29** — `Interview_Roman Matsukatov_Product Owner/CPO` → суффикс **(Nataliia B — prostaff.agency)** — `.../2026-04-29--interview-product-owner-cpo-nataliia-b-prostaff--7f2d946b.md`
- **2026-04-29** — `Проект MVP...` → **Зустріч | Тураєв Кирило — Роман Мацукатов (Banda)** — `.../2026-04-29--zustrich-turaiev-kyrylo-roman-matsukatov-banda--dc8f9f6f.md`
- **2026-04-29** — `Project Cases...` → суффикс **(Dinarys)** — `.../2026-04-29--project-cases-product-manager-roman-matsukatov-dinarys--79fc7ea5.md`
- **2026-04-30** — `Offer Call` → **Offer Call (Banda)** — `.../2026-04-30--offer-call-banda--d106e909.md`

## Rows where titles differ (needs rename decision)

- **2026-04-28:** в primary слот был **«Короткая прогулка или зарядка»**, фактически **Product Manager - HR (Roman Matsukatov) (Dinarys)** — в заметке зафиксировано как `calendar_slot_label_mismatch` и `vault_display_title`.

## Подсказки вручную (Granola без привязки к событию календаря в кэше)

У четырёх заметок в Granola нет блока `google_calendar_event` в локальном кэше, поэтому автоматическое сопоставление по времени события не сработало. Имеет смысл открыть календарь на тот же день и сопоставить по смыслу:

- **2026-04-30, Granola «Настройка и обзор проекта Zara Monitor с Roman Matsukatov»** — в primary в этот день есть **«Zara case (Roman+Ksenia)»** (16:00). Вероятно одна и та же встреча, но названия разные: оставить в заметке канон из календаря или из Granola по твоему правилу нейминга.
- **2026-04-30, Granola «Health analysis request and consultation with medical professional»** — явного одноимённого слота в выгрузке primary за апрель нет; поиск по дню 30 апреля вручную (или другой календарь, не primary).
- Два пункта ниже переименованы в vault (см. блок выше), автоматический NO_MATCH по кэшу сохраняется для истории.

## Rows with no calendar match in ±12 minutes

- **Granola:** Identity graph and user resolution strategies in digital advertising
  - **GCE start (if any):** —
  - **Note file:** `00-Inbox/Meetings/Granola-2026-04/2026-04-22--kyrylo-roman-banda-identity-graph--04f9ebd3.md`

- **Granola:** Проект MVP и корпоративная инфраструктура стартапа с Романом Матсукатовым
  - **GCE start (if any):** —
  - **Note file:** `00-Inbox/Meetings/Granola-2026-04/2026-04-29--zustrich-turaiev-kyrylo-roman-matsukatov-banda--dc8f9f6f.md`

- **Granola:** Health analysis request and consultation with medical professional
  - **GCE start (if any):** —
  - **Note file:** `00-Inbox/Meetings/Granola-2026-04/2026-04-30--health-analysis-request-and-consultation-with-medical-professional--1a651b6b.md`

- **Granola:** Настройка и обзор проекта Zara Monitor с Roman Matsukatov
  - **GCE start (if any):** —
  - **Note file:** `00-Inbox/Meetings/Granola-2026-04/2026-04-30--настройка-и-обзор-проекта-zara-monitor-с-roman-matsukatov--218197df.md`


## All meetings (chronological by event/created time)

- [OK] **Роман Мацукатов та Гліб Тутов** | calendar: **Роман Мацукатов та Гліб Тутов** | `00-Inbox/Meetings/Granola-2026-04/2026-04-19--роман-мацукатов-та-гліб-тутов--6eff72a5.md`
- [OK] **Interview with Company** | calendar: **Interview with Company** | vault: **Interview with Company (Brainrocket)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-21--interview-with-company-brainrocket--3b0aedcf.md`
- [OK] **Interview w/ Roman Matsukatov (Sr PM) Med Travel** | calendar: **Interview w/ Roman Matsukatov (Sr PM) Med Travel** | `00-Inbox/Meetings/Granola-2026-04/2026-04-22--interview-w-roman-matsukatov-sr-pm-med-travel--64ca00a5.md`
- [OK] **2 Interview — Roman Matsukatov — Product Manager** | calendar: **2 Interview — Roman Matsukatov — Product Manager** | vault: **…(Brainrocket)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-22--2-interview-roman-matsukatov-product-manager-brainrocket--ac3c2a6e.md`
- [NO_MATCH] **Identity graph and user resolution strategies in digital advertising** | calendar: **—** | vault: **Kyrylo / Roman (Banda) — …** | `00-Inbox/Meetings/Granola-2026-04/2026-04-22--kyrylo-roman-banda-identity-graph--04f9ebd3.md`
- [OK] **Roman Matsukatov // Product Lead // HR screen** | calendar: **Roman Matsukatov // Product Lead // HR screen** | vault: **…(Darya — madeofstorm.com)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-24--roman-matsukatov-product-lead-hr-screen-darya-madeofstorm--50ad923f.md`
- [OK] **Interview with Company** | calendar: **Interview with Company** | vault: **Interview with Company (Brainrocket)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-24--interview-with-company-brainrocket--2e592da1.md`
- [OK] **Короткая прогулка или зарядка** | calendar: **Короткая прогулка или зарядка** | vault: **Product Manager - HR (Roman Matsukatov) (Dinarys)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-28--product-manager-hr-roman-matsukatov-dinarys--3078289d.md`
- [OK] **Interview with Ruby Labs** | calendar: **Interview with Ruby Labs** | `00-Inbox/Meetings/Granola-2026-04/2026-04-28--interview-with-ruby-labs--8df88185.md`
- [OK] **Interview_Roman Matsukatov_Product Owner/CPO** | calendar: **Interview_Roman Matsukatov_Product Owner/CPO** | vault: **…(Nataliia B — prostaff.agency)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-29--interview-product-owner-cpo-nataliia-b-prostaff--7f2d946b.md`
- [OK] **Project Cases - Product Manager (Roman Matsukatov)** | calendar: **Project Cases - Product Manager (Roman Matsukatov)** | vault: **…(Dinarys)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-29--project-cases-product-manager-roman-matsukatov-dinarys--79fc7ea5.md`
- [NO_MATCH] **Проект MVP и корпоративная инфраструктура стартапа с Романом Матсукатовым** | calendar: **—** | vault: **Зустріч | Тураєв Кирило — Роман Мацукатов (Banda)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-29--zustrich-turaiev-kyrylo-roman-matsukatov-banda--dc8f9f6f.md`
- [OK] **Offer Call** | calendar: **Offer Call** | vault: **Offer Call (Banda)** | `00-Inbox/Meetings/Granola-2026-04/2026-04-30--offer-call-banda--d106e909.md`
- [NO_MATCH] **Health analysis request and consultation with medical professional** | calendar: **—** | `00-Inbox/Meetings/Granola-2026-04/2026-04-30--health-analysis-request-and-consultation-with-medical-professional--1a651b6b.md`
- [NO_MATCH] **Настройка и обзор проекта Zara Monitor с Roman Matsukatov** | calendar: **—** | `00-Inbox/Meetings/Granola-2026-04/2026-04-30--настройка-и-обзор-проекта-zara-monitor-с-roman-matsukatov--218197df.md`
