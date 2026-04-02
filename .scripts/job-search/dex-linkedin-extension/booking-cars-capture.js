/**
 * Dex Booking — car rental best price capture (DOM-only, no Playwright)
 *
 * Flow:
 * - user opens Booking car rental results in a logged-in browser tab
 * - content script shows overlay UI
 * - user clicks "Start"
 * - script creates date offsets matrix (drop-off ±N days)
 * - for each offset: navigates to URL with shifted drop-off date (URL-first)
 * - then iterates detected car categories (best-effort DOM click) or falls back to current category
 * - extracts "total" price via heuristics (currency regex + nearby keywords)
 * - stores progress in chrome.storage.local and resumes across reloads
 * - exports JSON via background `downloadJson`
 */

(function () {
  'use strict';

  var STATE_KEY = 'dexBookingCarsCaptureState';
  var SAVE_HISTORY_KEY = 'dexBookingCarsSaveHistory';
  var UI_ID = 'dex-booking-cars-ui';
  var UI_LOG_ID = 'dex-booking-cars-log';

  var MAX_OFFSET_DAYS = 30; // safety cap
  var DEFAULT_N = 7;

  // URL-first date params (commonly used by booking car rental pages)
  var URL_DATE_KEYS = {
    puYear: 'puYear',
    puMonth: 'puMonth',
    puDay: 'puDay',
    doYear: 'doYear',
    doMonth: 'doMonth',
    doDay: 'doDay'
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function normalizeMoney(n) {
    // Convert "1.234,56" or "1,234.56" into a float number
    if (typeof n !== 'string') return NaN;
    var t = n.trim().replace(/\s+/g, '');
    // If both '.' and ',' exist: assume thousand separators + decimal separator.
    var hasComma = t.indexOf(',') !== -1;
    var hasDot = t.indexOf('.') !== -1;
    if (hasComma && hasDot) {
      // Treat the last separator as decimal.
      var lastComma = t.lastIndexOf(',');
      var lastDot = t.lastIndexOf('.');
      var decimalSepIndex = Math.max(lastComma, lastDot);
      var decimalSep = decimalSepIndex === lastComma ? ',' : '.';
      var thousandsSep = decimalSep === ',' ? '.' : ',';
      t = t.split(thousandsSep).join('');
      t = t.replace(decimalSep, '.');
      return parseFloat(t);
    }
    // If only comma: it's probably decimal comma.
    if (hasComma && !hasDot) {
      t = t.replace(',', '.');
      return parseFloat(t);
    }
    // If only dot: normal decimal dot.
    return parseFloat(t);
  }

  function extractDebugFlag() {
    try {
      var sp = new URLSearchParams(window.location.search || '');
      return sp.get('dex-booking-debug') === '1' || sp.get('dex-booking-debug') === 'true';
    } catch (e) {
      return false;
    }
  }

  /** Same idea as LinkedIn dex-auto-capture: open from Dex with ?dex-booking-autostart=1 */
  function extractAutoStartParams() {
    try {
      var sp = new URLSearchParams(window.location.search || '');
      var hp = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
      var autoRaw = sp.get('dex-booking-autostart') || hp.get('dex-booking-autostart');
      var autostart = autoRaw === '1' || autoRaw === 'true';
      var nRaw = sp.get('dex-booking-n');
      if ((nRaw == null || nRaw === '') && hp.get('dex-booking-n')) nRaw = hp.get('dex-booking-n');
      var nParsed = nRaw != null && nRaw !== '' ? parseInt(String(nRaw), 10) : NaN;
      var nDays = !isNaN(nParsed) && nParsed >= 0 ? nParsed : null;
      var catRaw = sp.get('dex-booking-cat-scan');
      if ((catRaw == null || catRaw === '') && hp.get('dex-booking-cat-scan')) catRaw = hp.get('dex-booking-cat-scan');
      var catScan = catRaw === '0' || catRaw === 'false' ? false : true;
      return { autostart: autostart, nDays: nDays, catScan: catScan };
    } catch (e) {
      return { autostart: false, nDays: null, catScan: true };
    }
  }

  function stripDexBookingControlParamsFromUrl() {
    try {
      var u = new URL(window.location.href);
      var hash = u.hash || '';
      if (
        !u.searchParams.has('dex-booking-autostart') &&
        !u.searchParams.has('dex-booking-n') &&
        !u.searchParams.has('dex-booking-cat-scan') &&
        hash.indexOf('dex-booking-autostart=') === -1 &&
        hash.indexOf('dex-booking-n=') === -1 &&
        hash.indexOf('dex-booking-cat-scan=') === -1
      ) {
        return;
      }
      u.searchParams.delete('dex-booking-autostart');
      u.searchParams.delete('dex-booking-n');
      u.searchParams.delete('dex-booking-cat-scan');
      if (hash && hash.length > 1) {
        var hp = new URLSearchParams(hash.replace(/^#/, ''));
        hp.delete('dex-booking-autostart');
        hp.delete('dex-booking-n');
        hp.delete('dex-booking-cat-scan');
        var nextHash = hp.toString();
        u.hash = nextHash ? ('#' + nextHash) : '';
      }
      history.replaceState({}, '', u.toString());
    } catch (e) {}
  }

  var DEBUG = extractDebugFlag();
  function log() {
    if (!DEBUG) return;
    try { console.log.apply(console, arguments); } catch (e) {}
    try {
      var logEl = document.getElementById(UI_LOG_ID);
      if (logEl) logEl.textContent = (logEl.textContent || '') + '\n' + Array.prototype.slice.call(arguments).join(' ');
    } catch (e2) {}
  }

  function flowLog(level, tag, payload) {
    var line = '[Dex Booking][' + tag + '] ' + (payload != null ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '');
    try {
      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else if (level === 'info') console.info(line);
      else console.log(line);
    } catch (e) {}
    try {
      var logEl = document.getElementById(UI_LOG_ID);
      if (logEl) {
        var next = (logEl.textContent || '') + '\n' + line;
        // Keep overlay log bounded.
        var lines = next.split('\n');
        if (lines.length > 180) lines = lines.slice(lines.length - 180);
        logEl.textContent = lines.join('\n');
      }
    } catch (e2) {}
  }

  function getElByTextContains(root, text, maxMatches) {
    root = root || document;
    text = String(text || '').toLowerCase();
    if (!text) return [];
    var els = [];
    var candidates = root.querySelectorAll('button, a, [role="button"], label, span, div');
    for (var i = 0; i < candidates.length; i++) {
      var t = (candidates[i].textContent || '').trim().toLowerCase();
      if (t && t.indexOf(text) !== -1) els.push(candidates[i]);
      if (maxMatches && els.length >= maxMatches) break;
    }
    return els;
  }

  function safeClick(el) {
    if (!el || typeof el.click !== 'function') return false;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      try { el.scrollIntoView(true); } catch (e2) {}
    }
    try { el.click(); } catch (e3) { return false; }
    return true;
  }

  function moneyRegex() {
    // Capture strings like: € 123.45, £123, $1,234.56, EUR 123.45
    // We rely on heuristics later.
    return /(?:€|£|\$)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})|\b(?:EUR|USD|GBP|AUD|CAD|CHF|SEK|NOK|DKK|PLN)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/gi;
  }

  function extractMoneyFromText(text) {
    text = String(text || '');
    var re = moneyRegex();
    var m = null;
    var out = [];
    while ((m = re.exec(text)) !== null) {
      var raw = m[0];
      // Determine currency symbol/code.
      var cur = null;
      if (raw.indexOf('€') !== -1) cur = 'EUR';
      else if (raw.indexOf('£') !== -1) cur = 'GBP';
      else if (raw.indexOf('$') !== -1) cur = 'USD';
      else {
        var codeM = raw.match(/\b(EUR|USD|GBP|AUD|CAD|CHF|SEK|NOK|DKK|PLN)\b/i);
        cur = codeM ? codeM[1].toUpperCase() : null;
      }
      var numM = raw.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2}))/);
      var numRaw = numM ? numM[1] : null;
      var val = normalizeMoney(numRaw || '');
      if (!isNaN(val)) out.push({ raw: raw, currency: cur, value: val });
    }
    return out;
  }

  function currentUrlWithoutVolatile() {
    // Drop known volatile params that change across refresh/clicks.
    // Keep date params and location keys.
    try {
      var u = new URL(window.location.href);
      var dropKeys = [
        'checkin', 'checkout', 'nflt', 'selected_category', 'selected_group',
        '_', 'aid', 'label', 'lang', 'aid', 'temp'
      ];
      for (var i = 0; i < dropKeys.length; i++) u.searchParams.delete(dropKeys[i]);
      return u.toString();
    } catch (e) {
      return window.location.href;
    }
  }

  function getUrlDateParts(u) {
    // u: URL instance
    var puY = u.searchParams.get(URL_DATE_KEYS.puYear);
    var puM = u.searchParams.get(URL_DATE_KEYS.puMonth);
    var puD = u.searchParams.get(URL_DATE_KEYS.puDay);
    var doY = u.searchParams.get(URL_DATE_KEYS.doYear);
    var doM = u.searchParams.get(URL_DATE_KEYS.doMonth);
    var doD = u.searchParams.get(URL_DATE_KEYS.doDay);
    function intOrNull(x) {
      if (x == null) return null;
      var n = parseInt(String(x), 10);
      return isNaN(n) ? null : n;
    }
    return {
      pu: puY && puM && puD ? { y: intOrNull(puY), m: intOrNull(puM), d: intOrNull(puD) } : null,
      do: doY && doM && doD ? { y: intOrNull(doY), m: intOrNull(doM), d: intOrNull(doD) } : null
    };
  }

  function partsToISODate(p) {
    // p = {y,m,d} using 1-based month
    if (!p || !p.y || !p.m || !p.d) return null;
    var dt = new Date(p.y, p.m - 1, p.d, 12, 0, 0, 0); // local noon to reduce timezone DST edge
    // YYYY-MM-DD
    var yyyy = dt.getFullYear();
    var mm = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function addDaysToISODate(isoDate, offsetDays) {
    if (!isoDate) return null;
    var m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0, 0);
    dt.setDate(dt.getDate() + offsetDays);
    var yyyy = dt.getFullYear();
    var mm = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function setUrlDoDate(baseHref, doISO) {
    // Modify known URL params if present. If not, return baseHref unchanged.
    try {
      var u = new URL(baseHref);
      var parts = getUrlDateParts(u);
      if (!parts.do) return baseHref;
      var m = doISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return baseHref;
      u.searchParams.set('doYear', m[1]);
      u.searchParams.set('doMonth', String(parseInt(m[2], 10)));
      u.searchParams.set('doDay', String(parseInt(m[3], 10)));
      return u.toString();
    } catch (e) {
      return baseHref;
    }
  }

  function isLikelyResultsUrl(href) {
    try {
      var u = new URL(href);
      var p = String(u.pathname || '').toLowerCase();
      return p.indexOf('search-results') !== -1 || p.indexOf('/cars/results') !== -1;
    } catch (e) {
      return false;
    }
  }

  function extractBaseDatesFromUrl() {
    try {
      var u = new URL(window.location.href);
      var parts = getUrlDateParts(u);
      var puISO = parts.pu ? partsToISODate(parts.pu) : null;
      var doISO = parts.do ? partsToISODate(parts.do) : null;
      return { pickupISO: puISO, dropoffISO: doISO };
    } catch (e) {
      return { pickupISO: null, dropoffISO: null };
    }
  }

  var MONTHS = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  function parseMonthNameToIndex(monthStr) {
    if (!monthStr) return null;
    var s = String(monthStr).trim().toLowerCase();
    // normalize: "Sep" or "September"
    var key = s.substring(0, 3);
    if (MONTHS.hasOwnProperty(key)) return MONTHS[key];
    return null;
  }

  function isoFromMonthDay(monthIndex, dayNum, yearNum) {
    // yearNum is optional; if missing, we guess based on proximity to today.
    var now = new Date();
    var y = yearNum != null ? parseInt(yearNum, 10) : now.getFullYear();
    var dt = new Date(y, monthIndex, dayNum, 12, 0, 0, 0);
    if (yearNum == null) {
      // If guessed date is far in the past/future, shift by 1 year.
      var diffDays = (dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays < -180) dt = new Date(y + 1, monthIndex, dayNum, 12, 0, 0, 0);
      if (diffDays > 180) dt = new Date(y - 1, monthIndex, dayNum, 12, 0, 0, 0);
    }
    var yyyy = dt.getFullYear();
    var mm = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function extractDatesFromDomForPickupDropoff() {
    // Booking pages often show pickup/drop-off dates as "Sat, Mar 20" (no year in URL).
    // This function is best-effort and tuned for English UIs.
    var text = (document.body && document.body.innerText) ? document.body.innerText : '';
    var t = String(text || '');
    var head = t.slice(0, 8000); // bias towards the top search form

    // 1) labeled extraction (Pickup/Drop-off/Return near month label)
    // Example: "Pick-up Sun, Mar 21" or "Drop-off Sun, Mar 29"
    var monthWordsRe = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
    var pickupRe = new RegExp('(Pick[- ]?up|Pickup|Pick\\s*up)[^A-Za-z0-9]{0,60}(?:[A-Za-z]{2,4},\\s*)?' + monthWordsRe + '[^0-9]{0,10}(\\d{1,2})(?:[^0-9]{0,10}(\\d{4}))?', 'i');
    var dropRe = new RegExp('(Drop[- ]?off|Drop\\s*off|Return)[^A-Za-z0-9]{0,60}(?:[A-Za-z]{2,4},\\s*)?' + monthWordsRe + '[^0-9]{0,10}(\\d{1,2})(?:[^0-9]{0,10}(\\d{4}))?', 'i');

    var pickupMatch = head.match(pickupRe);
    var dropMatch = head.match(dropRe);

    var pickupISO = null;
    var dropoffISO = null;

    if (pickupMatch && pickupMatch[2]) {
      var mi = parseMonthNameToIndex(pickupMatch[2]);
      if (mi != null) pickupISO = isoFromMonthDay(mi, parseInt(pickupMatch[3], 10), pickupMatch[4] ? parseInt(pickupMatch[4], 10) : null);
    }

    if (dropMatch && dropMatch[2]) {
      var mi2 = parseMonthNameToIndex(dropMatch[2]);
      if (mi2 != null) dropoffISO = isoFromMonthDay(mi2, parseInt(dropMatch[3], 10), dropMatch[4] ? parseInt(dropMatch[4], 10) : null);
    }

    if (pickupISO || dropoffISO) return { pickupISO: pickupISO, dropoffISO: dropoffISO };

    // 2) fallback: parse first two weekday+month occurrences and take as pickup/dropoff
    // Example: "Sat, Mar 20" "Sun, Mar 29"
    var dateRe = new RegExp('(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\s*,?\\s*' + monthWordsRe + '[^0-9]{0,10}(\\d{1,2})(?:[^0-9]{0,10}(\\d{4}))?', 'gi');
    var matches = [];
    var m = null;
    while ((m = dateRe.exec(head)) !== null) {
      // Captures: monthWordsRe group + day + optional year
      var monthStr = m[1];
      var dayStr = m[2];
      var yearStr = m[3];
      var mi3 = parseMonthNameToIndex(monthStr);
      if (mi3 == null) continue;
      var dayNum = parseInt(dayStr, 10);
      if (!dayNum || dayNum < 1 || dayNum > 31) continue;
      matches.push(isoFromMonthDay(mi3, dayNum, yearStr ? parseInt(yearStr, 10) : null));
      if (matches.length >= 2) break;
    }

    if (matches.length >= 2) return { pickupISO: matches[0], dropoffISO: matches[1] };
    if (matches.length === 1) return { pickupISO: null, dropoffISO: matches[0] };
    return { pickupISO: null, dropoffISO: null };
  }

  function extractCategories() {
    // Best-effort extraction of car categories from filter controls.
    // If we cannot find stable categories, we return a single "current" category placeholder.
    var keywordRe = /(car type|vehicle type|category|group|class)/i;
    var prefer = ['Economy', 'Compact', 'Intermediate', 'Standard', 'Full size', 'SUV', 'Van', 'Luxury', 'Estate'];

    // First: find likely label controls
    var allButtons = document.querySelectorAll('button, [role="button"], label');
    var candidates = [];
    for (var i = 0; i < allButtons.length; i++) {
      var el = allButtons[i];
      var txt = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (!txt) continue;
      if (txt.length < 3 || txt.length > 60) continue;
      var lower = txt.toLowerCase();
      if (prefer.some(function (p) { return lower.indexOf(p.toLowerCase()) !== -1; })) {
        candidates.push(txt);
        continue;
      }
      if (keywordRe.test(lower)) {
        // Might be a header; not the actual option. Skip for now.
        continue;
      }
    }

    // De-dup and filter out "Show more" / navigation
    var uniq = {};
    var out = [];
    for (var j = 0; j < candidates.length; j++) {
      var c = candidates[j].trim();
      var lc = c.toLowerCase();
      if (lc.indexOf('show more') !== -1 || lc.indexOf('clear') !== -1 || lc.indexOf('accept') !== -1) continue;
      if (!uniq[lc]) {
        uniq[lc] = true;
        out.push({ label: c });
      }
    }

    // Heuristic: if we have at least 2 meaningful categories, use them.
    if (out.length >= 2) {
      // Keep only first N categories to prevent explosion.
      return out.slice(0, 8);
    }

    // Fallback: try to detect current selected category label (car group)
    var possible = [];
    var spans = document.querySelectorAll('span');
    for (var k = 0; k < spans.length; k++) {
      var s = (spans[k].innerText || '').trim();
      if (!s) continue;
      if (prefer.some(function (p) { return s.toLowerCase().indexOf(p.toLowerCase()) !== -1; })) possible.push(s);
    }
    if (possible.length > 0) {
      return [{ label: possible[0], fallback: true }];
    }

    return [{ label: 'current', fallback: true }];
  }

  function extractPriceHeuristics() {
    // Extract price from current page. Returns:
    // { price: number|null, currency: string|null, method: string, candidates: [...] }
    var text = '';
    try {
      text = (document.body && document.body.innerText) ? document.body.innerText : '';
    } catch (e) {
      text = '';
    }
    var moneyAll = extractMoneyFromText(text);
    if (moneyAll.length === 0) {
      return { price: null, currency: null, method: 'no-matches', candidates: [] };
    }

    // Prefer entries with "total" near the raw string
    var lowerText = String(text || '').toLowerCase();
    var preferIdx = [];
    for (var i = 0; i < moneyAll.length; i++) {
      var raw = moneyAll[i].raw;
      var idx = lowerText.indexOf(String(raw).toLowerCase());
      if (idx === -1) continue;
      var windowStart = Math.max(0, idx - 40);
      var windowEnd = Math.min(lowerText.length, idx + 60);
      var snippet = lowerText.slice(windowStart, windowEnd);
      if (snippet.indexOf('total') !== -1 || snippet.indexOf('for the') !== -1 || snippet.indexOf('entire') !== -1 || snippet.indexOf('whole') !== -1) {
        preferIdx.push(i);
      }
    }

    var chosen = null;
    if (preferIdx.length > 0) {
      // Choose the lowest among preferred "total" candidates.
      var best = null;
      for (var p = 0; p < preferIdx.length; p++) {
        var idx = preferIdx[p];
        var item = moneyAll[idx];
        if (!best || item.value < best.value) best = item;
      }
      chosen = best;
      return { price: chosen.value, currency: chosen.currency, method: 'total-keyword-lowest', candidates: moneyAll.slice(0, 20) };
    }

    // Else: choose the first money-like value (most stable for "starting at" layouts).
    chosen = moneyAll[0];
    return { price: chosen.value, currency: chosen.currency, method: 'first-money', candidates: moneyAll.slice(0, 20) };
  }

  function computeOffsets(N) {
    N = parseInt(N, 10);
    if (isNaN(N) || N < 0) N = DEFAULT_N;
    if (N > MAX_OFFSET_DAYS) N = MAX_OFFSET_DAYS;
    var offsets = [];
    for (var i = -N; i <= N; i++) offsets.push(i);
    // Sort by absolute distance? user may prefer closer first.
    offsets.sort(function (a, b) { return Math.abs(a) - Math.abs(b); });
    return { N: N, offsets: offsets };
  }

  function buildBestFilename(base) {
    var dt = new Date();
    var yyyy = dt.getFullYear();
    var mm = String(dt.getMonth() + 1).padStart(2, '0');
    var dd = String(dt.getDate()).padStart(2, '0');
    var suffix = base && base.pickupISO && base.dropoffISO ? ('-' + base.pickupISO + '_to_' + base.dropoffISO) : '';
    return 'dex-booking-cars-best-' + yyyy + '-' + mm + '-' + dd + suffix + '.json';
  }

  function buildUI(initial) {
    var root = document.createElement('div');
    root.id = UI_ID;
    root.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'z-index:999999',
      'background:rgba(10,102,194,0.95)',
      'color:#fff',
      'padding:12px',
      'border-radius:10px',
      'min-width:320px',
      'font-family:system-ui,sans-serif',
      'box-shadow:0 8px 30px rgba(0,0,0,.35)',
      'user-select:none'
    ].join(';');

    var topRow = [
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">',
      '<div style="font-weight:800;font-size:14px;line-height:1;">Dex Booking Cars</div>',
      '<div style="font-size:11px;opacity:.85;">session-scrape</div>',
      '</div>'
    ].join('');

    var form = [
      '<div style="margin-top:10px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">',
      '<label style="font-size:12px;opacity:.95;">N (drop-off ±days)</label>',
      '<input id="dex-booking-n" type="number" min="0" max="' + MAX_OFFSET_DAYS + '" style="width:88px;padding:6px 8px;border-radius:6px;border:none;outline:none;color:#000;" value="' + (initial && initial.N != null ? initial.N : DEFAULT_N) + '"/>',
      '<button id="dex-booking-start" type="button" style="background:#fff;color:#0a66c2;border:none;padding:7px 10px;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;">Start</button>',
      '<button id="dex-booking-stop" type="button" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:7px 10px;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;display:none;">Stop</button>',
      '</div>'
    ].join('');

    var catMode = [
      '<div style="margin-top:8px;font-size:12px;opacity:.95;">',
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">',
      '<input id="dex-booking-cat-scan" type="checkbox" ' +
        (initial && initial.catScan === false ? '' : 'checked') +
        ' style="accent-color:#0a66c2;"/>',
      'Scan car categories on page',
      '</label>',
      '</div>'
    ].join('');

    var status = [
      '<div style="margin-top:10px;font-size:12px;opacity:.95;" id="dex-booking-status">Idle.</div>',
      '<div style="margin-top:8px;font-size:11px;opacity:.9;white-space:pre-wrap;max-height:160px;overflow:auto;" id="' + UI_LOG_ID + '"></div>'
    ].join('');

    root.innerHTML = topRow + form + catMode + status;

    var stopBtn = root.querySelector('#dex-booking-stop');
    var startBtn = root.querySelector('#dex-booking-start');

    return {
      root: root,
      startBtn: startBtn,
      stopBtn: stopBtn
    };
  }

  function setStatus(html) {
    var el = document.getElementById('dex-booking-status');
    if (el) el.innerHTML = html;
  }

  function removeUI() {
    var el = document.getElementById(UI_ID);
    if (el) el.remove();
  }

  function storageGet() {
    return new Promise(function (resolve) {
      chrome.storage.local.get([STATE_KEY], function (res) {
        resolve(res && res[STATE_KEY] ? res[STATE_KEY] : null);
      });
    });
  }

  function storageSet(state) {
    return new Promise(function (resolve) {
      chrome.storage.local.set((function () {
        var obj = {};
        obj[STATE_KEY] = state;
        return obj;
      })(), function () { resolve(); });
    });
  }

  function storageClear() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove([STATE_KEY], function () { resolve(); });
    });
  }

  function appendSaveHistory(entry) {
    try {
      chrome.storage.local.get([SAVE_HISTORY_KEY], function (res) {
        try {
          var list = (res && Array.isArray(res[SAVE_HISTORY_KEY])) ? res[SAVE_HISTORY_KEY] : [];
          list.push(entry);
          // Keep recent history only.
          if (list.length > 200) list = list.slice(list.length - 200);
          var out = {};
          out[SAVE_HISTORY_KEY] = list;
          chrome.storage.local.set(out);
        } catch (e) {}
      });
    } catch (e2) {}
  }

  function buildQueue(baseHref, offsets, categories, catScan) {
    return {
      baseHref: baseHref,
      offsets: offsets,
      categories: categories || [{ label: 'current', fallback: true }],
      catScan: !!catScan
    };
  }

  function buildStateQueueFromConfig(config) {
    var base = config.baseDates || {};
    return {
      status: 'capturing',
      startedAt: nowIso(),
      base: {
        pickupISO: base.pickupISO || null,
        dropoffISO: base.dropoffISO || null
      },
      queue: config.queue,
      index: {
        offsetIndex: config.startOffsetIndex || 0,
        categoryIndex: config.startCategoryIndex || 0
      },
      items: [],
      completed: 0,
      warnings: []
    };
  }

  function bestItemFromItems(items) {
    var best = null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (typeof it.price !== 'number' || isNaN(it.price)) continue;
      if (!best || it.price < best.price) best = it;
    }
    return best;
  }

  function bestByKey(items, keyFn) {
    var map = {};
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it.price !== 'number' || isNaN(it.price)) continue;
      var k = keyFn(it);
      if (k == null) continue;
      if (!map[k] || it.price < map[k].price) map[k] = it;
    }
    return map;
  }

  function buildPayload(state, meta) {
    var items = state && state.items ? state.items : [];
    var bestOverall = bestItemFromItems(items);
    var bestByOffsetMap = bestByKey(items, function (it) { return String(it.offsetDays); });
    var bestByRentalTermMap = bestByKey(items, function (it) { return it.rentalTerm || null; });
    return {
      source: {
        baseUrl: state && state.queue ? state.queue.baseHref : null,
        pickupISO: state && state.base ? state.base.pickupISO : null,
        baseDropoffISO: state && state.base ? state.base.dropoffISO : null,
        exportedAt: nowIso(),
        snapshotType: meta && meta.snapshotType ? meta.snapshotType : 'final',
        userNotes: DEBUG ? 'debug=on' : null
      },
      matrixConfig: {
        N: state && state.queue && state.queue.N != null ? state.queue.N : null,
        offsets: state && state.queue ? state.queue.offsets : [],
        categories: state && state.queue ? state.queue.categories : [],
        categoryScanEnabled: state && state.queue ? state.queue.catScan : false
      },
      items: items,
      best: bestOverall,
      analysis: {
        itemCount: items.length,
        pricedItemCount: items.filter(function (it) { return it && typeof it.price === 'number' && !isNaN(it.price); }).length,
        bestOverall: bestOverall,
        bestByOffset: bestByOffsetMap,
        bestByRentalTerm: bestByRentalTermMap
      }
    };
  }

  function saveToLocalSaveServer(jsonStr, filename) {
    var url = 'http://127.0.0.1:8765/dex-save';
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Filename': filename
      },
      body: jsonStr
    }).then(function (r) {
      return r.text().then(function (t) {
        try {
          return JSON.parse(t);
        } catch (e) {
          return { ok: false, error: 'save-server bad response: ' + String(e && e.message ? e.message : e) };
        }
      });
    }).catch(function (e) {
      return { ok: false, error: 'save-server unreachable: ' + String(e && e.message ? e.message : e) };
    });
  }

  function sendToBackground(jsonStr, filename) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { action: 'downloadJson', filename: filename, data: jsonStr },
          function (resp) {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, error: 'bg lastError: ' + chrome.runtime.lastError.message });
            } else {
              resolve(resp || { ok: false, error: 'bg no response' });
            }
          }
        );
      } catch (e) {
        resolve({ ok: false, error: 'bg send exception: ' + (e && e.message ? e.message : String(e)) });
      }
    });
  }

  function sendPayloadToSave(filename, payload) {
    var jsonStr = JSON.stringify(payload, null, 2);
    var saveMeta = {
      at: nowIso(),
      filename: filename,
      snapshotType: payload && payload.source ? payload.source.snapshotType : null,
      itemCount: payload && payload.analysis ? payload.analysis.itemCount : null,
      pricedItemCount: payload && payload.analysis ? payload.analysis.pricedItemCount : null
    };
    flowLog('info', 'save', { stage: 'attempt', meta: saveMeta });
    appendSaveHistory(Object.assign({}, saveMeta, { stage: 'attempt' }));

    // Fire-and-forget: try background first; if it fails, force direct save-server fallback.
    sendToBackground(jsonStr, filename).then(function (resp) {
      if (resp && resp.ok) {
        var okEntry = Object.assign({}, saveMeta, {
          stage: 'saved',
          ok: true,
          method: resp.method || 'background',
          path: resp.path || null
        });
        flowLog('info', 'save', { stage: 'ok', entry: okEntry });
        appendSaveHistory(okEntry);
        log('[Dex Booking] Saved via background:', filename, resp.method || '');
        return;
      }
      var bgErr = resp && resp.error ? resp.error : '(unknown)';
      var failEntry = Object.assign({}, saveMeta, {
        stage: 'background-failed',
        ok: false,
        method: 'background',
        error: bgErr
      });
      flowLog('warn', 'save', { stage: 'background-failed', entry: failEntry });
      appendSaveHistory(failEntry);
      log('[Dex Booking] Background save failed, fallback to /dex-save:', filename, bgErr);
      return saveToLocalSaveServer(jsonStr, filename).then(function (srv) {
        if (srv && srv.ok) {
          var srvOk = Object.assign({}, saveMeta, {
            stage: 'saved',
            ok: true,
            method: 'save-server-fallback',
            path: srv.path || null
          });
          flowLog('info', 'save', { stage: 'ok', entry: srvOk });
          appendSaveHistory(srvOk);
          log('[Dex Booking] Saved via save-server fallback:', filename, srv.path || '');
        } else {
          var srvErr = srv && srv.error ? srv.error : '(unknown)';
          var srvFail = Object.assign({}, saveMeta, {
            stage: 'save-server-failed',
            ok: false,
            method: 'save-server-fallback',
            error: srvErr
          });
          flowLog('error', 'save', { stage: 'save-server-failed', entry: srvFail });
          appendSaveHistory(srvFail);
          log('[Dex Booking] save-server fallback failed:', filename, srvErr);
        }
      });
    }).catch(function (e) {
      var ex = e && e.message ? e.message : String(e);
      var exEntry = Object.assign({}, saveMeta, {
        stage: 'exception',
        ok: false,
        method: 'sendPayloadToSave',
        error: ex
      });
      flowLog('error', 'save', { stage: 'exception', entry: exEntry });
      appendSaveHistory(exEntry);
      log('[Dex Booking] sendPayloadToSave exception:', e && e.message ? e.message : String(e));
    });
  }

  function partialFilename(state) {
    var base = buildBestFilename({
      pickupISO: state && state.base ? state.base.pickupISO : null,
      dropoffISO: state && state.base ? state.base.dropoffISO : null
    });
    return base.replace(/\.json$/i, '-partial.json');
  }

  function persistPartialSnapshot(state) {
    try {
      var payload = buildPayload(state, { snapshotType: 'partial' });
      sendPayloadToSave(partialFilename(state), payload);
    } catch (e) {
      log('[Dex Booking] Partial save failed:', e && e.message ? e.message : String(e));
    }
  }

  function exportResults(state) {
    var payload = buildPayload(state, { snapshotType: 'final' });
    var filename = buildBestFilename({
      pickupISO: payload.source.pickupISO,
      dropoffISO: payload.source.baseDropoffISO
    });
    sendPayloadToSave(filename, payload);
  }

  function ensureCookieConsentDismissed() {
    // Booking often shows a cookie consent modal.
    // We try a small set of common button texts.
    var texts = ['Accept', 'I agree', 'Accept all', 'Принять', 'Согласен', 'ОК'];
    for (var i = 0; i < texts.length; i++) {
      var btns = getElByTextContains(document, texts[i], 3);
      if (btns && btns.length > 0) {
        safeClick(btns[0]);
        return true;
      }
    }
    return false;
  }

  function getCurrentDropoffISOFromPageOrUrl() {
    var d = extractBaseDatesFromUrl();
    if (d && d.dropoffISO) return d.dropoffISO;
    var domDates = extractDatesFromDomForPickupDropoff();
    if (domDates && domDates.dropoffISO) return domDates.dropoffISO;
    return null;
  }

  function getDropoffISOForOffset(baseDropoffISO, offset) {
    return addDaysToISODate(baseDropoffISO, offset);
  }

  function categoryMatchesLabel(label, candidateText) {
    if (!label) return false;
    if (!candidateText) return false;
    var l = String(label).trim().toLowerCase();
    var c = String(candidateText).trim().toLowerCase();
    if (!l || !c) return false;
    return c.indexOf(l) !== -1 || l.indexOf(c) !== -1;
  }

  function clickCategoryByLabel(label) {
    if (!label || label === 'current') return false;
    // Best-effort: find clickable elements whose visible text contains label.
    var candidates = getElByTextContains(document, label, 8);
    for (var i = 0; i < candidates.length; i++) {
      // Prefer buttons / radios.
      var tag = (candidates[i].tagName || '').toLowerCase();
      var role = (candidates[i].getAttribute && candidates[i].getAttribute('role')) || '';
      if (tag !== 'button' && role !== 'radio' && role !== 'button') {
        // Still allow labels/spans, but reduce chances by checking aria-label.
        var aria = (candidates[i].getAttribute && candidates[i].getAttribute('aria-label')) || '';
        if (!aria) continue;
      }
      var ok = safeClick(candidates[i]);
      if (ok) return true;
    }
    return false;
  }

  function fingerprintPriceAndCategory() {
    // Used to detect when UI has updated after clicking a category.
    var priceObj = extractPriceHeuristics();
    var priceStr = priceObj.price != null ? String(priceObj.price) : 'no-price';
    var dropISO = getCurrentDropoffISOFromPageOrUrl() || 'unknown-date';
    var catLabel = null;
    // Try to read current visible category-ish text (best-effort)
    var prefers = ['Economy', 'Compact', 'Intermediate', 'Standard', 'Full size', 'SUV', 'Van', 'Luxury', 'Estate'];
    for (var i = 0; i < prefers.length; i++) {
      var els = getElByTextContains(document, prefers[i], 1);
      if (els && els.length > 0) { catLabel = prefers[i]; break; }
    }
    if (!catLabel) catLabel = 'unknown-cat';
    return dropISO + '|' + catLabel + '|' + priceStr + '|' + priceObj.method;
  }

  function hasResultsSignals() {
    try {
      var p = String(window.location.pathname || '').toLowerCase();
      if (p.indexOf('search-results') !== -1) return true;
      var q = [
        '[data-testid*="search-result"]',
        '[data-testid*="vehicle"]',
        '[data-testid*="car-card"]',
        '[class*="SearchResult"]',
        '[class*="search-result"]',
        '[class*="VehicleCard"]',
        '[class*="vehicle-card"]'
      ];
      for (var i = 0; i < q.length; i++) {
        var el = document.querySelector(q[i]);
        if (el) return true;
      }
      var t = ((document.body && document.body.innerText) ? document.body.innerText : '').toLowerCase();
      if (!t) return false;
      if (t.indexOf('cars available') !== -1) return true;
      if (t.indexOf('available cars') !== -1) return true;
      if (t.indexOf('sort by') !== -1 && t.indexOf('price') !== -1) return true;
      if (t.indexOf('compare deals') !== -1) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  async function waitForResultsAfterSearch(msTotal) {
    msTotal = msTotal || 45000;
    var start = Date.now();
    while (Date.now() - start < msTotal) {
      await sleep(1000);
      if (!isBookingCarsIndexPage()) return true;
      if (hasResultsSignals()) {
        var p = extractPriceHeuristics();
        if (p && typeof p.price === 'number' && !isNaN(p.price)) return true;
      }
    }
    return false;
  }

  function buildRentalTermLabel(pickupISO, dropoffISO) {
    if (!pickupISO || !dropoffISO) return null;
    try {
      var pu = new Date(pickupISO + 'T12:00:00Z');
      var d = new Date(dropoffISO + 'T12:00:00Z');
      var days = Math.round((d.getTime() - pu.getTime()) / (24 * 60 * 60 * 1000));
      if (!isFinite(days)) return null;
      if (days <= 0) return '0 days';
      if (days === 1) return '1 day';
      return String(days) + ' days';
    } catch (e) {
      return null;
    }
  }

  async function waitForDomChange(previousFingerprint, msTotal) {
    msTotal = msTotal || 15000;
    var start = Date.now();
    while (Date.now() - start < msTotal) {
      await sleep(800);
      var fp = fingerprintPriceAndCategory();
      if (fp && fp !== previousFingerprint) return true;
    }
    return false;
  }

  function isElementVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isoToMonthShortAndDay(isoDate) {
    var dt = new Date(isoDate + 'T12:00:00');
    var monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var monthShort = monthShorts[dt.getMonth()];
    var day = dt.getDate();
    return { monthShort: monthShort, day: day };
  }

  function findDropoffTriggerEl(currentDropISO) {
    // Try by ARIA first.
    var selectors = [
      '[aria-label*="Drop-off" i]',
      '[aria-label*="Drop off" i]',
      '[aria-label*="Return" i]',
      'button[aria-label*="Drop" i]',
      'input[name*="drop" i]',
      'input[placeholder*="drop" i]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var list = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < list.length; j++) {
        if (isElementVisible(list[j])) return list[j];
      }
    }

    // Fallback: try to find element that currently shows the drop-off date label.
    if (currentDropISO) {
      var dd = isoToMonthShortAndDay(currentDropISO);
      var labelPart = dd.monthShort + ' ' + dd.day;
      var candidates = getElByTextContains(document, labelPart, 20);
      for (var k = 0; k < candidates.length; k++) {
        var el = candidates[k];
        if (!isElementVisible(el)) continue;
        var near = '';
        try { near = (el.closest('div') && el.closest('div').innerText) ? el.closest('div').innerText : ''; } catch (e) {}
        var nearLower = near.toLowerCase();
        // We want an element associated with the date picker, not a random occurrence.
        if (nearLower.indexOf('drop') !== -1 || nearLower.indexOf('return') !== -1) return el;
      }
      if (candidates.length > 0) return candidates[0];
    }

    return null;
  }

  function clickDateInCalendar(targetISO) {
    var dt = new Date(targetISO + 'T12:00:00');
    if (isNaN(dt.getTime())) return false;

    var monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var monthLongs = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var monthShort = monthShorts[dt.getMonth()];
    var monthLong = monthLongs[dt.getMonth()];
    var day = dt.getDate();
    var dayStr = String(day);

    // Prefer aria-labeled date cells.
    var ariaCandidates = document.querySelectorAll('[aria-label]');
    for (var i = 0; i < ariaCandidates.length; i++) {
      var a = ariaCandidates[i];
      var aria = (a.getAttribute && a.getAttribute('aria-label')) || '';
      if (!aria) continue;
      var al = aria.toLowerCase();
      if (al.indexOf(monthShort.toLowerCase()) !== -1 || al.indexOf(monthLong.toLowerCase()) !== -1) {
        if (al.indexOf(dayStr) !== -1) {
          if (!isElementVisible(a)) continue;
          return safeClick(a);
        }
      }
    }

    // Dialog-based: search for exact text day number inside calendar-like containers.
    var dialog = document.querySelector('[role="dialog"]') || document;
    var cells = dialog.querySelectorAll('button, [role="gridcell"], td, div');
    for (var j = 0; j < cells.length; j++) {
      var c = cells[j];
      if (!isElementVisible(c)) continue;
      var txt = (c.textContent || '').trim();
      if (txt !== dayStr) continue;
      var parentText = '';
      try {
        parentText = (c.closest('div') && c.closest('div').innerText) ? c.closest('div').innerText : '';
      } catch (e) {}
      if (parentText && (parentText.toLowerCase().indexOf(monthShort.toLowerCase()) !== -1 || parentText.toLowerCase().indexOf(monthLong.toLowerCase()) !== -1)) {
        return safeClick(c);
      }
    }

    return false;
  }

  async function setDropoffByClick(targetISO, currentDropISO) {
    // Open drop-off date picker, then select targetISO date.
    var trigger = findDropoffTriggerEl(currentDropISO);
    if (!trigger) return false;
    safeClick(trigger);
    await sleep(900);
    // Give calendar time to render.
    await sleep(500);
    var ok = clickDateInCalendar(targetISO);
    if (!ok) return false;
    await sleep(900);
    return true;
  }

  function isBookingCarsIndexPage() {
    try {
      var p = String(window.location.pathname || '');
      // Example: /cars/index.html
      return p.indexOf('cars/index') !== -1 || p.indexOf('/cars/index.html') !== -1 || p.endsWith('index.html');
    } catch (e) {
      return false;
    }
  }

  async function clickSearchButton() {
    // Submit search from the "index" page to land on results page.
    var labels = ['Search', 'Найти', 'Поиск', 'Find', 'Search cars', 'View prices'];

    // 1) Prefer real submit buttons (less likely to mis-click).
    try {
      var submitEls = document.querySelectorAll('button[type="submit"], input[type="submit"]');
      for (var k = 0; k < submitEls.length; k++) {
        if (!isElementVisible(submitEls[k])) continue;
        var txt = (submitEls[k].textContent || submitEls[k].value || '').trim().toLowerCase();
        var okMatch = false;
        for (var i2 = 0; i2 < labels.length; i2++) {
          var needle = String(labels[i2]).toLowerCase();
          if (needle && txt && txt.indexOf(needle.toLowerCase()) !== -1) okMatch = true;
        }
        // Click only the likely search/submit button.
        if (okMatch) {
          if (safeClick(submitEls[k])) {
            await sleep(1200);
            return true;
          }
        }
      }
    } catch (e2) {}

    // 2) Fallback: visible buttons/role="button" with known labels.
    for (var i = 0; i < labels.length; i++) {
      var els2 = [];
      try { els2 = document.querySelectorAll('button, [role="button"]'); } catch (e3) {}
      for (var j = 0; els2 && j < els2.length; j++) {
        var t2 = (els2[j].textContent || '').trim().toLowerCase();
        if (!t2) continue;
        if (t2.indexOf(String(labels[i]).toLowerCase()) === -1) continue;
        if (!isElementVisible(els2[j])) continue;
        if (safeClick(els2[j])) {
          await sleep(1200);
          return true;
        }
      }
    }

    return false;
  }

  function readOrBuildInitialContext() {
    // Base URL and dates
    var baseHref = window.location.href;
    var dates = extractBaseDatesFromUrl();
    if (!dates.pickupISO || !dates.dropoffISO) {
      var domDates = extractDatesFromDomForPickupDropoff();
      if (!dates.pickupISO && domDates && domDates.pickupISO) dates.pickupISO = domDates.pickupISO;
      if (!dates.dropoffISO && domDates && domDates.dropoffISO) dates.dropoffISO = domDates.dropoffISO;
      log('[Dex Booking] Dates from URL missing part of pickup/drop-off; DOM fallback applied:', dates);
    }

    // Categories from current page
    var categories = extractCategories();
    return { baseHref: baseHref, baseDates: dates, categories: categories };
  }

  function matchesAnyOffsetUrl(expectedDoISO) {
    var curDoISO = getCurrentDropoffISOFromPageOrUrl();
    if (!curDoISO) return false;
    return curDoISO === expectedDoISO;
  }

  async function runCaptureLoop() {
    flowLog('log', 'flow', { event: 'runCaptureLoop-start', href: window.location.href, readyState: document.readyState });
    ensureCookieConsentDismissed();

    var state = await storageGet();
    if (!state || !state.status || state.status !== 'capturing') {
      // Idle mode
      setStatus('Idle.');
      return;
    }

    var queue = state.queue || {};
    var base = state.base || {};
    var offsets = queue.offsets || [];
    var categories = queue.categories || [{ label: 'current', fallback: true }];
    var offsetIndex = (state.index && typeof state.index.offsetIndex === 'number') ? state.index.offsetIndex : 0;
    var categoryIndex = (state.index && typeof state.index.categoryIndex === 'number') ? state.index.categoryIndex : 0;

    // Derive expected drop-off ISO for current offsetIndex.
    var currentOffset = offsets[offsetIndex] != null ? offsets[offsetIndex] : 0;
    var expectedDoISO = base.dropoffISO ? getDropoffISOForOffset(base.dropoffISO, currentOffset) : null;
    var searchKey = 'offset:' + offsetIndex + '|cat:' + categoryIndex;

    // If we resumed and current page does not match expected drop-off, redirect to expected URL.
    if (expectedDoISO) {
      var ok = matchesAnyOffsetUrl(expectedDoISO);
      if (!ok) {
        var redirectedUrl = setUrlDoDate(queue.baseHref, expectedDoISO);
        // If baseHref is index.html, build URL from current page instead to avoid bouncing back to filters page.
        if (!isLikelyResultsUrl(redirectedUrl)) redirectedUrl = setUrlDoDate(window.location.href, expectedDoISO);
        if (redirectedUrl && redirectedUrl !== window.location.href && isLikelyResultsUrl(redirectedUrl)) {
          flowLog('log', 'flow', { event: 'redirect-expected-date', expectedDoISO: expectedDoISO, redirectedUrl: redirectedUrl });
          log('[Dex Booking] Redirecting to expected drop-off page:', expectedDoISO);
          state.index.categoryIndex = 0;
          await storageSet(state);
          window.location.href = redirectedUrl;
          return;
        }

        // URL-first might not work if Booking doesn't encode dates in URL.
        // Try click-based date picker as fallback.
        var curDoISO2 = getCurrentDropoffISOFromPageOrUrl();
        if (curDoISO2 && curDoISO2 !== expectedDoISO) {
          var prevFp = fingerprintPriceAndCategory();
          var clicked = await setDropoffByClick(expectedDoISO, curDoISO2);
          if (clicked) {
            await waitForDomChange(prevFp, 25000);
          }
          if (clicked) {
            // Booking often requires explicit Search submission to refresh results.
            state.index.categoryIndex = 0;
            state._bookingSearchKey = searchKey;
            await storageSet(state);
            await clickSearchButton();
            return;
          }
        }
      }
    }

    var captureIterations = 0;
    // We allow this content script to "continue" until it navigates to next offset (or finishes).
    while (state.status === 'capturing') {
      captureIterations++;
      if (typeof window !== 'undefined' && window.__dexStopRequested) {
        state.stopRequested = true;
        state.status = 'stopped';
        state.error = window.__dexStopReason || { message: 'Dex global stop requested' };
        await storageSet(state);
        setStatus('Stopped due to a runtime error. Press Resume.');
        break;
      }
      if (captureIterations > 200) {
        state.warnings.push('Loop safety cap reached.');
        await storageSet(state);
        break;
      }

      // Stop requested?
      if (state.stopRequested) {
        state.status = 'stopped';
        await storageSet(state);
        setStatus('Stopped. You can press Resume.');
        break;
      }

      var curOffset = offsets[offsetIndex];
      if (curOffset == null) break;
      var curDropISO = base.dropoffISO ? getDropoffISOForOffset(base.dropoffISO, curOffset) : null;

      // Update state UI
      setStatus(
        'Capturing... Offset ' + (offsetIndex + 1) + '/' + offsets.length +
        ', category ' + (categoryIndex + 1) + '/' + categories.length +
        (curDropISO ? ' (drop-off ' + curDropISO + ')' : '')
      );
      log('[Dex Booking] Capture step', { offsetIndex: offsetIndex, categoryIndex: categoryIndex, curDropISO: curDropISO });

      // If we are still on the "index" page, submit search and wait for results page.
      if (isBookingCarsIndexPage()) {
        flowLog('log', 'flow', { event: 'index-detected-before-search', offsetIndex: offsetIndex, categoryIndex: categoryIndex, searchKey: searchKey });
        var alreadySubmitted = (state._bookingSearchKey === searchKey);

        // Submit search once, then WAIT until Booking actually updates the UI/results.
        // Without this, Booking can briefly show a "searching" state while we still
        // remain on /cars/index.html, and the loop would bounce back immediately.
        if (!alreadySubmitted) {
          state._bookingSearchKey = searchKey;
          state.index.offsetIndex = offsetIndex;
          state.index.categoryIndex = categoryIndex;
          await storageSet(state);

          var clicked = await clickSearchButton();
          flowLog('log', 'flow', { event: 'search-click-result', clicked: clicked, href: window.location.href });
          if (!clicked) {
            state.status = 'stopped';
            state.stopRequested = true;
            state.warnings = state.warnings || [];
            state.warnings.push('Booking Search button not found/clickable for offset/category ' + offsetIndex + '/' + categoryIndex);
            state.error = { message: 'Could not click Booking Search button' };
            await storageSet(state);
            setStatus('Stopped: could not click Search (fix dates/filter then Resume).');
            break;
          }
        }

        setStatus('Searching on Booking… waiting for results');
        flowLog('log', 'flow', { event: 'wait-results-start', timeoutMs: 45000, href: window.location.href });
        var ready = await waitForResultsAfterSearch(45000);
        flowLog('log', 'flow', { event: 'wait-results-done', ready: ready, href: window.location.href });
        if (!ready) {
          state.status = 'stopped';
          state.stopRequested = true;
          state.warnings = state.warnings || [];
          state.warnings.push('Timeout waiting Booking results after Search for offset/category ' + offsetIndex + '/' + categoryIndex + ' (still no results signals)');
          state.error = { message: 'Timeout waiting for Booking results (no results rendered)' };
          await storageSet(state);
          setStatus('Stopped: Booking did not finish search results. Press Resume.');
          break;
        }

        // Allow further search submissions for the same offset/category only when we actually advance.
        state._bookingSearchKey = null;
        await storageSet(state);
        flowLog('log', 'flow', { event: 'results-ready-continue', href: window.location.href });
      }

      // Categories: if enabled, iterate by clicking; otherwise just read current page price once.
      var catsToIterate = queue.catScan ? categories : [{ label: 'current', fallback: true }];
      if (queue.catScan && catsToIterate.length === 0) catsToIterate = [{ label: 'current', fallback: true }];

      // Ensure categoryIndex within bounds
      if (categoryIndex >= catsToIterate.length) {
        categoryIndex = 0;
        state.index.categoryIndex = 0;
        await storageSet(state);
      }

      // Inner loop: iterate categories for this offset until we either finish all categories or we have to navigate next offset.
      while (state.status === 'capturing') {
        // If offsetIndex changed via some unexpected redirect, break
        if (offsetIndex !== (state.index && state.index.offsetIndex)) offsetIndex = state.index.offsetIndex;
        if (typeof window !== 'undefined' && window.__dexStopRequested) {
          state.stopRequested = true;
          state.status = 'stopped';
          state.error = window.__dexStopReason || { message: 'Dex global stop requested' };
          await storageSet(state);
          setStatus('Stopped due to a runtime error. Press Resume.');
          break;
        }
        if (categoryIndex >= catsToIterate.length) break;

        // If category scan enabled: click category
        var catLabel = catsToIterate[categoryIndex] ? catsToIterate[categoryIndex].label : 'current';
        var fpBefore = fingerprintPriceAndCategory();

        if (queue.catScan) {
          var clicked = false;
          if (catLabel && catLabel !== 'current') clicked = clickCategoryByLabel(catLabel);
          if (!clicked) {
            log('[Dex Booking] Category click not confirmed; continuing with best-effort read.', catLabel);
          } else {
            await waitForDomChange(fpBefore, 12000);
          }
        }

        // Extract price after UI change
        var priceObj = extractPriceHeuristics();
        // Ensure cost is present; Booking may render skeletons first.
        if (!(priceObj && typeof priceObj.price === 'number' && !isNaN(priceObj.price))) {
          var pStart = Date.now();
          while (Date.now() - pStart < 15000) {
            await sleep(1000);
            priceObj = extractPriceHeuristics();
            if (priceObj && typeof priceObj.price === 'number' && !isNaN(priceObj.price)) break;
          }
        }

        var item = {
          offsetDays: curOffset,
          pickupISO: base.pickupISO || null,
          dropoffISO: curDropISO || null,
          categoryLabel: catLabel,
          price: typeof priceObj.price === 'number' ? priceObj.price : null,
          currency: priceObj.currency || null,
          rentalTerm: buildRentalTermLabel(base.pickupISO || null, curDropISO || null),
          model: (catLabel && catLabel !== 'current') ? catLabel : 'current',
          priceMethod: priceObj.method,
          candidatesSample: priceObj.candidates && priceObj.candidates.slice ? priceObj.candidates.slice(0, 6) : []
        };

        if (!(typeof item.price === 'number' && !isNaN(item.price))) {
          state.status = 'stopped';
          state.stopRequested = true;
          state.warnings = state.warnings || [];
          state.warnings.push('Missing price after waiting on offset/category ' + offsetIndex + '/' + categoryIndex);
          state.error = { message: 'Missing cost in rendered results' };
          await storageSet(state);
          persistPartialSnapshot(state);
          setStatus('Stopped: could not parse cost from results. Press Resume.');
          break;
        }

        state.items.push(item);
        state.completed = state.items.length;
        state.index.categoryIndex = categoryIndex + 1;
        await storageSet(state);
        flowLog('log', 'flow', { event: 'item-captured', completed: state.completed, offsetDays: item.offsetDays, model: item.model, rentalTerm: item.rentalTerm, price: item.price, currency: item.currency });
        persistPartialSnapshot(state);

        setStatus(
          'Captured ' + state.completed + ' items so far. Offset ' + (offsetIndex + 1) + '/' + offsets.length +
          ', next category ' + (state.index.categoryIndex + 1) + '/' + catsToIterate.length
        );

        categoryIndex = state.index.categoryIndex;
        // If we have more categories, proceed; else break to navigate next offset.
        if (categoryIndex >= catsToIterate.length) break;

        // Yield small delay to avoid triggering anti-bot heuristics.
        await sleep(1200);
      }

      // Move to next offset
      offsetIndex = offsetIndex + 1;
      categoryIndex = 0;
      state.index.offsetIndex = offsetIndex;
      state.index.categoryIndex = 0;

      if (offsetIndex >= offsets.length) {
        state.status = 'done';
        await storageSet(state);
        setStatus('Done. Exporting JSON...');
        exportResults(state);
        await storageClear();
        setStatus('Done. JSON exported (see Dex download).');
        break;
      }

      // Navigate to next offset page (URL-first)
      var nextOffset = offsets[offsetIndex];
      var nextDoISO = base.dropoffISO ? getDropoffISOForOffset(base.dropoffISO, nextOffset) : null;
      if (!nextDoISO) {
        state.warnings.push('Missing base dropoffISO; cannot navigate next offsets.');
        await storageSet(state);
        state.status = 'stopped';
        setStatus('Stopped: missing base date for offsets.');
        break;
      }

      var nextUrl = setUrlDoDate(queue.baseHref, nextDoISO);
      if (!nextUrl || nextUrl === window.location.href) {
        // URL-first didn't work (date params likely absent in URL).
        // Try click-based calendar selection.
        var prevFp2 = fingerprintPriceAndCategory();
        var setOk = await setDropoffByClick(nextDoISO, curDropISO);
        if (setOk) {
          await waitForDomChange(prevFp2, 25000);
          await storageSet(state);
          await clickSearchButton();
          return;
        }
        state.status = 'stopped';
        await storageSet(state);
        setStatus('Stopped: could not switch drop-off date for offset ' + (offsetIndex + 1) + '.');
        break;
      } else {
        await storageSet(state);
        window.location.href = nextUrl;
        return;
      }
    }
  }

  function startCaptureFromUI(opts) {
    var n = parseInt(opts && opts.nDays, 10);
    if (isNaN(n) || n < 0) n = DEFAULT_N;
    if (n > MAX_OFFSET_DAYS) n = MAX_OFFSET_DAYS;
    var computed = computeOffsets(n);

    var ctx = readOrBuildInitialContext();
    var baseHref = ctx.baseHref;
    var baseDates = ctx.baseDates;

    var cats = ctx.categories || [{ label: 'current', fallback: true }];

    var queue = buildQueue(baseHref, computed.offsets, cats, opts && opts.catScan);
    queue.N = computed.N;

    // Soft checks
    if (!baseDates.dropoffISO) {
      var el = document.getElementById('dex-booking-status');
      setStatus('Cannot read base drop-off date from the page. Please set pickup and drop-off dates and try again.');
      return;
    }

    var st = buildStateQueueFromConfig({ baseDates: baseDates, queue: queue, startOffsetIndex: 0, startCategoryIndex: 0 });
    st.stopRequested = false;
    storageSet(st).then(function () {
      removeUI(); // keep page clean; capture will resume via injected script
      // Redirect only if current page doesn't match first offset (usually 0)
      var firstOffset = queue.offsets[0];
      // Our offsets are sorted by abs distance; ensure we start from actual current page if possible.
      // We'll just start capturing immediately; runCaptureLoop will redirect if mismatch.
      setTimeout(function () { runCaptureLoop(); }, 500);
    });
  }

  // Programmatic start for Playwright / CLI runner (`booking-cars-capture-run.cjs`).
  try {
    window.__DEX_BOOKING_AUTOMATION = {
      start: function (opts) {
        startCaptureFromUI(opts || {});
      }
    };
  } catch (e) {}

  async function init() {
    // Inject UI
    var existing = document.getElementById(UI_ID);
    if (!existing) {
      var autoParams = extractAutoStartParams();
      var ctx = readOrBuildInitialContext();
      var ui = buildUI({
        N: autoParams.nDays != null ? autoParams.nDays : DEFAULT_N,
        catScan: autoParams.catScan
      });
      document.documentElement.appendChild(ui.root);
      ui.startBtn.addEventListener('click', async function () {
        var state = await storageGet();
        if (state && state.status === 'stopped') {
          state.stopRequested = false;
          state.status = 'capturing';
          state.startedAt = nowIso();
          await storageSet(state);
          removeUI(); // keep page clean; capture will resume now
          setTimeout(runCaptureLoop, 500);
          return;
        }

        var nEl = document.getElementById('dex-booking-n');
        var catScanEl = document.getElementById('dex-booking-cat-scan');
        startCaptureFromUI({
          nDays: nEl ? nEl.value : DEFAULT_N,
          catScan: catScanEl ? !!catScanEl.checked : true
        });
      });
      ui.stopBtn.addEventListener('click', async function () {
        var state = await storageGet();
        if (!state) return;
        state.stopRequested = true;
        state.status = 'capturing';
        await storageSet(state);
        setStatus('Stop requested. Will stop after current step.');
      });
    }

    // Try to resume capture if state exists
    var state = await storageGet();
    if (state && state.status === 'capturing') {
      setStatus('Resuming capture...');
      // Toggle buttons
      var stopBtn = document.getElementById('dex-booking-stop');
      if (stopBtn) stopBtn.style.display = 'inline-block';
      setTimeout(runCaptureLoop, 700);
      return;
    }

    var auto = extractAutoStartParams();
    if (state && state.status === 'stopped') {
      // Autostart should also resume previously stopped sessions without manual click.
      if (auto.autostart) {
        state.stopRequested = false;
        state.status = 'capturing';
        state.startedAt = nowIso();
        await storageSet(state);
        setStatus('Auto-resume from URL…');
        setTimeout(runCaptureLoop, 700);
        return;
      }
      var startBtn = document.getElementById('dex-booking-start');
      if (startBtn) startBtn.textContent = 'Resume';
      setStatus('Stopped. Press Resume to continue.');
      return;
    }

    setStatus('Idle.');

    if (auto.autostart) {
      stripDexBookingControlParamsFromUrl();
      setStatus('Auto-start from URL…');
      setTimeout(function () {
        var nEl = document.getElementById('dex-booking-n');
        var catScanEl = document.getElementById('dex-booking-cat-scan');
        startCaptureFromUI({
          nDays: nEl ? nEl.value : DEFAULT_N,
          catScan: catScanEl ? !!catScanEl.checked : true
        });
      }, 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }

})();

