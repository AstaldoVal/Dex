/**
 * Dex LinkedIn Feed Capture
 * - Runs in the REAL LinkedIn browser (content script inside Dex extension).
 * - Captures a limited set of Feed posts into JSON for later processing (Node-only digest).
 *
 * Output (filename):
 *   dex-linkedin-feed-YYYY-MM-DD.json
 *
 * JSON payload shape:
 * {
 *   exportedAt: ISO,
 *   source: 'linkedin-feed-home',
 *   pageUrl: <current url>,
 *   settings: { maxPosts, maxScrollRounds, scrollStepPx, waitMs },
 *   posts: [
 *     {
 *       postUrl,
 *       postId,
 *       authorName,
 *       authorProfileUrl,
 *       postText,
 *       hashtags,
 *       likesCount,
 *       commentsCount
 *     }
 *   ]
 * }
 */
(function () {
  'use strict';

  var STORAGE_AUTO_CAPTURE_KEY = 'dexAutoCaptureRequested';
  var STORAGE_AUTO_CAPTURE_TS_KEY = 'dexAutoCaptureRequestedAt';
  var URL_AUTO_CAPTURE_PARAM = 'dex-auto-capture=1';
  var captureRunning = false;

  var MAX_POSTS_DEFAULT = 25;
  var MAX_SCROLL_ROUNDS_DEFAULT = 12;
  var SCROLL_STEP_PX_DEFAULT = 900;
  var WAIT_MS_DEFAULT = 1400;

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function normalizeLinkedInUrl(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    if (!s) return '';
    // Canonicalize without query/hash.
    s = s.replace(/[#?].*$/, '');
    s = s.replace(/^http:\/\//i, 'https://');
    return s;
  }

  function normalizeProfileUrl(url) {
    var s = normalizeLinkedInUrl(url);
    var m = (s || '').match(/linkedin\.com\/in\/([^\/?#]+)/i);
    if (!m) return s || '';
    return 'https://www.linkedin.com/in/' + m[1] + '/';
  }

  function normalizePostUrl(url) {
    var s = normalizeLinkedInUrl(url);
    if (!s) return '';
    // LinkedIn post URLs can be slightly variant; keep as canonical as possible.
    // Known patterns:
    // - /feed/update/<urn:li:activity:ID>/
    // - /posts/<slug>_<ID>/
    // - /feed/content/<ID>/
    return s;
  }

  function extractPostId(postUrl) {
    var s = postUrl || '';
    var m = s.match(/urn:li:activity:(\d+)/i);
    if (m) return m[1];
    m = s.match(/\/posts\/[^/]*_(\d+)/i);
    if (m) return m[1];
    m = s.match(/\/feed\/content\/(\d+)/i);
    if (m) return m[1];
    return '';
  }

  function parseCountFromText(raw, keys) {
    var s = String(raw || '');
    // Example aria-label: "12,345 likes"
    var numRe = '([0-9][0-9,\\.\\s]*)';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var re = new RegExp(numRe + '\\s*' + k, 'i');
      var m = s.match(re);
      if (m && m[1]) {
        var cleaned = m[1].replace(/[,\\s]/g, '');
        var n = parseInt(cleaned, 10);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  function extractEngagementCounts(root) {
    var likes = null;
    var comments = null;
    if (!root) return { likesCount: likes, commentsCount: comments };

    // Prefer aria-label for stable number extraction.
    var buttons = root.querySelectorAll('button[aria-label]');
    for (var i = 0; i < buttons.length; i++) {
      var aria = buttons[i].getAttribute('aria-label') || '';
      if (likes == null) {
        likes = parseCountFromText(aria, ['likes?']);
      }
      if (comments == null) {
        comments = parseCountFromText(aria, ['comments?|repl(y|ies)']);
      }
      if (likes != null && comments != null) break;
    }

    // Fallback: look for "comments" text inside buttons (rare).
    if (comments == null) {
      var commentEls = root.querySelectorAll('span, button');
      for (var j = 0; j < commentEls.length; j++) {
        var t = commentEls[j] && commentEls[j].textContent ? commentEls[j].textContent.trim() : '';
        if (!t) continue;
        if (/comments?/i.test(t)) {
          var m2 = t.match(/([0-9][0-9,\\.]*)/);
          if (m2 && m2[1]) {
            var cleaned2 = m2[1].replace(/,/g, '');
            var n2 = parseInt(cleaned2, 10);
            if (!isNaN(n2)) { comments = n2; break; }
          }
        }
      }
    }

    return { likesCount: likes, commentsCount: comments };
  }

  function cleanupPostText(raw) {
    var s = String(raw || '');
    s = s.replace(/\\s+/g, ' ').trim();
    // Remove frequent UI junk tokens.
    s = s.replace(/\\b(Like|Liked|Comment|Repost|Share|Save|Show more|Show less|Sign in)\\b/ig, '');
    s = s.replace(/\\s+/g, ' ').trim();
    return s;
  }

  function extractHashtags(text) {
    var s = String(text || '');
    var out = [];
    var re = /#[A-Za-z0-9_]+/g;
    var m;
    while ((m = re.exec(s)) !== null) out.push(m[0]);
    return Array.from(new Set(out));
  }

  function findPostsSnapshot(maxPosts) {
    var postsMap = new Map();
    // Capture candidate post links. We dedupe by postUrl.
    var anchors = document.querySelectorAll('a[href*="/feed/update/"], a[href*="/posts/"], a[href*="/feed/content/"]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!href) continue;
      var abs = href.indexOf('http') === 0 ? href : ('https://www.linkedin.com' + href);
      if (!/\/(feed\/update|posts|feed\/content)\//i.test(abs)) continue;
      var postUrl = normalizePostUrl(abs);
      if (!postUrl) continue;
      // Basic sanity: must include some ID-like part.
      if (!/urn:li:activity|\d{6,}|\/posts\//i.test(postUrl)) continue;
      if (postsMap.has(postUrl)) continue;

      var postId = extractPostId(postUrl);

      // Attempt to locate post root container.
      var root =
        a.closest('article') ||
        a.closest('[role="article"]') ||
        a.closest('div') ||
        a.parentElement;
      if (!root) continue;

      // Author profile: first /in/ link inside post root.
      var authorLink = root.querySelector('a[href*="/in/"]');
      var authorProfileUrl = normalizeProfileUrl(authorLink ? authorLink.href : '');
      var authorName = (authorLink && authorLink.textContent ? cleanupPostText(authorLink.textContent) : '').split(' ').slice(0, 3).join(' ').trim();

      // Post text: prefer a stable commentary-like block; fallback to root text.
      var textEl =
        root.querySelector('[data-test-id="commentary"], [data-test-id="commentary-text"], div[role="presentation"] div') ||
        root.querySelector('div[class*="commentary"], div[class*="description"], div[class*="update"], div[class*="feed-shared-update"]') ||
        null;

      var rawText = textEl && textEl.innerText ? textEl.innerText : (root.innerText || '');
      var postText = cleanupPostText(rawText).slice(0, 380);

      // Engagement counts.
      var counts = extractEngagementCounts(root);

      postsMap.set(postUrl, {
        postUrl: postUrl,
        postId: postId || '',
        authorName: authorName || '',
        authorProfileUrl: authorProfileUrl || '',
        postText: postText || '',
        hashtags: extractHashtags(postText),
        likesCount: counts.likesCount,
        commentsCount: counts.commentsCount
      });

      if (postsMap.size >= maxPosts) break;
    }
    return Array.from(postsMap.values());
  }

  function createUI() {
    if (document.getElementById('dex-feed-capture-ui')) return;

    var wrap = document.createElement('div');
    wrap.id = 'dex-feed-capture-ui';
    wrap.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'z-index:99999',
      'background:#0a66c2',
      'color:#fff',
      'padding:10px 14px',
      'border-radius:10px',
      'font-family:system-ui,sans-serif',
      'font-size:13px',
      'box-shadow:0 4px 16px rgba(0,0,0,.3)',
      'max-width:340px'
    ].join(';');

    wrap.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">',
      '  <span style="font-weight:700;">Dex Feed</span>',
      '  <span id="dex-feed-capture-status" style="opacity:.9;font-size:12px;">idle</span>',
      '</div>',
      '<div style="margin-top:8px;display:flex;gap:8px;align-items:center;">',
      '  <button id="dex-feed-start" type="button" style="background:#fff;color:#0a66c2;border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;">Capture</button>',
      '  <button id="dex-feed-stop" type="button" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.35);padding:6px 10px;border-radius:8px;cursor:pointer;font-weight:700;font-size:12px;display:none;">Stop</button>',
      '</div>',
      '<div id="dex-feed-capture-meta" style="margin-top:6px;opacity:.9;font-size:12px;">',
      '  Collect posts from your Home Feed. Saved to JSON, then use digest.',
      '</div>'
    ].join('');

    document.body.appendChild(wrap);

    var startBtn = document.getElementById('dex-feed-start');
    var stopBtn = document.getElementById('dex-feed-stop');

    startBtn.addEventListener('click', function () {
      startCapture({
        maxPosts: MAX_POSTS_DEFAULT,
        maxScrollRounds: MAX_SCROLL_ROUNDS_DEFAULT,
        scrollStepPx: SCROLL_STEP_PX_DEFAULT,
        waitMs: WAIT_MS_DEFAULT
      });
    });

    stopBtn.addEventListener('click', function () {
      try { stopRequested = true; } catch (e) {}
    });
  }

  var stopRequested = false;

  function setStatus(text) {
    var el = document.getElementById('dex-feed-capture-status');
    if (el) el.textContent = text;
  }

  function setStopVisible(visible) {
    var el = document.getElementById('dex-feed-stop');
    if (el) el.style.display = visible ? 'inline-flex' : 'none';
  }

  function setMeta(text) {
    var el = document.getElementById('dex-feed-capture-meta');
    if (el) el.textContent = text;
  }

  function sendToBackground(jsonStr, filename) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { action: 'downloadJson', data: jsonStr, filename: filename },
          function (resp) {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else resolve(resp || { ok: false, error: 'no response' });
          }
        );
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  // Fallback: save directly to local save-server from content script.
  // This bypasses background service worker/native messaging issues entirely.
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

  async function debugSave(payload, filename) {
    try {
      var jsonStr = JSON.stringify(payload, null, 2);
      return await saveToLocalSaveServer(jsonStr, filename);
    } catch (e) {
      // Debug must never block capture.
      return { ok: false, error: 'debugSave exception: ' + (e && e.message ? e.message : String(e)) };
    }
  }

  async function startCapture(settings) {
    if (captureRunning) return;
    captureRunning = true;
    stopRequested = false;

    createUI();
    setStatus('capturing');
    setStopVisible(true);
    setMeta('Scrolling feed and capturing post cards…');

    // Heartbeat: helps verify that the content script is actually running.
    await debugSave(
      {
        type: 'start',
        at: new Date().toISOString(),
        pageUrl: window.location.href,
        settings: settings || null
      },
      'dex-linkedin-feed-debug-start-' + todayStr() + '.json'
    );

    var maxPosts = settings && settings.maxPosts ? settings.maxPosts : MAX_POSTS_DEFAULT;
    var maxScrollRounds = settings && settings.maxScrollRounds ? settings.maxScrollRounds : MAX_SCROLL_ROUNDS_DEFAULT;
    var scrollStepPx = settings && settings.scrollStepPx ? settings.scrollStepPx : SCROLL_STEP_PX_DEFAULT;
    var waitMs = settings && settings.waitMs ? settings.waitMs : WAIT_MS_DEFAULT;

    var exportedAt = new Date().toISOString();
    var allPosts = [];
    var postsMap = new Map();
    var stableRounds = 0;
    var prevSize = 0;

    // Capture multiple rounds while scrolling.
    for (var r = 0; r < maxScrollRounds; r++) {
      if (stopRequested || (typeof window !== 'undefined' && window.__dexStopRequested)) break;

      var batch = findPostsSnapshot(maxPosts);
      var added = 0;
      for (var i = 0; i < batch.length; i++) {
        var p = batch[i];
        if (!p || !p.postUrl) continue;
        if (!postsMap.has(p.postUrl)) {
          postsMap.set(p.postUrl, p);
          added++;
        }
      }

      var size = postsMap.size;
      allPosts = Array.from(postsMap.values());

      setMeta('Captured ' + size + ' / ' + maxPosts + ' (round ' + (r + 1) + '/' + maxScrollRounds + ')');

      if (size >= maxPosts) break;

      if (size === prevSize) stableRounds++;
      else stableRounds = 0;
      prevSize = size;
      if (stableRounds >= 3) break;

      // Scroll
      window.scrollBy({ top: scrollStepPx, left: 0, behavior: 'smooth' });
      await sleep(waitMs);
    }

    // Build export payload.
    var payload = {
      exportedAt: exportedAt,
      source: 'linkedin-feed-home',
      pageUrl: window.location.href,
      settings: {
        maxPosts: maxPosts,
        maxScrollRounds: maxScrollRounds,
        scrollStepPx: scrollStepPx,
        waitMs: waitMs
      },
      posts: Array.from(postsMap.values()).slice(0, maxPosts)
    };

    var filename = 'dex-linkedin-feed-' + todayStr() + '.json';
    var jsonStr = JSON.stringify(payload, null, 2);
    var resp = await sendToBackground(jsonStr, filename);
    // Self-healing: if background/native failed, try direct save server.
    if (!resp || !resp.ok) {
      var errMsg = (resp && resp.error) ? resp.error : '';
      if (errMsg && (String(errMsg).indexOf('Native host') !== -1 || String(errMsg).indexOf('native') !== -1 || String(errMsg).indexOf('save-server') !== -1)) {
        setMeta('Native/save failed; trying direct save-server…');
        resp = await saveToLocalSaveServer(jsonStr, filename);
      }
    }

    if (resp && resp.ok) {
      setStatus('saved');
      setMeta('Saved: ' + (resp.path || filename) + '. Next: run digest.');
    } else {
      setStatus('failed');
      setMeta('Save failed: ' + ((resp && resp.error) || 'unknown error') + '.');
    }

    setStopVisible(false);
    captureRunning = false;
  }

  async function init() {
    createUI();

    // Auto-start if URL had dex-auto-capture=1 (best effort) or trigger set storage flag.
    var hasUrlParam = (window.location.search || '').indexOf(URL_AUTO_CAPTURE_PARAM) !== -1 ||
      (window.location.hash || '').indexOf(URL_AUTO_CAPTURE_PARAM) !== -1;

    var storageFlag = false;
    try {
      var r = await new Promise(function (resolve) {
        chrome.storage.local.get([STORAGE_AUTO_CAPTURE_KEY], function (res) {
          resolve(res && res[STORAGE_AUTO_CAPTURE_KEY] === '1');
        });
      });
      storageFlag = !!r;
    } catch (_) {
      storageFlag = false;
    }

    if (storageFlag) {
      try {
        chrome.storage.local.remove([STORAGE_AUTO_CAPTURE_KEY]);
      } catch (e) {}
    }

    var autoStart = hasUrlParam || storageFlag;

    // Heartbeat: verify which auto-start condition fired.
    await debugSave(
      {
        type: 'init',
        at: new Date().toISOString(),
        pageUrl: window.location.href,
        hasUrlParam: hasUrlParam,
        storageFlag: storageFlag,
        autoStart: autoStart
      },
      'dex-linkedin-feed-debug-init-' + todayStr() + '.json'
    );

    if (autoStart) {
      setStatus('auto-capture');
      setMeta('Auto-started capture in 2s…');
      await sleep(2000);
      startCapture({
        maxPosts: MAX_POSTS_DEFAULT,
        maxScrollRounds: MAX_SCROLL_ROUNDS_DEFAULT,
        scrollStepPx: SCROLL_STEP_PX_DEFAULT,
        waitMs: WAIT_MS_DEFAULT
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})();

