# Workday ATS: захват полей и автозаполнение

Расширение Dex умеет **собирать поля** формы Workday и потом **подставлять** данные из профиля и твои ответы.

## Что нужно

- Сохранённый расширением Chrome (Dex Job Capture) с Workday.
- Save-server запущен: `npm run dex-save-server` (порт 8765).
- Файл профиля: `.claude/reference/ats-application-profile.json`.

## Как пользоваться

1. **Запусти save-server**  
   `npm run dex-save-server`

2. **Открой форму заявки Workday**  
   Зайди на сайт компании (например `mrisoftware.wd501.myworkdayjobs.com`), авторизуйся, открой вакансию и перейди на шаг с формой (Apply).

3. **Захват полей**  
   На странице формы появится кнопка **«Capture fields»**. Нажми её — расширение соберёт все видимые поля (label, type, options) и **текущие значения**, которые ты уже ввёл в полях.  
   Схема сохраняется в `workday-fields-<tenant>.json`; введённые значения автоматически дописываются в `workday-custom-answers.json` для этого тенанта. При следующем «Fill form» подставятся в том числе эти сохранённые ответы.  
   Удобный порядок: заполни поля вручную (или частично), затем нажми **Capture fields** — и ответы сохранятся для следующих раз.

4. **Автозаполнение**  
   - При загрузке страницы формы расширение само попытается заполнить поля из **профиля** (email, phone, location, LinkedIn и т.д.) по совпадению подписей с `label_variants`.  
   - Кнопка **«Fill form»** — повторить заполнение (удобно после правки ответов или смены шага формы).

5. **Ответы на вопросы без маппинга в профиле**  
   Для полей, которые не подставляются из профиля (свободный текст, выбор из списка и т.п.), можно задать ответы вручную в JSON:

   - Файл: `00-Inbox/Job_Search/data/workday/workday-custom-answers.json`
   - Формат:
     ```json
     {
       "answers": {
         "mrisoftware.wd501": {
           "Why do you want to work here?": "Your answer...",
           "Desired salary": "90 000"
         }
       }
     }
     ```
   Ключи внутри `answers.<tenant>` — **точные подписи полей** из сохранённой схемы (из «Capture fields»). После сохранения файла нажми «Fill form» ещё раз.

## Где что лежит

- Схема полей (после «Capture fields»):  
  `00-Inbox/Job_Search/data/workday/workday-fields-<tenant>.json`
- Кастомные ответы (редактируешь вручную):  
  `00-Inbox/Job_Search/data/workday/workday-custom-answers.json`
- Профиль (общий для всех ATS):  
  `.claude/reference/ats-application-profile.json`

## API save-server (для отладки)

- `POST /workday-fields` — тело: `{ "tenant": "mrisoftware.wd501", "url": "...", "fields": [ ... ] }`. Сохраняет схему.
- `GET /workday-fields?tenant=mrisoftware.wd501` — отдаёт сохранённую схему.
- `GET /workday-custom-answers` — отдаёт все кастомные ответы по тенантам.
- `POST /workday-custom-answers` — тело: `{ "tenant": "mrisoftware.wd501", "answers": { "Label": "value" } }`. Дополняет ответы по тенанту (merge).

## Многошаговые формы

Workday часто показывает форму по шагам. На каждом шаге с полями можно снова нажать **«Capture fields»** — схема обновится полями текущего шага. Для полного набора полей можно пройти все шаги и делать «Capture fields» на каждом, но тогда в схеме останутся только поля последнего захвата. В будущем можно доработать объединение схем по шагам; пока удобно делать захват на том шаге, где больше всего полей, и заполнять остальное вручную или отдельным захватом/заполнением на других шагах.
