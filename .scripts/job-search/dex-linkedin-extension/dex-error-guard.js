(function () {
  'use strict';

  // Global guard installed in Dex content scripts.
  // Goal: stop capture loops when unexpected runtime errors happen,
  // and record the error context for later debugging.

  var INSTALLED_KEY = '__dexErrorGuardInstalled';
  if (typeof window === 'undefined') return;
  if (window[INSTALLED_KEY]) return;
  window[INSTALLED_KEY] = true;

  var STOP_FLAG = '__dexStopRequested';
  var STOP_REASON = '__dexStopReason';
  var STOP_AT = '__dexStopAt';

  function safeConsoleWarn() {
    try {
      console.warn.apply(console, arguments);
    } catch (e) {}
  }

  function getErrorMessageForFilter(err) {
    try {
      if (!err) return '';
      if (typeof err === 'string') return err;
      if (err && err.message) return String(err.message);
      return String(err);
    } catch (e) {
      return '';
    }
  }

  /**
   * ErrorEvent with no ev.error, no message, no filename: often resource load / third-party noise — not actionable.
   * Synthetic "window.onerror type=error" is what we used to build before; do not stop capture on that alone.
   */
  function shouldIgnoreBenignOrEmptyErrorEvent(ev, err) {
    try {
      if (ev && !ev.error && (!ev.message || String(ev.message).trim() === '') && !ev.filename) return true;
    } catch (e) {}
    try {
      if (err && err.message === 'window.onerror type=error') return true;
    } catch (e2) {}
    return false;
  }

  /** Other extensions (e.g. Redux DevTools / background-redux-new.js) — not a Dex bug. */
  function shouldIgnoreExternalExtensionNoise(err, ev) {
    var msg = getErrorMessageForFilter(err);
    var lower = msg.toLowerCase();
    if (
      lower.indexOf('extension manifest must request permission') !== -1 ||
      (lower.indexOf('cannot access contents of the page') !== -1 && lower.indexOf('manifest') !== -1)
    ) {
      return true;
    }
    try {
      var stack = err && err.stack ? String(err.stack) : '';
      if (stack.indexOf('background-redux-new.js') !== -1) return true;
    } catch (e) {}
    var myId = '';
    try {
      myId = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id ? chrome.runtime.id : '';
    } catch (e2) {}
    try {
      if (ev && ev.filename && typeof ev.filename === 'string' && myId) {
        if (ev.filename.indexOf('chrome-extension://') === 0 && ev.filename.indexOf('chrome-extension://' + myId + '/') !== 0) {
          return true;
        }
      }
    } catch (e3) {}
    return false;
  }

  function captureErrorDetails(err, context) {
    var message = '';
    try {
      if (!err) message = 'Unknown error';
      else if (typeof err === 'string') message = err;
      else if (typeof Event !== 'undefined' && err instanceof Event) {
        message =
          'Window error event' +
          (err.type ? ' (' + err.type + ')' : '') +
          (typeof err.message === 'string' && err.message ? ': ' + err.message : '') +
          (err.filename ? ' @ ' + err.filename + ':' + (err.lineno || '?') : '');
      } else if (err && err.message) message = String(err.message);
      else message = String(err);
    } catch (e) {
      message = 'Unknown error';
    }
    var stack = (err && err.stack) ? String(err.stack) : null;
    return {
      message: message,
      stack: stack,
      url: (typeof location !== 'undefined' && location && location.href) ? location.href : null,
      at: new Date().toISOString(),
      context: context || null
    };
  }

  var stopOnce = false;
  function requestDexStop(err, context) {
    if (stopOnce) return;
    stopOnce = true;

    var details = captureErrorDetails(err, context);
    try {
      window[STOP_FLAG] = true;
      window[STOP_REASON] = details;
      window[STOP_AT] = Date.now();
    } catch (e) {}

    safeConsoleWarn('[Dex] Stopping capture due to error:', details);

    // Tell the user to reload extension after our fixes are deployed.
    try {
      var bannerId = 'dex-reload-required-banner';
      var existing = document.getElementById(bannerId);
      if (!existing) {
        var wrap = document.createElement('div');
        wrap.id = bannerId;
        wrap.style.cssText =
          'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
          'background:#111827;color:#fff;padding:10px 14px;border-radius:10px;' +
          'font-family:system-ui,sans-serif;font-size:13px;max-width:860px;line-height:1.35;' +
          'box-shadow:0 10px 40px rgba(0,0,0,.45);';
        var msg = details && details.message ? details.message : 'runtime error';
        wrap.textContent =
          'Dex stopped due to a runtime error: ' + msg + '. Reload the extension (chrome://extensions/) to apply the latest fix, then press Resume.';
        document.documentElement.appendChild(wrap);
        setTimeout(function () {
          try {
            var el = document.getElementById(bannerId);
            if (el) el.remove();
          } catch (e) {}
        }, 20000);
      }
    } catch (e) {}

    // Also persist known capture states when possible (helps across reloads).
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.storage.local.get && chrome.storage.local.set) {
        var keys = ['dexBookingCarsCaptureState', 'dexSearchState'];
        chrome.storage.local.set({ dexNeedsExtensionReload: { at: Date.now(), reason: details && details.message ? details.message : '' } });
        try { chrome.storage.local.set({ dexLastRuntimeError: details }); } catch (e3) {}
        chrome.storage.local.get(keys, function (res) {
          try {
            var out = {};
            if (res && res.dexBookingCarsCaptureState && res.dexBookingCarsCaptureState.status === 'capturing') {
              res.dexBookingCarsCaptureState.status = 'stopped';
              res.dexBookingCarsCaptureState.stopRequested = true;
              res.dexBookingCarsCaptureState.error = details;
              out.dexBookingCarsCaptureState = res.dexBookingCarsCaptureState;
            }
            if (res && res.dexSearchState && res.dexSearchState.status === 'capturing') {
              res.dexSearchState.status = 'stopped';
              res.dexSearchState.stopRequested = true;
              res.dexSearchState.error = details;
              out.dexSearchState = res.dexSearchState;
            }
            if (Object.keys(out).length > 0) chrome.storage.local.set(out);
          } catch (e2) {}
        });
      }
    } catch (e) {}

    // Hiring managers capture uses sessionStorage.
    try {
      if (typeof sessionStorage !== 'undefined') {
        var raw = sessionStorage.getItem('dexHiringManagersCapture');
        if (raw) {
          var st = null;
          try { st = JSON.parse(raw); } catch (e2) { st = null; }
          if (st && st.status === 'capturing') {
            st.status = 'stopped';
            st.stopRequested = true;
            st.error = details;
            sessionStorage.setItem('dexHiringManagersCapture', JSON.stringify(st));
          }
        }
      }
    } catch (e3) {}
  }

  function onUnhandledError(ev, kind) {
    var err = null;
    try {
      if (ev && ev.error) {
        err = ev.error;
      } else if (ev && typeof ev.message === 'string' && ev.message.length > 0) {
        err = new Error(ev.message);
      } else {
        // Never pass the ErrorEvent/Event itself: String(ev) becomes "[object Event]" and confuses users.
        var parts = [kind || 'window.onerror'];
        if (ev && ev.type) parts.push('type=' + ev.type);
        if (ev && ev.filename) parts.push(String(ev.filename) + ':' + (ev.lineno != null ? ev.lineno : '?'));
        err = new Error(parts.join(' '));
      }
    } catch (e) {
      err = e instanceof Error ? e : new Error(String(e));
    }
    if (shouldIgnoreBenignOrEmptyErrorEvent(ev, err)) return;
    if (shouldIgnoreExternalExtensionNoise(err, ev)) return;
    requestDexStop(err, { kind: kind, filename: ev && ev.filename ? ev.filename : null, lineno: ev && ev.lineno ? ev.lineno : null, colno: ev && ev.colno ? ev.colno : null });
  }

  window.addEventListener('error', function (ev) {
    onUnhandledError(ev, 'window.onerror');
  }, true);

  window.addEventListener('unhandledrejection', function (ev) {
    var reason = null;
    try {
      if (ev && 'reason' in ev) {
        reason = ev.reason;
      } else {
        reason = new Error('unhandledrejection (invalid event)');
      }
    } catch (e) {
      reason = e instanceof Error ? e : new Error(String(e));
    }
    if (reason === undefined) {
      reason = new Error('Promise rejected with undefined');
    }
    if (typeof Event !== 'undefined' && reason instanceof Event) {
      reason = new Error('rejected with Event: ' + (reason.type || '?'));
    }
    if (shouldIgnoreExternalExtensionNoise(reason, null)) return;
    requestDexStop(reason, { kind: 'unhandledrejection' });
  }, true);
})();

