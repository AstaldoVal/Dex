// Dex LinkedIn Job Capture — background service worker
//
// Saves JSON exports from the search-capture content script.
// Only native messaging is used — writes directly to 00-Inbox/Job_Search/data/
// so Chrome's "Ask where to save each file" setting never affects this script.

var NATIVE_HOST = 'com.dex.job_capture';

var ATS_BASE = 'http://127.0.0.1:8765';

var CHAT_REPLY_BASE = 'http://127.0.0.1:8777';

/** @param {{ base?: string }} msg @param {function(string): void} callback */
function resolveChatReplyBase(msg, callback) {
  if (msg && msg.base && typeof msg.base === 'string') {
    callback(String(msg.base).replace(/\/$/, ''));
    return;
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({ dexChatReplyPort: 8777 }, function (o) {
      var p = parseInt(o && o.dexChatReplyPort, 10);
      if (isNaN(p) || p < 1 || p > 65535) p = 8777;
      callback('http://127.0.0.1:' + p);
    });
    return;
  }
  callback(CHAT_REPLY_BASE);
}

function parsePortFromBase(base) {
  try {
    var u = new URL(base || CHAT_REPLY_BASE);
    var p = parseInt(u.port || '8777', 10);
    if (isNaN(p) || p < 1 || p > 65535) return 8777;
    return p;
  } catch (e) {
    return 8777;
  }
}

function ensureChatReplyServerViaNative(base, callback) {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendNativeMessage) {
    callback(false, 'native unavailable');
    return;
  }
  var port = parsePortFromBase(base);
  try {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      { action: 'ensureChatReplyServer', port: port },
      function (resp) {
        if (chrome.runtime.lastError) {
          callback(false, chrome.runtime.lastError.message || 'native error');
          return;
        }
        if (resp && resp.ok) {
          callback(true, '');
          return;
        }
        callback(false, (resp && resp.error) || 'ensure failed');
      }
    );
  } catch (e) {
    callback(false, e && e.message ? e.message : String(e));
  }
}

var SAVE_SERVER_BASE = ATS_BASE;

// Guard against background runtime crashes.
try {
  self.addEventListener('unhandledrejection', function (event) {
    try { console.warn('[Dex bg] unhandledrejection:', event && event.reason ? event.reason : event); } catch (e) {}
  });
  self.addEventListener('error', function (event) {
    try { console.warn('[Dex bg] error:', event && event.message ? event.message : event); } catch (e) {}
  });
} catch (e) {}

function syncMatchClubWatchAlarm() {
  try {
    chrome.storage.local.get('matchClubWatchV1', function (o) {
      var nv = o && o.matchClubWatchV1;
      if (nv && nv.enabled === true) {
        chrome.alarms.create('matchClubWatchTick', { periodInMinutes: 1 });
      } else {
        chrome.alarms.clear('matchClubWatchTick');
      }
    });
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(function () {
  syncMatchClubWatchAlarm();
  chrome.contextMenus.create({
    id: 'dex-capture-ats-fields',
    title: 'Dex: Capture ATS form fields',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'dex-fill-ats-form',
    title: 'Dex: Fill ATS form',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'dex-chat-replies',
    title: 'Dex: Ответы в чатах (боковая панель)',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'dex-match-club-open',
    title: 'Dex: Открыть Match Club (вход вручную)',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'dex-match-club-inventory',
    title: 'Dex: Match Club — снять структуру страницы (DOM)',
    contexts: ['page'],
    documentUrlPatterns: ['https://match-club.club/*', 'https://*.match-club.club/*']
  });
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
  }
});

try {
  chrome.runtime.onStartup.addListener(function () {
    syncMatchClubWatchAlarm();
  });
} catch (e) {}

try {
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes.matchClubWatchV1) return;
      syncMatchClubWatchAlarm();
    });
  }
} catch (e) {}

try {
  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name !== 'matchClubWatchTick') return;
    chrome.tabs.query({ url: '*://match-club.club/*' }, function (tabs) {
      if (!tabs || !tabs.length) return;
      var i;
      for (i = 0; i < tabs.length; i++) {
        if (tabs[i].id == null) continue;
        chrome.tabs.sendMessage(tabs[i].id, { action: 'matchClubWatchTick' }, function () {});
      }
    });
  });
} catch (e) {}

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === 'dex-match-club-open') {
    chrome.tabs.create({ url: 'https://match-club.club/' }).catch(function (e) {
      console.warn('[Dex bg] open Match Club:', e && e.message ? e.message : e);
    });
    return;
  }
  if (info.menuItemId === 'dex-match-club-inventory' && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'matchClubInventory' }, function (response) {
      if (chrome.runtime.lastError) {
        console.warn('[Dex bg] Match Club inventory:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.ok && response.payload) {
        chrome.storage.local.set({ matchClubLastInventory: response.payload }).catch(function () {});
        console.log(
          '[Dex bg] Match Club DOM snapshot:',
          response.payload.pathname,
          'elements:',
          response.payload.elementCountTotal
        );
      }
    });
    return;
  }
  if (info.menuItemId === 'dex-chat-replies' && tab && tab.windowId != null) {
    if (chrome.sidePanel && chrome.sidePanel.setOptions && chrome.sidePanel.open) {
      chrome.sidePanel
        .setOptions({ path: 'sidepanel-chat.html', enabled: true })
        .then(function () {
          return chrome.sidePanel.open({ windowId: tab.windowId });
        })
        .catch(function (e) {
          console.warn('[Dex bg] sidePanel chat:', e && e.message ? e.message : e);
        });
    }
    return;
  }
  if (info.menuItemId === 'dex-fill-ats-form' && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'fillAtsForm' }, function (response) {
      if (chrome.runtime.lastError) {
        console.warn('[Dex bg] Fill ATS form:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.filled !== undefined) {
        console.log('[Dex bg] ATS form filled:', response.filled, 'fields');
      }
    });
    return;
  }
  if (info.menuItemId === 'dex-capture-ats-fields' && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'captureAtsFields' }, function (response) {
      if (chrome.runtime.lastError) {
        console.warn('[Dex bg] Capture ATS fields:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.ok) {
        console.log('[Dex bg] ATS fields captured:', response.count, response.path);
      }
    });
  }
});

// Prime storage as soon as worker starts (e.g. when content script wakes us). Content script fallback will read from storage.
function primeAtsProfile() {
  fetch(ATS_BASE + '/ats-profile').then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
    if (p && typeof p === 'object') chrome.storage.local.set({ atsProfile: p });
  }).catch(function () {});
}
primeAtsProfile();

if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  // Match Club: backup feedback when DOM snapshot completes (page toast + OS notification).
  if (msg && msg.action === 'dexMatchClubWatchDraftReady') {
    try {
      if (chrome.notifications && typeof chrome.notifications.create === 'function') {
        var title = msg.peerTitle ? String(msg.peerTitle).slice(0, 80) : 'чат';
        chrome.notifications.create(
          'dex-mc-watch-' + Date.now(),
          {
            type: 'basic',
            title: 'Dex · Match Club',
            message: 'Черновик добива вставлен: ' + title + '. Нажмите «Отправить» на сайте.'
          },
          function () {
            if (chrome.runtime.lastError) {
              console.warn('[Dex bg] watch draft notification:', chrome.runtime.lastError.message);
            }
          }
        );
      }
    } catch (e) {}
    return;
  }
  if (msg && msg.action === 'dexMatchClubInventoryDone') {
    try {
      if (chrome.notifications && typeof chrome.notifications.create === 'function') {
        var cnt = msg.elementCountTotal != null ? String(msg.elementCountTotal) : '?';
        chrome.notifications.create(
          'dex-mc-inv-' + Date.now(),
          {
            type: 'basic',
            title: 'Dex · Match Club',
            message: 'Снимок готов: ' + cnt + ' узлов. Данные в расширении (последний снимок).'
          },
          function () {
            if (chrome.runtime.lastError) {
              console.warn('[Dex bg] Match Club notification:', chrome.runtime.lastError.message);
            }
          }
        );
      }
    } catch (e) {}
    return;
  }
  // Chat-reply side panel: proxy GET to local chat-reply-server (panel fetch → 127.0.0.1 can fail in some Chrome builds).
  if (msg && msg.action === 'dexChatReplyGet') {
    var crPath = msg.path;
    if (typeof crPath !== 'string' || !crPath.startsWith('/')) {
      try {
        sendResponse({ ok: false, error: 'bad path' });
      } catch (e) {}
      return;
    }
    resolveChatReplyBase(msg, function (crBase) {
      var crUrl = crBase + crPath;
      function fetchWithRetry(finalAttempt) {
        fetch(crUrl, { method: 'GET', cache: 'no-store' })
          .then(function (r) {
            return r.text().then(function (text) {
              try {
                sendResponse({ ok: !!r.ok, status: r.status, text: text });
              } catch (e) {}
            });
          })
          .catch(function (e) {
            if (!finalAttempt) {
              ensureChatReplyServerViaNative(crBase, function () {
                setTimeout(function () {
                  fetchWithRetry(true);
                }, 450);
              });
              return;
            }
            try {
              sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
            } catch (err) {}
          });
      }
      // Same as outbound-queue / watch: extension cannot run `npm` by itself; Native Messaging host
      // can spawn chat-reply-server.cjs. Proactive ensure before every GET avoids races when the
      // side panel opens before the first fetch would otherwise trigger ensure-on-failure.
      ensureChatReplyServerViaNative(crBase, function () {
        setTimeout(function () {
          fetchWithRetry(false);
        }, 280);
      });
    });
    return true;
  }
  if (msg && msg.action === 'dexChatReplyPost') {
    var postPath = msg.path;
    var postBody = msg.body;
    if (typeof postPath !== 'string' || !postPath.startsWith('/') || typeof postBody !== 'string') {
      try {
        sendResponse({ ok: false, error: 'bad post' });
      } catch (e) {}
      return;
    }
    resolveChatReplyBase(msg, function (postBase) {
      function tryPost(finalAttempt) {
        var ac = new AbortController();
        var postTid = setTimeout(function () {
          ac.abort();
        }, 120000);
        fetch(postBase + postPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: postBody,
          cache: 'no-store',
          signal: ac.signal
        })
          .then(function (r) {
            clearTimeout(postTid);
            return r.text().then(function (text) {
              var parsed = null;
              try {
                parsed = JSON.parse(text || '{}');
              } catch (e) {
                parsed = { error: text ? text.slice(0, 200) : 'non-JSON response' };
              }
              try {
                sendResponse({ ok: !!r.ok, status: r.status, data: parsed });
              } catch (e) {}
            });
          })
          .catch(function (e) {
            clearTimeout(postTid);
            if (!finalAttempt && (!e || e.name !== 'AbortError')) {
              ensureChatReplyServerViaNative(postBase, function () {
                setTimeout(function () {
                  tryPost(true);
                }, 450);
              });
              return;
            }
            var errMsg = e && e.message ? e.message : String(e);
            if (e && e.name === 'AbortError') {
              errMsg = 'Превышено время ожидания ответа (2 мин).';
            }
            try {
              sendResponse({ ok: false, error: errMsg });
            } catch (err) {}
          });
      }
      tryPost(false);
    });
    return true;
  }
  // ATS autofill: profile and Navero code (avoids mixed-content block on HTTPS pages)
  if (msg.action === 'atsProfile') {
    var responded = false;
    function reply(obj) { if (!responded) { responded = true; try { sendResponse(obj); } catch (e) {} } }
    var ab = new AbortController();
    var t = setTimeout(function () { ab.abort(); }, 6000);
    fetch(ATS_BASE + '/ats-profile', { signal: ab.signal }).then(function (r) {
      clearTimeout(t);
      return r.ok ? r.json() : null;
    }).then(function (p) {
      if (p && typeof p === 'object') {
        chrome.storage.local.set({ atsProfile: p });
        reply({ ok: true, profile: p });
      } else { reply({ ok: false }); }
    }).catch(function () {
      clearTimeout(t);
      reply({ ok: false });
    });
    return true;
  }
  if (msg.action === 'naveroCode') {
    var responded2 = false;
    function reply2(obj) {
      if (obj && obj.ok && obj.code) chrome.storage.local.set({ naveroCode: obj.code, naveroCodeTime: Date.now() });
      if (!responded2) { responded2 = true; try { sendResponse(obj); } catch (e) {} }
    }
    fetch(ATS_BASE + '/navero-code').then(function (r) {
      if (!r.ok) return r.text().then(function () { reply2({ ok: false }); });
      return r.text().then(function (txt) {
        try {
          var data = JSON.parse(txt);
          reply2({ ok: !!data.ok, code: data.code });
        } catch (e) { reply2({ ok: false }); }
      });
    }).catch(function () { reply2({ ok: false }); });
    return true;
  }

  // Progress for capture-progress.log (avoids LinkedIn CSP blocking content script → 127.0.0.1)
  if (msg.action === 'dexCaptureProgress') {
    var payload = msg.payload || {};
    var body = JSON.stringify({
      page: payload.page,
      processed: payload.processed,
      total: payload.total,
      remote: payload.remote || 0
    });
    fetch('http://127.0.0.1:8765/dex-capture-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body
    }).then(function (r) {
      sendResponse && sendResponse({ ok: !!(r && r.ok) });
    }).catch(function () {
      sendResponse && sendResponse({ ok: false });
    });
    return true;
  }

  if (msg.action !== 'downloadJson') return;

  var filename = msg.filename;
  var data = msg.data;

  function saveViaServerAndRespond(filename, data, sendResponse) {
    var responded = false;
    function safeSend(obj) {
      if (responded) return;
      responded = true;
      try { sendResponse(obj); } catch (e) {}
    }

    try {
      // Service worker context: use fetch() (XMLHttpRequest may be unavailable).
      // save-server expects JSON body, and uses X-Filename header for output name.
      fetch(SAVE_SERVER_BASE + '/dex-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Filename': filename
        },
        body: data
      }).then(function (r) {
        return r.text().then(function (t) { return { status: r.status, text: t }; });
      }).then(function (obj) {
        var resp = null;
        try { resp = JSON.parse(obj.text || '{}'); } catch (e) {}
        if (resp && resp.ok) safeSend({ ok: true, path: resp.path, method: 'server' });
        else safeSend({ ok: false, error: (resp && resp.error) || 'save-server error' });
      }).catch(function (e) {
        safeSend({ ok: false, error: 'save-server exception: ' + (e && e.message ? e.message : String(e)) });
      });
    } catch (e) {
      safeSend({ ok: false, error: 'save-server exception: ' + e.message });
    }
  }

  try {
    chrome.runtime.sendNativeMessage(
      NATIVE_HOST,
      { action: 'saveJson', filename: filename, data: data },
      function (response) {
        if (chrome.runtime.lastError) {
          console.warn('[Dex bg] Native host unavailable:', chrome.runtime.lastError.message);
          // Self-healing: try local save-server if native host dies.
          return saveViaServerAndRespond(filename, data, sendResponse);
        }
        if (response && response.ok) {
          console.log('[Dex bg] Saved via native host:', response.path);
          try { sendResponse({ ok: true, path: response.path, method: 'native' }); } catch (e) {}
        } else {
          console.warn('[Dex bg] Native host error:', response && response.error);
          // Self-healing: try local save-server if native host returned error.
          return saveViaServerAndRespond(filename, data, sendResponse);
        }
      }
    );
  } catch (e) {
    console.warn('[Dex bg] Native messaging failed:', e.message);
    // Self-healing: try local save-server if native messaging throws synchronously.
    return saveViaServerAndRespond(filename, data, sendResponse);
  }

  return true; // keep sendResponse channel open
});
