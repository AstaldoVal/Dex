# ATS Application Forms — Reference for Auto-fill

Справочник форм подачи заявок разных ATS. Цель: единообразно описывать поля и типы, чтобы потом автозаполнять их из профиля (имя, локация, право на работу и т.д.).

---

## Как добавлять новые ATS

Для каждого ATS указывать:

1. **Идентификация:** название, хост, шаблон URL.
2. **Страница заявки:** вкладка/раздел (Overview / Application и т.д.).
3. **Поля формы:** порядок, тип, лейбл (как в интерфейсе), обязательность, плейсхолдер/подсказки.
4. **Специфика:** автокомплит, выпадающие списки, кастомные вопросы компании.
5. **Селекторы (если известны):** для скриптов/расширений автозаполнения.

---

## 1. Ashby (Ashby HQ)

**Хост:** `jobs.ashbyhq.com`  
**URL:** `https://jobs.ashbyhq.com/{company_slug}/{job_id}/application`  
**Примеры:**
- SoSafe: `https://jobs.ashbyhq.com/sosafe/536d4dc7-e598-43c1-b6ee-77394c1b5499/application`
- Restream: `https://jobs.ashbyhq.com/restream/146764ce-0b32-4816-a5da-0b702e90f41e/application`

**Страница заявки:**
- Вкладки: **Overview** | **Application**. Форма заявки — на вкладке **Application** (заголовок «Submit your application»). Переключение: Tab до вкладки Application → Enter или клик.

**Поля формы — два варианта (зависит от компании):**

**Вариант A (SoSafe, Staff Product Operations Manager):**
- Поле с плейсхолдером «Type here...» (лейбл в кадре не виден).
- **Your Location (City, Country)*** — обязательное, плейсхолдер «Start typing...», автокомплит/выпадающий список.
- **Do you currently have a right to work in the European Union? (Work permit, Blue Card, etc.)*** — Yes/No (кнопки как radio).

**Вариант B (Restream, Senior Product Manager - New Product):**
- **Name*** — текст, плейсхолдер «Type here...».
- **Email*** — текст, плейсхолдер «hello@example.com...».
- **Resume*** — загрузка файла.
- **LinkedIn URL** — текст, «Type here...».
- **Twitter URL** — текст, «Type here...».
- **GitHub URL** — текст, «Type here...».
- **Portfolio URL** — текст, «Type here...».

**Общее:**
- Оформление: светлый фон, скруглённые поля, обязательные поля отмечены `*`. Плейсхолдеры часто «Type here...» или «Start typing...».
- Внизу страницы: ссылка «Recruiting Privacy Policy».
- Набор полей **зависит от настроек вакансии**: у одной компании — Location + право на работу в ЕС, у другой — Name, Email, Resume, URL-поля. Переключение на вкладку Application обязательно, иначе виден только Overview (карточка вакансии: Location, Employment Type, Location Type, Department).

**Маппинг для автозаполнения (профиль → Ashby):**

- Имя / Full name → «Name» (вариант B) или первое поле «Type here...» (вариант A).
- Email → «Email» (вариант B).
- Резюме (файл) → «Resume».
- LinkedIn → «LinkedIn URL».
- GitHub → «GitHub URL».
- Портфолио → «Portfolio URL».
- Город, страна → «Your Location (City, Country)» (вариант A).
- Право на работу в ЕС → «Do you currently have a right to work in the European Union?» → Yes/No (вариант A).

---

## 2. Greenhouse (на примере Elastic)

**Хост (пример):** `jobs.elastic.co` (карьерный сайт компании; бэкенд — Greenhouse).  
**Признак ATS:** в URL параметр `gh_jid` = Greenhouse Job ID.  
**URL:** `https://jobs.{company}.com/form?gh_jid={job_id}`  
**Пример:** `https://jobs.elastic.co/form?gh_jid=7306012`

**Перед формой:**
- **Cookie consent:** баннер «Notice» с кнопками «Learn more and customize», «Reject», «Accept». Для автозаполнения сначала закрыть (Accept/Reject).
- **Breadcrumb:** Home / {Job Title}.
- **Заголовок:** должность крупным шрифтом (например, «Senior Product Manager, Platform»).
- **Блок «Create a Job Alert»** — не поле заявки, а подписка на алерты.

**Поля формы:**
- Набор полей в Greenhouse **настраивается по вакансии**: кастомные application fields и application questions ([Greenhouse Support](https://support.greenhouse.io/hc/en-us/articles/115003544472)).
- Типичные стандартные поля: First Name, Last Name, Email, Phone, Resume (file), Cover Letter (textarea или file), LinkedIn URL, «How did you hear about us?» и др.
- Типы: текст, файл, выпадающий список, single/multi choice. Обязательность задаётся в настройках вакансии.

**Специфика:**
- Один и тот же ATS (Greenhouse), но хост и дизайн у каждого работодателя свои (elastic, stripe, okta, etc.).
- Параметр `gh_jid` в ссылке однозначно указывает на Greenhouse. Форма может быть: (1) на отдельной странице `/form?gh_jid=...` (например, Elastic), либо (2) встроена в страницу вакансии на корпоративном домене (например, Okta: секция «Apply» на той же странице; в URL может быть `gh_src`).

**Маппинг для автозаполнения (профиль → типичные лейблы Greenhouse):**
- Имя → «First Name» / «First name».
- Фамилия → «Last Name» / «Last name».
- Email → «Email».
- Телефон → «Phone».
- Резюме → «Resume» (file upload).
- Сопроводительное → «Cover Letter» (если есть).
- LinkedIn → «LinkedIn URL» / «LinkedIn».
- Откуда узнали → «How did you hear about us?» (часто dropdown).

*Точный список полей на конкретной форме нужно снимать по факту (после закрытия cookie banner и прокрутки к форме).*

**Вариант: форма на сайте компании (Okta)**

**URL:** страница вакансии на корпоративном домене, например  
`https://www.okta.com/company/careers/product/{slug}-{job_id}/?gh_src=...`  
Параметр `gh_src` — источник перехода (Greenhouse). Форма «Apply» встроена в ту же страницу (секция внизу или сайдбар).

**Поля формы (Okta, Principal Product Manager — пример полного набора Greenhouse):**

- **First Name** — текст.
- **Last Name** — текст.
- **Email** — текст.
- **Phone** — текст.
- **Resume / Resume/CV** — загрузка PDF (до 8 MB) или вставка текста (Upload PDF / Paste).
- **Cover Letter** — загрузка PDF (до 8 MB) или вставка текста.
- **LinkedIn Profile** — текст (URL).
- **Website** — текст (URL).
- **Are you legally authorized to work in the country you reside?** — Yes/No (dropdown «Choose»).
- **Will you now or in the future require Visa Sponsorship?** — Yes/No.
- **Do you have any family members / relatives or personal relationships at Okta...?** — Yes/No; при Yes — текстовое поле для имени и связи.
- **Do you have any outside business activity(ies)...?** — Yes/No; при Yes — текстовое поле.
- **Have you worked for Okta in the past?** — Yes/No.
- Чекбокс: согласие на обработку персональных данных (Okta Privacy Policy).
- Чекбокс: согласие на использование данных для оценки кандидатуры и других ролей.

**Добровольные опросы (U.S. Equal Opportunity):**  
Disability Status, Veteran Status, Race, Gender — выпадающие списки с опцией «Decline To Self Identify» / «I don't wish to answer». Заполнение не обязательно.

**Маппинг (Okta / Greenhouse на сайте компании):** как в общем маппинге Greenhouse плюс: право на работу → «Are you legally authorized to work...», виза → «Visa Sponsorship», LinkedIn → «LinkedIn Profile», сайт → «Website».

---

## 3. Teamtailor (на примере FYUL)

**Хост (пример):** `careers.fyul.com` (карьерный сайт на Teamtailor).  
**Признак ATS:** внизу страницы ссылка «Applicant tracking system by Teamtailor»; в cookie-модалке указан вендор Teamtailor.  
**URL:** `https://careers.{company}.com/jobs/{job_id}-{slug}`  
**Пример:** `https://careers.fyul.com/jobs/6956881-api-product-manager?utm_source=LinkedIn`

**Перед формой:**
- **Cookie consent:** баннер «This website uses cookies...» с кнопками «Accept all cookies», «Decline all non-necessary cookies», «Cookie preferences». Модалка «Select which cookies you accept» (Strictly necessary / Analytics, вендор Teamtailor). Для автозаполнения сначала принять или отклонить cookies.
- **Кнопка Apply:** форма заявки **не видна по умолчанию**. Нужно нажать **Apply**, чтобы открыть форму (модальное окно или раскрывающаяся секция). Без клика по Apply видны только описание вакансии и блок «Our Hiring Process».

**Поля формы:**
- Список полей нужно снимать **после клика по Apply** (форма подгружается динамически). Типичные для Teamtailor-сайтов: имя, email, телефон, резюме (файл), иногда cover letter, LinkedIn — уточнять по открытой форме.

**Специфика:**
- Один хост = один работодатель (fyul.com → careers.fyul.com); у других компаний будет свой careers-поддомен на Teamtailor.
- Обязательный шаг перед автозаполнением: клик по **Apply** для отображения формы.

**Маппинг (предположительный, уточнить по форме):**  
Имя → «First name» / «Name»; Email → «Email»; Телефон → «Phone»; Резюме → «Resume» / «CV»; LinkedIn → «LinkedIn» (если есть).

---

## 4. HiBob (Bob Hiring) — на примере MuchBetter

**Хост:** `{company}.careers.hibob.com` (поддомен компании на платформе HiBob).  
**Признак ATS:** домен `careers.hibob.com`; продукт — Bob Hiring ([HiBob Talent](https://www.hibob.com/talent/hiring/)).  
**URL:** `https://{company}.careers.hibob.com/jobs/{job_id}/apply`  
**Пример:** `https://muchbetter.careers.hibob.com/jobs/d6aec568-5d64-4f29-a2ae-74852109562d/apply`

**Страница заявки:**
- Отдельная страница **/apply** (форма заявки сразу в контенте, без дополнительного клика «Apply»). Заголовок страницы в браузере может быть просто «Careers».

**Поля формы:**
- Набор полей в Bob Hiring **настраивается под работодателя** (как в Greenhouse). Типичные поля: First Name, Last Name, Email, Phone, Resume (file), Cover Letter, иногда вопросы про право на работу, визу, откуда узнали. Точный список и порядок — снимать по открытой форме.

**Специфика:**
- Поддомен компании в домене HiBob: `muchbetter.careers.hibob.com`, не `careers.muchbetter.com`.
- [API для careers page](https://apidocs.hibob.com/docs/how-to-use-hiring-api-careers-page) — интеграция с внешними карьерными страницами; кандидаты могут перенаправляться на форму Bob.
- Обработка данных заявок: [Bob Hiring Privacy Notice for Applicants](https://www.hibob.com/privacy/bob-hiring-privacy-notice-for-applicants/).

**Маппинг для автозаполнения (типичные лейблы, уточнить по форме):**  
Имя → «First Name»; Фамилия → «Last Name»; Email → «Email»; Телефон → «Phone»; Резюме → «Resume» / «CV»; Сопроводительное → «Cover Letter» (если есть).

---

## 5. Navero (clarifying questions)

**Хост:** `app.navero.me`  
**URL:** `https://app.navero.me/clarifying-questions/{id}?utm_source=...`  
**Пример:** `https://app.navero.me/clarifying-questions/b96624a5-31d4-4dbc-b5db-f200b06746e6?utm_source=xgpLChIpPx`

**Специфика:**
- Форма с вопросами **показывается только после верификации по почте**: пользователь вводит email → на почту приходит код → пользователь вводит код и отправляет → затем загружается блок «clarifying questions». До ввода кода на странице только «Loading test data...» или шаг ввода email/кода.
- **Автоматическое получение и подстановка кода:** экстеншн на app.navero.me сам заполняет email из профиля, нажимает «Send code», через 12 с запрашивает код по `GET http://127.0.0.1:8765/navero-code` (save-server вызывает `core/mcp/navero_code.py`, тот через Gmail API ищет последнее письмо от Navero/verification и извлекает код), подставляет код в поле и отправляет форму. После появления формы clarifying questions срабатывает обычное автозаполнение полей из профиля. Нужны: запущенный save-server и настроенный Gmail (**`Credentials/personal/credentials.json`** и **`Credentials/personal/gmail_token.json`**, как для Gmail MCP).

**Поля формы:** уточнять по факту после появления формы (опросы могут быть кастомными). Маппинг — по тем же лейблам из профиля (имя, email, текст ответов и т.д.).

---

## 6. (Следующий ATS)

Добавлять по тому же шаблону: идентификация, URL, вкладки, поля по порядку, маппинг на профиль.
