# Гайд з навчання на Retention Manager в iGaming

Покроковий план, щоб закрити gap у retention та стратегіях його покращення в casino/betting. Орієнтація на вакансію: CRM/Retention Manager, Customer.io / Braze / Iterable, тригерні кампанії, RFM, OR 35%+, complaint rate <0.1%.

---

## 1. Що потрібно знати: огляд топіків

### 1.1 Retention та lifecycle в iGaming

- **Метрики retention:** Day 1 / Day 7 / Day 30 retention, churn rate, reactivation rate, LTV, average lifetime, stickiness (DAU/MAU), deposit frequency, average time between deposits, dormant user ratio.
- **Життєвий цикл гравця:** Visit → Registration → First Deposit (FTD) → Repeat deposits → Dormant / Churn. Місця втручання CRM: пост-рег, пост-FTD, перед очікуваним повторним депозитом, після N днів неактивності, winback.
- **Відмінності від e-commerce:** високий churn, регуляторні обмеження (реклама азартних ігор, таргетинг, мовні/гео правила), responsible gambling, complaint rate та скарги в регулятора.
- **Ключові KPI ролі:** Open Rate (OR) email 35%+ як норма, complaint rate <0.1%, реактивація, retention по днях, LTV по сегментах.

### 1.2 Сегментація та RFM

- **RFM в iGaming:** Recency (коли останній депозит/візит), Frequency (як часто депозить/грає), Monetary (сума ставок або депозитів). Сегменти: Champions (R недавно, F і M високі), Loyal, At risk, Dormant, Lost. Різні повідомлення та оффери на кожен сегмент.
- **Додаткові розрізи:** GEO, продукт (casino vs betting), канал реєстрації, тип бонусу при FTD, game preference, VIP tier. Комбіновані сегменти для персональізації.
- **Практика:** будувати RFM на реальних даних (депозити, сесії), оновлювати періодично, зв’язувати сегменти з кампаніями та A/B тестами.

### 1.3 Тригерні кампанії та омніканал

- **Тригери (приклади):** пост-реєстрація (welcome flow), пост-FTD, перед очікуваним повторним депозитом (на основі середнього інтервалу), N днів без гри (dormant), N днів без депозиту, виграш/великий виграш, досягнення (achievement), сезонні/події.
- **Канали:** Email, Push (web/mobile), SMS (де дозволено), in-app messages, іноді WhatsApp. Обмеження по гео та RG (наприклад, нічні пуши).
- **Омніканал:** одна логіка (сегмент + тригер), різні канали з правилами fallback (наприклад, email якщо немає push token), консистентний тон і responsible gambling повідомлення.

### 1.4 Інструменти: Customer.io, Braze, Iterable

- **Загальне:** це платформи для поведінкового маркетингу (behavioral messaging), сегментації, автоматизованих flows і A/B тестів. Різниця в UX, ціні, інтеграціях та глибині аналітики.
- **Customer.io:** сильні тригери, segments на подіях, A/B тести, хороші API. Типово: event-driven flows, сегменти по активності.
- **Braze:** канали (email, push, in-app, Content Cards), Funnel, Canvas (flows), сегменти, A/B. Сильна мобільна та реального часу сегментація.
- **Iterable:** journey-based кампанії, сегменти, A/B, інтеграції з data warehouse. Зручно для складних multi-step journey.
- **Що вміти:** налаштування сегментів по подіях/атрибутах, побудова trigger-based flow (welcome, winback, replenishment), налаштування A/B тестів, використання шаблонів та персональізації (first name, segment-based copy), контроль частоти (frequency capping) та RG-обмежень.

### 1.5 A/B тести та оптимізація

- **Що тестувати:** subject line (OR), час відправки, контент (CTA, оффер, тон), канал (email vs push), сегментна стратегія. Критерії успіху: OR, CTR, conversion to deposit, reactivation rate, complaint rate.
- **Методологія:** чіткий hypothesis, одна змінна, достатній volume і час, статистична значущість. Не знижувати complaint rate заради OR.
- **OR 35%:** досягається якісним контентом, релевантністю, таймінгом, сегментацією та чисткою бази (не спамити неактивним).

### 1.6 Complaint rate та responsible gambling (RG)

- **Complaint rate <0.1%:** скарги на комунікації (спам, введення в оману, надмірні оффери). Контроль: прозорі умови, unsubscribe, частота, не тиснути на вразливих сегментах, логіка "cooling off" та self-exclusion.
- **RG в комунікаціях:** не заохочувати надмірну гру, додавати посилання на допомогу, дотримуватись гео-обмежень (наприклад, нічні пуши), поважати opt-out та exclusions.
- **Як впливає на retention:** довіра знижує churn; скарги та регуляторні ризики пошкоджують бренд і retention. Retention-стратегія має бути сумісною з RG.

### 1.7 Метрики та звітність

- **Retention:** D1/D7/D30, churn, reactivation rate, LTV, average lifetime, stickiness, deposit frequency, dormant ratio (з референсу igaming-metrics).
- **CRM-кампанії:** OR, CTR, conversion to click/deposit, unsubscribes, complaints, revenue attributed to campaign або segment.
- **Звіти:** cohort retention, performance по сегментах (RFM), performance по каналах і flows, тренд complaint rate.

---

## 2. Як це працює в iGaming (ID / індустрія)

- **Регулятори:** кожен ринок (UA, EU, UK тощо) має обмеження на рекламу, таргетинг, години комунікацій. Retention-кампанії мають бути в межах правил.
- **Responsible gambling:** самовиключення, ліміти, "cooling off" мають відображатися в CRM (не слати оффери тим, хто в exclusion).
- **Дані:** події (registration, FTD, deposit, session, withdrawal, game played) з продукту/аналитики в CRM-платформу. Якісна сегментація та тригери залежать від якості даних.
- **Бонуси та оффери:** частина retention-інструментів. Важливо: wagering requirements, ясні умови, щоб не рости complaint rate. Сегментація офферів по RFM та ризику.
- **Команда:** Retention Manager часто працює з Product, Analytics, Compliance, Support. Потрібна здатність читати метрики та узгоджувати кампанії з RG та правилами.

---

## 3. Пошагове навчання: закрити gap з Retention та стратегіями

Нижче план по фазах. Кожна фаза включає теми, дії та перевірку (що ти маєш вміти/знати після фази).

---

### Фаза 1: Основи retention та метрик (1–2 тижні)

**Ціль:** розуміти, що таке retention в iGaming і як його вимірюють.

**Теми:**

- Retention метрики: D1/D7/D30, churn, reactivation, LTV, stickiness, deposit frequency, dormant ratio.
- Життєвий цикл гравця та типові точки втручання CRM.
- Відмінності casino vs betting по поведінці та retention.

**Дії:**

1. Прочитати розділ "Retention" у `.claude/reference/igaming-metrics.md` (або локальному референсу 100 iGaming metrics) і виписати формули та "when to use" для кожної метрики.
2. Подивитися 1–2 вебінари або статті про retention в iGaming (наприклад, SBC, iGaming Business, або блоги Braze/Iterable про gaming).
3. Скласти короткий глосарій: retention, churn, reactivation, LTV, FTD, RFM, OR, complaint rate, RG.

**Перевірка:** можу пояснити D1/D7/D30, churn, reactivation та як вони пов’язані з роботою CRM.

---

### Фаза 2: Сегментація та RFM (1–2 тижні)

**Ціль:** вміти будувати та використовувати RFM і сегменти для кампаній.

**Теми:**

- RFM: визначення Recency, Frequency, Monetary для iGaming (події: депозит, сесія, ставка).
- Типові сегменти: Champions, Loyal, At risk, Dormant, Lost та які повідомлення/оффери для них.
- Додаткові розрізи: GEO, канал, продукт, VIP.

**Дії:**

1. Описати для вибраного продукту (casino або betting): які події брати для R, F, M і як визначити пороги (наприклад, "dormant" = без депозиту 14+ днів).
2. Налаштувати простий RFM-сегмент у будь-якій доступній платформі (Excel/Sheets на експорті даних або trial Customer.io/Braze/Iterable).
3. Написати 1–2 речення messaging strategy для кожного з 5 RFM-сегментів (що пропонуємо і навіщо).

**Перевірка:** можу пояснити RFM та запропонувати сегментну стратегію для welcome, replenishment і winback.

---

### Фаза 3: Тригерні кампанії та flows (2–3 тижні)

**Ціль:** розуміти та проектувати trigger-based flows і омніканал.

**Теми:**

- Типи тригерів: подія (event), таймер (N днів після події або без активності), умова (segment + trigger).
- Welcome, post-FTD, replenishment, dormant, winback flows. Відповідальна гра: не слати після self-exclusion, враховувати частоту.
- Канали: email, push, SMS, in-app. Коли який використовувати та fallback.

**Дії:**

1. Намалювати (на папері або Miro) повний flow: Registration → Welcome (email + push) → FTD → Post-FTD (подяка + next offer) → Replenishment (на основі середнього інтервалу депозиту) → Dormant (N днів) → Winback. Позначити умови та канали.
2. У trial однієї з платформ (Customer.io, Braze або Iterable) збудувати один flow: наприклад, welcome series з 2–3 кроків (email + push).
3. Описати, як у flow додати перевірку self-exclusion / RG (на рівні логіки та даних).

**Перевірка:** можу спроектувати trigger flow для 2–3 сценаріїв і пояснити, як уникати скарг та порушень RG.

---

### Фаза 4: Інструменти (Customer.io, Braze, Iterable) (2–3 тижні)

**Ціль:** вміти працювати в одній-двох платформах на рівні "можу налаштувати сегмент і flow".

**Теми:**

- Інтерфейс: Campaigns vs Flows/Workflows, Segments, Events, Attributes, A/B tests.
- Інтеграція даних: які події та атрибути потрібні з продукту для retention (registration, FTD, deposit, session, game).
- Шаблони, персональізація, frequency capping, unsubscribe handling.

**Дії:**

1. Пройти офіційні туторіали/документацію однієї платформи (наприклад, Customer.io "Getting started" + "Campaigns" + "Data").
2. У sandbox/trial: створити сегмент за подією (наприклад, "зареєструвався за останні 24 год"), створити простий email з персональізацією (ім’я, сегмент).
3. Зробити один A/B тест (наприклад, два subject lines) і описати, як будеш оцінювати результат (OR, CTR, sample size).

**Перевірка:** можу в інтерфейсі створити сегмент, flow і простий A/B тест; розумію, які дані мають приходити з продукту.

---

### Фаза 5: OR, complaint rate та A/B тести (1–2 тижні)

**Ціль:** знати, як досягти OR 35%+ і тримати complaint rate <0.1%.

**Теми:**

- Open Rate: subject line, релевантність, таймінг, сегментація, чистота бази. Best practices для iGaming (не обіцяти виграш, ясний CTA).
- Complaint rate: причини скарг (частота, введення в оману, ігнорування opt-out). Як знизити: прозорість, контроль частоти, RG-фільтри.
- A/B тести: hypothesis, одна змінна, метрики (OR, CTR, conversion, complaints), статистична значущість.

**Дії:**

1. Скласти чек-лист "перед відправкою кампанії": перевірка на RG, unsubscribe, frequency, ясність офферу.
2. Запропонувати 3 гіпотези для A/B тестів (наприклад, subject line, час відправки, CTA) і метрики для кожної.
3. Описати процедуру: що робити, якщо complaint rate зріс після кампанії (розбір, пауза, зміна контенту/аудиторії).

**Перевірка:** можу пояснити зв’язок OR і complaint rate з контентом та процесом і запропонувати тести без порушення RG.

---

### Фаза 6: Стратегія retention та дорожня карта (1 тиждень)

**Ціль:** зібрати все в єдину стратегію та план покращення retention.

**Теми:**

- Пріоритизація: які flows дають найбільший вплив на retention (часто: welcome, post-FTD, winback). Залежить від даних продукту.
- Метрики успіху: D1/D7/D30, churn, reactivation, LTV по сегментах, OR, complaint rate. Звітність по когортах та кампаніях.
- Ітерації: вимірювання → гіпотеза → A/B → впровадження → знову вимірювання.

**Дії:**

1. Написати короткий документ "Retention strategy" на 1–2 сторінки: цілі (метрики), сегменти, ключові flows, канали, обмеження (RG, complaint rate), пріорити на 3 місяці.
2. Скласти roadmap: що робити в місяць 1 (наприклад, welcome + post-FTD), місяць 2 (replenishment + dormant), місяць 3 (winback + A/B оптимізація).
3. Визначити 3–5 дашборд-метрик і де їх дивитися (CRM-платформа, аналітика, звіти).

**Перевірка:** можу представити стратегію retention та план на квартал з обґрунтуванням пріоритетів.

---

## 4. Ресурси для навчання

- **Метрики iGaming:** `.claude/reference/igaming-metrics.md` (у твоєму репо), або будь-який довідник 80–100 iGaming KPIs.
- **Customer.io:** Docs (customer.io/docs), блог (customer.io/blog), use cases "gaming" / "retention".
- **Braze:** Braze Learning (learning.braze.com), документація по Canvas, Funnel, Segments; гайди по gaming.
- **Iterable:** Iterable Academy / Docs, кейси по lifecycle marketing та retention.
- **iGaming контекст:** SBC News, iGaming Business, EGR, а також регуляторні сайти обраних ринків (UA, MGA, UK Gambling Commission) для правил реклами та RG.
- **RFM та сегментація:** статті по RFM в e-commerce/gaming, підходи до порогів (квантилі, бізнес-правила).
- **Responsible gambling:** BeGambleAware, national regulatory guidelines; як відображати RG в комунікаціях та в логіці CRM.

---

## 5. Чек-лист готовності до ролі CRM / Retention Manager (iGaming)

- Розумію retention-метрики (D1/D7/D30, churn, reactivation, LTV) та їх використання в iGaming.
- Можу побудувати RFM-сегментацію та запропонувати messaging по сегментах.
- Можу спроектувати trigger flows: welcome, post-FTD, replenishment, dormant, winback.
- Розумію омніканал (email, push, SMS, in-app) та обмеження по каналах і гео.
- Маю досвід або пробні проекти в одній з платформ: Customer.io, Braze, Iterable (сегменти, flows, A/B).
- Знаю, як працювати з OR 35%+ та complaint rate <0.1% (контент, частота, RG, тести).
- Можу описати retention-стратегію та roadmap на 3 місяці з пріоритетами та метриками.
- Розумію основи RG та регуляторних обмежень у комунікаціях в iGaming.

---

*Документ можна зберігати в vault і використовувати як план на 2–3 місяці. Кожну фазу можна розбити на тижневі задачі та відмічати виконання.*
