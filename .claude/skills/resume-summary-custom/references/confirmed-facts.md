# Confirmed Facts for Resume Summary

Use only these facts when they are not explicitly in the user's CV. Do not invent anything beyond this list or the CV.

## Experience

- **Total experience:** 12+ years (never state fewer than 12 years in any summary).
- **iGaming:** 5+ years in iGaming overall (use this, not "3+ years in iGaming B2B"). **Use only when the resume type is iGaming.** For AI resume (or any non-iGaming template) never mention "5 years in iGaming" or "5+ years in iGaming"; in that context it is usually irrelevant and the AI resume does not highlight iGaming experience.
- **iGaming B2B and B2C:** Experience in both. Use the **iGaming narrative** below for recruiter answers and summaries. Do not describe iGaming experience as "mainly B2C"; do not name the EBET brand — only "EBET".

## iGaming narrative (canonical for recruiters and summaries)

**Use this framing when answering recruiters or writing iGaming experience in summaries.**

В конце декабря у меня закончился контракт с Pin-Up (Redcore). Там я в течение последних полутора лет работал сначала как Senior Product Manager по вертикалям Live Casino, TV Games, Bingo & Lottery, а потом перешел на роль Compliance Product Manager и работал с лицензиями MGA, Curaçao, Anjouan, Tobique, Ontario, New Jersey. В рамках этой роли готовил всю платформу на сертификацию по MGA, так что я знаю каждый элемент B2B платформы и ее настройки плюс занимался доработками такого функционала как Languages, Transactional Email Templates, Multi-tenancy, и др. А так же являюсь специалистом по требованиям Player protection.

До этого так же работал в EBET — там у нас был упор больше на Sportsbook и Esports, но так же были и казино интеграции. Здесь я был главным B2C продакт менеджером. Два раза мигрировал платформу Betconstruct -> UltraPlay -> Aspire (Aristocrat Group). Работал в основном с WL и разрабатывал собственный Middleware + Front-end для удовлетворения потребностей наших ICP и в основном потому, что предоставляемые WL решения были очень не гибкими и устаревшими в плане технологий.

В общем и целом, у меня 5 лет опыта в iGaming. [Для ответа рекрутеру: прилагаю резюме с деталями, открыт к разным ролям.]

**Key facts to reuse in English/summaries:** Pin-Up (Redcore), contract ended end of December; ~1.5 years there. First Senior PM (Live Casino, TV Games, Bingo & Lottery), then Compliance PM. Licenses: MGA, Curaçao, Anjouan, Tobique, Ontario, New Jersey. Prepared full platform for MGA certification; knows every B2B platform element and its settings. Drove improvements to Languages, Transactional Email Templates, Multi-tenancy, etc. Specialist in Player protection requirements. EBET: lead B2C product manager; focus on Sportsbook and Esports, plus casino integrations. Two platform migrations: Betconstruct -> UltraPlay -> Aspire (Aristocrat Group). Worked mainly with WL; built own Middleware + Front-end because provided WL solutions were inflexible and outdated. 5 years iGaming total.

## AI and Automation

- Led a project at **AlphaPrompt** — AI knowledge-management system in real estate.
- Used **Azure OpenAI** and **Milvus** for semantic search.
- Built **React** interface and prompt pipeline.
- Delivered the first working version in 4 weeks.
- Over roughly 6 months, the product reduced manual document analysis time by **60%**.
- **AI workflow automation & prototyping:** Python, n8n, Make.com for AI agents and process automation.
- Familiar with **Next.js, React, Ant Design, Material UI, Shadcn**; builds custom AI prototypes and MVPs.

## AI implementations beyond document management (e.g. for Parimatch-style roles)

- **AI agents and process automation:** Designed and deployed AI agents and workflow automation with **Python, n8n, Make.com** for process automation and internal tools (not only document use cases).
- **AI prototypes and MVPs:** Builds custom AI prototypes and MVPs with modern stack (Next.js, React, Shadcn, etc.) to validate AI use cases and iterate quickly.

## MCP and AI agent orchestration (DEX-style experience; do not mention automated job application submission)

- **MCP and agent tooling:** Designed and integrated **Model Context Protocol (MCP)** servers to connect an AI assistant to calendars, tasks, career evidence, and structured data; clear separation between deterministic tools (validation, state, aggregation) and LLM reasoning (interpretation, generation). Built multi-tool workflows: task management, resume building, summary generation, career coaching, with MCP handling validation and state.
- **AI product pipelines:** Shipped pipelines for job-type detection (domain classification), resume summary generation via structured prompts and keyword rules, and batch digest processing with quality checks. Stateful career and resume flows with session management, metric validation, competency mapping, and promotion-readiness scoring, backed by MCP tools and LLM generation.
- **Prompt orchestration:** Multi-step flows (summary, cover letter, daily plan) using system/user prompts, reference docs (confirmed facts, format rules), and revision loops (e.g. excluding domain-specific wording by role type). Skill-style workflows with file-based rules and ATS/keyword alignment for consistent, on-brand output.
- **Trust and control:** Validation at each step (onboarding, resume metrics, task deduplication); deterministic MCP layers for data aggregation, probabilistic LLM only for reasoning and text; improved reliability and debuggability.
- **Integrations:** Integrated external systems (Linear, Google Calendar/Drive, Gmail, FIDM, meeting transcripts) via MCP; bidirectional sync (e.g. tasks ↔ Linear) and scheduling/capacity logic so task and calendar context feed into planning and prioritization. Content preparation workflows for social and professional posts (e.g. LinkedIn), with reference frameworks and checklists.

**CV bullet formulations (Consultoria / AI PM block; never mention automated job application submission or resume-writing tooling):**
- Shipped MCP-based agent tooling for a personal knowledge system: multiple custom servers (tasks, calendar, career evidence, goals and planning workflows) with structured prompts, validation, and stateful workflows so an AI assistant could reliably read/write calendars, goals, and career artifacts.
- Designed AI product pipelines for domain-specific content (type detection, document generation, revision loops) with prompt orchestration, reference docs, and quality checks; stateful flows with metric validation and competency mapping.
- Integrated external systems (Linear, Google Calendar, Gmail, FIDM, meeting transcripts) via MCP; bidirectional sync and scheduling logic for planning and prioritization; content preparation workflows for social and professional posts (reference frameworks, checklists).
- **Skills and plugins:** Extensible skill-based workflows (Agent Skills-style: structured instructions, reference docs, domain-specific skills for planning, career, content, prioritization); plugin architecture to extend the AI environment (e.g. compound-engineering: agents, commands, skills). Delivered in an AI-powered IDE (Cursor) with Claude; optionally mention Codex for agentic workflows.
- **Data infrastructure for ML/analytics:** Data Warehouse design (**Amazon Redshift**), **SQL** (PostgreSQL, MySQL), **Apache Airflow** for pipeline orchestration; built and launched a Data Warehouse from scratch in 6 months at Glorium, enabling BI and custom reporting. Supports data readiness for predictive models and analytics.
- **iGaming: antifraud, retention, LTV:** At Pin-Up worked on promo economics and aligned it with **antifraud**, retention, and marketing to maximize LTV without over-bonusing; used **advanced data analysis** for compliance gaps, audit evidence, and reporting accuracy. Domain overlap with ROI prediction, VIP identification, and risk/fraud signals.

## Crypto Trading and Automation

- **5+ years** in crypto trading, **2+ years** in strategy automation.
- Writes algorithms in **Pine Script**; runs them via WebHooks on **Binance, OKX, Bybit**.
- Uses **Altrady** for DCA bots, **Bitsgap** for futures automation.

## DeFi

- Portfolio tracking via **DeBank**.
- Experience with **Morpho Blue, Pendle Finance, Yearn, Loopify.XYZ, Curve, Uniswap**.
- Uses **Token Terminal, CoinMarketCap, CoinGecko** for analytics.

## Data & SQL

- Writes **SQL** for **PostgreSQL** and **MySQL**.
- Understands and uses **DDL**; works with DB schemas.
- Worked on **Data Warehouse** design in **Amazon Redshift**.
- Familiar with pipeline orchestration via **Apache Airflow**.

---

## Language / metrics

- **English level:** Always write **C1** in all CV/summary outputs. Do not use variants like "B2+/C1" or "B2+".
- **Pin-Up Live Games metric:** Always use "turnover" (not "conversion") for the 7% result — e.g. "increased Live Games turnover by 7%".
- **Pin-Up verticals:** When listing what you owned at Pin-Up, always include all four: Live Casino, Bingo, Lottery, and TV Games (not just "Live Casino, Bingo, and Lottery").
- **Pin-Up analytics:** At Pin-Up we used Tableau (among other tools) for product and behavioral data analysis.
- **Pin-Up bonus / promo economics:** Designed cashback promotions with providers (e.g. Pragmatic Play, Evolution, Imagin Life). Worked on promo economics and aligned it with antifraud, retention, and marketing so as not to over-bonus users while still creating reasons for them to return and maximizing LTV.

---

## iGaming regulated markets

**By product (use when attributing experience):**
- **Aspire:** **Curaçao** (operated), **MGA** (opened license), **UKGC** (launched brand for UK market; project was closed ~2 months before go-live, so UKGC brand did not go to production).
- **Pin-Up (PINAP):** **Ontario, Anjouan, Tobique, New Jersey** (and other Pin-Up markets).
- **EBET:** geo not specified in confirmed facts (do not attribute Curaçao/MGA/UKGC to EBET).

**Generic phrasing when listing all:** "Experience in regulated markets: UKGC, MGA, Curaçao, Ontario, Anjouan, Tobique, New Jersey." Use the full list for general iGaming/compliance roles; when describing Aspire White Label or geo, use Curaçao, MGA, UKGC and the context above.

---

## Gogawi (EBET / BetConstruct) — контекст для этапа EBET

**Проект:** Gogawi — продукт с фокусом на **esports**, уникальная для индустрии концепция. Домены: **gogawi.com**, **esportsbook.com** (в портфолио как password protected). Юрлицо в переписке: Gogawi Entertainment Group Ltd SC / Gogawi SC.

**Роль:** Product Owner в **Glorium Technologies** на проекте Gogawi **~3 года** (от идеации до завершения). Команда/коммуникация: Slack workspace **GoGaWi** (gogawi-team.slack.com); со стороны заказчика — **Aaron Speach, COO Gogawi** (aaron@gogawi.com), **Jody** (jody@gogawi.com, операционные тикеты); со стороны платформы — **Narek Melikyan** (BetConstruct); со стороны Glorium — Dmitry (dmitry@gloriumtech.com), Roman (rmatsukatov@gloriumtech.com).

**Платформа:** White Label на **BetConstruct** (этап EBET). Поддержка и тикеты через **Jira Service Desk** BetConstruct (betconstruct.atlassian.net); в переписке — «gogawi ID:507 Swarm API». В резюме/заявках также указаны UltraPlay и Aspire как другие платформы в опыте; для Gogawi — BetConstruct.

**Объём работ (по переписке Glorium, окт. 2019 — 2022):**
- Эспортс-линия и результатинг: Dota 2, CS:GO, Rainbow Six, e-basketball; запросы линий на собственные ивенты, бан команд в бэк-офисе, grading wager.
- Agent network: agent site (даунтаймы, доступ), переводы кредитов между агентами, дубликаты, отрицательные балансы, отображение кредитов в реальном времени; агенты (Jody, Rico и др.).
- Бэк-офис: доступ, сброс аутентификации; отчёты (Bet reports vs sales reports), лимиты ставок, liability.
- Платежи: интеграция **Safecharge** (инциденты «payments missing», срочные тикеты); операционное взаимодействие с **Wirecard** (клиент Gogawi 106168) при wind-down банка — смена банковской связки, коллатерал.
- Комплаенс: запрос **SAS70 Report**, Linking Gaming License Request, обновление политик и ссылок; политики **Facebook** (app gogawi.com — real money gaming, Login) и **Google OAuth** (embedded browser).

**Рекомендация (Aaron Speach, Apr 2019):** Roman worked as PO at Gogawi for the last 3 years; professional, prompt, expert problem solver; helped solve complicated issues and essentially **guided the project from Ideation to completion**; concept unique to the industry and **focused on esports**; understood client needs, listened to requests, made them happen or gave proper instructions on **feasibility of their ambitious project**.

**Для саммари и интервью (EBET/BetConstruct):** В саммари и ответах рекрутерам **не называть бренд** — только «EBET» или «B2C brand at EBET». Опыт WL на BetConstruct: B2C-бренд на платформе партнёра, продукт с фокусом на киберспорт, полный цикл от идеации до завершения; поддержка и приоритизация тикетов (Jira Service Desk), agent network и бэк-офис, эспортс-линия и результатинг; интеграции платежей (Safecharge) и операционное взаимодействие с банком (Wirecard); комплаенс (SAS70, лицензии, политики соцсетей и OAuth). Работа с заказчиком (COO, операционный контакт), оценка реализуемости амбициозных требований.

---

## White Label (WL) — EBET, Aspire, Pin-Up (structure and формулировки для ответов)

**EBET (BetConstruct).** WL здесь — это фронтовый B2C-сайт, который подключается к платформе партнёра для отрисовки контента. Делали свой middleware (.NET) и фронтенд (Angular 2+). Качество фида BetConstruct тогда было слабым, поэтому через middleware добавляли контентную и маркетинговую информацию, иконки команд, баннеры с акциями и делали Esports-фронт более привлекательным для нашей ICP. За что отвечал: требования к обогащению фида и приоритизация доработок под Esports/ICP, приёмка фронта. В объём работ входила также поддержка и операции: тикеты BetConstruct (Jira Service Desk), agent network (agent site, кредиты, бэк-офис), эспортс-линия и результатинг, интеграции платежей (Safecharge), комплаенс (SAS70, лицензии, политики платформ).

**Aspire / LightLabel.** WL был на WordPress (шаблоны как CMS) и Angular 1.5 — устаревший стек давал много ограничений. Часть улучшений пользовательского флоу делали через GTM, потому что так был доступ к фронту; это было костыльно и ограничено. Через GTM делали разные инжекты и поднимали аналитику: воронки в Google Analytics до стадии активации на платёжных методах настраивал сам в рамках LightLabel. По гео: работали на Curaçao, открывали лицензию MGA, запускали бренд под UKGC (проект закрыли за два месяца до релиза, в прод не вышли). После миграции всё переписали на Headless CMS (Strapi) и свой фронт на React — получили полный контроль над онбордингом и воронкой до первого депозита. За что отвечал: воронки и аналитика до активации, приоритизация сценариев при миграции на свой стек.

**Pin-Up WL.** Отдельный полноценный сервер со своим админским контуром и сайтом; по сути, под каждый WL платформа поднималась с нуля. Один основной сервер и несколько white labels (MGA был одним из них). Запускал платформу под MGA; знает все компоненты платформы и то, как они конфигурируются по гео. Может перенести этот опыт, чтобы масштабировать WL-структуру в другой компании. Отдельный кейс: вёл идеацию и концепт масштабирования Pin-Up до мультитенантной архитектуры (несколько лицензий на одном бэкенде). Техкоманда не имела возражений по подходу; реализацию не завершили из‑за окончания контракта. Для интервью по WL/scaling/platform: опыт идеации tenant-архитектуры и согласования с разработкой.

**Для саммари и интервью (WL-роли).** Два типа WL-опыта: (1) фронтовый WL на платформе партнёра (EBET — middleware + фронт, обогащение фида под Esports/ICP, приёмка и поддержка); (2) полноценный WL с отдельным сервером и админкой, поднятие платформы с нуля и конфигурация по гео (Pin-Up, включая запуск MGA). Плюс идеация мультитенантной архитектуры для масштабирования лицензий.

---

*Update this file when the user confirms new facts to use in summaries.*
