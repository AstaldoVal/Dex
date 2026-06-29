import { google } from 'googleapis';
import { readFileSync } from 'fs';
import * as path from 'path';

const ROOT = '/Users/admin.roman.matsukatov/Development/DEX';
function envVal(key) {
  const text = readFileSync(path.join(ROOT, '.env'), 'utf8');
  const m = text.match(new RegExp('^' + key + '=(.*)$', 'm'));
  if (!m) throw new Error('missing ' + key);
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const CLIENT_ID = envVal('GOOGLE_SLIDES_CLIENT_ID');
const CLIENT_SECRET = envVal('GOOGLE_SLIDES_CLIENT_SECRET');
const REFRESH = envVal('GOOGLE_SHEETS_REFRESH_TOKEN');

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2.setCredentials({ refresh_token: REFRESH });
const sheets = google.sheets({ version: 'v4', auth: oauth2 });
const RATE = 35;
/** Канонический Sheet (синхронизация вручную ↔ gen_gsheet.mjs): 1HoXtvDVVKB0SN2aNuOQuZSJCk--eolJQt3_iowQVybo */
const DEFAULT_SPREADSHEET_ID = '1HoXtvDVVKB0SN2aNuOQuZSJCk--eolJQt3_iowQVybo';

// [group, section, what, hours, note]
const excluded = [
  ['Вне scope (0 ч)', 'Рассылка (меню Classberry)', 'Массовые SMS/email из CRM — ArtHome шлёт вне CRM', 0, 'Исходный документ: рассылки не через CRM'],
  ['Вне scope (0 ч)', 'Видеоуроки Classberry', 'Обучение продукту SaaS', 0, ''],
  ['Вне scope (0 ч)', 'Расписание: залы, каталог курсов, «шаблон недели»', 'Отдельные сущности Classberry; сетка = повторяющиеся события в календаре', 0, 'Не дублируем шаблон — достаточно правил повторяемости для создаваемых ивентов в календаре'],
  ['Вне scope (0 ч)', 'Посетители: массовые действия', 'Bulk-операции в реестре', 0, ''],
  ['Вне scope (0 ч)', 'Биллинг подписки Classberry', 'Оплата лицензии Roman & Mariia Consultoria LDA', 0, 'Не путать с модулями доступа в CRM'],
  ['Вне scope (0 ч)', 'Настройки: взаимосвязи, авто-действия', 'Взаимосвязи сотрудников, авто-действия платформы', 0, ''],
  ['Вне scope (0 ч)', 'Мобильное приложение / PWA', 'Нативное приложение Classberry, PWA, отдельный мобильный клиент для админов', 0, 'Админы и преподаватели — только веб-CRM в браузере'],
];

const classberry = [
  ['Разделы Classberry (in scope)', 'Посетители', 'ФИО, телефон, направления, группа/индив, актив/архив, поиск, дубли, экспорт', 6, 'Без массовых действий'],
  ['Разделы Classberry (in scope)', 'Карточка клиента', 'Профиль, статусы+история, абонементы, посещения, брони, платежи, депозит, представители, документы, теги, ЛК (доступ/пароль), история', 14, 'Вкладки Classberry, но не все. UI будет оптимизирован и компактнее'],
  ['Разделы Classberry (in scope)', 'Доска лидов', 'Полировка + разделение по филиалам/источникам (уже есть в демо ArtHome)', 4, ''],
  ['Разделы Classberry (in scope)', 'Журнал', 'Посещения, индивидуальные, статусы', 6, ''],
  ['Разделы Classberry (in scope)', 'Расписание', 'Календарь по филиалу, повторяющиеся занятия, синк Google Calendar (повторяемые события)', 6, ''],
  ['Разделы Classberry (in scope)', 'Бронирование', 'Создание брони, статусы, отмена, привязка к занятию/клиенту', 6, 'Напоминания и авто-подтверждение — в примечании к строке «Автоматизация рутины админа»'],
  [
    'Разделы Classberry (in scope)',
    'CRM — Действия',
    'Лента по клиенту: тип действия, шаблоны, результат, ответственный',
    6,
    [
      '1. Действие = фиксация контакта с клиентом: звонок, комментарий, письмо/SMS и др.',
      '2. Шаблон — заготовка при создании;',
      '3. Результат — что фиксируем при закрытии (дозвонился, отправлено…).',
      '4. Binotel → действие в ленте.',
      '5. План с дедлайнами: строка «Доска задач» в блоке «Дополнения ArtHome»',
    ].join('\n'),
  ],
  ['Разделы Classberry (in scope)', 'Бухгалтерия', 'Приход/расход/переводы, статьи, типы, скидки, связь с платежами', 24, 'После воркшопа с Наташей (0 ч — отдельная строка PM)'],
  ['Разделы Classberry (in scope)', 'Онлайн продажи', 'Абонементы: настройка, продажа, активация, срок', 6, ''],
  ['Разделы Classberry (in scope)', 'Склад, товары', 'Товары/цены/категории, закупки, остатки, продажи, перемещения, списания, поставщики', 16, ''],
  [
    'Разделы Classberry (in scope)',
    'Маркетинг',
    [
      '1. Упрощённо: кампании + триггеры в CRM',
      '2. Рассылка в Телеграм',
      '3. Рассылка на email (Sendgrid) - 1 шаблон письма',
    ].join('\n'),
    16,
    'В новой CRM данный раздел будет переработан, чтобы сконцентрироваться на рассылках через Телеграм и Email\nВ предложение входит 1 шаблон письма для рассылки. После настройки можно будет легко создавать свои самостоятельно',
  ],
  ['Разделы Classberry (in scope)', 'Сотрудники', 'Справочник, должности/отделы; базовая зарплата (план)', 6, ''],
];

const REPORTS_WHAT = [
  'MVP (не все ~60+ отчётов Classberry):',
  '1. Посещения — список, ведомости, по филиалам',
  '2. Бронирование — брони, статистика бронь/визит',
  '3. Абонементы — проданные, активные, истекающие',
  '4. Посетители — ДР, давно не были, последний визит',
  '5. Финансы — общий, статьи, P&L (с Наташей)',
  '6. CRM — звонки, задачи, забытые клиенты',
  '7. Филиалы — кто в филиале, загруженность',
  '8. Сотрудники / склад — продажи, смены; остатки (базово)',
  '9. Выгрузка Google Sheets / CSV',
].join('\n');

const REPORTS_NOTE =
  'Не копируем все отчёты Classberry 1:1; после MVP — добор по приоритету ArtHome. Скорее всего большая часть отчетов будет не нужна или упрощена за счет лучшей проработки интерфейса каждого из разделов';

const RBAC_WHAT = [
  '1. Группы доступа + состав группы (например, Админ и Администратор филиала)',
  '2. RBAC доступ: нет / чтение / запись / полный;',
  '3. В карточке сотрудника — назначенные группы и сводка прав',
].join('\n');

const classberryTail = [
  ['Разделы Classberry (in scope)', 'Отчёты', REPORTS_WHAT, 24, REPORTS_NOTE],
  ['Разделы Classberry (in scope)', 'Настройка', 'Организация и 6 филиалов, роли пользователей, уведомления', 6, 'В меню Classberry пункт «Сеть» = настройки всей организации ArtHome, не одного филиала'],
  ['Разделы Classberry (in scope)', 'RBAC — группы доступа', RBAC_WHAT, 6, 'Права доступа к разделам CRM.'],
];

const classberryAll = [...classberry, ...classberryTail];

const additions = [
  ['Дополнения ArtHome', 'Доска задач (дедлайны по клиенту)', 'Канбан/список, дедлайн, просрочено/сегодня', 6, 'Планирование «что сделать к дате»; лента «Действия» в CRM — что уже сделали'],
  ['Дополнения ArtHome', 'Лояльность: перенос занятия', 'Перенос = 1 бесплатное посещение; visit type free', 6, ''],
];

const PAYMENTS_WHAT = [
  'Платежи',
  '',
  '1. Cash — ручная оплата в CRM, привязка к клиенту/курсу',
  '2. Stripe×6 — Customer + Product/Price; при смене цены в CRM — новый Price; Payment Link; webhook → «оплачено» в CRM',
  '3. Way4Pay — ссылка/инвойс + callback или «оплачено» админом',
].join('\n');

const PAYMENTS_NOTE = [
  'ДЕЛАЕМ:',
  '1. Новая цена курса в CRM → новый Price в Stripe (старый не перезаписываем)',
  '',
  'НЕ делаем:',
  '1. KYC и онбординг 6 юрлиц в Stripe',
  '2. Refunds / disputes / chargebacks в CRM (только Stripe Dashboard)',
  '3. Subscriptions, рассрочка, частичная оплата, Stripe Coupons',
  '4. Sync каталога Stripe → CRM, автосверка с бухгалтерией',
  '',
  'Правки после оплаты — вручную в бухгалтерии и карточке клиента',
  'Тестирование платежных систем обеспечивается клиентом и не входит в оценку',
].join('\n');

const crosscut = [
  ['Сквозные', 'Фундамент: филиалы, RLS, доступы', 'Auth, приглашения, переключатель филиала; RLS по branch_id; базовые роли (админ сети / филиала / преподаватель)', 14, 'Детальная матрица разделов — строка «RBAC — группы доступа»'],
  ['Сквозные', 'Платежи', PAYMENTS_WHAT, 20, PAYMENTS_NOTE],
  ['Сквозные', 'Binotel', 'API, вебхуки, click-to-call, запись, лог и задачи в карточке', 16, 'Интеграция телефонии'],
  ['Сквозные', 'Открытый API + OpenAPI', 'REST, вебхуки для следующих этапов (мобильное приложение и AI автоматизация)', 8, ''],
  ['Сквозные', 'Миграция Classberry + QA', 'Импорт ×6 филиалов: клиенты, платежи, посещения, абонементы; сквозной QA; деплой; Базовый мониторинг; Базовые бэкапы', 16, '2 дня'],
  ['Сквозные', 'Обучение команды', 'Сессии для админов/преподавателей: CRM, платежи, брони, карточка клиента; материалы/запись по согласованию', 8, '1 день'],
  [
    'Сквозные',
    'Автоматизация рутины админа',
    'Правила по расписанию: брони, ДР, пауза, inbox',
    6,
    'Авто-подтверждение броней: по cron (напр. утром) для записей на сегодня и на 2–3 дня — напоминание клиенту (Telegram/email) и/или статус «подтверждена», без ручного обзвона админом. Плюс: поздравления с ДР, касание после паузы, единый inbox задач',
  ],
];

const HEADER = ['Группа', 'Раздел Classberry / блок', 'Что делаем (минимум)', 'Часы (мин)', 'Часы (макс +20%)', '€ (мин ×35)', '€ (макс ×35)', 'Примечание'];
const rows = [];
const push = (r) => { rows.push(r); return rows.length; };

push(['ArtHome CRM — оценка по меню Classberry', '', '', '', '', '', '', '']);
push(['', '', '', '', '', '', '', '']);
push(['', '', '', '', '', '', '', '']);
push(['ВНЕ SCOPE (не в сумме)', '', '', '', '', '', '', '']);
excluded.forEach((r) => { const i = rows.length + 1; push([r[0], r[1], r[2], r[3], `=D${i}*12/10`, `=D${i}*${RATE}`, `=E${i}*${RATE}`, r[4]]); });

push(['', '', '', '', '', '', '', '']);
push(['В SCOPE — ОЦЕНКА', '', '', '', '', '', '', '']);
push(HEADER);

const firstCb = rows.length + 1;
classberryAll.forEach((r) => {
  const i = rows.length + 1;
  push([r[0], r[1], r[2], r[3], `=D${i}*12/10`, `=D${i}*${RATE}`, `=E${i}*${RATE}`, r[4]]);
});
const lastCb = rows.length;
const subCbRow = push(['', 'Подытог: разделы in scope', '', `=SUM(D${firstCb}:D${lastCb})`, `=SUM(E${firstCb}:E${lastCb})`, `=SUM(F${firstCb}:F${lastCb})`, `=SUM(G${firstCb}:G${lastCb})`, '']);

const firstAdd = rows.length + 1;
additions.forEach((r) => { const i = rows.length + 1; push([r[0], r[1], r[2], r[3], `=D${i}*12/10`, `=D${i}*${RATE}`, `=E${i}*${RATE}`, r[4]]); });
const lastAdd = rows.length;
const subAddRow = push(['', 'Подытог: дополнения', '', `=SUM(D${firstAdd}:D${lastAdd})`, `=SUM(E${firstAdd}:E${lastAdd})`, `=SUM(F${firstAdd}:F${lastAdd})`, `=SUM(G${firstAdd}:G${lastAdd})`, '']);

const firstCc = rows.length + 1;
let paymentsSheetRow1 = null;
crosscut.forEach((r) => {
  const i = rows.length + 1;
  if (r[1] === 'Платежи') paymentsSheetRow1 = i;
  push([r[0], r[1], r[2], r[3], `=D${i}*12/10`, `=D${i}*${RATE}`, `=E${i}*${RATE}`, r[4]]);
});
const lastCc = rows.length;
const subCcRow = push(['', 'Подытог: сквозные', '', `=SUM(D${firstCc}:D${lastCc})`, `=SUM(E${firstCc}:E${lastCc})`, `=SUM(F${firstCc}:F${lastCc})`, `=SUM(G${firstCc}:G${lastCc})`, '']);

const grandRow = push(['', 'ИТОГО Этап 1', '', `=D${subCbRow}+D${subAddRow}+D${subCcRow}`, `=E${subCbRow}+E${subAddRow}+E${subCcRow}`, `=F${subCbRow}+F${subAddRow}+F${subCcRow}`, `=G${subCbRow}+G${subAddRow}+G${subCcRow}`, '']);

push(['', '', '', '', '', '', '', '']);
push(['Вне разработки (PM)', 'Согласование бухгалтерии с Наташей', 'Статьи, типы платежей, сверка', 0, '', '', '', 'До модуля бухгалтерии']);

push(['', '', '', '', '', '', '', '']);
const pbHeaderRow = push(['Окупаемость', '', '', '', '', '', '', '']);
push(['', 'Срок разработки Этап 1', '~2 мес (разовый проект, не ежемесячный retainer)', '', '', '', '', '']);
const devMinRow = push(['', 'Разовая разработка, € (мин)', 'сумма строки «ИТОГО Этап 1»', '', '', `=F${grandRow}`, '', '']);
const devMaxRow = push(['', 'Разовая разработка, € (макс)', '', '', '', '', `=G${grandRow}`, '']);
const cbMinRow = push(['', 'Classberry, €/мес (мин)', '15 000 €/год ÷ 12', '', '', '=15000/12', '', '']);
const cbMaxRow = push(['', 'Classberry, €/мес (макс)', '20 000 €/год ÷ 12', '', '', '=20000/12', '', '']);
const infraMinRow = push(['', 'Инфра после запуска, €/мес (мин)', 'Supabase Pro и др.; без retainer', '', '', 35, '', '']);
const infraMaxRow = push(['', 'Инфра после запуска, €/мес (макс)', '', '', '', 50, '', '']);
push(['', 'Retainer / поддержка', 'вне базовой оценки Этап 1 — по SLA, отдельно', '', '', '', '', '']);
const ecoMinRow = push(['', 'Экономия vs Classberry, €/мес (мин)', 'Classberry мин − инфра макс', '', '', `=F${cbMinRow}-F${infraMaxRow}`, '', '']);
const ecoMaxRow = push(['', 'Экономия vs Classberry, €/мес (макс)', 'Classberry макс − инфра мин', '', '', `=F${cbMaxRow}-F${infraMinRow}`, '', '']);
const pbMaxRow = push(['', 'Окупаемость разработки, мес (макс)', 'разработка макс ÷ экономия (мин)', '', '', `=G${devMaxRow}/F${ecoMinRow}`, '', '']);
const pbMinRow = push(['', 'Окупаемость разработки, мес (мин)', 'разработка мин ÷ экономия (макс)', '', '', `=F${devMinRow}/F${ecoMaxRow}`, '', '']);
push(['', 'Вывод', 'минимум/максимум показаны в колонках D-G; +20% заложены в максимум', '', '', '', '', '']);

const NCOLS = 8;

async function ensureSheet() {
  const targetId = process.argv[2];
  if (targetId) {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: targetId });
    const add = await sheets.spreadsheets.batchUpdate({ spreadsheetId: targetId, requestBody: { requests: [{ addSheet: { properties: { title: 'tmp_' + Date.now(), gridProperties: { rowCount: rows.length + 10, columnCount: NCOLS } } } }] } });
    const newSheetId = add.data.replies[0].addSheet.properties.sheetId;
    const dels = meta.data.sheets.map((s) => ({ deleteSheet: { sheetId: s.properties.sheetId } }));
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: targetId, requestBody: { requests: dels } });
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: targetId, requestBody: { requests: [{ updateSheetProperties: { properties: { sheetId: newSheetId, title: 'Декомпозиция' }, fields: 'title' } }] } });
    return { spreadsheetId: targetId, sheetId: newSheetId };
  }
  const create = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: 'ArtHome CRM — Classberry mapping (Этап 1)', locale: 'ru_RU' },
      sheets: [{ properties: { title: 'Декомпозиция', gridProperties: { rowCount: rows.length + 10, columnCount: NCOLS } } }],
    },
  });
  return { spreadsheetId: create.data.spreadsheetId, sheetId: create.data.sheets[0].properties.sheetId };
}

async function main() {
  const { spreadsheetId, sheetId } = await ensureSheet();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Декомпозиция!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  });

  const BLUE = { red: 0.12, green: 0.29, blue: 0.49 };
  const LIGHT = { red: 0.90, green: 0.94, blue: 0.99 };
  const GREY = { red: 0.93, green: 0.93, blue: 0.93 };
  const MUTED = { red: 0.95, green: 0.92, blue: 0.92 };
  const WHITE = { red: 1, green: 1, blue: 1 };
  const rc = (r0, r1, fmt, fields) => ({ repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1 }, cell: { userEnteredFormat: fmt }, fields } });

  const excludedStart = 3;
  const excludedEnd = excludedStart + excluded.length;
  const headerRow = excludedEnd + 2;
  const firstData = headerRow + 1;

  const boldRuns = (text, labels) => {
    const runs = [];
    for (const label of labels) {
      const idx = text.indexOf(label);
      if (idx >= 0) runs.push({ startIndex: idx, format: { bold: true } });
    }
    return runs;
  };
  const richCell = (row0, col0, text, labels) => ({
    updateCells: {
      range: { sheetId, startRowIndex: row0, endRowIndex: row0 + 1, startColumnIndex: col0, endColumnIndex: col0 + 1 },
      rows: [{ values: [{ userEnteredValue: { stringValue: text }, textFormatRuns: boldRuns(text, labels) }] }],
      fields: 'userEnteredValue,textFormatRuns',
    },
  });

  const reqs = [
    { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NCOLS }, mergeType: 'MERGE_ALL' } },
    rc(0, 1, { textFormat: { bold: true, fontSize: 13 } }, 'userEnteredFormat.textFormat'),
    { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: NCOLS }, mergeType: 'MERGE_ALL' } },
    rc(excludedStart - 1, excludedStart, { textFormat: { bold: true, italic: true } }, 'userEnteredFormat.textFormat'),
    rc(excludedStart, excludedEnd, { backgroundColor: MUTED, textFormat: { foregroundColor: { red: 0.4, green: 0.4, blue: 0.4 } } }, 'userEnteredFormat(backgroundColor,textFormat)'),
    rc(headerRow, headerRow + 1, { backgroundColor: BLUE, textFormat: { bold: true, foregroundColor: WHITE }, horizontalAlignment: 'CENTER' }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: headerRow + 1 } }, fields: 'gridProperties.frozenRowCount' } },
    rc(subCbRow - 1, subCbRow, { backgroundColor: LIGHT, textFormat: { bold: true } }, 'userEnteredFormat(backgroundColor,textFormat)'),
    rc(subAddRow - 1, subAddRow, { backgroundColor: LIGHT, textFormat: { bold: true } }, 'userEnteredFormat(backgroundColor,textFormat)'),
    rc(subCcRow - 1, subCcRow, { backgroundColor: LIGHT, textFormat: { bold: true } }, 'userEnteredFormat(backgroundColor,textFormat)'),
    rc(grandRow - 1, grandRow, { backgroundColor: BLUE, textFormat: { bold: true, foregroundColor: WHITE } }, 'userEnteredFormat(backgroundColor,textFormat)'),
    rc(pbHeaderRow - 1, pbHeaderRow, { backgroundColor: GREY, textFormat: { bold: true } }, 'userEnteredFormat(backgroundColor,textFormat)'),
    { repeatCell: { range: { sheetId, startRowIndex: firstData - 1, endRowIndex: grandRow, startColumnIndex: 5, endColumnIndex: 7 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0 €' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: devMinRow - 1, endRowIndex: ecoMaxRow, startColumnIndex: 5, endColumnIndex: 7 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '#,##0 €' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: pbMaxRow - 1, endRowIndex: pbMinRow + 1, startColumnIndex: 5, endColumnIndex: 7 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0.0" мес"' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 400 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 5 }, properties: { pixelSize: 96 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 7 }, properties: { pixelSize: 112 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 280 }, fields: 'pixelSize' } },
  ];


  if (paymentsSheetRow1) {
    const pr = paymentsSheetRow1 - 1;
    reqs.push(
      richCell(pr, 2, PAYMENTS_WHAT, ['Платежи']),
      richCell(pr, 7, PAYMENTS_NOTE, ['ДЕЛАЕМ:', 'НЕ делаем:']),
    );
  }

  const totalRows = rows.length;
  reqs.push(
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: NCOLS },
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
        fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment',
      },
    },
    {
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: totalRows },
      },
    },
  );

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reqs } });
  console.log('SPREADSHEET_ID=' + spreadsheetId);
  console.log('URL=https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit');
}

main().catch((e) => { console.error('error', e.message); process.exit(1); });
