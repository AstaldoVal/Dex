// Dex LinkedIn Job Capture — background service worker
//
// Saves JSON exports from the search-capture content script.
// Only native messaging is used — writes directly to 00-Inbox/Job_Search/data/
// so Chrome's "Ask where to save each file" setting never affects this script.

var NATIVE_HOST = 'com.dex.job_capture';

var ATS_BASE = 'http://127.0.0.1:8765';

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

chrome.runtime.onInstalled.addListener(function () {
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
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
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

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
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
