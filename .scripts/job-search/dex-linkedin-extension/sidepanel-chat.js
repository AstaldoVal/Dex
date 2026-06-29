(function () {
  'use strict';

  var DEFAULT_CHAT_REPLY_PORT = 8777;
  var STORAGE_CHAT_REPLY_PORT = 'dexChatReplyPort';
  /** @type {string} */
  var BASE = '';
  var API = '';

  var msgEl = document.getElementById('msg');
  var styleEl = document.getElementById('style');
  var goBtn = document.getElementById('go');
  var errEl = document.getElementById('err');
  var variantsEl = document.getElementById('variants');
  var rulesBodyEl = document.getElementById('rules-body');
  var followupApprovedBodyEl = document.getElementById('followup-approved-body');
  var followupDraftBodyEl = document.getElementById('followup-draft-body');
  var matchclubHintEl = document.getElementById('matchclub-hint');
  var matchclubDomBtn = document.getElementById('matchclub-dom-btn');
  var matchclubDomStatus = document.getElementById('matchclub-dom-status');
  var matchclubDebugEl = document.getElementById('matchclub-debug');
  var matchclubOnlineOnlyBtn = document.getElementById('matchclub-online-only-btn');
  var matchclubOnlineStatus = document.getElementById('matchclub-online-status');
  var matchclubPullBtn = document.getElementById('matchclub-pull-context-btn');
  var matchclubPullStatus = document.getElementById('matchclub-pull-status');
  var matchclubExportChatsBtn = document.getElementById('matchclub-export-chats-btn');
  var matchclubExportStatus = document.getElementById('matchclub-export-status');
  var matchclubOutboundInsertOnlyEl = document.getElementById('matchclub-outbound-insert-only');
  var matchclubSiteBannerEl = document.getElementById('matchclub-site-banner');
  var chatInsertStatusEl = document.getElementById('chat-insert-status');
  var rulesDialogEl = document.getElementById('rules-dialog');
  var rulesInfoBtn = document.getElementById('rules-info-btn');
  var rulesDialogCloseBtn = document.getElementById('rules-dialog-close');
  var INVENTORY_API = '';
  var CHATS_EXPORT_API = '';
  var OUTBOUND_QUEUE_API = '';
  var STORAGE_MC_DEBUG = 'matchClubDebug';
  var STORAGE_MC_WATCH = 'matchClubWatchV1';
  var STORAGE_MC_DAILY_SENT = 'matchClubDailySentStatsV1';
  var STORAGE_MC_ACTIVITY = 'matchClubActivityLogV1';
  var MATCH_CLUB_DAILY_TARGET = 700;
  var matchclubWatchStartBtn = document.getElementById('matchclub-watch-start-btn');
  var matchclubWatchStartFreeBtn = document.getElementById('matchclub-watch-start-free-btn');
  var matchclubWatchStartPaidBtn = document.getElementById('matchclub-watch-start-paid-btn');
  var matchclubWatchStopBtn = document.getElementById('matchclub-watch-stop-btn');
  var matchclubWatchAbortWaitBtn = document.getElementById('matchclub-watch-abort-wait-btn');
  var matchclubWatchDelayMinEl = document.getElementById('matchclub-watch-delay-min');
  var matchclubWatchBaselineBtn = document.getElementById('matchclub-watch-baseline-btn');
  var matchclubWatchStatusMainEl = document.getElementById('matchclub-watch-status-main');
  var matchclubWatchStatusExtraEl = document.getElementById('matchclub-watch-status-extra');
  var matchclubActivityReportBtn = document.getElementById('matchclub-activity-report-btn');
  var matchclubActivityReportStatus = document.getElementById('matchclub-activity-report-status');

  function portFromBase() {
    try {
      var u = new URL(BASE);
      return parseInt(u.port || String(DEFAULT_CHAT_REPLY_PORT), 10) || DEFAULT_CHAT_REPLY_PORT;
    } catch (e) {
      return DEFAULT_CHAT_REPLY_PORT;
    }
  }

  /**
   * @param {number|string} port
   */
  function setChatReplyBase(port) {
    var p = parseInt(String(port), 10);
    if (isNaN(p) || p < 1 || p > 65535) p = DEFAULT_CHAT_REPLY_PORT;
    BASE = 'http://127.0.0.1:' + p;
    API = BASE + '/api/suggest-replies';
    INVENTORY_API = BASE + '/api/match-club-inventory';
    CHATS_EXPORT_API = BASE + '/api/match-club-chats-export';
    OUTBOUND_QUEUE_API = BASE + '/api/match-club-outbound-queue';
  }

  setChatReplyBase(DEFAULT_CHAT_REPLY_PORT);

  /**
   * @param {string} hint
   */
  function appendFileHintToOutboundError(hint) {
    var fileHint = 'Файл: .scripts/chat-reply/match-club-outbound-queue.md';
    var h = String(hint || '').trim();
    var body = 'Критическая ошибка: очередь outbound недоступна или пуста после ответа сервера. ';
    if (!h) return body + fileHint;
    var sep = /[.!?…]$/.test(h) ? ' ' : '. ';
    return body + h + sep + fileHint;
  }

  /**
   * Загрузка очереди для экспорта: GET /api/match-club-outbound-queue (только через chat-reply-server).
   * Ноль строк с сервера — критическая ошибка: сервер сам записывает шаблон в `match-club-outbound-queue.md` и возвращает `repaired`.
   * В расширении резерва нет: при ошибке сети / 500 / пустом массиве экспорт не стартует.
   * @param {function(?string, ?string[], ?{repaired?: boolean, queueSource?: string, sourcePath?: string}): void} done
   */
  function loadOutboundQueueForExport(done) {
    function onQueueJsonText(text, lastAttempt) {
      var raw = String(text == null ? '' : text).replace(/^\uFEFF/, '');
      var t = raw.trim();
      if (!t) {
        if (lastAttempt) {
          done('outbound_queue_no_body', null, null);
        } else {
          tryBg();
        }
        return;
      }
      var j;
      try {
        j = JSON.parse(t);
      } catch (parseErr) {
        if (lastAttempt) {
          done(
            'outbound_queue_invalid_json: ' +
              (parseErr && parseErr.message ? parseErr.message : 'parse') +
              ' | head: ' +
              t.slice(0, 200),
            null,
            null
          );
        } else {
          tryBg();
        }
        return;
      }
      if (j && j.ok === false) {
        done(j.detail || j.error || 'server_error', null, null);
        return;
      }
      if (!j || !Array.isArray(j.messages)) {
        if (lastAttempt) {
          done(
            'outbound_queue_unexpected_shape: ' + JSON.stringify(j).slice(0, 280),
            null,
            null
          );
        } else {
          tryBg();
        }
        return;
      }
      var msgs = j.messages.filter(function (x) {
        return typeof x === 'string' && String(x).trim();
      });
      if (msgs.length === 0) {
        done('outbound_queue_empty', null, null);
        return;
      }
      done(null, msgs, {
        repaired: j.repaired === true,
        queueSource: j.queueSource || 'match_club_file',
        sourcePath: typeof j.sourcePath === 'string' ? j.sourcePath : ''
      });
    }
    function tryBg() {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        done('chat_reply_unreachable', null, null);
        return;
      }
      chrome.runtime.sendMessage(
        { action: 'dexChatReplyGet', path: '/api/match-club-outbound-queue', base: BASE },
        function (resp) {
          // resp.ok отражает HTTP status (500 -> false); тело JSON всё равно нужно разобрать (ok:false, detail).
          if (chrome.runtime.lastError || !resp || typeof resp.text !== 'string') {
            done('chat_reply_unreachable', null, null);
            return;
          }
          onQueueJsonText(resp.text, true);
        }
      );
    }
    fetch(OUTBOUND_QUEUE_API, { method: 'GET', cache: 'no-store' })
      .then(function (r) {
        return r.text();
      })
      .then(function (text) {
        onQueueJsonText(text, false);
      })
      .catch(function () {
        tryBg();
      });
  }

  function setupRulesInfoDialog() {
    if (!rulesDialogEl) return;
    function openDialog() {
      if (typeof rulesDialogEl.showModal === 'function') {
        rulesDialogEl.showModal();
      }
    }
    function closeDialog() {
      if (typeof rulesDialogEl.close === 'function') {
        rulesDialogEl.close();
      }
    }
    if (rulesInfoBtn) {
      rulesInfoBtn.addEventListener('click', function () {
        openDialog();
      });
    }
    if (rulesDialogCloseBtn) {
      rulesDialogCloseBtn.addEventListener('click', function () {
        closeDialog();
      });
    }
    rulesDialogEl.addEventListener('click', function (e) {
      if (e.target === rulesDialogEl) {
        closeDialog();
      }
    });
  }
  setupRulesInfoDialog();

  var panelHelpDialogEl = document.getElementById('panel-help-dialog');
  var panelHelpTitleEl = document.getElementById('panel-help-title');
  var panelHelpBodyEl = document.getElementById('panel-help-body');
  var panelHelpCloseBtn = document.getElementById('panel-help-close');

  var PANEL_HELP_HTML = {
    overview:
      '<p>Полный текст правил проекта (включая контекст Match Club / операторский) открывается кнопкой <strong>i</strong> в шапке панели. Фильтр списка <strong>только онлайн</strong> — кнопка <strong>Онлайн</strong> рядом. Ниже — блоки утверждённых и черновых добивов. Логин и пароль храните в корневом <code>.env</code> (<code>MATCH_CLUB_*</code>); расширение их не подставляет. Пункт меню страницы: «Dex: Открыть Match Club».</p>',
    debug:
      '<p>При включённой галочке в консоли вкладки сайта (F12 → Console) выводятся сообщения с префиксом <code>[Dex MC]</code> для отладки сценариев Match Club.</p>',
    queue:
      '<p>По умолчанию расширение только вставляет текст добивки в поле чата и ждёт вашу отправку (human-in-the-loop). Снимите галочку, если нужна автоматическая отправка (убедитесь, что это допустимо по правилам площадки и вашему процессу).</p>',
    watch:
      '<p>Три режима: <strong>Paid → Free</strong> (стандарт), <strong>только Free</strong> (без Paid/First SMS в очереди), <strong>только Paid / 1st SMS</strong> (бесплатные не ставятся в очередь; на сайте снимается Online и по возможности включается фильтр платных; черновик вставляется, следующий чат только после вашей отправки или если вы очистили поле ввода).</p><p>После запуска мониторинг следит за новыми строками в списке чатов на открытой вкладке. Для новой строки выдерживается задержка (минуты), затем открывается чат и вставляется черновик из той же очереди outbound, что и при массовом экспорте. Пояснения по счётчикам — в карточке статуса ниже кнопок.</p>',
    generate:
      '<p><strong>Куратор:</strong> между исходящими добивами по онлайн-очереди выдерживайте <strong>3–5 минут</strong>; тексты только из утверждённого списка выше, с ротацией. Подробности в <code>chat-project-rules.md</code> (раздел «Операторский контекст» и добивы).</p><p>Вставьте сообщение собеседника (скопируйте с страницы), выберите стиль и нажмите «Сгенерировать». Варианты учитывают правила на сервере (кнопка <strong>i</strong> в шапке) и утверждённые добивы. Фильтр Online на списке — кнопка <strong>Онлайн</strong> в шапке.</p>',
    server:
      '<p>Нужен локальный сервер: <code>npm run chat-reply:server</code> или <code>npm run chat-reply:server:local</code> (Ollama; см. <code>.scripts/chat-reply/chat-reply.env.example</code>, <code>CHAT_REPLY_OLLAMA_NUM_PREDICT</code>, <code>GET /health</code>). Иначе задайте <code>OPENAI_API_KEY</code> в .env. Файлы: <code>chat-project-rules.md</code>, утверждённые добивы <code>chat-followup-phrases-approved-en.md</code> (маршрут <code>GET /api/chat-followup-phrases-approved</code>).</p><p>Расширение не может само выполнить <code>npm</code> (ограничение Chrome). Автоподъём <code>chat-reply-server</code> возможен после установки Native Messaging host: <code>install-native-host.sh</code> в папке расширения и id расширения с <code>chrome://extensions</code>. Без host сервер нужно запускать вручную.</p>'
  };

  function openPanelHelp(title, html) {
    if (!panelHelpDialogEl || !panelHelpTitleEl || !panelHelpBodyEl) return;
    panelHelpTitleEl.textContent = title || 'Справка';
    panelHelpBodyEl.innerHTML = html || '';
    if (typeof panelHelpDialogEl.showModal === 'function') {
      panelHelpDialogEl.showModal();
    }
  }

  function closePanelHelp() {
    if (panelHelpDialogEl && typeof panelHelpDialogEl.close === 'function') {
      panelHelpDialogEl.close();
    }
  }

  function setupPanelHelpDialogs() {
    if (panelHelpCloseBtn) {
      panelHelpCloseBtn.addEventListener('click', closePanelHelp);
    }
    if (panelHelpDialogEl) {
      panelHelpDialogEl.addEventListener('click', function (e) {
        if (e.target === panelHelpDialogEl) closePanelHelp();
      });
    }
    var ov = document.getElementById('matchclub-help-overview');
    if (ov) {
      ov.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPanelHelp('Match Club: обзор', PANEL_HELP_HTML.overview);
      });
    }
    var db = document.getElementById('matchclub-help-debug');
    if (db) {
      db.addEventListener('click', function () {
        openPanelHelp('Логи в консоли', PANEL_HELP_HTML.debug);
      });
    }
    var qu = document.getElementById('matchclub-help-queue');
    if (qu) {
      qu.addEventListener('click', function () {
        openPanelHelp('Очередь outbound', PANEL_HELP_HTML.queue);
      });
    }
    var w = document.getElementById('matchclub-help-watch');
    if (w) {
      w.addEventListener('click', function () {
        openPanelHelp('Мониторинг списка', PANEL_HELP_HTML.watch);
      });
    }
    var gen = document.getElementById('help-generate-flow');
    if (gen) {
      gen.addEventListener('click', function () {
        openPanelHelp('Генерация и добивы', PANEL_HELP_HTML.generate);
      });
    }
    var srv = document.getElementById('help-server');
    if (srv) {
      srv.addEventListener('click', function () {
        openPanelHelp('Локальный сервер', PANEL_HELP_HTML.server);
      });
    }
  }
  setupPanelHelpDialogs();

  /**
   * GET markdown/text from chat-reply-server. Uses background service worker first (reliable with host_permissions);
   * falls back to direct fetch (e.g. if messaging fails).
   */
  function loadChatReplyText(path, bodyEl, emptyHint, errText) {
    if (!bodyEl) return;
    function applyError() {
      bodyEl.textContent = errText;
      bodyEl.classList.add('error');
    }
    function applyOk(text) {
      bodyEl.textContent = (text || '').trim() || emptyHint;
      bodyEl.classList.remove('error');
    }
    function tryDirect() {
      fetch(BASE + path, { method: 'GET', cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(applyOk)
        .catch(applyError);
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'dexChatReplyGet', path: path, base: BASE },
        function (resp) {
          if (chrome.runtime.lastError) {
            tryDirect();
            return;
          }
          if (resp && resp.ok === true && typeof resp.text === 'string') {
            applyOk(resp.text);
            return;
          }
          tryDirect();
        }
      );
      return;
    }
    tryDirect();
  }

  function loadProjectRules() {
    loadChatReplyText(
      '/api/chat-project-rules',
      rulesBodyEl,
      '(файл правил пуст)',
      'Не удалось загрузить правила. Запустите в корне репозитория Dex: npm run chat-reply:server\n\n' +
        'Локальная копия лежит в репозитории: .scripts/chat-reply/chat-project-rules.md'
    );
  }

  function loadFollowupApproved() {
    loadChatReplyText(
      '/api/chat-followup-phrases-approved',
      followupApprovedBodyEl,
      '(файл пуст)',
      'Не удалось загрузить. Запустите: npm run chat-reply:server\n\n' +
        'Файл: .scripts/chat-reply/chat-followup-phrases-approved-en.md'
    );
  }

  function loadFollowupDraft() {
    loadChatReplyText(
      '/api/chat-followup-phrases-draft',
      followupDraftBodyEl,
      '(файл пуст)',
      'Не удалось загрузить. Запустите: npm run chat-reply:server\n\n' +
        'Файл: .scripts/chat-reply/chat-followup-phrases-draft-en.md'
    );
  }

  function startInitialChatReplyLoads() {
    loadProjectRules();
    loadFollowupApproved();
    loadFollowupDraft();
  }

  var chatReplyPortInput = document.getElementById('chat-reply-port-input');
  var chatReplyPortSave = document.getElementById('chat-reply-port-save');
  var chatReplyPortStatus = document.getElementById('chat-reply-port-status');

  if (chrome.storage && chrome.storage.local) {
    var st0 = {};
    st0[STORAGE_CHAT_REPLY_PORT] = DEFAULT_CHAT_REPLY_PORT;
    chrome.storage.local.get(st0, function (o) {
      var p = parseInt(o && o[STORAGE_CHAT_REPLY_PORT], 10);
      if (!isNaN(p) && p >= 1 && p <= 65535) setChatReplyBase(p);
      if (chatReplyPortInput) chatReplyPortInput.value = String(portFromBase());
      startInitialChatReplyLoads();
    });
  } else {
    if (chatReplyPortInput) chatReplyPortInput.value = String(portFromBase());
    startInitialChatReplyLoads();
  }

  if (chatReplyPortSave && chatReplyPortInput && chrome.storage && chrome.storage.local) {
    chatReplyPortSave.addEventListener('click', function () {
      var p = parseInt(chatReplyPortInput.value, 10);
      if (isNaN(p) || p < 1 || p > 65535) {
        if (chatReplyPortStatus) {
          chatReplyPortStatus.textContent = 'Введите порт от 1 до 65535';
          chatReplyPortStatus.style.color = 'var(--error)';
        }
        chatReplyPortInput.value = String(portFromBase());
        return;
      }
      var st = {};
      st[STORAGE_CHAT_REPLY_PORT] = p;
      chrome.storage.local.set(st, function () {
        setChatReplyBase(p);
        startInitialChatReplyLoads();
        if (chatReplyPortStatus) {
          chatReplyPortStatus.textContent = 'Порт ' + p + ': обновлены правила и добивы';
          chatReplyPortStatus.style.color = 'var(--muted)';
        }
      });
    });
  }

  if (matchclubDebugEl && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([STORAGE_MC_DEBUG], function (o) {
      matchclubDebugEl.checked = !!(o && o[STORAGE_MC_DEBUG]);
    });
    matchclubDebugEl.addEventListener('change', function () {
      var st = {};
      st[STORAGE_MC_DEBUG] = !!matchclubDebugEl.checked;
      chrome.storage.local.set(st);
    });
  }

  function mergeWatchState(raw) {
    var base = {
      enabled: false,
      watchMode: 'all',
      paidOnlyPassPhase: 'paid',
      delayMs: 180000,
      seenHrefKeys: [],
      baselineCaptured: false,
      pending: [],
      activeProcessingId: null
    };
    if (!raw || typeof raw !== 'object') return base;
    if (typeof raw.enabled === 'boolean') base.enabled = raw.enabled;
    if (raw.watchMode === 'free_only' || raw.watchMode === 'all' || raw.watchMode === 'paid_only') {
      base.watchMode = raw.watchMode;
    }
    if (raw.paidOnlyPassPhase === 'unread') {
      base.paidOnlyPassPhase = 'unread';
    } else if (raw.paidOnlyPassPhase === 'first_sms') {
      base.paidOnlyPassPhase = 'first_sms';
    } else {
      base.paidOnlyPassPhase = 'paid';
    }
    if (typeof raw.delayMs === 'number' && raw.delayMs >= 60000 && raw.delayMs <= 3600000) {
      base.delayMs = raw.delayMs;
    }
    if (Array.isArray(raw.seenHrefKeys)) base.seenHrefKeys = raw.seenHrefKeys.slice();
    base.baselineCaptured = !!raw.baselineCaptured;
    if (Array.isArray(raw.pending)) base.pending = raw.pending.slice();
    if (typeof raw.activeProcessingId === 'string' || raw.activeProcessingId === null) {
      base.activeProcessingId = raw.activeProcessingId;
    }
    return base;
  }

  function getLocalDayKey(dateLike) {
    var d = dateLike instanceof Date ? dateLike : new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var dd = d.getDate();
    return (
      String(y) +
      '-' +
      (m < 10 ? '0' + String(m) : String(m)) +
      '-' +
      (dd < 10 ? '0' + String(dd) : String(dd))
    );
  }

  function getTodaySentCount(rawStats) {
    var st = rawStats || {};
    if (!st || typeof st !== 'object' || Array.isArray(st)) return 0;
    var byDay = st.byDay;
    if (!byDay || typeof byDay !== 'object' || Array.isArray(byDay)) return 0;
    var n = parseInt(byDay[getLocalDayKey(new Date())], 10);
    if (isNaN(n) || n < 0) return 0;
    return n;
  }

  function getTodayActivitySummary(rawActivity) {
    var out = {
      totalMinutes: 0,
      activeHours: [],
      hoursMinutes: {}
    };
    if (!rawActivity || typeof rawActivity !== 'object' || Array.isArray(rawActivity)) return out;
    var byDay = rawActivity.byDay;
    if (!byDay || typeof byDay !== 'object' || Array.isArray(byDay)) return out;
    var day = byDay[getLocalDayKey(new Date())];
    if (!day || typeof day !== 'object' || Array.isArray(day)) return out;
    var totalSec = parseInt(day.totalSec, 10);
    if (isNaN(totalSec) || totalSec < 0) totalSec = 0;
    out.totalMinutes = Math.max(0, Math.round(totalSec / 60));
    var hs = day.hoursSec;
    if (!hs || typeof hs !== 'object' || Array.isArray(hs)) return out;
    var keys = Object.keys(hs).sort();
    var i;
    for (i = 0; i < keys.length; i++) {
      var hk = keys[i];
      var sec = parseInt(hs[hk], 10);
      if (isNaN(sec) || sec < 1) continue;
      var min = Math.max(1, Math.round(sec / 60));
      out.activeHours.push(hk);
      out.hoursMinutes[hk] = min;
    }
    return out;
  }

  function mcwAppendRow(grid, label, value, valueClass) {
    var row = document.createElement('div');
    row.className = 'mcw-status-row';
    var k = document.createElement('span');
    k.className = 'mcw-status-k';
    k.textContent = label;
    var v = document.createElement('span');
    v.className = 'mcw-status-v' + (valueClass ? ' ' + valueClass : '');
    v.textContent = value;
    row.appendChild(k);
    row.appendChild(v);
    grid.appendChild(row);
  }

  /** Человекочитаемо: когда сработает scheduledAt (только для отладки очереди). */
  function formatMcwNextStart(scheduledAtMs) {
    if (typeof scheduledAtMs !== 'number' || isNaN(scheduledAtMs)) return '—';
    var now = Date.now();
    if (scheduledAtMs <= now) return 'сейчас';
    var ms = scheduledAtMs - now;
    var m = Math.ceil(ms / 60000);
    if (m <= 1) return 'скоро (~1 мин)';
    if (m < 60) return 'через ~' + m + ' мин';
    var h = Math.floor(m / 60);
    var rm = m - h * 60;
    return 'через ~' + h + ' ч' + (rm > 0 ? ' ' + rm + ' мин' : '');
  }

  function normalizeSidepanelWatchMode(st) {
    if (st.watchMode === 'free_only') return 'free_only';
    if (st.watchMode === 'paid_only') return 'paid_only';
    return 'all';
  }

  function refreshMatchClubWatchStatus() {
    if (!chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get([STORAGE_MC_WATCH, STORAGE_MC_DAILY_SENT, STORAGE_MC_ACTIVITY], function (o) {
      var st = mergeWatchState(o && o[STORAGE_MC_WATCH]);
      var mode = normalizeSidepanelWatchMode(st);
      var sentToday = getTodaySentCount(o && o[STORAGE_MC_DAILY_SENT]);
      var act = getTodayActivitySummary(o && o[STORAGE_MC_ACTIVITY]);
      var target = MATCH_CLUB_DAILY_TARGET;
      var left = Math.max(0, target - sentToday);
      var progressPct = target > 0 ? Math.min(100, Math.round((sentToday / target) * 100)) : 0;
      var pend = st.pending || [];
      var sched = 0;
      var dueNow = 0;
      var wait = 0;
      var processing = 0;
      var recovered = false;
      var minScheduledAt = null;
      var scheduledSnapshots = [];
      var pi;
      for (pi = 0; pi < pend.length; pi++) {
        var ps = pend[pi] && pend[pi].status;
        if (ps === 'scheduled') {
          sched++;
          var sat = pend[pi].scheduledAt;
          if (typeof sat === 'number' && sat <= Date.now()) dueNow++;
          if (typeof sat === 'number') {
            if (minScheduledAt == null || sat < minScheduledAt) minScheduledAt = sat;
            if (scheduledSnapshots.length < 5) {
              var peer = String((pend[pi] && pend[pi].peerTitle) || '').trim().slice(0, 36);
              var err = String((pend[pi] && pend[pi].lastError) || '').trim().slice(0, 48);
              scheduledSnapshots.push({
                peer: peer || (pend[pi] && pend[pi].hrefKey ? String(pend[pi].hrefKey).slice(0, 24) : '?'),
                at: sat,
                err: err
              });
            }
          }
        }
        if (ps === 'waiting_send') wait++;
        if (ps === 'processing') processing++;
        if (
          !recovered &&
          String((pend[pi] && pend[pi].lastError) || '').indexOf('recovered_on_tab_load') !== -1
        ) {
          recovered = true;
        }
      }
      var delayMin = Math.round(st.delayMs / 60000);
      if (matchclubWatchStartBtn) {
        matchclubWatchStartBtn.disabled = !!(st.enabled && mode === 'all');
      }
      if (matchclubWatchStartFreeBtn) {
        matchclubWatchStartFreeBtn.disabled = !!(st.enabled && mode === 'free_only');
      }
      if (matchclubWatchStartPaidBtn) {
        matchclubWatchStartPaidBtn.disabled = !!(st.enabled && mode === 'paid_only');
      }
      if (matchclubWatchStopBtn) {
        matchclubWatchStopBtn.disabled = !st.enabled;
      }
      if (matchclubWatchAbortWaitBtn) {
        matchclubWatchAbortWaitBtn.disabled = !st.enabled || wait < 1;
      }
      if (!matchclubWatchStatusMainEl) return;
      if (matchclubWatchStatusExtraEl) {
        matchclubWatchStatusExtraEl.textContent = '';
        matchclubWatchStatusExtraEl.hidden = true;
      }
      if (!st.enabled) {
        matchclubWatchStatusMainEl.innerHTML = '';
        var offP = document.createElement('p');
        offP.className = 'mcw-status-off-msg';
        offP.textContent =
          'Мониторинг выключен. Нажмите «Запустить мониторинг», чтобы снова отслеживать новые строки в списке чатов на открытой вкладке.';
        matchclubWatchStatusMainEl.appendChild(offP);
        return;
      }

      matchclubWatchStatusMainEl.innerHTML = '';
      var title = document.createElement('div');
      title.className = 'mcw-status-title';
      var badge = document.createElement('span');
      badge.className = 'mcw-badge mcw-badge-on';
      badge.textContent = 'Мониторинг вкл';
      var sub = document.createElement('span');
      sub.style.fontWeight = 'normal';
      sub.style.fontSize = '11px';
      sub.style.color = 'var(--muted)';
      sub.textContent = 'что происходит';
      title.appendChild(badge);
      title.appendChild(sub);
      matchclubWatchStatusMainEl.appendChild(title);

      var grid = document.createElement('div');
      grid.className = 'mcw-status-grid';
      mcwAppendRow(grid, 'Пауза перед обработкой нового чата (как в поле выше)', String(delayMin) + ' мин');
      mcwAppendRow(
        grid,
        'Режим мониторинга',
        mode === 'free_only'
          ? 'только бесплатные чаты'
          : mode === 'paid_only'
            ? st.paidOnlyPassPhase === 'unread'
              ? 'только Paid: фаза Unread (Paid и 1st SMS выкл, Unread вкл)'
              : st.paidOnlyPassPhase === 'first_sms'
                ? 'только Paid: фаза 1st SMS (Paid выкл, фильтр первого SMS вкл)'
                : 'только Paid: фаза Paid (только платные в списке и в очереди)'
            : 'сначала Paid/First SMS, потом Free',
        mode === 'free_only' || mode === 'paid_only' ? 'mcw-warn' : 'mcw-ok'
      );
      mcwAppendRow(
        grid,
        'Список чатов снят в «базу» (можно ловить только новые строки)',
        st.baselineCaptured ? 'да' : 'нет — откройте список чатов на сайте',
        st.baselineCaptured ? 'mcw-ok' : 'mcw-warn'
      );
      mcwAppendRow(
        grid,
        'Всего отложенных задач (ещё не открывали чат)',
        String(sched),
        sched > 0 ? '' : 'mcw-warn'
      );
      mcwAppendRow(
        grid,
        'Из них уже пора открыть чат (таймер выдержан)',
        String(dueNow),
        dueNow > 0 ? 'mcw-ok' : ''
      );
      if (sched > 0 && minScheduledAt != null) {
        mcwAppendRow(
          grid,
          'Ближайший старт по таймеру (не ручные сообщения)',
          formatMcwNextStart(minScheduledAt),
          dueNow > 0 ? 'mcw-ok' : ''
        );
      }
      if (processing > 0) {
        mcwAppendRow(grid, 'Сейчас открывается чат / вставляется черновик', String(processing), 'mcw-warn');
      }
      mcwAppendRow(
        grid,
        'Черновик в поле, ждём вашу отправку на сайте',
        String(wait),
        wait > 0 ? 'mcw-warn' : ''
      );
      mcwAppendRow(
        grid,
        'Отправлено сегодня (подтверждено расширением)',
        String(sentToday),
        sentToday >= target ? 'mcw-ok' : ''
      );
      mcwAppendRow(grid, 'Цель на день', String(target) + '+');
      mcwAppendRow(
        grid,
        sentToday >= target ? 'Цель выполнена' : 'Осталось до цели',
        sentToday >= target ? 'выполнено' : String(left),
        sentToday >= target ? 'mcw-ok' : 'mcw-warn'
      );
      mcwAppendRow(
        grid,
        'Прогресс',
        String(progressPct) + '%',
        progressPct >= 100 ? 'mcw-ok' : ''
      );
      mcwAppendRow(
        grid,
        'Активность сегодня (минуты)',
        String(act.totalMinutes),
        act.totalMinutes > 0 ? 'mcw-ok' : ''
      );
      mcwAppendRow(
        grid,
        'Активные часы',
        act.activeHours.length ? act.activeHours.join(', ') : '—',
        act.activeHours.length ? 'mcw-ok' : ''
      );
      matchclubWatchStatusMainEl.appendChild(grid);

      if (sched > 0 && scheduledSnapshots.length > 0) {
        var pendBox = document.createElement('div');
        pendBox.className = 'mcw-status-hint';
        pendBox.style.fontSize = '11px';
        pendBox.style.marginTop = '6px';
        var pendTitle = document.createElement('div');
        pendTitle.style.fontWeight = '600';
        pendTitle.style.marginBottom = '4px';
        pendTitle.textContent = 'Отложенные (до 5 шт.): имя / когда старт / lastError';
        pendBox.appendChild(pendTitle);
        var si;
        for (si = 0; si < scheduledSnapshots.length; si++) {
          var sn = scheduledSnapshots[si];
          var line = document.createElement('div');
          line.style.opacity = '0.95';
          line.textContent =
            (si + 1) +
            '. ' +
            sn.peer +
            ' · ' +
            formatMcwNextStart(sn.at) +
            (sn.err ? ' · ' + sn.err : '');
          pendBox.appendChild(line);
        }
        matchclubWatchStatusMainEl.appendChild(pendBox);
      }

      if (recovered) {
        var rec = document.createElement('div');
        rec.className = 'mcw-status-hint';
        rec.style.borderLeftColor = '#ffb86b';
        rec.style.background = 'rgba(255, 184, 107, 0.1)';
        rec.textContent =
          'После перезагрузки вкладки задачи, которые были «в работе», вернулись в очередь: время старта пересчитано (сброс таймера).';
        matchclubWatchStatusMainEl.appendChild(rec);
      }

      var hint = document.createElement('div');
      hint.className = 'mcw-status-hint';
      if (!st.baselineCaptured) {
        hint.textContent =
          'Откройте на сайте страницу со списком чатов — пока база не снята, мониторинг не знает, какие строки новые.';
      } else if (sched === 0 && wait === 0) {
        hint.textContent =
          'Очередь пуста: в списке пока нет новых чатов для обработки после старта мониторинга.';
      } else if (dueNow > 0) {
        hint.textContent =
          'Можно свернуть вкладку в фон. Когда скрипт откроет чат и вставит текст, переключитесь на вкладку и при необходимости отправьте сообщение.';
      } else if (sched > 0 && dueNow === 0) {
        hint.textContent =
          'Задачи в очереди есть, но таймер ещё не наступил. Пауза в минутах задаётся в момент постановки задачи (новая строка в списке или добор «catch-up»), это не интервал «каждые N минут после вашего сообщения». Скрипт вставляет фразы из локальной outbound-очереди сервера chat-reply, а не продолжает ваш ручной диалог во всех чатах подряд.';
      } else {
        hint.textContent = 'Статус обновляется при изменении очереди на вкладке Match Club.';
      }
      matchclubWatchStatusMainEl.appendChild(hint);

      var foot = document.createElement('div');
      foot.className = 'mcw-status-foot';
      foot.textContent =
        'После обновления страницы (F5) восстановленные задачи получают пересчёт времени. Первые ~15 секунд после загрузки вкладки шаги не выполняются. Чат мог не попасть в очередь, если он уже был в «базе» списка и не подошёл под добор, или если включён фильтр «только онлайн», а собеседник офлайн.';
      matchclubWatchStatusMainEl.appendChild(foot);
    });
  }

  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([STORAGE_MC_WATCH], function (o) {
      var st = mergeWatchState(o && o[STORAGE_MC_WATCH]);
      if (matchclubWatchDelayMinEl) {
        var m = Math.round(st.delayMs / 60000);
        if (m < 3) m = 3;
        if (m > 10) m = 10;
        matchclubWatchDelayMinEl.value = String(m);
      }
      refreshMatchClubWatchStatus();
    });
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (!changes[STORAGE_MC_WATCH] && !changes[STORAGE_MC_DAILY_SENT] && !changes[STORAGE_MC_ACTIVITY]) return;
        refreshMatchClubWatchStatus();
      });
    } catch (e) {}
  }

  function notifyMatchClubWatchTabsContentScripts(partial) {
    if (!chrome.tabs || !chrome.tabs.query) return;
    try {
      chrome.tabs.query({}, function (tabs) {
        if (!tabs || !tabs.length) return;
        var i;
        var n = 0;
        for (i = 0; i < tabs.length; i++) {
          var t = tabs[i];
          var u = (t.url || '').toLowerCase();
          if (u.indexOf('match-club.club') === -1) continue;
          if (t.id == null) continue;
          n++;
          try {
            chrome.tabs.sendMessage(
              t.id,
              { action: 'matchClubWatchApplyState' },
              function () {
                void chrome.runtime.lastError;
              }
            );
          } catch (eSend) {}
        }
        if (partial && partial.enabled === true && n === 0 && matchclubWatchStatusExtraEl) {
          setTimeout(function () {
            var cur = matchclubWatchStatusExtraEl.textContent || '';
            if (cur.indexOf('Нет открытой вкладки match-club') !== -1) return;
            matchclubWatchStatusExtraEl.textContent =
              cur +
              (cur ? '\n' : '') +
              'Нет открытой вкладки match-club.club: откройте сайт со списком чатов и обновите страницу (F5), затем снова нажмите «Запустить мониторинг», если статус не обновился.';
            matchclubWatchStatusExtraEl.hidden = false;
          }, 80);
        }
      });
    } catch (eN) {}
  }

  function saveWatchStateFromUi(partial) {
    if (!chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get([STORAGE_MC_WATCH], function (o) {
      var st = mergeWatchState(o && o[STORAGE_MC_WATCH]);
      if (partial) {
        if (partial.enabled !== undefined) st.enabled = partial.enabled;
        if (partial.watchMode === 'free_only' || partial.watchMode === 'all' || partial.watchMode === 'paid_only') {
          st.watchMode = partial.watchMode;
        }
        if (partial.delayMs !== undefined) st.delayMs = partial.delayMs;
        if (partial.baselineReset) {
          st.baselineCaptured = false;
          st.seenHrefKeys = [];
          st.pending = [];
          st.activeProcessingId = null;
          st.paidOnlyPassPhase = 'paid';
        }
        if (
          partial.paidOnlyPassPhase === 'paid' ||
          partial.paidOnlyPassPhase === 'first_sms' ||
          partial.paidOnlyPassPhase === 'unread'
        ) {
          st.paidOnlyPassPhase = partial.paidOnlyPassPhase;
        }
        if (partial.dropPriorityPending) {
          var activeRemoved = false;
          st.pending = (st.pending || []).filter(function (p) {
            var isPriority = !!(p && (p.isPaidChat || p.isFirstSms));
            if (!isPriority) return true;
            if (st.activeProcessingId && p && p.id === st.activeProcessingId) {
              activeRemoved = true;
            }
            return false;
          });
          if (activeRemoved) {
            st.activeProcessingId = null;
          }
        }
        if (partial.dropNonPriorityPending) {
          var activeRemovedNp = false;
          st.pending = (st.pending || []).filter(function (p) {
            var isPriorityNp = !!(p && (p.isPaidChat || p.isFirstSms));
            if (isPriorityNp) return true;
            if (st.activeProcessingId && p && p.id === st.activeProcessingId) {
              activeRemovedNp = true;
            }
            return false;
          });
          if (activeRemovedNp) {
            st.activeProcessingId = null;
          }
        }
      }
      var out = {};
      out[STORAGE_MC_WATCH] = st;
      chrome.storage.local.set(out, function () {
        refreshMatchClubWatchStatus();
        notifyMatchClubWatchTabsContentScripts(partial);
      });
    });
  }

  if (chrome.storage && chrome.storage.local) {
    if (matchclubWatchStartBtn) {
      matchclubWatchStartBtn.addEventListener('click', function () {
        saveWatchStateFromUi({ enabled: true, watchMode: 'all', paidOnlyPassPhase: 'paid' });
      });
    }
    if (matchclubWatchStartFreeBtn) {
      matchclubWatchStartFreeBtn.addEventListener('click', function () {
        saveWatchStateFromUi({
          enabled: true,
          watchMode: 'free_only',
          paidOnlyPassPhase: 'paid',
          dropPriorityPending: true
        });
      });
    }
    if (matchclubWatchStartPaidBtn) {
      matchclubWatchStartPaidBtn.addEventListener('click', function () {
        saveWatchStateFromUi({
          enabled: true,
          watchMode: 'paid_only',
          paidOnlyPassPhase: 'paid',
          dropNonPriorityPending: true
        });
      });
    }
    if (matchclubWatchStopBtn) {
      matchclubWatchStopBtn.addEventListener('click', function () {
        saveWatchStateFromUi({ enabled: false });
      });
    }
  }

  if (matchclubWatchDelayMinEl && chrome.storage && chrome.storage.local) {
    function applyDelayFromInput() {
      var m = parseInt(matchclubWatchDelayMinEl.value, 10);
      if (isNaN(m) || m < 3) m = 3;
      if (m > 10) m = 10;
      matchclubWatchDelayMinEl.value = String(m);
      saveWatchStateFromUi({ delayMs: m * 60000 });
    }
    matchclubWatchDelayMinEl.addEventListener('change', applyDelayFromInput);
    matchclubWatchDelayMinEl.addEventListener('blur', applyDelayFromInput);
  }

  if (matchclubWatchBaselineBtn && chrome.storage && chrome.storage.local) {
    matchclubWatchBaselineBtn.addEventListener('click', function () {
      saveWatchStateFromUi({ baselineReset: true });
    });
  }

  if (matchclubWatchAbortWaitBtn && chrome.tabs && chrome.tabs.query) {
    matchclubWatchAbortWaitBtn.addEventListener('click', function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        if (!tab || !tab.id) return;
        chrome.tabs.sendMessage(
          tab.id,
          { action: 'matchClubWatchAbortWait' },
          function () {
            var err = chrome.runtime && chrome.runtime.lastError;
            if (err && matchclubWatchStatusExtraEl) {
              var curE = matchclubWatchStatusExtraEl.textContent || '';
              matchclubWatchStatusExtraEl.textContent =
                curE +
                (curE ? '\n' : '') +
                'Не удалось связаться со страницей: откройте вкладку match-club.club со списком или чатом.';
              matchclubWatchStatusExtraEl.hidden = false;
            }
          }
        );
      });
    });
  }

  function showChatInsertStatus(text, isErr) {
    if (!chatInsertStatusEl) return;
    if (!text) {
      chatInsertStatusEl.hidden = true;
      chatInsertStatusEl.textContent = '';
      return;
    }
    chatInsertStatusEl.hidden = false;
    chatInsertStatusEl.textContent = text;
    chatInsertStatusEl.style.color = isErr ? 'var(--error)' : 'var(--muted)';
  }

  function insertVariantIntoMatchClub(text) {
    showChatInsertStatus('');
    if (!chrome.tabs || !chrome.tabs.query) {
      showChatInsertStatus('Нет API вкладок.', true);
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      var u = tab && tab.url ? tab.url : '';
      if (u.indexOf('match-club.club') === -1) {
        showChatInsertStatus('Откройте вкладку match-club.club с чатом и повторите.', true);
        return;
      }
      if (!tab.id) return;
      chrome.tabs.sendMessage(
        tab.id,
        { action: 'matchClubInsertDraft', text: text },
        function (res) {
          if (chrome.runtime.lastError) {
            showChatInsertStatus(
              'Контент-скрипт не ответил. Перезагрузите страницу Match Club. ' +
                (chrome.runtime.lastError.message || ''),
              true
            );
            return;
          }
          if (res && res.ok) {
            showChatInsertStatus('Текст подставлен в поле ввода. Осталось нажать «Отправить» на сайте.', false);
            return;
          }
          showChatInsertStatus((res && res.error) || 'Не удалось вставить.', true);
        }
      );
    });
  }

  if (matchclubOnlineOnlyBtn && chrome.tabs && chrome.tabs.query) {
    matchclubOnlineOnlyBtn.addEventListener('click', function () {
      if (matchclubOnlineStatus) matchclubOnlineStatus.textContent = '';
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        var u = tab && tab.url ? tab.url : '';
        if (u.indexOf('match-club.club') === -1) {
          if (matchclubOnlineStatus) {
            matchclubOnlineStatus.textContent =
              'Откройте вкладку match-club.club (список чатов, например …/chats/…/messages).';
          }
          return;
        }
        if (!tab.id) return;
        matchclubOnlineOnlyBtn.disabled = true;
        chrome.tabs.sendMessage(
          tab.id,
          { action: 'matchClubEnableOnlineOnly', timeoutMs: 10000 },
          function (res) {
            if (matchclubOnlineOnlyBtn) matchclubOnlineOnlyBtn.disabled = false;
            if (chrome.runtime.lastError) {
              if (matchclubOnlineStatus) {
                matchclubOnlineStatus.textContent =
                  'Скрипт не ответил. Обновите страницу Match Club (расширение с match-club-chat.js).';
              }
              return;
            }
            if (!res) {
              if (matchclubOnlineStatus) matchclubOnlineStatus.textContent = 'Нет ответа.';
              return;
            }
            if (res.ok) {
              if (matchclubOnlineStatus) {
                matchclubOnlineStatus.textContent = res.wasAlreadyOn
                  ? 'Фильтр Online уже был включён.'
                  : 'Фильтр Online включён — в списке только онлайн-профили.';
              }
              return;
            }
            if (matchclubOnlineStatus) {
              matchclubOnlineStatus.textContent = res.error || 'Не удалось включить тоггл.';
            }
          }
        );
      });
    });
  }

  if (matchclubPullBtn && chrome.tabs && chrome.tabs.query) {
    matchclubPullBtn.addEventListener('click', function () {
      if (matchclubPullStatus) matchclubPullStatus.textContent = '';
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        var u = tab && tab.url ? tab.url : '';
        if (u.indexOf('match-club.club') === -1) {
          if (matchclubPullStatus) {
            matchclubPullStatus.textContent = 'Откройте вкладку match-club.club с открытым чатом.';
          }
          return;
        }
        if (!tab.id) return;
        matchclubPullBtn.disabled = true;
        chrome.tabs.sendMessage(tab.id, { action: 'matchClubGetChatContext' }, function (ctx) {
          matchclubPullBtn.disabled = false;
          if (chrome.runtime.lastError) {
            if (matchclubPullStatus) {
              matchclubPullStatus.textContent =
                'Скрипт чата не ответил. Обновите страницу Match Club (расширение v1.8+).';
            }
            return;
          }
          if (!ctx || !ctx.ok) {
            if (matchclubPullStatus) matchclubPullStatus.textContent = 'Нет ответа от страницы.';
            return;
          }
          var parts = [];
          if (ctx.pathname) parts.push('Путь: ' + ctx.pathname);
          parts.push('Чат: ' + (ctx.isChat ? 'да' : 'нет (проверьте URL / откройте диалог)'));
          parts.push('Поле ввода: ' + (ctx.composerFound ? 'найдено (' + (ctx.composerTag || '') + ')' : 'не найдено'));
          if (ctx.partnerContext && String(ctx.partnerContext).trim()) {
            if (msgEl) msgEl.value = String(ctx.partnerContext).trim();
            parts.push('Текст области переписки подставлен в поле «Сообщение» — можно жать «Сгенерировать».');
            if (ctx.lastMessageRole === 'me') {
              parts.push(
                'Последнее в треде — ваше сообщение: «Сгенерировать» не будет предлагать повтор этой же строки.'
              );
            }
          } else {
            parts.push('Текст переписки не извлечён: откройте нужный чат или скопируйте сообщение вручную.');
          }
          if (matchclubPullStatus) matchclubPullStatus.textContent = parts.join(' ');
        });
      });
    });
  }

  /**
   * POST экспорта чатов на chat-reply-server; при сбое fetch — через background (dexChatReplyPost).
   */
  function postMatchClubChatsExport(doc, onDone) {
    var body = JSON.stringify(doc);
    function tryBg() {
      chrome.runtime.sendMessage(
        {
          action: 'dexChatReplyPost',
          path: '/api/match-club-chats-export',
          base: BASE,
          body: body
        },
        function (resp) {
          if (chrome.runtime.lastError) {
            onDone(false, chrome.runtime.lastError.message);
            return;
          }
          if (resp && resp.ok && resp.data && resp.data.ok) {
            onDone(true, resp.data);
            return;
          }
          var err =
            resp && resp.data && (resp.data.error || resp.data.message)
              ? resp.data.error || resp.data.message
              : 'post failed';
          onDone(false, typeof err === 'string' ? err : JSON.stringify(err));
        }
      );
    }
    fetch(CHATS_EXPORT_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { httpOk: r.ok, data: data };
        });
      })
      .then(function (obj) {
        if (obj.httpOk && obj.data && obj.data.ok) {
          onDone(true, obj.data);
          return;
        }
        tryBg();
      })
      .catch(function () {
        tryBg();
      });
  }

  function postMatchClubActivityReport(doc, onDone) {
    var body = JSON.stringify(doc);
    function tryBg() {
      chrome.runtime.sendMessage(
        {
          action: 'dexChatReplyPost',
          path: '/api/match-club-activity-report',
          base: BASE,
          body: body
        },
        function (resp) {
          if (chrome.runtime.lastError) {
            onDone(false, chrome.runtime.lastError.message);
            return;
          }
          if (resp && resp.ok && resp.data && resp.data.ok) {
            onDone(true, resp.data);
            return;
          }
          var err =
            resp && resp.data && (resp.data.error || resp.data.message)
              ? resp.data.error || resp.data.message
              : 'post failed';
          onDone(false, typeof err === 'string' ? err : JSON.stringify(err));
        }
      );
    }
    fetch(BASE + '/api/match-club-activity-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { httpOk: r.ok, data: data };
        });
      })
      .then(function (obj) {
        if (obj.httpOk && obj.data && obj.data.ok) {
          onDone(true, obj.data);
          return;
        }
        tryBg();
      })
      .catch(function () {
        tryBg();
      });
  }

  if (matchclubExportChatsBtn && chrome.tabs && chrome.tabs.query) {
    matchclubExportChatsBtn.addEventListener('click', function () {
      if (matchclubExportStatus) matchclubExportStatus.textContent = '';
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        var u = tab && tab.url ? tab.url : '';
        if (u.indexOf('match-club.club') === -1) {
          if (matchclubExportStatus) {
            matchclubExportStatus.textContent = 'Откройте вкладку match-club.club (список чатов или split-view).';
          }
          return;
        }
        if (!tab.id) return;
        matchclubExportChatsBtn.disabled = true;
        loadOutboundQueueForExport(function (err, outboundQueue, queueMeta) {
          var qm = queueMeta || {};
          if (err || !outboundQueue || outboundQueue.length === 0) {
            matchclubExportChatsBtn.disabled = false;
            if (matchclubExportStatus) {
              var ph = portFromBase();
              var hint =
                err === 'chat_reply_unreachable'
                  ? 'Запустите в корне репозитория: npm run chat-reply:server'
                  : err === 'outbound_queue_no_body'
                    ? 'Пустое тело ответа от GET /api/match-club-outbound-queue (сервер на 127.0.0.1:' +
                      ph +
                      ' не отдал JSON).'
                    : String(err || 'outbound_queue_empty').indexOf('outbound_queue_invalid_json') === 0
                      ? 'Ответ не JSON — часто порт ' +
                        ph +
                        ' занят не chat-reply-server. Освободите порт или задайте тот же порт в поле «Порт» выше и CHAT_REPLY_PORT в .env, затем перезапустите npm run chat-reply:server из корня репозитория Dex'
                      : String(err || 'outbound_queue_empty');
              matchclubExportStatus.textContent = appendFileHintToOutboundError(hint);
            }
            return;
          }
          if (matchclubExportStatus) {
            var insOnly = matchclubOutboundInsertOnlyEl ? matchclubOutboundInsertOnlyEl.checked : true;
            var src =
              qm.repaired === true
                ? 'Источник: сервер создал match-club-outbound-queue.md (шаблон). '
                : qm.queueSource === 'approved_followup'
                  ? 'Источник: утверждённые добивы EN (chat-followup-phrases-approved-en.md, секция English). '
                  : 'Источник: match-club-outbound-queue.md через chat-reply-server. ';
            matchclubExportStatus.textContent =
              'Очередь: ' +
              outboundQueue.length +
              ' шт. ' +
              src +
              (insOnly
                ? 'Режим: вставка в поле + ждать вашей отправки (после отправки скрипт пойдёт дальше; если «зависло» на первом чате — отправьте сообщение вручную). '
                : 'Режим: автоматическая отправка. ') +
              'Обход чатов… оставьте вкладку открытой.';
          }
          var insertOnlyChecked = matchclubOutboundInsertOnlyEl
            ? matchclubOutboundInsertOnlyEl.checked
            : true;
          chrome.tabs.sendMessage(
            tab.id,
            {
              action: 'matchClubExportAllChats',
              maxChats: 120,
              waitPerChatMs: 2800,
              listScrollStepPx: 56,
              listScrollPauseMs: 110,
              maxListPasses: 15,
              outboundQueue: outboundQueue,
              outboundInsertOnly: insertOnlyChecked,
              outboundQueueSource: qm.queueSource || 'match_club_file',
              outboundQueueSourcePath: qm.sourcePath || '',
              outboundCooldownMs: 120000
            },
            function (response) {
              matchclubExportChatsBtn.disabled = false;
              if (chrome.runtime.lastError) {
                if (matchclubExportStatus) {
                  matchclubExportStatus.textContent =
                    'Скрипт не ответил: ' + chrome.runtime.lastError.message + ' — обновите страницу Match Club.';
                }
                return;
              }
              if (!response || !response.export) {
                if (matchclubExportStatus) {
                  matchclubExportStatus.textContent =
                    (response && response.error) || 'Нет данных экспорта.';
                }
                return;
              }
              var doc = response.export;
              if (doc.ok === false && doc.error) {
                if (matchclubExportStatus) {
                  matchclubExportStatus.textContent = 'Ошибка: ' + doc.error;
                }
                return;
              }
              postMatchClubChatsExport(doc, function (ok, data) {
                if (ok) {
                  if (matchclubExportStatus) {
                    var listed =
                      doc.chatListTotal != null ? doc.chatListTotal : doc.chats && doc.chats.length;
                    var exported = doc.chats && doc.chats.length ? doc.chats.length : 0;
                    var line =
                      'Сохранено: ' +
                      (data.relativePath || data.savedPath || 'ok') +
                      '. Лог: .scripts/chat-reply/match-club-chats-exports.md (в списке: ' +
                      listed +
                      ', в файл: ' +
                      exported +
                      ').';
                    var orun = doc.outboundRun;
                    if (orun && orun.enabled && orun.stats) {
                      var s = orun.stats;
                      line +=
                        ' Автоотправка: отправлено ' +
                        (s.sent != null ? s.sent : 0) +
                        ', пропусков ' +
                        (s.skipped != null ? s.skipped : 0) +
                        ', ошибок ' +
                        (s.failed != null ? s.failed : 0) +
                        '.';
                      if (data.outboundRunPath) {
                        line += ' Детали: ' + data.outboundRunPath;
                      }
                    }
                    matchclubExportStatus.textContent = line;
                  }
                  return;
                }
                if (matchclubExportStatus) {
                  matchclubExportStatus.textContent =
                    'Сервер: ' + data + '. JSON экспорта скопирован в буфер.';
                }
                try {
                  navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
                } catch (e) {}
              });
            }
          );
        });
      });
    });
  }

  if (matchclubActivityReportBtn && chrome.storage && chrome.storage.local) {
    matchclubActivityReportBtn.addEventListener('click', function () {
      if (matchclubActivityReportStatus) {
        matchclubActivityReportStatus.textContent = 'Готовлю отчёт...';
      }
      chrome.storage.local.get([STORAGE_MC_ACTIVITY], function (o) {
        var dayKey = getLocalDayKey(new Date());
        var act = getTodayActivitySummary(o && o[STORAGE_MC_ACTIVITY]);
        var report = {
          dayKey: dayKey,
          totalMinutes: act.totalMinutes,
          activeHours: act.activeHours,
          hoursMinutes: act.hoursMinutes
        };
        postMatchClubActivityReport(report, function (ok, data) {
          if (ok) {
            var hoursText = act.activeHours.length ? act.activeHours.join(', ') : '—';
            var msg =
              'Сохранено: ' +
              (data.relativePath || data.savedPath || 'ok') +
              '. День: ' +
              dayKey +
              '. Активность: ' +
              String(act.totalMinutes) +
              ' мин. Часы: ' +
              hoursText +
              '.';
            if (matchclubActivityReportStatus) matchclubActivityReportStatus.textContent = msg;
            return;
          }
          if (matchclubActivityReportStatus) {
            matchclubActivityReportStatus.textContent = 'Ошибка сохранения отчёта: ' + String(data || 'unknown');
          }
        });
      });
    });
  }

  function refreshMatchClubHint() {
    if (!matchclubHintEl || !chrome.tabs || !chrome.tabs.query) return;
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var u = tabs && tabs[0] && tabs[0].url ? tabs[0].url : '';
      var on = u.indexOf('match-club.club') !== -1;
      matchclubHintEl.classList.toggle('matchclub-on-site', on);
      matchclubHintEl.classList.toggle('matchclub-off-site', !on);
      if (matchclubSiteBannerEl) {
        matchclubSiteBannerEl.textContent = on
          ? 'Активная вкладка: Match Club. Кнопки в этом блоке — для страницы; фильтр Online на списке чатов — кнопка «Онлайн» в шапке панели.'
          : 'Сейчас активна не вкладка Match Club. Откройте match-club.club в этом окне и переключитесь на неё — кнопка «Онлайн» в шапке и инструменты ниже станут активны.';
      }
      if (matchclubDomBtn) matchclubDomBtn.disabled = !on;
      if (matchclubOnlineOnlyBtn) matchclubOnlineOnlyBtn.disabled = !on;
      if (matchclubPullBtn) matchclubPullBtn.disabled = !on;
      if (matchclubExportChatsBtn) matchclubExportChatsBtn.disabled = !on;
    });
  }

  refreshMatchClubHint();
  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(function () {
      refreshMatchClubHint();
    });
  }
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
      if (!changeInfo.url && changeInfo.status !== 'complete') return;
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var cur = tabs && tabs[0];
        if (cur && cur.id === tabId) {
          refreshMatchClubHint();
        }
      });
    });
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refreshMatchClubHint();
  });

  if (matchclubDomBtn && chrome.tabs && chrome.tabs.query) {
    matchclubDomBtn.addEventListener('click', function () {
      if (matchclubDomStatus) matchclubDomStatus.textContent = '';
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        var u = tab && tab.url ? tab.url : '';
        if (u.indexOf('match-club.club') === -1) {
          if (matchclubDomStatus) {
            matchclubDomStatus.textContent = 'Откройте вкладку match-club.club и повторите.';
          }
          return;
        }
        if (!tab.id) return;
        matchclubDomBtn.disabled = true;
        chrome.tabs.sendMessage(
          tab.id,
          { action: 'matchClubInventory' },
          function (response) {
          matchclubDomBtn.disabled = false;
          if (chrome.runtime.lastError) {
            if (matchclubDomStatus) {
              matchclubDomStatus.textContent =
                'Контент-скрипт не ответил. Перезагрузите страницу Match Club и убедитесь, что расширение обновлено.';
            }
            return;
          }
          if (!response || !response.ok || !response.payload) {
            if (matchclubDomStatus) {
              matchclubDomStatus.textContent = response && response.error ? response.error : 'Нет данных снимка.';
            }
            return;
          }
          var snap = response.payload;
          fetch(INVENTORY_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot: snap })
          })
            .then(function (r) {
              return r.json().then(function (data) {
                return { ok: r.ok, data: data };
              });
            })
            .then(function (obj) {
              if (obj.ok && obj.data && obj.data.ok) {
                if (matchclubDomStatus) {
                  matchclubDomStatus.textContent =
                    'Сохранено в репозиторий: ' +
                    (obj.data.relativePath || obj.data.savedPath || 'ok') +
                    '. Лог: .scripts/chat-reply/match-club-dom-inventory.md';
                }
                return;
              }
              var err = (obj.data && obj.data.error) ? obj.data.error : 'сервер';
              if (matchclubDomStatus) {
                matchclubDomStatus.textContent =
                  'Сервер не сохранил (' + err + '). Запустите npm run chat-reply:server. Копирую JSON в буфер.';
              }
              try {
                navigator.clipboard.writeText(JSON.stringify(snap, null, 2));
              } catch (e) {}
            })
            .catch(function () {
              if (matchclubDomStatus) {
                matchclubDomStatus.textContent =
                  'Сервер недоступен (npm run chat-reply:server). Копирую JSON в буфер обмена.';
              }
              try {
                navigator.clipboard.writeText(JSON.stringify(snap, null, 2));
              } catch (e) {}
            });
        });
      });
    });
  }

  function showErr(text) {
    errEl.hidden = !text;
    errEl.textContent = text || '';
  }

  function setLoading(on) {
    goBtn.disabled = !!on;
    goBtn.textContent = on ? 'Генерация…' : 'Сгенерировать';
  }

  function renderVariants(list) {
    variantsEl.innerHTML = '';
    showChatInsertStatus('');
    if (!list || list.length < 1) return;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      var wrap = document.createElement('div');
      wrap.className = 'variant';
      var pre = document.createElement('pre');
      pre.textContent = v;
      var row = document.createElement('div');
      row.style.display = 'flex';
      row.style.flexWrap = 'wrap';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy';
      btn.textContent = 'Копировать';
      btn.addEventListener('click', function (text) {
        return function () {
          navigator.clipboard.writeText(text).catch(function () {});
        };
      }(v));
      var btnChat = document.createElement('button');
      btnChat.type = 'button';
      btnChat.className = 'copy insert-chat';
      btnChat.textContent = 'В поле чата (отправить вручную)';
      btnChat.title = 'Подставить текст в поле ввода на открытой вкладке Match Club';
      btnChat.addEventListener('click', function (text) {
        return function () {
          insertVariantIntoMatchClub(text);
        };
      }(v));
      row.appendChild(btn);
      row.appendChild(btnChat);
      wrap.appendChild(pre);
      wrap.appendChild(row);
      variantsEl.appendChild(wrap);
    }
  }

  goBtn.addEventListener('click', function () {
    showErr('');
    var message = (msgEl.value || '').trim();
    if (!message) {
      showErr('Вставьте текст сообщения.');
      return;
    }

    function buildSuggestPayload(meta) {
      var o = {
        message: message,
        style: styleEl.value || 'neutral'
      };
      if (meta && meta.lastOutgoingFromMe && meta.lastOutgoingText) {
        o.lastOutgoingFromMe = true;
        o.lastOutgoingText = String(meta.lastOutgoingText).trim();
      }
      return JSON.stringify(o);
    }

    function runSuggestGeneration(payload) {
    setLoading(true);
    variantsEl.innerHTML = '';

    var suggestTimerId = null;
    function clearSuggestTimer() {
      if (suggestTimerId) {
        clearTimeout(suggestTimerId);
        suggestTimerId = null;
      }
    }
    suggestTimerId = setTimeout(function () {
      suggestTimerId = null;
      setLoading(false);
      showErr(
        'Нет ответа за 2 минуты (запрос завис или service worker не ответил). Проверьте: npm run chat-reply:server, OPENAI_API_KEY или Ollama; перезагрузите расширение.'
      );
    }, 125000);

    function finishSuggest(obj) {
      clearSuggestTimer();
      setLoading(false);
      if (!obj.ok) {
        var err = obj.data && obj.data.error ? obj.data.error : 'Ошибка ' + (obj.status || '');
        showErr(String(err));
        return;
      }
      if (obj.data && obj.data.error && (!obj.data.variants || !obj.data.variants.length)) {
        showErr(String(obj.data.error));
        return;
      }
      var vars = obj.data && obj.data.variants;
      if (Array.isArray(vars) && vars.length > 0) {
        var nonEmpty = vars.filter(function (s) {
          return String(s || '').trim().length > 0;
        });
        if (nonEmpty.length > 0) {
          renderVariants(nonEmpty);
          return;
        }
        showErr(
          'Модель вернула пустые варианты (часто при отказе по политике контента). Попробуйте сократить цитату или другой стиль; смотрите лог npm run chat-reply:server.'
        );
        return;
      }
      showErr('Неожиданный ответ сервера (нет поля variants).');
    }

    function directPost() {
      var ac = new AbortController();
      var tid = setTimeout(function () {
        ac.abort();
      }, 120000);
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: ac.signal
      })
        .then(function (r) {
          clearTimeout(tid);
          return r.json().then(function (data) {
            finishSuggest({ ok: r.ok, status: r.status, data: data });
          });
        })
        .catch(function (e) {
          clearTimeout(tid);
          clearSuggestTimer();
          setLoading(false);
          if (e && e.name === 'AbortError') {
            showErr('Превышено время ожидания ответа (2 мин). Проверьте сервер и модель (Ollama/OpenAI).');
            return;
          }
          showErr('Сервер недоступен. Запустите npm run chat-reply:server в корне репозитория.');
        });
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        { action: 'dexChatReplyPost', path: '/api/suggest-replies', base: BASE, body: payload },
        function (resp) {
          if (chrome.runtime.lastError) {
            directPost();
            return;
          }
          if (resp && resp.ok === false && resp.error) {
            finishSuggest({ ok: false, status: 0, data: { error: String(resp.error) } });
            return;
          }
          if (resp && typeof resp.data === 'object' && resp.data !== null && (resp.ok === true || resp.status)) {
            finishSuggest({ ok: !!resp.ok, status: resp.status, data: resp.data });
            return;
          }
          directPost();
        }
      );
      return;
    }
    directPost();
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        var u = tab && tab.url ? tab.url : '';
        if (u.indexOf('match-club.club') !== -1 && tab.id) {
          chrome.tabs.sendMessage(tab.id, { action: 'matchClubGetChatContext' }, function (ctx) {
            var meta = null;
            if (
              !chrome.runtime.lastError &&
              ctx &&
              ctx.ok &&
              ctx.lastMessageRole === 'me' &&
              ctx.lastMessageText &&
              String(ctx.lastMessageText).trim().length > 0
            ) {
              meta = {
                lastOutgoingFromMe: true,
                lastOutgoingText: ctx.lastMessageText
              };
            }
            runSuggestGeneration(buildSuggestPayload(meta));
          });
          return;
        }
        runSuggestGeneration(buildSuggestPayload(null));
      });
      return;
    }
    runSuggestGeneration(buildSuggestPayload(null));
  });
})();
