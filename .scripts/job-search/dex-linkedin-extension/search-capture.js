/**
 * Dex LinkedIn Search Capture — content script.
 * Runs on LinkedIn search results pages (split view: cards left, details right).
 * Clicks through each job card, reads the right panel, filters hybrid/on-site,
 * handles pagination, saves state for resume, and auto-downloads JSON.
 *
 * No Playwright. All actions emulate real user behavior via DOM API.
 */
(function () {
  'use strict';

  // Capture dex-auto-capture=1 immediately (LinkedIn may strip it from URL before init)
  var q = (typeof location !== 'undefined' && (location.search || '') + (location.hash || '')) || '';
  if (q.indexOf('dex-auto-capture=1') !== -1) {
    try { sessionStorage.setItem('dexAutoCaptureRequested', '1'); } catch (e) {}
  }

  // ── Constants ──────────────────────────────────────────────────────────────

  var CLICK_DELAY_MS = 5000;        // Min delay between card clicks
  var SCROLL_WAIT_MS = 1500;        // Wait after each scroll for cards to load
  var PANEL_RETRY_DELAYS = [3000, 5000, 8000]; // Retry delays for panel load
  var MAX_SCROLL_STABLE = 3;        // Scroll attempts with no new cards before stop
  var PAGINATION_WAIT_MS = 4000;    // Wait after clicking page number
  var SKIP_DELAY_MS = 2000;         // Shorter delay for filtered/skipped jobs

  // Debug: capture only one job (add ?dex-debug=1 to search URL)
  var DEBUG_ONE_JOB = typeof window !== 'undefined' && window.location &&
    (window.location.search || '').indexOf('dex-debug=1') !== -1;
  if (DEBUG_ONE_JOB) console.log('[Dex] Debug mode: will capture only 1 job and log every save step.');

  // ── Selectors (updated for 2026 LinkedIn DOM) ─────────────────────────────

  // Left panel: scrollable list container
  var LIST_CONTAINER_SELECTORS = [
    'div[data-testid="lazy-column"]',
    'div[data-component-type="LazyColumn"]',
    '.scaffold-layout__list-container',
    '.jobs-search-results-list',
    '.scaffold-layout__list'
  ];

  // Right panel: job detail selectors
  var DETAIL_SELECTORS = {
    title: [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title a',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-details-top-card__job-title',
      'h1[class*="job-title"]',
      'a[class*="job-title"]',
      'h2.t-24',
      'h1.t-24'
    ],
    company: [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-details-top-card__company-name a',
      '.jobs-details-top-card__company-name',
      '.jobs-unified-top-card__company-name a'
    ],
    location: [
      '.job-details-jobs-unified-top-card__bullet',
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
      '.jobs-details-top-card__bullet',
      '.jobs-unified-top-card__bullet'
    ],
    description: [
      '.jobs-description-content__text',
      '.jobs-description__content .jobs-box__html-content',
      '.jobs-box__html-content',
      '.jobs-details__main-content',
      '.jobs-description__content',
      'article[class*="jobs-description"]',
      'div[class*="jobs-description"]',
      '#job-details',
      'div[class*="description"]',
      'section[class*="description"]'
    ],
    showMore: [
      'button.jobs-description__footer-button',
      'button[aria-label*="Show more"]',
      'button[aria-label*="show more"]',
      'button.jobs-details__show-more-button'
    ].join(', ')
  };

  // Right panel root containers
  var RIGHT_PANEL_SELECTORS = [
    '.scaffold-layout__detail-inner',
    '.scaffold-layout__detail',
    '.jobs-search__job-details',
    '.jobs-details'
  ];

  // Pagination (updated for new DOM; multiple fallbacks for different LinkedIn layouts)
  var PAGINATION_SELECTORS = {
    currentPage: 'button[aria-current="true"]',
    nextButton: 'button[data-testid="pagination-controls-next-button-visible"], button[aria-label*="Next" i], button[aria-label*="next" i]',
    allPages: 'button[data-testid^="pagination-indicator-"], button[aria-label^="Page "], button[aria-label*="Page "]'
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getEl(selectors, root) {
    root = root || document;
    var arr = Array.isArray(selectors) ? selectors : [selectors];
    for (var i = 0; i < arr.length; i++) {
      var el = root.querySelector(arr[i]);
      if (el && el.textContent && el.textContent.trim().length > 0) return el;
    }
    return null;
  }

  function extractText(root) {
    if (!root) return '';
    var text = '';
    function walk(node) {
      if (node.nodeType === 3) { text += node.nodeValue || ''; }
      else if (node.nodeType === 1) {
        var tag = node.nodeName.toLowerCase();
        if (tag === 'li') text += '\n\u2022 ';
        if (tag === 'p' || tag === 'br' || tag === 'div') text += '\n';
        for (var i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
        if (tag === 'p' || tag === 'div') text += '\n';
      }
    }
    walk(root);
    return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function getSearchQuery() {
    return new URLSearchParams(window.location.search).get('keywords') || '';
  }

  function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 60);
  }

  function getJobIdFromUrl(url) {
    var m = (url || '').match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : null;
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeSearchUrl(url) {
    return (url || '').replace(/&currentJobId=[^&]*/g, '').replace(/&start=[^&]*/g, '');
  }

  // ── Card detection (multiple strategies, 2026 LinkedIn DOM) ────────────────

  function findListContainer() {
    for (var i = 0; i < LIST_CONTAINER_SELECTORS.length; i++) {
      var el = document.querySelector(LIST_CONTAINER_SELECTORS[i]);
      if (el && el.children.length > 0) return el;
    }
    return null;
  }

  /**
   * Extract job ID from various attribute formats LinkedIn uses.
   * Priority: data-view-tracking-scope JSON > data-occludable-job-id >
   * data-job-id > data-entity-urn > href > any large number in tracking scope
   */
  function extractJobIdFromElement(el) {
    // 2026 DOM: data-view-tracking-scope contains JSON with objectUrn
    var trackingScope = el.getAttribute('data-view-tracking-scope');
    if (trackingScope) {
      // Try explicit jobPosting URN
      var urnMatch = trackingScope.match(/jobPosting[:\"](\d+)/i);
      if (urnMatch) return urnMatch[1];
      // Try any URN with large numeric ID (10+ digits = likely job ID)
      var bigNumMatch = trackingScope.match(/(\d{10,})/);
      if (bigNumMatch) return bigNumMatch[1];
    }
    // Older DOM: direct data attributes
    var d = el.getAttribute('data-occludable-job-id')
      || el.getAttribute('data-job-id');
    if (d) return d;
    // Entity URN attribute
    var urn = el.getAttribute('data-entity-urn') || '';
    var urnM = urn.match(/jobPosting:(\d+)/);
    if (urnM) return urnM[1];
    // href: /jobs/view/12345 or currentJobId=12345
    var href = el.getAttribute('href') || '';
    var viewMatch = href.match(/\/jobs\/view\/(\d+)/);
    if (viewMatch) return viewMatch[1];
    var cidMatch = href.match(/currentJobId=(\d+)/);
    if (cidMatch) return cidMatch[1];
    return null;
  }

  /**
   * Try to extract job ID from a card element by scanning all descendants
   * for any element that has job-related data attributes.
   */
  function extractJobIdFromCard(cardEl) {
    // 1. Try the card element itself
    var id = extractJobIdFromElement(cardEl);
    if (id) return id;
    // 2. Try immediate children and their data-view-tracking-scope
    var allTracking = cardEl.querySelectorAll('[data-view-tracking-scope]');
    for (var i = 0; i < allTracking.length; i++) {
      id = extractJobIdFromElement(allTracking[i]);
      if (id) return id;
    }
    // 3. Try any descendant with data-* job attributes
    var jobAttrEls = cardEl.querySelectorAll('[data-occludable-job-id], [data-job-id], [data-entity-urn]');
    for (var j = 0; j < jobAttrEls.length; j++) {
      id = extractJobIdFromElement(jobAttrEls[j]);
      if (id) return id;
    }
    // 4. Try any <a> with /jobs/view/ href
    var links = cardEl.querySelectorAll('a[href*="/jobs/view/"]');
    for (var k = 0; k < links.length; k++) {
      id = getJobIdFromUrl(links[k].href);
      if (id) return id;
    }
    // 5. Scan ALL data-* attributes on all descendants for large numeric IDs
    var allEls = cardEl.querySelectorAll('*');
    for (var m = 0; m < Math.min(allEls.length, 50); m++) {
      var attrs = allEls[m].attributes;
      for (var n = 0; n < attrs.length; n++) {
        if (attrs[n].name.indexOf('data-') === 0) {
          var numMatch = attrs[n].value.match(/(\d{10,})/);
          if (numMatch) return numMatch[1];
        }
      }
    }
    return null;
  }

  /**
   * Extract card-level metadata (title, company, location, work type hint)
   * directly from the card DOM, without needing the right panel.
   * This allows pre-filtering hybrid/on-site jobs without clicking.
   */
  function extractCardMeta(cardElement) {
    var meta = { title: '', company: '', location: '', workTypeHint: '' };
    // Title: from aria-label of the role="button" div, or from dismiss button
    var roleBtn = cardElement.querySelector('div[role="button"]');
    if (roleBtn) {
      var ariaLabel = roleBtn.getAttribute('aria-label') || '';
      if (ariaLabel.length > 5) meta.title = ariaLabel;
    }
    // Also try dismiss button: aria-label="Dismiss Senior Product Manager, ..."
    var dismissBtn = cardElement.querySelector('button[data-view-name="dismiss-job"]');
    if (dismissBtn && !meta.title) {
      var dismissLabel = dismissBtn.getAttribute('aria-label') || '';
      meta.title = dismissLabel.replace(/^Dismiss\s+/i, '');
    }
    // Extract visible text blocks — typically: title, company, location, metadata
    var paragraphs = cardElement.querySelectorAll('p');
    var textBlocks = [];
    for (var i = 0; i < paragraphs.length; i++) {
      var txt = (paragraphs[i].textContent || '').trim();
      if (txt.length > 0 && txt.length < 300) textBlocks.push(txt);
    }
    // Heuristic: first <p> = title, second = company, third = location
    if (textBlocks.length >= 1 && !meta.title) meta.title = textBlocks[0];
    if (textBlocks.length >= 2) meta.company = textBlocks[1];
    if (textBlocks.length >= 3) meta.location = textBlocks[2];
    // Work type from location text (e.g. "Berlin (Hybrid)", "Remote")
    var locLower = meta.location.toLowerCase();
    if (/\(hybrid\)|\bhybrid\b/.test(locLower)) meta.workTypeHint = 'hybrid';
    else if (/\(on-?site\)|\bon-?site\b|\bonsite\b/.test(locLower)) meta.workTypeHint = 'on-site';
    else if (/\(remote\)|\bremote\b/.test(locLower)) meta.workTypeHint = 'remote';
    // Fallback: "Hybrid"/"On-site" often appear as separate badges, not in location string — scan full card text
    if (!meta.workTypeHint) {
      var cardLower = (cardElement.innerText || textBlocks.join(' ')).toLowerCase();
      if (/\bhybrid\b/.test(cardLower)) meta.workTypeHint = 'hybrid';
      else if (/\bon-?site\b|\bonsite\b|\bin-?office\b/.test(cardLower)) meta.workTypeHint = 'on-site';
      else if (/\bremote\b/.test(cardLower)) meta.workTypeHint = 'remote';
    }
    // Never use LinkedIn UI labels or company taglines as job title (e.g. "We believe in smart execution, continuous improvement")
    if (meta.title && isUILabel(meta.title)) meta.title = '';
    if (meta.title && looksLikeSloganOrTagline(meta.title)) meta.title = '';
    return meta;
  }

  /**
   * Quick card count for scroll detection — avoids full diagnostics overhead.
   */
  function getJobCardCount() {
    var n = document.querySelectorAll('[data-view-name="job-search-job-card"]').length;
    if (n > 0) return n;
    // Legacy fallback
    n = document.querySelectorAll('[data-occludable-job-id]').length
      || document.querySelectorAll('[data-job-id]').length
      || document.querySelectorAll('a[href*="/jobs/view/"]').length;
    return n;
  }

  /**
   * Find all job cards on the current search results page.
   * Tries the 2026 DOM patterns first, then falls back to older layouts.
   * If no IDs can be extracted statically, assigns pending IDs (resolved on click).
   */
  function getJobCards() {
    var cards = [];
    var seenIds = {};
    var seenElements = [];
    var rightPanel = document.querySelector('.scaffold-layout__detail')
      || document.querySelector('.scaffold-layout__detail-inner')
      || null;

    function addCard(jobId, element) {
      if (!jobId || seenIds[jobId]) return;
      if (rightPanel && rightPanel.contains(element)) return;
      seenIds[jobId] = true;
      seenElements.push(element);
      cards.push({ jobId: jobId, element: element });
    }

    // ─── Diagnostics ─────────────────────────────────────────────
    var diag = {};
    var jobCardDivs = document.querySelectorAll('[data-view-name="job-search-job-card"]');
    diag['job-cards'] = jobCardDivs.length;

    var allTrackingScopes = document.querySelectorAll('[data-view-tracking-scope]');
    diag['tracking-scope-any'] = allTrackingScopes.length;
    diag['tracking-scope-jobPosting'] = document.querySelectorAll('[data-view-tracking-scope*="jobPosting"]').length;
    diag['lazy-column'] = document.querySelectorAll('div[data-testid="lazy-column"]').length;
    diag['jobs-view-links'] = document.querySelectorAll('a[href*="/jobs/view/"]').length;

    // Log first tracking scope value for debugging the actual format
    if (allTrackingScopes.length > 0) {
      var tsVal = allTrackingScopes[0].getAttribute('data-view-tracking-scope') || '';
      diag['first-tracking-scope'] = tsVal.substring(0, 300);
    }

    // Log first job card's data attributes (and first child's)
    if (jobCardDivs.length > 0) {
      var cardAttrs = {};
      var fc = jobCardDivs[0];
      for (var ai = 0; ai < fc.attributes.length; ai++) {
        if (fc.attributes[ai].name.indexOf('data-') === 0) {
          cardAttrs[fc.attributes[ai].name] = fc.attributes[ai].value.substring(0, 150);
        }
      }
      // Check first child div too
      if (fc.children[0]) {
        for (var bi = 0; bi < fc.children[0].attributes.length; bi++) {
          if (fc.children[0].attributes[bi].name.indexOf('data-') === 0) {
            cardAttrs['child:' + fc.children[0].attributes[bi].name] = fc.children[0].attributes[bi].value.substring(0, 150);
          }
        }
      }
      console.log('[Dex] First card data-* attrs:', JSON.stringify(cardAttrs));
    }

    var listContainer = findListContainer();
    diag['listContainer'] = listContainer ? listContainer.tagName + '.' + (listContainer.getAttribute('data-testid') || listContainer.className.substring(0, 60)) : 'NOT FOUND';
    console.log('[Dex] DOM diagnostics:', JSON.stringify(diag));

    // ─── Strategy 1 (2026): data-view-name="job-search-job-card" ─
    for (var a = 0; a < jobCardDivs.length; a++) {
      var jid = extractJobIdFromCard(jobCardDivs[a]);
      if (jid) addCard(jid, jobCardDivs[a]);
    }

    // ─── Strategy 2 (legacy): data-occludable-job-id ─────────────
    var s2 = document.querySelectorAll('[data-occludable-job-id]');
    for (var c = 0; c < s2.length; c++) {
      addCard(s2[c].getAttribute('data-occludable-job-id'), s2[c]);
    }

    // ─── Strategy 3 (legacy): data-job-id ────────────────────────
    var s3 = document.querySelectorAll('[data-job-id]');
    for (var dd = 0; dd < s3.length; dd++) {
      addCard(s3[dd].getAttribute('data-job-id'), s3[dd]);
    }

    // ─── Strategy 4 (legacy): entity URN ─────────────────────────
    var s4 = document.querySelectorAll('[data-entity-urn*="jobPosting"]');
    for (var ee = 0; ee < s4.length; ee++) {
      var urn = s4[ee].getAttribute('data-entity-urn') || '';
      var um = urn.match(/jobPosting:(\d+)/);
      if (um) addCard(um[1], s4[ee]);
    }

    // ─── Strategy 5 (fallback): /jobs/view/ links ────────────────
    // Only add links that are INSIDE a job card element (not right panel links)
    var s5 = document.querySelectorAll('a[href*="/jobs/view/"]');
    for (var ff = 0; ff < s5.length; ff++) {
      var id5 = getJobIdFromUrl(s5[ff].href);
      var wrapper5 = s5[ff].closest('[data-view-name="job-search-job-card"]');
      if (id5 && wrapper5) addCard(id5, wrapper5);
    }

    // ─── Strategy 6 (fallback): li items in list container ───────
    if (listContainer) {
      var liItems = listContainer.querySelectorAll('li');
      for (var gg = 0; gg < liItems.length; gg++) {
        var li = liItems[gg];
        var liId = extractJobIdFromCard(li);
        if (liId) addCard(liId, li);
      }
    }

    // ─── PENDING IDs: for any job-card elements not yet in results ──────
    // Cards may lack static IDs entirely (2026 DOM). Assign pending IDs
    // that will be resolved from URL (currentJobId) after clicking.
    var existingEls = {};
    for (var ei = 0; ei < cards.length; ei++) existingEls[cards[ei].element] = true;
    var pendingAdded = 0;
    for (var h = 0; h < jobCardDivs.length; h++) {
      if (rightPanel && rightPanel.contains(jobCardDivs[h])) continue;
      // Check if this element is already in cards
      var alreadyInCards = false;
      for (var ci2 = 0; ci2 < cards.length; ci2++) {
        if (cards[ci2].element === jobCardDivs[h]) { alreadyInCards = true; break; }
      }
      if (!alreadyInCards) {
        cards.push({ jobId: '_pending_' + h, element: jobCardDivs[h], pendingId: true });
        pendingAdded++;
      }
    }
    if (pendingAdded > 0) {
      console.log('[Dex] Added', pendingAdded, 'cards with pending IDs (resolved on click from URL)');
    }

    console.log('[Dex] Total cards found:', cards.length, '(pending:', pendingAdded + ')');
    return cards;
  }

  // ── Click a card WITHOUT navigating away ───────────────────────────────────

  /**
   * Click a job card to load its details in the right panel.
   * Prefer the <a> whose href contains this card's jobId (exact match) so the
   * right panel always switches; fall back to any /jobs/view/ link, then role=button.
   */
  function clickCard(card) {
    var el = card.element;
    var jobId = card.jobId;

    // Strategy 1: anchor that matches this job (href contains jobId) — most reliable
    var jobLink = null;
    if (jobId && String(jobId).length >= 6) {
      jobLink = el.querySelector('a[href*="/jobs/view/' + jobId + '"], a[href*="' + jobId + '"]');
    }
    if (!jobLink) {
      jobLink = el.querySelector('a[href*="/jobs/view/"]');
    }
    if (jobLink) {
      jobLink.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card._clickMode = 'anchor';
      return sleep(400).then(function () {
        jobLink.click();
        console.log('[Dex] Clicked card for job', jobId, '(anchor)');
      });
    }

    // Strategy 2: click div[role="button"] (SPA often reacts to this)
    var roleBtn = el.querySelector('div[role="button"]');
    if (roleBtn) {
      roleBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card._clickMode = 'role';
      return sleep(400).then(function () {
        roleBtn.click();
        console.log('[Dex] Clicked card for job', jobId, '(role=button)');
      });
    }

    // Strategy 3: MouseEvent dispatch (unreliable — panel may not update)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card._clickMode = 'dispatch';
    return sleep(400).then(function () {
      var rect = el.getBoundingClientRect();
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
        el.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, view: window,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        }));
      });
      console.warn('[Dex] Clicked card for job', jobId, '(dispatch — panel may not update)');
    });
  }

  // ── Scroll to load all cards on current page ───────────────────────────────

  function getScrollableListElement() {
    // The scrollable element might be the list container or its parent
    var container = findListContainer();
    if (!container) {
      // Fallback: try legacy or parent containers
      container = document.querySelector('.scaffold-layout__list') || null;
    }
    if (!container) return null;

    // Walk up to find the actually scrollable element
    var el = container;
    for (var i = 0; i < 5; i++) {
      if (el.scrollHeight > el.clientHeight + 10) return el;
      if (!el.parentElement) break;
      el = el.parentElement;
    }
    // If nothing scrolls, the main page might be the scroll container
    return container;
  }

  /**
   * Scroll the job list until no new cards load (or hit limit).
   * Optional minCardsHint: if set (e.g. target total from page), we do more scroll rounds before trusting "stable".
   */
  async function scrollToLoadAll(minCardsHint) {
    var scrollEl = getScrollableListElement();
    if (!scrollEl) return;

    var prevCount = 0;
    var stableRounds = 0;
    var maxIterations = (minCardsHint != null && minCardsHint > 25) ? 35 : 20; // больше скроллов, если ожидаем много вакансий
    var minStable = (minCardsHint != null && minCardsHint > 25) ? 4 : MAX_SCROLL_STABLE;

    for (var i = 0; i < maxIterations; i++) {
      scrollEl.scrollTop = scrollEl.scrollHeight;
      await sleep(SCROLL_WAIT_MS);

      var currentCount = getJobCardCount();
      if (currentCount === prevCount) {
        stableRounds++;
        if (stableRounds >= minStable) break;
        // Если ещё не набрали minCardsHint и стабильно — даём ещё несколько скроллов (ленивая подгрузка)
        if (minCardsHint != null && currentCount < minCardsHint && stableRounds >= 2 && i < maxIterations - 5) continue;
      } else {
        stableRounds = 0;
        prevCount = currentCount;
      }
    }

    // Scroll back to top for clicking
    scrollEl.scrollTop = 0;
    await sleep(500);
  }

  // ── Work type detection (scoped to right panel) ────────────────────────────

  function getRightPanel() {
    for (var i = 0; i < RIGHT_PANEL_SELECTORS.length; i++) {
      var el = document.querySelector(RIGHT_PANEL_SELECTORS[i]);
      if (el) return el;
    }
    // 2026 fallback: try to find a detail panel by common patterns
    var detailPanel = document.querySelector('[class*="detail"]')
      || document.querySelector('[data-testid*="detail"]')
      || document.querySelector('[role="main"]');
    return detailPanel || null;
  }

  function getWorkTypeFromPanel(panel) {
    if (!panel) return 'unknown';

    // Check badge/insight elements first (legacy selectors)
    var badges = panel.querySelectorAll(
      '.job-details-jobs-unified-top-card__job-insight span, ' +
      '.ui-label[class*="workplace"], ' +
      'span[class*="workplace-type"], ' +
      '.job-details-jobs-unified-top-card__job-insight .tvm__text'
    );
    for (var i = 0; i < badges.length; i++) {
      var bt = (badges[i].textContent || '').toLowerCase();
      if (/\bhybrid\b/.test(bt)) return 'hybrid';
      if (/\bon-?site\b|\bonsite\b|\bin-?office\b/.test(bt)) return 'on-site';
      if (/\bremote\b/.test(bt)) return 'remote';
    }

    // 2026 DOM: check for "Remote" / "Hybrid" / "On-site" in pill/tag elements
    var pills = panel.querySelectorAll('span, button, li');
    for (var j = 0; j < Math.min(pills.length, 80); j++) {
      var pt = (pills[j].textContent || '').trim().toLowerCase();
      // Only match short elements that are likely tags (not full paragraphs)
      if (pt.length > 30) continue;
      if (/^\s*remote\s*$/.test(pt)) return 'remote';
      if (/^\s*hybrid\s*$/.test(pt)) return 'hybrid';
      if (/^\s*on-?site\s*$/.test(pt) || /^\s*onsite\s*$/.test(pt)) return 'on-site';
    }

    // Fallback: text search in the top portion of the panel (first 800 chars)
    var panelText = (panel.innerText || '').toLowerCase();
    var topText = panelText.substring(0, 800);
    if (/\bhybrid\b/.test(topText)) return 'hybrid';
    if (/\bon-?site\b|\bonsite\b|\bin-?office\b/.test(topText)) return 'on-site';
    if (/\bremote\b/.test(topText)) return 'remote';
    return 'unknown';
  }

  function isJobClosedInPanel(panel) {
    if (!panel) return false;
    var text = panel.innerText || '';
    return /no longer accepting applications|applications? (?:are )?closed/i.test(text);
  }

  // ── Right panel parsing ────────────────────────────────────────────────────

  function getPanelJobId() {
    // Try to get job ID from current URL
    var m = window.location.href.match(/currentJobId=(\d+)/);
    if (m) return m[1];
    var m2 = window.location.href.match(/\/jobs\/view\/(\d+)/);
    return m2 ? m2[1] : null;
  }

  /**
   * Lightweight fingerprint of the right panel (first 200 chars + title text).
   * Used to detect when the panel content actually CHANGES after a click.
   */
  function getPanelFingerprint() {
    var panel = getRightPanel();
    if (!panel) return '';
    // Combine URL job ID + top panel text for reliable change detection
    var urlId = getPanelJobId() || '';
    var titleEl = getEl(DETAIL_SELECTORS.title, panel);
    var titleText = titleEl ? titleEl.textContent.trim().substring(0, 80) : '';
    var panelSnippet = (panel.innerText || '').trim().substring(0, 200);
    return urlId + '|' + titleText + '|' + panelSnippet;
  }

  async function waitForPanelToUpdate(expectedJobId, prevFingerprint) {
    // Wait until the right panel CHANGES from its previous state.
    // Two conditions for success: URL matches expectedJobId OR fingerprint changed.
    for (var i = 0; i < PANEL_RETRY_DELAYS.length; i++) {
      await sleep(PANEL_RETRY_DELAYS[i]);

      // Strategy 1: URL contains the expected job ID → panel switched
      var currentUrl = window.location.href;
      if (expectedJobId && currentUrl.indexOf(expectedJobId) !== -1) {
        await sleep(800); // wait for content render
        return true;
      }

      // Strategy 2: panel fingerprint changed from before click
      if (prevFingerprint) {
        var currentFp = getPanelFingerprint();
        if (currentFp && currentFp !== prevFingerprint) {
          await sleep(500); // wait for full render
          return true;
        }
      }
    }
    // Last resort: if URL changed at all, consider it loaded
    if (expectedJobId && window.location.href.indexOf('currentJobId') !== -1) {
      await sleep(1000);
      return true;
    }
    return false;
  }

  // Companies to exclude from capture (not considered for this job search)
  var COMPANY_BLOCKLIST = ['Kraken', 'Toptal'];

  function isBlocklistedCompany(companyName) {
    if (!companyName || typeof companyName !== 'string') return false;
    var c = companyName.trim().toLowerCase();
    for (var i = 0; i < COMPANY_BLOCKLIST.length; i++) {
      if (c === COMPANY_BLOCKLIST[i].toLowerCase()) return true;
    }
    return false;
  }

  // Video-game studios (not iGaming): user does not consider gaming roles. Keep in sync with job-search-utils.cjs VIDEO_GAMING_EXCLUDED_COMPANIES
  var VIDEO_GAMING_EXCLUDED = [
    'fortis games', 'zynga', 'voodoo', 'playrix', 'supercell', 'roblox', 'unity technologies',
    'epic games', 'riot games', 'electronic arts', 'activision', 'nintendo', 'scopely', 'machine zone',
    'social point', 'lilith games', 'playtika', 'miniclip', 'wooga', 'peak games', 'gram games', 'big fish games',
    'userwise'
  ];
  function isVideoGamingCompany(companyName) {
    if (!companyName || typeof companyName !== 'string') return false;
    var c = companyName.trim().toLowerCase();
    for (var i = 0; i < VIDEO_GAMING_EXCLUDED.length; i++) {
      if (c.indexOf(VIDEO_GAMING_EXCLUDED[i]) !== -1) return true;
    }
    return false;
  }
  function isVideoGamingTitle(title) {
    if (!title || typeof title !== 'string') return false;
    return /\b(?:senior\s+)?product\s+manager\s*[·\-–—]\s*games\b/i.test(title) ||
      /\bvideo\s+game\b/i.test(title) || /\bgame\s+studio\b/i.test(title) || /\bgames?\s+(?:product|team)\s+manager\b/i.test(title);
  }
  // Non-PM roles (category/line/sales hybrid): same as NON_PM_TITLE_PATTERNS in generate-search-digest.cjs
  function isNonPMTitleForCapture(title) {
    if (!title || typeof title !== 'string') return false;
    return /\bproduct\s+category\s+manager\b/i.test(title) ||
      /\bproduct\s+line\s+manager\b/i.test(title) ||
      /\b(?:technical\s+)?sales\s*(?:&|and|\s*[-–—])\s*product\s+manager\b/i.test(title);
  }

  // Automotive sector: user does not consider. Keep in sync with job-search-utils.cjs AUTOMOTIVE_EXCLUDED_COMPANIES
  var AUTOMOTIVE_EXCLUDED = ['motorad', 'motor rad'];
  function isAutomotiveForCapture(companyName, title, description) {
    var c = (companyName || '').trim().toLowerCase();
    if (AUTOMOTIVE_EXCLUDED.some(function (name) { return c.indexOf(name) !== -1; })) return true;
    var text = ((title || '') + ' ' + (description || '')).toLowerCase();
    return /\bautomotive\b/.test(text) || /\bauto\s+industry\b/.test(text);
  }

  // Non-English language required (e.g. Arabic Speaker): user considers only English-language roles. Keep in sync with job-search-utils.cjs requiresNonEnglishLanguage.
  var REQUIRES_NON_ENGLISH = [
    /fluent\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)/i,
    /\bfluency\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)\b/i,
    /native\s+(German|Spanish|Portuguese|French|Italian|Arabic)\s+(speaker|language)?/i,
    /\bArabic\s+[Ss]peaker\b/i,
    /(German|Spanish|Portuguese|French|Italian|Arabic)\s+(language\s+)?(proficiency|required|essential|fluent)/i,
    /\bDeutsch\s+auf\s+Muttersprachniveau\b/i,
    /\bdeutschsprachig\b/i,
    /\bin\s+deutscher\s+Sprache\b/i,
    /\bDeutsch-?\s*und\s+Englischkenntnisse\b/i,
    /\bDeutschkenntnisse\b/i,
    /\bfließend(?:em)?\s+(?:in\s+)?Deutsch\b/i,
    /\bsehr\s+gute\s+Deutsch-?\s*und\s+Englisch\b/i
  ];
  function requiresNonEnglishForCapture(title, description) {
    var text = ((title || '') + ' ' + (description || '')).trim();
    if (text.length < 25) return false;  // lowered from 50: catch "Deutsch- und Englischkenntnisse" in shorter snippets
    return REQUIRES_NON_ENGLISH.some(function (re) { return re.test(text); });
  }

  // SAP experience required: user does not consider SAP-focused roles. Keep in sync with job-search-utils.cjs requiresSapExperience.
  var REQUIRES_SAP = [
    /\bSAP\s+(?:HANA|ECC|S\/4HANA|S4HANA)\b/i,
    /\b(?:experience|knowledge|expertise)\s+(?:with|in)\s+SAP\b/i,
    /\bSAP\s+(?:experience|knowledge|expertise)\b/i,
    /\b(?:working\s+with|proficient\s+in)\s+(?:SAP|SAP\s+HANA)\b/i
  ];
  function requiresSapForCapture(title, description) {
    var text = ((title || '') + ' ' + (description || '')).trim();
    if (!text || text.length < 80) return false;
    return REQUIRES_SAP.some(function (re) { return re.test(text); });
  }

  // List of known LinkedIn UI labels that should NEVER be treated as job titles
  var UI_LABEL_BLACKLIST = [
    'people you can reach out to',
    'people they can reach out to',
    'about the job',
    'about this role',
    'similar jobs',
    'premium',
    'job activity',
    'show more',
    'show less',
    'apply',
    'save',
    'share',
    'reposted',
    'promoted',
    'meet the hiring team',
    'skills',
    'how you match',
    'base salary',
    'recommended for you'
  ];

  function isUILabel(text) {
    var t = (text || '').trim().toLowerCase();
    if (t.length < 3 || t.length > 150) return true;
    for (var i = 0; i < UI_LABEL_BLACKLIST.length; i++) {
      if (t.indexOf(UI_LABEL_BLACKLIST[i]) !== -1) return true;
    }
    // Pure numbers or dates are not titles
    if (/^\d+$/.test(t)) return true;
    return false;
  }

  /** Returns true if text looks like a company tagline/slogan rather than a job title (e.g. "We believe in smart execution, continuous improvement"). */
  function looksLikeSloganOrTagline(text) {
    var t = (text || '').trim();
    if (t.length < 10 || t.length > 120) return false;
    if (/,/.test(t)) return true;
    if (/^(We |Our |The |This |At |Why |How we )/i.test(t)) return true;
    if (/\b(we believe|we're |we are |our (?:mission|vision|values|team)|smart execution|continuous improvement)\b/i.test(t)) return true;
    return false;
  }

  function parseRightPanel() {
    var panel = getRightPanel();

    // Click "Show more" to expand full description
    var showMore = document.querySelector(DETAIL_SELECTORS.showMore);
    if (!showMore) {
      showMore = document.querySelector('button[aria-label*="show more" i], button[aria-label*="See more" i]');
    }
    if (showMore) {
      try { showMore.click(); } catch (e) { /* ignore */ }
    }

    var titleEl = getEl(DETAIL_SELECTORS.title, panel || document);
    var companyEl = getEl(DETAIL_SELECTORS.company, panel || document);
    var locationEl = getEl(DETAIL_SELECTORS.location, panel || document);
    var descEl = getEl(DETAIL_SELECTORS.description, panel || document);

    var title = titleEl ? titleEl.textContent.trim() : '';
    var company = companyEl ? companyEl.textContent.split('\n')[0].trim() : '';
    var location = locationEl ? locationEl.textContent.split('\u00b7')[0].trim() : '';
    var description = descEl ? extractText(descEl) : '';

    // Validate title: reject UI labels and company taglines/slogans (e.g. "We believe in smart execution, continuous improvement")
    if (isUILabel(title)) title = '';
    if (title && looksLikeSloganOrTagline(title)) title = '';

    // Fallback title: look for <a> with /jobs/view/ in the panel (the actual job title link)
    if (!title && panel) {
      var titleLinks = panel.querySelectorAll('a[href*="/jobs/view/"]');
      for (var tl = 0; tl < titleLinks.length; tl++) {
        var linkText = (titleLinks[tl].textContent || '').trim();
        if (linkText.length > 3 && linkText.length < 120 && !isUILabel(linkText) && !looksLikeSloganOrTagline(linkText)) {
          title = linkText;
          break;
        }
      }
    }

    // Fallback title: h1/h2 in top-card area (scoped tightly); skip slogan-like headings
    if (!title && panel) {
      var topCard = panel.querySelector('[class*="top-card"], [class*="topcard"]');
      var searchRoot = topCard || panel;
      var headings = searchRoot.querySelectorAll('h1, h2');
      for (var hi = 0; hi < headings.length; hi++) {
        var ht = (headings[hi].textContent || '').trim();
        if (!isUILabel(ht) && !looksLikeSloganOrTagline(ht)) {
          title = ht;
          break;
        }
      }
    }

    // Company fallback: first /company/ link in panel
    if (!company && panel) {
      var companyLink = panel.querySelector('a[href*="/company/"]');
      if (companyLink) company = companyLink.textContent.trim();
    }

    // Description fallback: text after "About the job" header (full text, no truncation)
    if (!description && panel) {
      var panelText = panel.innerText || '';
      var aboutIdx = panelText.indexOf('About the job');
      if (aboutIdx === -1) aboutIdx = panelText.indexOf('About this role');
      if (aboutIdx !== -1) {
        description = panelText.substring(aboutIdx + 15).trim();
      } else if (panelText.length > 300) {
        description = panelText.trim();
      }
    }

    return {
      title: title,
      company: company,
      location: location,
      description: description,
      workType: getWorkTypeFromPanel(panel || document.body),
      closed: isJobClosedInPanel(panel || document.body)
    };
  }

  // ── Pagination ─────────────────────────────────────────────────────────────

  /** LinkedIn uses start=0,25,50,... in URL for pages 1,2,3,... */
  function getStartFromUrl() {
    var m = window.location.href.match(/[?&]start=(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function getCurrentPageNum() {
    var btn = document.querySelector(PAGINATION_SELECTORS.currentPage);
    if (btn) {
      var num = parseInt(btn.textContent.trim(), 10);
      if (!isNaN(num)) return num;
    }
    // Fallback: derive from URL start param (25 per page)
    var start = getStartFromUrl();
    return Math.floor(start / 25) + 1;
  }

  function getNextPageButton() {
    // 2026 DOM: dedicated next button with data-testid or aria-label
    var nextSelectors = PAGINATION_SELECTORS.nextButton.split(/,\s*/);
    for (var s = 0; s < nextSelectors.length; s++) {
      var nextBtn = document.querySelector(nextSelectors[s].trim());
      if (nextBtn && !nextBtn.disabled) return nextBtn;
    }
    // Fallback: button whose text is "Next"
    var allButtons = document.querySelectorAll('button[class*="pagination"], nav button, [role="navigation"] button');
    for (var b = 0; b < allButtons.length; b++) {
      if (/^\s*next\s*$/i.test((allButtons[b].textContent || '').trim()) && !allButtons[b].disabled) return allButtons[b];
    }
    // Fallback: page number button = currentPage + 1 (номера страниц: 1, 2, 3...)
    var currentNum = getCurrentPageNum();
    var buttons = document.querySelectorAll(PAGINATION_SELECTORS.allPages);
    for (var i = 0; i < buttons.length; i++) {
      var num = parseInt(buttons[i].textContent.trim(), 10);
      if (!isNaN(num) && num === currentNum + 1) return buttons[i];
    }
    // Доп. поиск: любой кликабельный элемент с текстом "2", "3" и т.д. в блоке пагинации
    var nav = document.querySelector('nav[aria-label*="Pagination"], [role="navigation"], .jobs-search-results-pagination, [class*="pagination"]');
    if (nav) {
      var links = nav.querySelectorAll('button, a[href*="start="], span[role="button"], li button, li a');
      for (var j = 0; j < links.length; j++) {
        var t = (links[j].textContent || '').trim();
        if (t === String(currentNum + 1) && !links[j].disabled) return links[j];
      }
    }
    return null;
  }

  function hasMorePages() {
    return !!getNextPageButton();
  }

  /**
   * Переход на следующую страницу через URL (start=25, 50, ...).
   * Надёжно работает, когда пагинация по номерам страниц и кнопка Next не находится.
   */
  function goToNextPageByUrl() {
    var prevStart = getStartFromUrl();
    var nextStart = prevStart + 25;
    var url = window.location.href;
    var newUrl;
    if (url.indexOf('start=') !== -1) {
      newUrl = url.replace(/([?&])start=\d+/, '$1start=' + nextStart);
    } else {
      newUrl = url + (url.indexOf('?') !== -1 ? '&' : '?') + 'start=' + nextStart;
    }
    if (newUrl === url) return false;
    window.location.href = newUrl;
    return true;
  }

  async function goToNextPage() {
    var prevPage = getCurrentPageNum();
    var prevStart = getStartFromUrl();
    var prevUrl = window.location.href;
    var nextStart = prevPage * 25; // page 2 -> start=25, page 3 -> start=50

    // 1) Сначала пробуем кнопку (Next или номер страницы)
    var btn = getNextPageButton();
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(500);
      btn.click();
      await sleep(PAGINATION_WAIT_MS);

      for (var attempt = 0; attempt < 8; attempt++) {
        var nowStart = getStartFromUrl();
        var nowPage = getCurrentPageNum();
        var urlChanged = window.location.href !== prevUrl;

        if (nowStart >= nextStart) return true;
        if (nowPage === prevPage + 1) return true;
        if (urlChanged && getJobCardCount() > 0) return true;

        await sleep(1500);
      }
    }

    // 2) Если кнопка не сработала или не найдена — переход по URL (start=25, 50, ...)
    console.log('[Dex] Next/Page button not found or click had no effect. Trying URL navigation (start=' + nextStart + ').');
    try {
      sessionStorage.setItem('dexAutoCaptureRequested', '1');
      sessionStorage.removeItem('dexAutoCaptureFired');
    } catch (e) {}
    goToNextPageByUrl();
    // После location.href страница перезагрузится; на новой странице init() увидит dexAutoCaptureRequested и вызовет startCapture (resume)
    return true;
  }

  // ── State management ───────────────────────────────────────────────────────

  function loadState() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(['dexSearchState'], function (result) {
        resolve(result.dexSearchState || null);
      });
    });
  }

  function saveState(state) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ dexSearchState: state }, resolve);
    });
  }

  function clearState() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove('dexSearchState', resolve);
    });
  }

  // ── Auto-save JSON (automatic, no user interaction) ────────────────────────

  function sendToBackground(jsonStr, filename) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(
          { action: 'downloadJson', data: jsonStr, filename: filename },
          function (resp) {
            if (chrome.runtime.lastError) {
              console.warn('[Dex] sendMessage error:', chrome.runtime.lastError.message);
              resolve({ ok: false, error: chrome.runtime.lastError.message });
            } else if (resp && resp.ok) {
              resolve(resp);
            } else {
              resolve({ ok: false, error: (resp && resp.error) || 'no response' });
            }
          }
        );
      } catch (e) {
        console.warn('[Dex] sendMessage exception:', e.message);
        resolve({ ok: false, error: e.message });
      }
    });
  }

  async function autoSaveJson(capturedJobs, skippedIds, stats) {
    var query = getSearchQuery();
    var slug = slugify(query) || 'search';
    var filename = 'dex-linkedin-search-' + slug + '-' + todayStr() + '.json';

    var filterResults = {};
    var jobs = {};
    var jobIds = Object.keys(capturedJobs);

    for (var i = 0; i < jobIds.length; i++) {
      var jobId = jobIds[i];
      var data = capturedJobs[jobId];
      filterResults[jobId] = {
        remove: false,
        title: data.job_title,
        company: data.company,
        workType: data.work_type || 'Remote'
      };
      jobs[jobId] = {
        job_title: data.job_title,
        company: data.company,
        work_type: data.work_type || 'Remote',
        location: data.location || '',
        job_description: data.job_description || ''
      };
    }

    var payload = {
      searchQuery: query,
      searchUrl: window.location.href,
      exportedAt: new Date().toISOString(),
      stats: {
        total: stats.remote + stats.hybrid + stats.onsite + stats.failed,
        remote: stats.remote,
        hybrid: stats.hybrid,
        onsite: stats.onsite,
        failed: stats.failed
      },
      filter: { results: filterResults },
      jobs: jobs,
      failedIds: skippedIds
    };

    var jsonStr = JSON.stringify(payload, null, 2);

    var SAVE_SERVER_URL = 'http://127.0.0.1:8765/dex-save';

    // Attempt 1: send to background (native messaging)
    if (DEBUG_ONE_JOB) console.log('[Dex] Save attempt 1: native messaging');
    var resp = await sendToBackground(jsonStr, filename);
    if (resp.ok) {
      console.log('[Dex] Auto-saved:', filename, 'via', resp.method || 'native');
      return { filename: filename, savedToFile: true };
    }
    if (DEBUG_ONE_JOB) console.log('[Dex] Save attempt 1 failed:', resp.error || 'no response');

    // Attempt 2: retry native after 2s (service worker may need to wake up)
    if (DEBUG_ONE_JOB) console.log('[Dex] Save attempt 2: retry native after 2s');
    console.log('[Dex] Retrying save after 2s...');
    await sleep(2000);
    resp = await sendToBackground(jsonStr, filename);
    if (resp.ok) {
      console.log('[Dex] Auto-saved (retry):', filename, 'via', resp.method || 'native');
      return { filename: filename, savedToFile: true };
    }
    if (DEBUG_ONE_JOB) console.log('[Dex] Save attempt 2 failed:', resp.error || 'no response');

    // Attempt 3: local save server (run: node save-server.cjs)
    if (DEBUG_ONE_JOB) console.log('[Dex] Save attempt 3: local server', SAVE_SERVER_URL);
    try {
      var fetchResp = await fetch(SAVE_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Filename': filename },
        body: jsonStr
      });
      var fetchJson = await fetchResp.json().catch(function () { return {}; });
      if (fetchResp.ok && fetchJson && fetchJson.ok) {
        console.log('[Dex] Auto-saved:', filename, 'via server:', fetchJson.path || '');
        return { filename: filename, savedToFile: true };
      }
      if (DEBUG_ONE_JOB) console.log('[Dex] Save attempt 3 failed:', fetchResp.status, fetchJson.error || fetchResp.statusText);
    } catch (e) {
      if (DEBUG_ONE_JOB) console.log('[Dex] Save attempt 3 failed (network):', e.message);
    }

    // Last resort: save to chrome.storage.local so data isn't lost
    console.error('[Dex] All save methods failed. Storing in chrome.storage.local as backup.');
    try {
      await new Promise(function (resolve) {
        chrome.storage.local.set({ dexLastExport: payload, dexLastExportFilename: filename }, resolve);
      });
      console.log('[Dex] Data backed up to chrome.storage.local (key: dexLastExport)');
    } catch (e) {
      console.error('[Dex] Even chrome.storage.local failed:', e.message);
    }

    return { filename: filename, savedToFile: false };
  }

  /** Trigger download of backup from chrome.storage.local (one-time recovery). */
  function downloadBackupFromStorage() {
    chrome.storage.local.get(['dexLastExport', 'dexLastExportFilename'], function (result) {
      var payload = result.dexLastExport;
      var filename = result.dexLastExportFilename || 'dex-linkedin-search-backup.json';
      if (!payload) {
        console.warn('[Dex] No backup in storage.');
        return;
      }
      var jsonStr = JSON.stringify(payload, null, 2);
      var blob = new Blob([jsonStr], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      console.log('[Dex] Backup downloaded:', filename);
    });
  }

  // ── UI (floating indicator, no manual actions required) ────────────────────

  var uiContainer = null;
  var stopRequested = false;

  function isDexGlobalStopRequested() {
    try {
      return typeof window !== 'undefined' && !!window.__dexStopRequested;
    } catch (e) {
      return false;
    }
  }

  function createUI() {
    if (document.getElementById('dex-search-capture-ui')) {
      uiContainer = document.getElementById('dex-search-capture-ui');
      return uiContainer;
    }
    uiContainer = document.createElement('div');
    uiContainer.id = 'dex-search-capture-ui';
    uiContainer.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:99999;' +
      'background:#0a66c2;color:#fff;padding:10px 14px;border-radius:8px;' +
      'font-size:13px;font-family:system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.3);' +
      'display:flex;flex-direction:column;gap:6px;min-width:280px;' +
      'pointer-events:auto;';
    document.body.appendChild(uiContainer);
    return uiContainer;
  }

  function updateUI(html) {
    if (!uiContainer) createUI();
    uiContainer.innerHTML = html;
  }

  function removeUI() {
    if (uiContainer) { uiContainer.remove(); uiContainer = null; }
  }

  function showCaptureButton(totalResults, isResume, resumeDone) {
    createUI();
    var label = isResume
      ? 'Resume (' + resumeDone + ' done)'
      : 'Capture ' + totalResults + ' results';

    updateUI(
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<span style="font-weight:600;">Dex Search</span>' +
        '<button type="button" id="dex-start-capture" style="' +
          'background:#fff;color:#0a66c2;border:none;padding:5px 12px;' +
          'border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;' +
        '">' + label + '</button>' +
      '</div>'
    );
    document.getElementById('dex-start-capture').addEventListener('click', startCapture);

    // Auto-start when URL had/has dex-auto-capture=1 (we store it early in case LinkedIn strips param)
    function hasAutoCaptureParam() {
      var q = (location.search || '') + (location.hash || '');
      return q.indexOf('dex-auto-capture=1') !== -1 || sessionStorage.getItem('dexAutoCaptureRequested') === '1';
    }
    function tryAutoStart() {
      if (sessionStorage.getItem('dexAutoCaptureFired') || captureRunning) return;
      if (!hasAutoCaptureParam()) return;
      sessionStorage.removeItem('dexAutoCaptureRequested');
      sessionStorage.setItem('dexAutoCaptureFired', '1');
      console.log('[Dex] Auto-starting capture now (dex-auto-capture=1)');
      startCapture();
    }
    if (hasAutoCaptureParam() && !sessionStorage.getItem('dexAutoCaptureFired')) {
      console.log('[Dex] dex-auto-capture=1 detected (URL or requested), starting capture in 4s');
      setTimeout(tryAutoStart, 4000);
      setTimeout(tryAutoStart, 8000);
    }
  }

  /**
   * Parse total results string to a number for "process until we have this many".
   * "85" -> 85, "99+" -> 99, "1,234" -> 1234. Returns null if unparseable.
   */
  function parseTotalResults(totalResultsText) {
    if (!totalResultsText || typeof totalResultsText !== 'string') return null;
    var t = totalResultsText.trim().replace(/,/g, '');
    var m = t.match(/^(\d+)\+?$/);
    return m ? parseInt(m[1], 10) : null;
  }

  /**
   * Extract total results count from LinkedIn search page header.
   * E.g. "99+ results", "1,234 results", "150 results".
   * Returns string like "99+" or "1,234", or null if not found.
   */
  function getTotalResultsText() {
    // Try multiple selectors for the results count header
    var candidates = document.querySelectorAll(
      '.jobs-search-results-list__subtitle, ' +
      '.jobs-search-results-list__title-heading h2, ' +
      '.jobs-search-results-list__title-heading, ' +
      'header h2, ' +
      'span[class*="results"], ' +
      'div[class*="results-context"]'
    );
    for (var i = 0; i < candidates.length; i++) {
      var t = (candidates[i].textContent || '').trim();
      // Match patterns like "99+ results", "1,234 results", "150 результатов"
      var m = t.match(/([\d,\.]+\+?)\s+result/i);
      if (m) return m[1];
    }
    // Fallback: search visible text for "N results" pattern
    var allH2 = document.querySelectorAll('h2, h3, span');
    for (var j = 0; j < Math.min(allH2.length, 50); j++) {
      var txt = (allH2[j].textContent || '').trim();
      if (txt.length > 50) continue;
      var m2 = txt.match(/([\d,\.]+\+?)\s+result/i);
      if (m2) return m2[1];
    }
    return null;
  }

  var lastProgressSent = { page: -1, processed: -1 };
  function sendProgressToServer(globalProcessed, totalResults, pageNum, stats) {
    var send = lastProgressSent.processed < 0 ||
      lastProgressSent.page !== pageNum ||
      globalProcessed - lastProgressSent.processed >= 10;
    if (!send) return;
    lastProgressSent = { page: pageNum, processed: globalProcessed };
    try {
      chrome.runtime.sendMessage({
        action: 'dexCaptureProgress',
        payload: {
          page: pageNum,
          processed: globalProcessed,
          total: totalResults,
          remote: (stats && stats.remote) || 0
        }
      });
    } catch (e) {}
  }

  function showProgress(globalProcessed, totalResults, pageNum, stats) {
    sendProgressToServer(globalProcessed, totalResults, pageNum, stats);
    var parts = [];
    parts.push(stats.remote + ' remote');
    if (stats.hybrid > 0) parts.push(stats.hybrid + ' hybrid');
    if (stats.onsite > 0) parts.push(stats.onsite + ' on-site');
    if (stats.failed > 0) parts.push(stats.failed + ' failed');

    var progressText = globalProcessed + '/' + totalResults;

    updateUI(
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<span style="font-weight:600;">Dex: p.' + pageNum + ' \u2014 ' + progressText + '</span>' +
        '<button type="button" id="dex-stop-capture" style="' +
          'background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);' +
          'padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;' +
        '">Stop</button>' +
      '</div>' +
      '<span style="font-size:12px;opacity:.9;">' + parts.join(', ') + '</span>'
    );
    var stopBtn = document.getElementById('dex-stop-capture');
    if (stopBtn) stopBtn.addEventListener('click', function () { stopRequested = true; });
  }

  function showDone(stats, filename, totalResultsText, savedToFile) {
    var processed = stats.remote + stats.hybrid + stats.onsite + stats.failed;
    var parts = [];
    parts.push(stats.remote + ' remote');
    if (stats.hybrid > 0) parts.push(stats.hybrid + ' hybrid');
    if (stats.onsite > 0) parts.push(stats.onsite + ' on-site');
    if (stats.failed > 0) parts.push(stats.failed + ' failed');

    var backupHtml = (savedToFile === false && filename)
      ? '<button type="button" id="dex-download-backup" style="' +
          'background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.4);' +
          'padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;margin-top:4px;' +
        '">Download backup (JSON)</button>'
      : '';

    updateUI(
      '<span style="font-weight:600;">Done \u2014 ' + stats.remote + ' remote captured</span>' +
      '<span style="font-size:11px;opacity:.8;">' + parts.join(' \u00b7 ') + ' = ' + processed + '/' + totalResultsText + ' processed</span>' +
      (filename ? '<span style="font-size:11px;opacity:.7;">' + (savedToFile ? 'Saved: ' : 'Backup: ') + filename + '</span>' : '') +
      backupHtml
    );
    var backupBtn = document.getElementById('dex-download-backup');
    if (backupBtn) backupBtn.addEventListener('click', function () { downloadBackupFromStorage(); });
    setTimeout(removeUI, savedToFile === false ? 60000 : 12000); // keep UI longer when backup needed
  }

  // ── Main capture logic ─────────────────────────────────────────────────────

  var captureRunning = false;

  async function startCapture() {
    if (captureRunning) return;
    captureRunning = true;
    stopRequested = false;

    var currentSearchUrl = normalizeSearchUrl(window.location.href);

    // Load or create state
    var state = await loadState();
    var isResume = state
      && state.status === 'capturing'
      && normalizeSearchUrl(state.searchUrl) === currentSearchUrl;

    if (!isResume) {
      state = {
        searchUrl: currentSearchUrl,
        searchQuery: getSearchQuery(),
        currentPage: getCurrentPageNum(),
        processedIds: [],
        capturedJobs: {},
        skippedIds: [],
        hybridCount: 0,
        onsiteCount: 0,
        status: 'capturing'
      };
    }

    state.status = 'capturing';
    // Ensure new fields exist on legacy state
    if (state.hybridCount == null) state.hybridCount = 0;
    if (state.onsiteCount == null) state.onsiteCount = 0;
    await saveState(state);

    var processedSet = {};
    for (var pi = 0; pi < state.processedIds.length; pi++) {
      processedSet[state.processedIds[pi]] = true;
    }

    var captured = Object.keys(state.capturedJobs).length;
    var hybridCount = state.hybridCount;
    var onsiteCount = state.onsiteCount;
    var failed = state.skippedIds.length;

    // Stats object passed to UI functions
    function makeStats() {
      return { remote: captured, hybrid: hybridCount, onsite: onsiteCount, failed: failed };
    }

    // If resuming, navigate to saved page
    if (isResume && state.currentPage > getCurrentPageNum()) {
      while (getCurrentPageNum() < state.currentPage && !stopRequested && !isDexGlobalStopRequested()) {
        if (!(await goToNextPage())) break;
      }
    }

    // Get total results count from the page (e.g. "99+", "1,234") — парсим целевое число, доходим до конца
    var totalResultsText = getTotalResultsText() || '?';
    var targetTotal = parseTotalResults(totalResultsText);
    if (targetTotal != null) console.log('[Dex] Target total from page:', targetTotal, '(will capture until reached or no more pages)');
    var globalProcessed = state.processedIds.length;

    // Process pages until we've processed targetTotal or there are no more pages
    var continueCapture = true;
    var emptyPagesInRow = 0; // pages with zero new cards → stop after 2
    captureLoop: while (continueCapture && !stopRequested && !isDexGlobalStopRequested()) {
      var pageNum = getCurrentPageNum();
      state.currentPage = pageNum;

      // Phase 1: scroll to load all cards (pass target so we scroll enough on first pages)
      await scrollToLoadAll(targetTotal);
      var cards = getJobCards();
      if (DEBUG_ONE_JOB && cards.length > 1) {
        cards = cards.slice(0, 1);
        console.log('[Dex] Debug: limited to 1 card');
      }
      var newCardsOnPage = 0; // track how many cards were actually new

      // Phase 2: click through each card
      for (var ci = 0; ci < cards.length; ci++) {
        if (stopRequested) break;

        var card = cards[ci];
        var jobId = card.jobId;
        var isPending = card.pendingId === true;

        // Skip already-processed cards (only for resolved IDs)
        if (!isPending && processedSet[jobId]) continue;

        newCardsOnPage++;
        globalProcessed++;

        // ── Pre-filter using card metadata (skip without clicking) ──
        var cardMeta = extractCardMeta(card.element);
        if (isBlocklistedCompany(cardMeta.company)) {
          console.log('[Dex] Pre-filtered (blocklist):', cardMeta.company, cardMeta.title);
          var filterKeyB = isPending ? ('_blocklist_' + cardMeta.title) : jobId;
          processedSet[filterKeyB] = true;
          state.processedIds.push(filterKeyB);
          await saveState(state);
          showProgress(globalProcessed, totalResultsText, pageNum, makeStats());
          await sleep(300);
          continue;
        }
        if (isVideoGamingCompany(cardMeta.company) || isVideoGamingTitle(cardMeta.title)) {
          console.log('[Dex] Pre-filtered (video gaming, not iGaming):', cardMeta.company, cardMeta.title);
          var filterKeyG = isPending ? ('_filtered_gaming_' + cardMeta.title) : jobId;
          processedSet[filterKeyG] = true;
          state.processedIds.push(filterKeyG);
          await saveState(state);
          showProgress(globalProcessed, totalResultsText, pageNum, makeStats());
          await sleep(300);
          continue;
        }
        if (isNonPMTitleForCapture(cardMeta.title)) {
          console.log('[Dex] Pre-filtered (non-PM: category/line/sales):', cardMeta.title);
          var filterKeyN = isPending ? ('_filtered_nonpm_' + cardMeta.title) : jobId;
          processedSet[filterKeyN] = true;
          state.processedIds.push(filterKeyN);
          await saveState(state);
          showProgress(globalProcessed, totalResultsText, pageNum, makeStats());
          await sleep(300);
          continue;
        }
        if (isAutomotiveForCapture(cardMeta.company, cardMeta.title, '')) {
          console.log('[Dex] Pre-filtered (automotive):', cardMeta.company, cardMeta.title);
          var filterKeyAuto = isPending ? ('_filtered_automotive_' + cardMeta.title) : jobId;
          processedSet[filterKeyAuto] = true;
          state.processedIds.push(filterKeyAuto);
          await saveState(state);
          showProgress(globalProcessed, totalResultsText, pageNum, makeStats());
          await sleep(300);
          continue;
        }
        if (/\bremote\s+from\s+nigeria\b/i.test((cardMeta.title || '') + ' ' + (cardMeta.location || ''))) {
          console.log('[Dex] Pre-filtered (card-level): remote-from excluded country', cardMeta.title);
          var filterKeyR = isPending ? ('_filtered_remote_from_' + (cardMeta.title || '')) : jobId;
          processedSet[filterKeyR] = true;
          state.processedIds.push(filterKeyR);
          await saveState(state);
          showProgress(globalProcessed, totalResultsText, pageNum, makeStats());
          await sleep(300);
          continue;
        }
        if (cardMeta.workTypeHint === 'hybrid' || cardMeta.workTypeHint === 'on-site') {
          console.log('[Dex] Pre-filtered (card-level):', cardMeta.workTypeHint, cardMeta.title);
          if (cardMeta.workTypeHint === 'hybrid') { hybridCount++; state.hybridCount = hybridCount; }
          else { onsiteCount++; state.onsiteCount = onsiteCount; }
          var filterKey = isPending ? ('_filtered_' + cardMeta.title) : jobId;
          processedSet[filterKey] = true;
          state.processedIds.push(filterKey);
          await saveState(state);
          showProgress(globalProcessed, totalResultsText, pageNum, makeStats());
          await sleep(300);
          continue;
        }

        showProgress(globalProcessed, totalResultsText, pageNum, makeStats());

        var clickTime = Date.now();

        // ── Capture panel fingerprint BEFORE clicking ──
        var prevFingerprint = getPanelFingerprint();

        // Click card to load right panel details
        await clickCard(card);

        // ── Resolve pending ID from URL after clicking ──
        if (isPending) {
          await sleep(1500);
          var resolvedId = getPanelJobId();
          if (resolvedId) {
            jobId = resolvedId;
            card.jobId = resolvedId;
            card.pendingId = false;
            console.log('[Dex] Resolved pending ID to:', resolvedId);
            if (processedSet[jobId]) {
              var skipE = Date.now() - clickTime;
              if (skipE < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipE);
              continue;
            }
          } else {
            console.warn('[Dex] Could not resolve pending ID from URL, skipping');
            failed++;
            var skipE2 = Date.now() - clickTime;
            if (skipE2 < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipE2);
            continue;
          }
        }

        // Wait for right panel to CHANGE (not just exist)
        var panelLoaded = await waitForPanelToUpdate(jobId, prevFingerprint);

        if (!panelLoaded) {
          console.warn('[Dex] Panel did not change for', jobId, '— panel may be stuck');
        }

        // After dispatch click, URL must show this job — otherwise panel is stale. One retry after 1.5s for slow LinkedIn updates.
        var panelJobId = getPanelJobId();
        if (card._clickMode === 'dispatch' && panelJobId !== jobId) {
          await sleep(1500);
          panelJobId = getPanelJobId();
        }
        if (card._clickMode === 'dispatch' && panelJobId !== jobId) {
          console.warn('[Dex] Dispatch click: URL still shows job', panelJobId, 'not', jobId, '— skipping');
          state.skippedIds.push(jobId);
          failed++;
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipE4 = Date.now() - clickTime;
          if (skipE4 < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipE4);
          continue;
        }

        // Parse right panel
        var data = parseRightPanel();

        // Filter on the fly (right panel check for ambiguous work types)
        if (data.workType === 'hybrid' || data.workType === 'on-site' || data.closed) {
          console.log('[Dex] Panel-filtered:', data.workType, data.title || cardMeta.title);
          if (data.workType === 'hybrid') { hybridCount++; state.hybridCount = hybridCount; }
          else { onsiteCount++; state.onsiteCount = onsiteCount; }
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);

          var skipElapsed = Date.now() - clickTime;
          if (skipElapsed < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipElapsed);
          continue;
        }

        // Determine final values with fallbacks (never use UI labels as title)
        var finalTitle = data.title || cardMeta.title || '';
        if (finalTitle && isUILabel(finalTitle)) finalTitle = '';
        var finalCompany = data.company || cardMeta.company || '';
        var finalLocation = data.location || cardMeta.location || '';
        var finalWorkType = data.workType !== 'unknown' ? data.workType : (cardMeta.workTypeHint || 'unknown');
        var finalDesc = data.description || '';

        // Exclude blocklisted companies (panel may have company when card did not)
        if (isBlocklistedCompany(finalCompany)) {
          console.log('[Dex] Panel-filtered (blocklist):', finalCompany, finalTitle);
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipBlock = Date.now() - clickTime;
          if (skipBlock < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipBlock);
          continue;
        }
        if (isVideoGamingCompany(finalCompany) || isVideoGamingTitle(finalTitle)) {
          console.log('[Dex] Panel-filtered (video gaming, not iGaming):', finalCompany, finalTitle);
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipGaming = Date.now() - clickTime;
          if (skipGaming < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipGaming);
          continue;
        }
        if (isNonPMTitleForCapture(finalTitle)) {
          console.log('[Dex] Panel-filtered (non-PM: category/line/sales):', finalTitle);
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipNonPM = Date.now() - clickTime;
          if (skipNonPM < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipNonPM);
          continue;
        }
        if (isAutomotiveForCapture(finalCompany, finalTitle, finalDesc)) {
          console.log('[Dex] Panel-filtered (automotive):', finalCompany, finalTitle);
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipAuto = Date.now() - clickTime;
          if (skipAuto < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipAuto);
          continue;
        }

        // Exclude "Remote from [country]" where user won't work (e.g. Nigeria). Keep in sync with job-search-utils.cjs REMOTE_FROM_EXCLUDED_COUNTRIES
        if (/\bremote\s+from\s+nigeria\b/i.test(finalTitle + ' ' + finalLocation + ' ' + (finalDesc || ''))) {
          console.log('[Dex] Panel-filtered (remote-from excluded country):', finalTitle);
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipRemoteFrom = Date.now() - clickTime;
          if (skipRemoteFrom < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipRemoteFrom);
          continue;
        }

        // Exclude roles requiring non-English language (e.g. Arabic Speaker). Keep in sync with job-search-utils.cjs requiresNonEnglishLanguage
        if (requiresNonEnglishForCapture(finalTitle, finalDesc)) {
          console.log('[Dex] Panel-filtered (non-English language required, e.g. Arabic):', finalTitle);
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipLang = Date.now() - clickTime;
          if (skipLang < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipLang);
          continue;
        }

        // Exclude roles requiring SAP experience. Keep in sync with job-search-utils.cjs requiresSapExperience
        if (requiresSapForCapture(finalTitle, finalDesc)) {
          console.log('[Dex] Panel-filtered (SAP experience required):', finalTitle);
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipSap = Date.now() - clickTime;
          if (skipSap < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipSap);
          continue;
        }

        // If we have almost nothing AND the panel didn't change, mark as failed
        // Also: if we had to use dispatch click and panel didn't change, treat as failed
        if ((!finalTitle && !finalDesc && !panelLoaded) ||
            (card._clickMode === 'dispatch' && !panelLoaded)) {
          console.warn('[Dex] No reliable data for', jobId, '(clickMode:', card._clickMode || 'unknown', ') — marking as failed');
          state.skippedIds.push(jobId);
          failed++;
          processedSet[jobId] = true;
          state.processedIds.push(jobId);
          await saveState(state);
          var skipE3 = Date.now() - clickTime;
          if (skipE3 < SKIP_DELAY_MS) await sleep(SKIP_DELAY_MS - skipE3);
          continue;
        }

        // Save captured job
        state.capturedJobs[jobId] = {
          id: jobId,
          url: 'https://www.linkedin.com/jobs/view/' + jobId,
          job_title: finalTitle || '\u2014',
          company: finalCompany || '\u2014',
          location: finalLocation,
          work_type: finalWorkType,
          job_description: finalDesc,
          closed: false
        };
        captured++;
        console.log('[Dex] Captured:', finalTitle, '@', finalCompany, '(' + finalWorkType + ')');
        processedSet[jobId] = true;
        state.processedIds.push(jobId);
        await saveState(state);

        showProgress(globalProcessed, totalResultsText, pageNum, makeStats());

        // Enforce minimum delay between clicks
        var elapsed = Date.now() - clickTime;
        if (elapsed < CLICK_DELAY_MS) await sleep(CLICK_DELAY_MS - elapsed);

        // Debug: stop after first captured job (exit both for and while)
        if (DEBUG_ONE_JOB && captured >= 1) {
          console.log('[Dex] Debug: 1 job captured, stopping.');
          continueCapture = false;
          break captureLoop;
        }
      }

      // Достигли целевого числа — выходим
      if (targetTotal != null && globalProcessed >= targetTotal) {
        console.log('[Dex] Reached target:', globalProcessed + ' >= ' + targetTotal);
        continueCapture = false;
        break;
      }

      // ── Pagination protection: if no new cards on this page, stop after 2 such pages ──
      if (newCardsOnPage === 0) {
        emptyPagesInRow++;
        console.log('[Dex] Page', pageNum, 'had 0 new cards (' + emptyPagesInRow + ' empty pages in a row)');
        if (emptyPagesInRow >= 2) {
          console.log('[Dex] Stopping: 2 consecutive pages with no new cards');
          break;
        }
      } else {
        emptyPagesInRow = 0;
      }

      // Pagination
      if (stopRequested) break;

      if (hasMorePages()) {
        var prevPageNum = pageNum;
        var nextOk = await goToNextPage();
        if (!nextOk) {
          await sleep(3000);
          nextOk = await goToNextPage();
        }
        if (nextOk && getCurrentPageNum() !== prevPageNum) {
          state.currentPage = getCurrentPageNum();
          await saveState(state);
        } else {
          // Пагинация оборвалась — сохраняем состояние для возобновления, не очищаем
          console.warn('[Dex] Pagination failed or page did not change. Saving state for resume.');
          state.status = 'capturing';
          await saveState(state);
          if (Object.keys(state.capturedJobs).length > 0) {
            var partialResult = await autoSaveJson(state.capturedJobs, state.skippedIds, makeStats());
            console.log('[Dex] Partial export saved:', partialResult.filename, '(' + Object.keys(state.capturedJobs).length + ' jobs). Re-open this search URL to resume.');
          }
          updateUI(
            '<span style="font-weight:600;">Pagination stopped.</span>' +
            '<span style="font-size:11px;">Processed ' + globalProcessed + '/' + totalResultsText + '. Re-open this search and click Capture to resume from page ' + getCurrentPageNum() + '.</span>'
          );
          setTimeout(removeUI, 25000);
          captureRunning = false;
          return;
        }
      } else {
        // Нет кнопки "Next" — возможно бесконечный скролл: один раз ещё скроллим и проверяем
        if (targetTotal != null && globalProcessed < targetTotal) {
          console.log('[Dex] No Next button but only ' + globalProcessed + '/' + targetTotal + ' processed. Trying one more scroll round (infinite scroll).');
          await scrollToLoadAll(targetTotal);
          await sleep(2000);
          var extraCards = getJobCards();
          var extraNew = 0;
          for (var ei = 0; ei < extraCards.length; ei++) {
            if (!processedSet[extraCards[ei].jobId]) extraNew++;
          }
          if (extraNew > 0) {
            console.log('[Dex] Loaded ' + extraNew + ' more cards after extra scroll. Continuing.');
            emptyPagesInRow = 0;
            continue;
          }
        }
        continueCapture = false;
      }
    }

    // Phase 3: auto-save
    state.status = 'done';
    await saveState(state);

    var saveResult = { filename: '', savedToFile: true };
    if (Object.keys(state.capturedJobs).length > 0) {
      saveResult = await autoSaveJson(state.capturedJobs, state.skippedIds, makeStats());
    }
    var finalStats = makeStats();

    showDone(finalStats, saveResult.filename, totalResultsText, saveResult.savedToFile);
    await clearState();
    captureRunning = false;
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  async function init() {
    console.log('[Dex] search-capture.js init, URL:', location.href);

    // If trigger page set the flag (LinkedIn strips URL param), copy to sessionStorage for auto-start
    var stored = await new Promise(function (r) { chrome.storage.local.get(['dexAutoCaptureRequested'], r); });
    if (stored.dexAutoCaptureRequested === '1') {
      sessionStorage.setItem('dexAutoCaptureRequested', '1');
      chrome.storage.local.remove('dexAutoCaptureRequested');
      console.log('[Dex] Auto-capture requested via trigger page');
    }

    // Wait for cards to render
    var cards = [];
    for (var i = 0; i < 15; i++) {
      cards = getJobCards();
      console.log('[Dex] init attempt', i + 1, '— cards found:', cards.length);
      if (cards.length > 0) break;
      await sleep(1000);
    }

    if (cards.length === 0) {
      console.warn('[Dex] No job cards found after 15 attempts. Aborting.');
      return;
    }

    // Get total results from the page header
    var totalResults = getTotalResultsText() || cards.length + '';

    // Check for resume state
    var state = await loadState();
    var currentUrl = normalizeSearchUrl(window.location.href);

    if (state && state.status === 'capturing' && normalizeSearchUrl(state.searchUrl) === currentUrl) {
      showCaptureButton(totalResults, true, state.processedIds ? state.processedIds.length : 0);
    } else {
      showCaptureButton(totalResults, false, 0);
    }

    // If a backup is in storage (e.g. last run failed to save to file), offer to download it
    chrome.storage.local.get(['dexLastExport', 'dexLastExportFilename'], function (res) {
      if (!res.dexLastExport || !uiContainer) return;
      var line = document.createElement('div');
      line.style.cssText = 'font-size:11px;opacity:.9;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.2);';
      line.innerHTML = 'Last run saved to storage. <button type="button" id="dex-download-backup-init" style="background:rgba(255,255,255,.2);color:#fff;border:none;padding:2px 8px;border-radius:3px;cursor:pointer;font-size:11px;">Download backup</button>';
      uiContainer.appendChild(line);
      document.getElementById('dex-download-backup-init').addEventListener('click', function () { downloadBackupFromStorage(); });
    });
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 2000); });
  } else {
    setTimeout(init, 2000);
  }

  // SPA navigation handler (observe only if we have a valid target node)
  var navTarget = document.body || document.documentElement;
  if (navTarget) {
    var lastUrl = location.href;
    new MutationObserver(function () {
      var url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        if (/\/jobs\/(search|collections)/.test(url)) {
          if (!captureRunning) {
            removeUI();
            setTimeout(init, 2000);
          }
        } else if (!captureRunning) {
          removeUI();
        }
      }
    }).observe(navTarget, { subtree: true, childList: true });
  }
})();
