// Match Club: snapshot of page structure for mapping UI to data (ids, roles, text previews).
// Triggered by context menu or side panel via chrome.tabs.sendMessage({ action: 'matchClubInventory' }).
(function () {
  'use strict';

  function prune(obj) {
    if (obj === undefined || obj === null || obj === '') return undefined;
    if (typeof obj === 'object' && !Array.isArray(obj)) {
      var o = {};
      for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          var v = prune(obj[k]);
          if (v !== undefined) o[k] = v;
        }
      }
      return Object.keys(o).length ? o : undefined;
    }
    return obj;
  }

  function textPreview(el, max) {
    max = max || 120;
    var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length ? t.slice(0, max) : undefined;
  }

  function snapshotElement(el) {
    var tag = el.tagName.toLowerCase();
    var o = {
      tag: tag,
      id: el.id || undefined,
      className: el.className && String(el.className).slice(0, 200) || undefined,
      role: el.getAttribute('role') || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      dataTestId: el.getAttribute('data-testid') || undefined,
      dataCy: el.getAttribute('data-cy') || undefined,
      name: el.name || undefined,
      type: el.type || undefined,
      placeholder: el.placeholder || undefined
    };
    if (tag === 'a' && el.href) o.href = el.href.slice(0, 400);
    if (tag === 'input' && el.value) o.valuePreview = String(el.value).slice(0, 80);
    var tagsWithText = {
      button: 1,
      a: 1,
      label: 1,
      span: 1,
      p: 1,
      h1: 1,
      h2: 1,
      h3: 1,
      li: 1,
      td: 1,
      th: 1
    };
    if (tagsWithText[tag] || tag === 'div') {
      var tp = textPreview(el, tag === 'div' ? 80 : 120);
      if (tp) o.textPreview = tp;
    }
    return prune(o);
  }

  function showDexToast(text, isError) {
    try {
      var hostId = 'dex-match-club-inventory-toast-host';
      var old = document.getElementById(hostId);
      if (old) old.remove();
      var host = document.createElement('div');
      host.id = hostId;
      host.setAttribute('data-dex-toast', '1');
      host.style.cssText =
        'all:initial;position:fixed;bottom:max(24px,env(safe-area-inset-bottom));left:50%;' +
        'transform:translateX(-50%);z-index:2147483647;pointer-events:none;';
      var mount = document.body && document.body.nodeType === 1 ? document.body : document.documentElement;
      mount.appendChild(host);
      var shadow = host.attachShadow({ mode: 'open' });
      var inner = document.createElement('div');
      inner.setAttribute('role', 'status');
      inner.textContent = text;
      var border = isError ? '#fa5252' : '#4dabf7';
      inner.style.cssText =
        'box-sizing:border-box;padding:12px 18px;background:#1a1b1e;color:#e9ecef;border:1px solid ' +
        border +
        ';border-radius:10px;font:14px system-ui,-apple-system,sans-serif;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.45);max-width:min(92vw,420px);text-align:center;line-height:1.4;pointer-events:auto';
      shadow.appendChild(inner);
      setTimeout(function () {
        inner.style.transition = 'opacity 0.35s ease';
        inner.style.opacity = '0';
        setTimeout(function () {
          try {
            host.remove();
          } catch (e2) {}
        }, 380);
      }, 4500);
    } catch (e) {}
  }

  function runInventory() {
    var seen = new WeakSet();
    var list = [];

    function add(el) {
      if (!el || el.nodeType !== 1) return;
      if (seen.has(el)) return;
      seen.add(el);
      list.push(snapshotElement(el));
    }

    document.querySelectorAll('[id]').forEach(add);
    document.querySelectorAll('a[href], button, input, textarea, select, label').forEach(add);
    document.querySelectorAll('[role]').forEach(add);
    document.querySelectorAll('h1, h2, h3, nav, main, article, header, footer').forEach(add);
    document.querySelectorAll('[data-testid], [data-cy]').forEach(add);

    var max = 220;
    return {
      url: location.href,
      pathname: location.pathname,
      title: document.title,
      capturedAt: new Date().toISOString(),
      elementCountTotal: list.length,
      elements: list.slice(0, max)
    };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || msg.action !== 'matchClubInventory') return;
    var silent = !!msg.silentToast;
    try {
      var payload = runInventory();
      // Видно в DevTools этой вкладки (Console), не только в service worker расширения.
      console.info(
        '[Dex] Match Club: страница захвачена — HTML/DOM структура снята.',
        {
          url: payload.url,
          pathname: payload.pathname,
          elementCount: payload.elementCountTotal,
          capturedAt: payload.capturedAt
        }
      );
      // Synchronous sendResponse — do NOT return true (that reserves async channel and breaks sync reply).
      sendResponse({ ok: true, payload: payload });
      if (!silent) {
        setTimeout(function () {
          showDexToast(
            'Dex: снимок страницы готов. Учтено узлов: ' +
              payload.elementCountTotal +
              '. Данные в расширении (последний снимок).'
          );
        }, 0);
      }
      setTimeout(function () {
        try {
          chrome.runtime.sendMessage({
            action: 'dexMatchClubInventoryDone',
            elementCountTotal: payload.elementCountTotal,
            pathname: payload.pathname || ''
          });
        } catch (e3) {}
      }, 0);
    } catch (e) {
      var err = e && e.message ? e.message : String(e);
      console.warn('[Dex] Match Club: не удалось снять HTML/DOM структуру.', err);
      sendResponse({
        ok: false,
        error: err
      });
      if (!silent) {
        setTimeout(function () {
          showDexToast('Dex: не удалось снять структуру. ' + err, true);
        }, 0);
      }
    }
  });
})();
