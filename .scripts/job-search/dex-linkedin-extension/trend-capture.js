/**
 * Dex LinkedIn Trend Capture
 * - Runs in the REAL LinkedIn browser (content script inside Dex extension).
 * - Captures posts from LinkedIn hashtag search results for trend analysis.
 *
 * URL pattern: https://www.linkedin.com/search/results/content/*
 *
 * Output (filename):
 *   dex-linkedin-trend-YYYY-MM-DD.json
 *
 * JSON payload shape:
 * {
 *   exportedAt: ISO,
 *   source: 'linkedin-search-trends',
 *   pageUrl: <current url>,
 *   hashtag: <searched hashtag>,
 *   settings: { maxPosts, maxScrollRounds, scrollStepPx, waitMs },
 *   posts: [
 *     {
 *       postUrl,
 *       postId,
 *       authorName,
 *       authorProfileUrl,
 *       postText,            // up to 1500 chars
 *       hashtags,
 *       likesCount,
 *       commentsCount,
 *       repostsCount,
 *       postType,            // 'text' | 'image' | 'video' | 'article' | 'document' | 'unknown'
 *       publishedAt,         // ISO or relative string from LinkedIn
 *     }
 *   ]
 * }
 */
(function () {
  'use strict';

  var STORAGE_AUTO_CAPTURE_KEY = 'dexAutoCaptureRequested';
  var URL_AUTO_CAPTURE_PARAM = 'dex-auto-capture=1';
  var captureRunning = false;

  var MAX_POSTS_DEFAULT = 150;
  var MAX_SCROLL_ROUNDS_DEFAULT = 60;
  var SCROLL_STEP_PX_DEFAULT = 700;
  // Random wait between 1200–2500ms to simulate human reading/scrolling
  var WAIT_MS_MIN = 1200;
  var WAIT_MS_MAX = 2500;

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function randomWait() {
    var ms = WAIT_MS_MIN + Math.random() * (WAIT_MS_MAX - WAIT_MS_MIN);
    return sleep(Math.round(ms));
  }

  function normalizeLinkedInUrl(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    if (!s) return '';
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
    var numRe = '([0-9][0-9,\\.\\s]*)';
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var re = new RegExp(numRe + '\\s*' + k, 'i');
      var m = s.match(re);
      if (m && m[1]) {
        var cleaned = m[1].replace(/[,\s]/g, '');
        var n = parseInt(cleaned, 10);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  function extractEngagementCounts(root) {
    var likes = null;
    var comments = null;
    var reposts = null;
    if (!root) return { likesCount: likes, commentsCount: comments, repostsCount: reposts };

    var buttons = root.querySelectorAll('button[aria-label]');
    for (var i = 0; i < buttons.length; i++) {
      var aria = buttons[i].getAttribute('aria-label') || '';
      if (likes == null) {
        likes = parseCountFromText(aria, ['likes?', 'reactions?']);
      }
      if (comments == null) {
        comments = parseCountFromText(aria, ['comments?', 'repl(y|ies)']);
      }
      if (reposts == null) {
        reposts = parseCountFromText(aria, ['reposts?', 'reshares?', 'shares?']);
      }
      if (likes != null && comments != null && reposts != null) break;
    }

    // Fallback: scan text nodes for numbers near keywords
    if (comments == null || reposts == null) {
      var spans = root.querySelectorAll('span, li');
      for (var j = 0; j < spans.length; j++) {
        var t = spans[j] && spans[j].textContent ? spans[j].textContent.trim() : '';
        if (!t || t.length > 100) continue;
        if (comments == null && /comments?/i.test(t)) {
          var m2 = t.match(/([0-9][0-9,\.]*)/);
          if (m2) {
            var n2 = parseInt(m2[1].replace(/,/g, ''), 10);
            if (!isNaN(n2)) comments = n2;
          }
        }
        if (reposts == null && /reposts?|reshares?/i.test(t)) {
          var m3 = t.match(/([0-9][0-9,\.]*)/);
          if (m3) {
            var n3 = parseInt(m3[1].replace(/,/g, ''), 10);
            if (!isNaN(n3)) reposts = n3;
          }
        }
      }
    }

    return { likesCount: likes, commentsCount: comments, repostsCount: reposts };
  }

  function detectPostType(root) {
    if (!root) return 'unknown';
    // Video
    if (root.querySelector('video, [data-test-id="video-player"], div[data-urn*="ugcVideo"]')) return 'video';
    // Document / PDF carousel
    if (root.querySelector('[data-test-id="document-player"], div[data-urn*="document"]') ||
        root.querySelector('div[class*="document-player"]')) return 'document';
    // Article (LinkedIn article with full heading)
    if (root.querySelector('a[href*="/pulse/"], a[href*="/articles/"]')) return 'article';
    // Image
    if (root.querySelector('img[data-delayed-url], div[class*="image-container"] img')) return 'image';
    return 'text';
  }

  function extractPublishedAt(root) {
    if (!root) return '';
    // LinkedIn typically has a <span> or <a> with relative time like "2h", "1d", "3w"
    var timeEl = root.querySelector('time, span[class*="time"], a[class*="time"], span[aria-label*="ago"]');
    if (timeEl) {
      var t = timeEl.getAttribute('datetime') || timeEl.getAttribute('aria-label') || timeEl.textContent || '';
      return t.trim().slice(0, 50);
    }
    // Fallback: look for small text matching time patterns
    var allSpans = root.querySelectorAll('span');
    for (var i = 0; i < allSpans.length; i++) {
      var txt = allSpans[i].textContent || '';
      txt = txt.trim();
      if (/^\d+[smhdwmy]$|^\d+ (second|minute|hour|day|week|month|year)s? ago$/i.test(txt)) {
        return txt;
      }
    }
    return '';
  }

  function cleanupPostText(raw) {
    var s = String(raw || '');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/\b(Like|Liked|Comment|Repost|Share|Save|Show more|Show less|Sign in|Follow)\b/ig, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function extractHashtags(text) {
    var s = String(text || '');
    var out = [];
    var re = /#[A-Za-z0-9_]+/g;
    var m;
    while ((m = re.exec(s)) !== null) out.push(m[0].toLowerCase());
    return Array.from(new Set(out));
  }

  function extractHashtagFromUrl() {
    var href = window.location.href;
    var m = href.match(/keywords=%23([^&]+)/i) ||
             href.match(/keywords=%2523([^&]+)/i) ||
             href.match(/[#?&]keywords=([^&]+)/i);
    if (m) {
      var kw = decodeURIComponent(m[1]).replace(/^#/, '').toLowerCase();
      return '#' + kw;
    }
    return '';
  }

  function findPostsSnapshot(maxPosts) {
    var postsMap = new Map();
    var anchors = document.querySelectorAll(
      'a[href*="/feed/update/"], a[href*="/posts/"], a[href*="/feed/content/"]'
    );
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!href) continue;
      var abs = href.indexOf('http') === 0 ? href : ('https://www.linkedin.com' + href);
      if (!/\/(feed\/update|posts|feed\/content)\//i.test(abs)) continue;
      var postUrl = normalizePostUrl(abs);
      if (!postUrl) continue;
      if (!/urn:li:activity|\d{6,}|\/posts\//i.test(postUrl)) continue;
      if (postsMap.has(postUrl)) continue;

      var postId = extractPostId(postUrl);

      var root =
        a.closest('[data-id]') ||
        a.closest('article') ||
        a.closest('[role="article"]') ||
        a.closest('li') ||
        a.parentElement;
      if (!root) continue;

      var authorLink = root.querySelector('a[href*="/in/"]');
      var authorProfileUrl = normalizeProfileUrl(authorLink ? authorLink.href : '');
      var authorName = (authorLink && authorLink.textContent
        ? cleanupPostText(authorLink.textContent)
        : ''
      ).split(' ').slice(0, 4).join(' ').trim();

      // Prefer commentary/description block; fallback to root innerText
      var textEl =
        root.querySelector('[data-test-id="commentary"], [data-test-id="commentary-text"]') ||
        root.querySelector('div[class*="commentary"], div[class*="description"], div[class*="update"]') ||
        root.querySelector('span[class*="break-words"]') ||
        null;

      var rawText = textEl && textEl.innerText ? textEl.innerText : (root.innerText || '');
      var postText = cleanupPostText(rawText).slice(0, 1500);

      var counts = extractEngagementCounts(root);
      var postType = detectPostType(root);
      var publishedAt = extractPublishedAt(root);

      postsMap.set(postUrl, {
        postUrl: postUrl,
        postId: postId || '',
        authorName: authorName || '',
        authorProfileUrl: authorProfileUrl || '',
        postText: postText || '',
        hashtags: extractHashtags(postText),
        likesCount: counts.likesCount,
        commentsCount: counts.commentsCount,
        repostsCount: counts.repostsCount,
        postType: postType,
        publishedAt: publishedAt
      });

      if (postsMap.size >= maxPosts) break;
    }
    return Array.from(postsMap.values());
  }

  function createUI() {
    if (document.getElementById('dex-trend-capture-ui')) return;

    var wrap = document.createElement('div');
    wrap.id = 'dex-trend-capture-ui';
    wrap.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'right:16px',
      'z-index:99999',
      'background:#057642',
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
      '  <span style="font-weight:700;">Dex Trends</span>',
      '  <span id="dex-trend-status" style="opacity:.9;font-size:12px;">idle</span>',
      '</div>',
      '<div id="dex-trend-meta" style="margin-top:6px;opacity:.9;font-size:12px;">',
      '  Trend capture: hashtag search posts.',
      '</div>'
    ].join('');

    document.body.appendChild(wrap);
  }

  function setStatus(text) {
    var el = document.getElementById('dex-trend-status');
    if (el) el.textContent = text;
  }

  function setMeta(text) {
    var el = document.getElementById('dex-trend-meta');
    if (el) el.textContent = text;
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
        try { return JSON.parse(t); }
        catch (e) { return { ok: false, error: 'save-server bad response' }; }
      });
    }).catch(function (e) {
      return { ok: false, error: 'save-server unreachable: ' + String(e && e.message ? e.message : e) };
    });
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

  var stopRequested = false;

  async function startCapture() {
    if (captureRunning) return;
    captureRunning = true;
    stopRequested = false;

    var maxPosts = MAX_POSTS_DEFAULT;
    var maxScrollRounds = MAX_SCROLL_ROUNDS_DEFAULT;
    var scrollStepPx = SCROLL_STEP_PX_DEFAULT;

    createUI();
    setStatus('capturing');
    setMeta('Starting trend capture…');

    var hashtag = extractHashtagFromUrl();
    var exportedAt = new Date().toISOString();
    var postsMap = new Map();
    var stableRounds = 0;
    var prevSize = 0;

    for (var r = 0; r < maxScrollRounds; r++) {
      if (stopRequested || (typeof window !== 'undefined' && window.__dexStopRequested)) break;

      var batch = findPostsSnapshot(maxPosts);
      for (var i = 0; i < batch.length; i++) {
        var p = batch[i];
        if (!p || !p.postUrl) continue;
        if (!postsMap.has(p.postUrl)) postsMap.set(p.postUrl, p);
      }

      var size = postsMap.size;
      setMeta('Captured ' + size + ' / ' + maxPosts + ' posts (round ' + (r + 1) + '/' + maxScrollRounds + ')' + (hashtag ? ' — ' + hashtag : ''));

      if (size >= maxPosts) break;

      if (size === prevSize) stableRounds++;
      else stableRounds = 0;
      prevSize = size;
      if (stableRounds >= 4) break;

      // Vary scroll step slightly to look human
      var step = scrollStepPx + Math.round((Math.random() - 0.5) * 200);
      window.scrollBy({ top: step, left: 0, behavior: 'smooth' });
      await randomWait();
    }

    var posts = Array.from(postsMap.values()).slice(0, maxPosts);

    var payload = {
      exportedAt: exportedAt,
      source: 'linkedin-search-trends',
      pageUrl: window.location.href,
      hashtag: hashtag || '',
      settings: {
        maxPosts: maxPosts,
        maxScrollRounds: maxScrollRounds,
        scrollStepPx: scrollStepPx
      },
      posts: posts
    };

    // Use hashtag in filename for easy identification; fallback to 'unknown'
    var hashtagSlug = hashtag ? hashtag.replace(/^#/, '').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() : 'unknown';
    var filename = 'dex-linkedin-trend-' + todayStr() + '-' + hashtagSlug + '.json';
    var jsonStr = JSON.stringify(payload, null, 2);

    setMeta('Saving ' + posts.length + ' posts…');

    var resp = await sendToBackground(jsonStr, filename);
    if (!resp || !resp.ok) {
      resp = await saveToLocalSaveServer(jsonStr, filename);
    }

    if (resp && resp.ok) {
      setStatus('saved');
      setMeta('Saved ' + posts.length + ' posts to ' + filename + '. All done!');
    } else {
      setStatus('failed');
      setMeta('Save failed: ' + ((resp && resp.error) || 'unknown error'));
    }

    captureRunning = false;
  }

  async function init() {
    createUI();

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
      try { chrome.storage.local.remove([STORAGE_AUTO_CAPTURE_KEY]); } catch (e) {}
    }

    var autoStart = hasUrlParam || storageFlag;

    if (autoStart) {
      setStatus('auto');
      setMeta('Auto-started in 3s…');
      await sleep(3000);
      startCapture();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})();
