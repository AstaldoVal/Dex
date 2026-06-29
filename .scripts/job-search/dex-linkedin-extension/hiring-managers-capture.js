/**
 * Dex LinkedIn Extension — Hiring Managers digest capture.
 * 1) On My Network > Grow: find and click "Show all" (People who are hiring for your role), wait for modal, collect profile URLs from modal, go to first profile.
 * 2) On profile (/in/*): if in capture flow, find "Hiring" → "Show job", open modal, collect Remote jobs, next profile or finish.
 * 3) On finish: save JSON to data/ (native or save-server) and optionally build digest.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'dexHiringManagersCapture';
  var SAVE_SERVER_URL = 'http://127.0.0.1:8765/dex-save';
  // Watchlist: профили, которые вы открывали (для будущего сканирования недавних постов).
  // Пишем 1 событие на профиль раз в N часов, чтобы не раздувать количество файлов.
  var WATCHLIST_EVENT_THROTTLE_HOURS = 24;
  var WATCHLIST_EVENT_PREFIX = 'dex-linkedin-watchlist-event-';

  function getState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setState(state) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[Dex Hiring] setState failed:', e.message);
    }
  }

  function clearState() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getSlugFromProfilePath(pathname) {
    var m = (pathname || '').match(/^\/in\/([^/]+)\/?$/);
    return m ? m[1] : null;
  }

  function canonicalizeLinkedInProfileUrl(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    if (!s) return '';
    s = s.replace(/[#?].*$/, '');
    s = s.replace(/^http:\/\//i, 'https://');
    var m = s.match(/linkedin\.com\/in\/([^\/?#]+)/i);
    if (m) return 'https://www.linkedin.com/in/' + m[1] + '/';
    return s;
  }

  function recordWatchlistEventIfAllowed() {
    var slug = getSlugFromProfilePath(window.location.pathname);
    if (!slug) return Promise.resolve(false);

    var profileUrl = canonicalizeLinkedInProfileUrl('https://www.linkedin.com/in/' + slug + '/');
    var nowMs = Date.now();
    var throttleMs = WATCHLIST_EVENT_THROTTLE_HOURS * 3600 * 1000;
    var key = 'dexInterestWatchlistLastAt:' + slug;

    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([key], function (res) {
          var last = res && res[key] ? Number(res[key]) : 0;
          if (last && nowMs - last < throttleMs) {
            resolve(false);
            return;
          }

          var obj = {};
          obj[key] = nowMs;
          chrome.storage.local.set(obj, function () {
            var filename = WATCHLIST_EVENT_PREFIX + slug + '-' + todayStr() + '.json';
            var payload = {
              exportedAt: new Date().toISOString(),
              source: 'linkedin-profile-visit',
              profileUrl: profileUrl,
              at: new Date(nowMs).toISOString(),
              slug: slug
            };
            var jsonStr = JSON.stringify(payload, null, 2);
            sendToBackground(jsonStr, filename)
              .then(function () { resolve(true); })
              .catch(function () { resolve(false); });
          });
        });
      } catch (_) {
        resolve(false);
      }
    });
  }

  // ── Interest capture (recent posts on profile) ──────────────────────────────
  var INTEREST_CAPTURE_PARAM = 'dex-interest-capture=1';
  var INTEREST_RUN_ID_PARAM = 'dex-interest-run-id';
  var INTEREST_RUN_ID_STORAGE_KEY = 'dexInterestRunId';
  var INTEREST_MAX_AGE_DAYS = 7;
  var INTEREST_MAX_RECENT_POSTS = 10; // сколько постов с age<=N хотим получить
  var INTEREST_MIN_RECENT_POSTS = 3; // после этого безопасно прерываться по достижению старых
  var INTEREST_MAX_POSTS_SNAPSHOT = 40; // максимум кандидатов за один DOM-скан
  var INTEREST_MAX_SCROLL_ROUNDS = 12;
  var INTEREST_SCROLL_STEP_PX = 900;
  var INTEREST_WAIT_MS = 1400;

  function getInterestRunIdFromUrl() {
    try {
      var params = new URLSearchParams(window.location.search || '');
      var v = params.get(INTEREST_RUN_ID_PARAM);
      if (v) return String(v).trim();
    } catch (_) {}
    return '';
  }

  function getInterestRunIdFromStorage() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([INTEREST_RUN_ID_STORAGE_KEY], function (res) {
          var v = res && res[INTEREST_RUN_ID_STORAGE_KEY] ? String(res[INTEREST_RUN_ID_STORAGE_KEY]).trim() : '';
          resolve(v);
        });
      } catch (_) {
        resolve('');
      }
    });
  }

  async function getInterestRunId() {
    var fromUrl = getInterestRunIdFromUrl();
    if (fromUrl) return fromUrl;
    var fromStorage = await getInterestRunIdFromStorage();
    return fromStorage || '';
  }

  function normalizePostUrl(raw) {
    if (!raw) return '';
    var s = String(raw).trim();
    if (!s) return '';
    s = s.replace(/[#?].*$/, '');
    s = s.replace(/^http:\/\//i, 'https://');
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

  function cleanupPostText(raw) {
    var s = String(raw || '');
    s = s.replace(/\s+/g, ' ').trim();
    // Убираем часто встречающиеся UI-заглушки.
    s = s.replace(/\b(Like|Liked|Comment|Repost|Share|Save|Show more|Show less|Sign in)\b/ig, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function parsePublishedAtMs(raw, nowMs) {
    if (!raw) return null;
    var s = String(raw).trim();
    if (!s) return null;

    // 1) Если это уже ISO/дата — пробуем Date.parse
    var parsed = Date.parse(s);
    if (!isNaN(parsed)) return parsed;

    // 2) Относительные форматы
    var sl = s.toLowerCase();
    if (/^today$/i.test(s) || /\btoday\b/.test(sl)) return nowMs;
    if (/^yesterday$/i.test(s) || /\byesterday\b/.test(sl)) return nowMs - 24 * 3600 * 1000;

    // English
    var m = sl.match(/(\d+)\s*(minute|minutes|min|mins)\s*(?:ago)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 60 * 1000;
    m = sl.match(/(\d+)\s*(hour|hours|hr|hrs)\s*(?:ago)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 3600 * 1000;
    m = sl.match(/(\d+)\s*h\s*(?:ago)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 3600 * 1000;
    m = sl.match(/(\d+)\s*(day|days|d)\s*(?:ago)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 24 * 3600 * 1000;
    m = sl.match(/(\d+)\s*(week|weeks|w)\s*(?:ago)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 7 * 24 * 3600 * 1000;
    m = sl.match(/(\d+)\s*(month|months|mo)\s*(?:ago)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 30 * 24 * 3600 * 1000;
    m = sl.match(/(\d+)\s*(year|years|y)\s*(?:ago)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 365 * 24 * 3600 * 1000;

    // Russian (best-effort)
    m = sl.match(/(\d+)\s*(минуты?|мин|м)\s*(?:назад)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 60 * 1000;
    m = sl.match(/(\d+)\s*(часов?|ч)\s*(?:назад)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 3600 * 1000;
    m = sl.match(/(\d+)\s*(дней?|дня|дн)\s*(?:назад)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 24 * 3600 * 1000;
    m = sl.match(/(\d+)\s*(недель|недели|недел)\s*(?:назад)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 7 * 24 * 3600 * 1000;
    m = sl.match(/(\d+)\s*(месяцев|месяца|мес)\s*(?:назад)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 30 * 24 * 3600 * 1000;
    m = sl.match(/(\d+)\s*(лет|год|года|г)\s*(?:назад)?/i);
    if (m) return nowMs - parseInt(m[1], 10) * 365 * 24 * 3600 * 1000;

    return null;
  }

  function findProfilePostsContainer() {
    // Пробуем ограничить поиск по пост-контейнеру (меньше шума на странице профиля).
    // Если не нашли, откатываемся на main/body.
    var main = document.querySelector('main') || document.body;
    if (!main) return document;
    var candidates = main.querySelectorAll('section, [role="main"], div');
    var keywordsRe = /(Posts|Post|Посты|Пост|Activity|Активность)/i;
    var scanned = 0;
    for (var i = 0; i < candidates.length && scanned < 80; i++) {
      var el = candidates[i];
      if (!el || !el.querySelector) continue;
      scanned++;
      if (!el.querySelector('time')) continue;
      var txt = (el.textContent || '').trim();
      if (keywordsRe.test(txt)) return el;
    }
    return main;
  }

  function findPostRootFromAnchor(a) {
    var el = a && (a.closest('article') || a.closest('[role="article"]') || a.parentElement);
    if (!el) return null;
    // Если ближайший article не содержит time, поднимемся выше несколько уровней.
    for (var i = 0; i < 6; i++) {
      if (el.querySelector && el.querySelector('time')) return el;
      el = el.parentElement;
      if (!el) break;
    }
    return a.closest('article') || a.closest('[role="article"]') || a.parentElement;
  }

  function findProfilePostCandidates(maxPosts) {
    var postsMap = new Map();
    var nowMs = Date.now();
    var searchRoot = findProfilePostsContainer() || document;
    var anchors = searchRoot.querySelectorAll('a[href*="/feed/update/"], a[href*="/posts/"], a[href*="/feed/content/"]');
    for (var i = 0; i < anchors.length; i++) {
      if (postsMap.size >= maxPosts) break;
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!href) continue;
      var abs = href.indexOf('http') === 0 ? href : ('https://www.linkedin.com' + href);
      if (!/\/(feed\/update|posts|feed\/content)\//i.test(abs)) continue;

      var postUrl = normalizePostUrl(abs);
      if (!postUrl) continue;
      // LinkedIn может хранить ссылки на посты по-разному.
      // Поэтому не завязываемся только на urn или на "длинные цифры" - принимаем основные паттерны.
      if (!/urn:li:activity|\/feed\/update\/|\/feed\/content\/|\/posts\//i.test(postUrl)) continue;
      if (postsMap.has(postUrl)) continue;

      var root = findPostRootFromAnchor(a);
      if (!root) continue;

      // Автор (приблизительно: первое /in/ внутри пост-контейнера)
      var authorLink = root.querySelector('a[href*="/in/"]');
      var authorProfileUrl = canonicalizeLinkedInProfileUrl(authorLink ? authorLink.href : '');
      var authorName = authorLink && authorLink.textContent ? cleanupPostText(authorLink.textContent).split(' ').slice(0, 3).join(' ').trim() : '';

      // Текст поста
      var textEl =
        root.querySelector('[data-test-id="commentary"], [data-test-id="commentary-text"]') ||
        root.querySelector('div[role="presentation"] div') ||
        root.querySelector('div[class*="commentary"], div[class*="description"], div[class*="update"]') ||
        null;
      var rawText = textEl && textEl.innerText ? textEl.innerText : (root.innerText || '');
      var postText = cleanupPostText(rawText).slice(0, 700);

      // Published time
      // Внутри пост-карточек LinkedIn может вставлять несколько <time>.
      // Берём тот, у которого есть полезные метаданные (datetime/aria-label/title/text).
      var timeEl = null;
      var timeEls = root.querySelectorAll ? root.querySelectorAll('time') : [];
      if (timeEls && timeEls.length) {
        for (var ti = 0; ti < timeEls.length; ti++) {
          var t = timeEls[ti];
          var dtTry = (t.getAttribute('datetime') || '').trim();
          var metaTry = (t.getAttribute('aria-label') || t.getAttribute('title') || '').trim();
          var txtTry = (t.textContent || '').trim();
          if (dtTry || metaTry || txtTry) {
            timeEl = t;
            break;
          }
        }
      }
      if (!timeEl) timeEl = root.querySelector('time');
      var publishedAtMs = null;
      var publishedAtRaw = '';
      if (timeEl) {
        var dt = (timeEl.getAttribute('datetime') || '').trim();
        if (dt) {
          // 1) ISO date -> Date.parse
          // 2) Epoch seconds/ms -> numeric parse (LinkedIn иногда отдаёт числа)
          var dtMs = null;
          if (/^\d+$/.test(dt)) {
            var n = parseInt(dt, 10);
            // heuristic: seconds vs ms
            if (n && n < 1000000000000) n = n * 1000;
            dtMs = n;
          } else {
            dtMs = Date.parse(dt);
          }
          if (!isNaN(dtMs) && dtMs) {
            publishedAtMs = dtMs;
            publishedAtRaw = dt;
          }
        }

        if (publishedAtMs == null) {
          // Try parsing meta on the time element itself.
          var meta = (timeEl.getAttribute('aria-label') || timeEl.getAttribute('title') || '').trim();
          if (meta) {
            var metaMs = parsePublishedAtMs(meta, nowMs);
            if (metaMs != null) {
              publishedAtMs = metaMs;
              publishedAtRaw = meta;
            }
          }
        }

        if (publishedAtMs == null) {
          // Fallback to visible time text.
          publishedAtRaw = (timeEl.textContent || '').trim();
          publishedAtMs = parsePublishedAtMs(publishedAtRaw, nowMs);
        }
      }
      if (publishedAtMs == null) {
        // fallback: aria-labels (best-effort)
        var ariaEls = root.querySelectorAll('[aria-label]');
        for (var j = 0; j < ariaEls.length; j++) {
          var aria = (ariaEls[j].getAttribute('aria-label') || '').trim();
          if (!aria) continue;
          var ms2 = parsePublishedAtMs(aria, nowMs);
          if (ms2 != null) {
            publishedAtMs = ms2;
            publishedAtRaw = aria;
            break;
          }
        }
      }

      if (publishedAtMs == null) {
        // Last-resort: вытаскиваем relative-time из общего текста карточки.
        var bigText = (root.innerText || '').trim();
        if (bigText) {
          var anyRel =
            bigText.match(
              /(today|yesterday|\d+\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|d|week|weeks|w|month|months|mo|year|years|минуты?|мин|м|часов?|ч|дней?|дня|дн|недель|недели|недел|месяцев|месяца|мес|лет|год|года)\s*(?:ago|назад)?)/i
            ) || null;

          if (anyRel && anyRel[1]) {
            publishedAtRaw = String(anyRel[1]).trim();
            publishedAtMs = parsePublishedAtMs(publishedAtRaw, nowMs);
          }
        }
      }

      postsMap.set(postUrl, {
        postUrl: postUrl,
        postId: extractPostId(postUrl),
        authorProfileUrl: authorProfileUrl || '',
        authorName: authorName || '',
        postText: postText || '',
        publishedAtMs: publishedAtMs,
        publishedAtRaw: publishedAtRaw || ''
      });
    }
    return Array.from(postsMap.values());
  }

  async function captureRecentProfilePostsAndExport() {
    var slug = getSlugFromProfilePath(window.location.pathname);
    if (!slug) return { ok: false, error: 'no slug' };

    var runId = await getInterestRunId();
    // Сразу очищаем, чтобы следующий независимый переход не утащил прошлый runId.
    try { chrome.storage.local.remove([INTEREST_RUN_ID_STORAGE_KEY]); } catch (_) {}

    var profileUrl = canonicalizeLinkedInProfileUrl(window.location.href);
    if (!profileUrl) profileUrl = 'https://www.linkedin.com/in/' + slug + '/';

    var nowMs = Date.now();
    var cutoffMs = nowMs - INTEREST_MAX_AGE_DAYS * 24 * 3600 * 1000;

    var postsMap = new Map(); // key=postUrl
    var stableRounds = 0;
    var prevSize = 0;

    for (var r = 0; r < INTEREST_MAX_SCROLL_ROUNDS; r++) {
      var batch = findProfilePostCandidates(INTEREST_MAX_POSTS_SNAPSHOT);
      var added = 0;
      for (var i = 0; i < batch.length; i++) {
        var p = batch[i];
        if (!p || !p.postUrl) continue;
        if (!postsMap.has(p.postUrl)) {
          postsMap.set(p.postUrl, p);
          added++;
        }
      }

      var allPosts = Array.from(postsMap.values());
      var recentPosts = allPosts.filter(function (p) { return p.publishedAtMs != null && p.publishedAtMs >= cutoffMs; });

      // Условия остановки:
      if (recentPosts.length >= INTEREST_MAX_RECENT_POSTS) break;

      var hasOld = allPosts.some(function (p) { return p.publishedAtMs != null && p.publishedAtMs < cutoffMs; });
      if (hasOld && recentPosts.length >= INTEREST_MIN_RECENT_POSTS) break;

      var size = postsMap.size;
      if (size === prevSize) stableRounds++;
      else stableRounds = 0;
      prevSize = size;
      if (stableRounds >= 3) break;

      if (r < INTEREST_MAX_SCROLL_ROUNDS - 1) {
        window.scrollBy({ top: INTEREST_SCROLL_STEP_PX, left: 0, behavior: 'smooth' });
        await sleep(INTEREST_WAIT_MS);
      }
    }

    var candidates = Array.from(postsMap.values());
    var matchedRecentPosts = candidates
      .filter(function (p) { return p.publishedAtMs != null && p.publishedAtMs >= cutoffMs; })
      .sort(function (a, b) { return (b.publishedAtMs || 0) - (a.publishedAtMs || 0); });

    // If publishedAt parsing failed for everything, still export some links.
    // This keeps the extension useful even when LinkedIn DOM/time formats change.
    var allPostsFinal = matchedRecentPosts.length > 0
      ? matchedRecentPosts
      : candidates.slice(0, INTEREST_MAX_RECENT_POSTS);
    var exportMode = matchedRecentPosts.length > 0 ? 'timestamp_filtered' : 'timestamp_fallback';

    // Guardrail: если timestamp распарсился плохо, сохраняем debug JSON, чтобы можно было быстро улучшить селекторы.
    try {
      var missing = candidates
        .filter(function (p) { return p.publishedAtMs == null; })
        .slice(0, 20)
        .map(function (p) {
          return {
            postUrl: p.postUrl,
            authorProfileUrl: p.authorProfileUrl || '',
            publishedAtRaw: p.publishedAtRaw || ''
          };
        });

      if (missing.length > 0) {
        var debugPayload = {
          exportedAt: new Date().toISOString(),
          source: 'linkedin-profile-posts-recent-debug',
          profileUrl: profileUrl,
          settings: { maxAgeDays: INTEREST_MAX_AGE_DAYS },
          counts: {
            candidates: candidates.length,
            withPublishedAt: candidates.length - missing.length,
            missingPublishedAt: missing.length
          },
          parseFailuresSample: missing
        };
        var debugFilename = 'dex-linkedin-profile-posts-debug-' + slug + '-' + todayStr() + '.json';
        var debugJsonStr = JSON.stringify(debugPayload, null, 2);
        // Не блокируем основной экспорт, если debug-сохранение не получилось.
        await sendToBackground(debugJsonStr, debugFilename);
      }
    } catch (_) {}

    var payload = {
      exportedAt: new Date().toISOString(),
      source: 'linkedin-profile-posts-recent',
      runId: runId || null,
      profileUrl: profileUrl,
      exportMode: exportMode,
      settings: {
        maxAgeDays: INTEREST_MAX_AGE_DAYS
      },
      posts: allPostsFinal.slice(0, INTEREST_MAX_RECENT_POSTS).map(function (p) {
        return {
          postUrl: p.postUrl,
          postId: p.postId || '',
          authorProfileUrl: p.authorProfileUrl || '',
          authorName: p.authorName || '',
          postText: p.postText || '',
          publishedAt: p.publishedAtMs ? new Date(p.publishedAtMs).toISOString() : null,
          publishedAtRaw: p.publishedAtRaw || ''
        };
      })
    };

    var filename = 'dex-linkedin-profile-posts-' + slug + (runId ? '-' + runId : '') + '-' + todayStr() + '.json';
    var jsonStr = JSON.stringify(payload, null, 2);
    var resp = await sendToBackground(jsonStr, filename);
    if (resp && resp.ok) return { ok: true, filename: filename, path: resp.path };
    return { ok: false, error: resp && resp.error ? resp.error : 'save failed', filename: filename };
  }

  async function maybeCaptureInterestPosts() {
    var wantsByParam = (window.location.search || '').indexOf(INTEREST_CAPTURE_PARAM) !== -1 ||
      (window.location.hash || '').indexOf(INTEREST_CAPTURE_PARAM) !== -1;

    var wantsByStorage = false;
    try {
      var res = await new Promise(function (resolve) {
        chrome.storage.local.get(['dexAutoCaptureRequested'], function (r) { resolve(r || null); });
      });
      wantsByStorage = !!(res && res.dexAutoCaptureRequested === '1');
    } catch (_) {
      wantsByStorage = false;
    }

    if (!wantsByParam && !wantsByStorage) return false;

    // Clear trigger flag so the next LinkedIn navigation doesn't start another capture.
    try { chrome.storage.local.remove(['dexAutoCaptureRequested']); } catch (_) {}

    await captureRecentProfilePostsAndExport();
    return true;
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /** Find the section/card that contains "People who are hiring for your role" (not other cohorts). */
  function findHiringCohortSection() {
    if (!document.body) return null;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
    var el;
    while ((el = walker.nextNode())) {
      var text = (el.textContent || '').trim();
      var isHiringBlock = text.indexOf('People who are hiring for your role') !== -1 ||
        (text.indexOf('hiring for your role') !== -1 && text.length < 150);
      if (!isHiringBlock) continue;
      var section = el.closest('section') || el.closest('[data-view-name]') || el.closest('div[class*="cohort"]') || el.closest('div[class*="card"]');
      if (section) return section;
      var p = el.parentElement;
      while (p && p !== document.body) {
        if (p.querySelector && p.querySelector('button[data-view-name="cohort-section-see-all"]')) return p;
        p = p.parentElement;
      }
      return el.parentElement;
    }
    return null;
  }

  /** Find and click the "Show all" button only inside the "People who are hiring for your role" section. */
  function findAndClickShowAll() {
    var section = findHiringCohortSection();
    if (!section) return false;

    var btn = section.querySelector('button[aria-label="People who are hiring for your role"]');
    if (btn) {
      btn.click();
      return true;
    }
    var allSeeAll = section.querySelectorAll('button[data-view-name="cohort-section-see-all"]');
    if (allSeeAll.length > 0) {
      allSeeAll[0].click();
      return true;
    }
    var links = section.querySelectorAll('button, a');
    for (var i = 0; i < links.length; i++) {
      var node = links[i];
      if ((node.textContent || '').trim().indexOf('Show all') !== -1) {
        node.click();
        return true;
      }
    }
    return false;
  }

  /** Wait for "People who are hiring for your role" modal (cohort see-all list). */
  function waitForCohortModal(maxWaitMs) {
    maxWaitMs = maxWaitMs || 10000;
    var deadline = Date.now() + maxWaitMs;
    return new Promise(function (resolve) {
      function check() {
        var dialog = document.querySelector('[role="dialog"]');
        if (dialog) {
          var h2 = dialog.querySelector('h2');
          if (h2 && (h2.textContent || '').indexOf('People who are hiring') !== -1) {
            resolve(dialog);
            return;
          }
        }
        var byData = document.querySelector('[data-sdui-screen="com.linkedin.sdui.flagshipnav.mynetwork.CohortSeeAll"]');
        if (byData) {
          resolve(byData.closest('[role="dialog"]') || byData);
          return;
        }
        if (Date.now() > deadline) {
          resolve(null);
          return;
        }
        setTimeout(check, 250);
      }
      check();
    });
  }

  /** Collect profile URLs from inside the cohort modal (dialog). */
  function collectProfileUrlsFromModal(modalRoot) {
    var root = modalRoot || document;
    var links = root.querySelectorAll('a[href*="/in/"]');
    var seen = new Set();
    var urls = [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = (a.getAttribute('href') || '').split('?')[0];
      var match = href.match(/linkedin\.com\/in\/([^/]+)/);
      if (!match) continue;
      var slug = match[1];
      if (!slug || slug === 'feed' || slug === 'messaging') continue;
      var full = href.indexOf('http') === 0 ? href : 'https://www.linkedin.com' + href;
      if (!/^https?:\/\/[^/]+\/in\/[^/]+\/?$/.test(full)) full = 'https://www.linkedin.com/in/' + slug + '/';
      if (seen.has(full)) continue;
      seen.add(full);
      urls.push(full);
    }
    return urls;
  }

  /** Fallback: collect profile URLs from whole Grow page (e.g. when modal not used). */
  function collectProfileUrlsFromGrow() {
    var links = document.querySelectorAll('a[href*="/in/"]');
    var seen = new Set();
    var urls = [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = (a.getAttribute('href') || '').split('?')[0];
      var match = href.match(/linkedin\.com\/in\/([^/]+)/);
      if (!match) continue;
      var slug = match[1];
      if (!slug || slug === 'feed' || slug === 'messaging') continue;
      var full = 'https://www.linkedin.com/in/' + slug + '/';
      if (seen.has(full)) continue;
      seen.add(full);
      urls.push(full);
    }
    return urls;
  }

  /** Find and click "Show job" (opens Hiring modal). */
  function findAndClickShowJob() {
    var xpath = "//*[contains(text(),'Show job')]";
    var snapshot = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    for (var i = 0; i < snapshot.snapshotLength; i++) {
      var node = snapshot.snapshotItem(i);
      if (node.nodeType !== 1) node = node.parentElement;
      if (!node) continue;
      var tag = (node.tagName || '').toLowerCase();
      if (tag === 'script' || tag === 'style') continue;
      node.click();
      return true;
    }
    return false;
  }

  /** Wait for modal (dialog) to appear. */
  function waitForModal(maxWaitMs) {
    maxWaitMs = maxWaitMs || 5000;
    var deadline = Date.now() + maxWaitMs;
    return new Promise(function (resolve) {
      function check() {
        var dialog = document.querySelector('[role="dialog"]') || document.querySelector('.artdeco-modal');
        if (dialog) {
          resolve(dialog);
          return;
        }
        if (Date.now() > deadline) {
          resolve(null);
          return;
        }
        setTimeout(check, 200);
      }
      check();
    });
  }

  /** From modal: get job cards, extract link, company, workplace type; return only Remote. */
  function parseRemoteJobsFromModal(modalRoot) {
    var root = modalRoot || document;
    var cards = root.querySelectorAll('[data-job-id], .po-view__job-card, li[data-job-id]');
    if (cards.length === 0) {
      cards = root.querySelectorAll('.job-card-container, [class*="job-card"]');
    }
    var results = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var linkEl = card.querySelector('a[href*="/jobs/view/"]') || card.querySelector('.job-card-container__link');
      var href = linkEl ? (linkEl.getAttribute('href') || '') : '';
      var companyEl = card.querySelector('.job-card-container__company-name') || card.querySelector('[class*="company-name"]');
      var company = companyEl ? companyEl.textContent.trim() : '';
      var workEl = card.querySelector('.job-card-container__metadata-item--workplace-type') || card.querySelector('[class*="workplace-type"]');
      var workType = workEl ? workEl.textContent.trim() : '';
      var title = linkEl ? linkEl.textContent.trim() : '';
      if (!href || !/\/jobs\/view\/\d+/.test(href)) continue;
      var workLower = workType.toLowerCase();
      if (workLower.indexOf('on-site') !== -1 || workLower.indexOf('onsite') !== -1 || workLower.indexOf('hybrid') !== -1) continue;
      var url = href.indexOf('http') === 0 ? href.split('?')[0] : 'https://www.linkedin.com' + href.split('?')[0];
      results.push({ url: url, title: title || 'View job', company: company, workType: workType || 'Remote' });
    }
    return results;
  }

  /** Close modal: Dismiss button or overlay. */
  function closeModal() {
    var btn = document.querySelector('[role="dialog"] button[aria-label="Dismiss"]') ||
      document.querySelector('.artdeco-modal__dismiss') ||
      document.querySelector('button[aria-label="Dismiss"]');
    if (btn) {
      btn.click();
      return true;
    }
    var overlay = document.querySelector('.artdeco-modal__backdrop');
    if (overlay) overlay.click();
    return false;
  }

  function sendToBackground(jsonStr, filename) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { action: 'downloadJson', data: jsonStr, filename: filename },
          function (resp) {
            if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
            else if (resp && resp.ok) resolve(resp);
            else resolve({ ok: false, error: (resp && resp.error) || 'no response' });
          }
        );
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  /** Save collected jobs: native host, then save-server, then download. */
  async function saveCollected(collected, profileUrls, currentIndex) {
    var filename = 'dex-linkedin-hiring-managers-' + todayStr() + '.json';
    var payload = {
      exportedAt: new Date().toISOString(),
      source: 'linkedin-mynetwork-grow',
      profileUrls: profileUrls || [],
      currentIndex: currentIndex || 0,
      collected: collected || []
    };
    var jsonStr = JSON.stringify(payload, null, 2);

    var resp = await sendToBackground(jsonStr, filename);
    if (resp.ok) {
      console.log('[Dex Hiring] Saved via native:', filename);
      return { ok: true, filename: filename };
    }

    try {
      var fetchResp = await fetch(SAVE_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Filename': filename },
        body: jsonStr
      });
      var data = await fetchResp.json().catch(function () { return {}; });
      if (fetchResp.ok && data && data.ok) {
        console.log('[Dex Hiring] Saved via server:', filename);
        return { ok: true, filename: filename };
      }
    } catch (e) {
      console.warn('[Dex Hiring] Save server failed:', e.message);
    }

    var blob = new Blob([jsonStr], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    console.log('[Dex Hiring] Downloaded fallback:', filename);
    return { ok: true, filename: filename };
  }

  /** Start capture from Grow: click Show all (only in "People who are hiring" block), wait modal, collect URLs from modal only, go to first profile. */
  async function startGrowCapture() {
    var clicked = findAndClickShowAll();
    if (!clicked) {
      console.warn('[Dex Hiring] Could not find "Show all" in "People who are hiring for your role". Scroll to that block and click the button manually.');
      return false;
    }
    var modal = await waitForCohortModal(12000);
    await sleep(500);
    if (!modal) {
      console.warn('[Dex Hiring] Modal "People who are hiring" did not open. Click "Show all" in that block manually.');
      return false;
    }
    var urls = collectProfileUrlsFromModal(modal);
    if (urls.length === 0) {
      console.warn('[Dex Hiring] No profile links in modal.');
      return false;
    }
    setState({ profileUrls: urls, currentIndex: 0, collected: [], status: 'capturing' });
    window.location.href = urls[0];
    return true;
  }

  function showGrowUI() {
    if (document.getElementById('dex-hiring-managers-ui')) return;

    var wrap = document.createElement('div');
    wrap.id = 'dex-hiring-managers-ui';
    wrap.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;font-family:system-ui,sans-serif;font-size:13px;background:#0a66c2;color:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.2);';
    var btn = document.createElement('button');
    btn.textContent = 'Dex: Capture Hiring Managers';
    btn.style.cssText = 'background:#fff;color:#0a66c2;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-weight:600;';
    btn.onclick = function () { startGrowCapture(); };
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  async function runProfilePage() {
    if (typeof window !== 'undefined' && window.__dexStopRequested) {
      try {
        var st0 = getState();
        if (st0 && st0.status === 'capturing') {
          setState({ profileUrls: st0.profileUrls, currentIndex: st0.currentIndex, collected: st0.collected, status: 'stopped' });
        }
      } catch (e) {}
      return;
    }
    var state = getState();
    if (!state || state.status !== 'capturing' || !state.profileUrls || state.currentIndex >= state.profileUrls.length) {
      return;
    }

    await sleep(800);

    var clicked = findAndClickShowJob();
    if (!clicked) {
      var nextIndex = state.currentIndex + 1;
      if (nextIndex < state.profileUrls.length) {
        setState({ profileUrls: state.profileUrls, currentIndex: nextIndex, collected: state.collected, status: 'capturing' });
        window.location.href = state.profileUrls[nextIndex];
      } else {
        await finishCapture(state);
      }
      return;
    }

    var modal = await waitForModal(6000);
    await sleep(500);
    var remoteJobs = modal ? parseRemoteJobsFromModal(modal) : [];
    closeModal();
    await sleep(300);

    var collected = (state.collected || []).concat(remoteJobs);
    var nextIndex = state.currentIndex + 1;

    if (nextIndex < state.profileUrls.length) {
      setState({ profileUrls: state.profileUrls, currentIndex: nextIndex, collected: collected, status: 'capturing' });
      window.location.href = state.profileUrls[nextIndex];
    } else {
      setState({ profileUrls: state.profileUrls, currentIndex: nextIndex, collected: collected, status: 'capturing' });
      await finishCapture(getState());
    }
  }

  async function finishCapture(state) {
    var raw = state.collected || [];
    var seen = new Set();
    var collected = raw.filter(function (j) {
      var key = (j.url || '').split('?')[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await saveCollected(collected, state.profileUrls, state.currentIndex);
    clearState();
    var msg = collected.length + ' remote job(s) saved. Run: npm run job-search:hiring-managers-digest';
    console.log('[Dex Hiring]', msg);
    alert(msg);
  }

  var GROW_AUTO_START_DELAY_MS = 3000;
  var GROW_RETRY_DELAY_MS = 5000;

  function init() {
    var path = window.location.pathname || '';
    if (/\/mynetwork\/grow\/?$/.test(path)) {
      function runAutoStart() {
        startGrowCapture().then(function (ok) {
          if (!ok && GROW_RETRY_DELAY_MS > 0) {
            setTimeout(function () { startGrowCapture(); }, GROW_RETRY_DELAY_MS);
          }
        });
      }
      function onGrowReady() {
        showGrowUI();
        setTimeout(runAutoStart, GROW_AUTO_START_DELAY_MS);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onGrowReady);
      } else {
        onGrowReady();
      }
      return;
    }
    if (/^\/in\/[^/]+\/?$/.test(path)) {
      // Light watchlist logging (throttled). Не мешает hiring-managers capture flow.
      recordWatchlistEventIfAllowed().catch(function () {});
      // Если пришёл запрос интереса — делаем capture недавних постов и не идём в hiring-managers capture.
      maybeCaptureInterestPosts().then(function (didCapture) {
        if (!didCapture) runProfilePage();
      }).catch(function () { runProfilePage(); });
    }
  }

  init();
})();
