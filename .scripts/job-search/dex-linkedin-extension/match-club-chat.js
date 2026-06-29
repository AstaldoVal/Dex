// Match Club: detect chat UI, extract thread text, insert draft into composer and send.
// Runs with match-club-inventory.js. Debug: chrome.storage.local.matchClubDebug === true.
(function () {
  'use strict';

  var DEBUG_KEY = 'matchClubDebug';
  var debugEnabled = false;


  /** Семантика поля `role` у каждого сообщения в JSON экспорте (имя собеседника — в peerTitle на чате). */
  var MESSAGE_ROLE_SEMANTICS =
    'Per message: role is sender direction (me = your account, them = peer, unknown = could not infer from DOM). Peer name is peerTitle / peerDisplayName on the chat object, not in role.';

  function loadDebug(cb) {
    try {
      chrome.storage.local.get([DEBUG_KEY], function (o) {
        debugEnabled = !!(o && o[DEBUG_KEY]);
        if (typeof cb === 'function') cb();
      });
    } catch (e) {
      debugEnabled = false;
      if (typeof cb === 'function') cb();
    }
  }

  function dexLog() {
    if (!debugEnabled) return;
    var args = ['[Dex MC]'].concat(Array.prototype.slice.call(arguments));
    try {
      console.info.apply(console, args);
    } catch (e) {}
  }

  /**
   * Цепочка мониторинга списка: всегда в консоль (не зависит от matchClubDebug),
   * чтобы по логам восстановить порядок шагов и ловить неверную логику.
   */
  function watchTrace() {
    var args = ['[Dex MC watch]'].concat(Array.prototype.slice.call(arguments));
    try {
      console.info.apply(console, args);
    } catch (e) {}
  }

  /**
   * Во вкладке в фоне (боковая панель Chrome, другое окно) размеры из getBoundingClientRect часто 0,
   * хотя DOM и композер есть — иначе скрипт не находит поле и не вставляет текст.
   */
  function isVisibleInBackgroundTab(el) {
    if (!el || el.nodeType !== 1) return false;
    if (!el.isConnected) return false;
    var st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    if (parseFloat(st.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    if (r.width >= 2 && r.height >= 2) return true;
    var w = el;
    var d = 0;
    for (d = 0; d < 45 && w; d++) {
      st = window.getComputedStyle(w);
      if (st.visibility === 'hidden' || st.display === 'none') return false;
      if (!w.parentElement) break;
      w = w.parentElement;
    }
    return true;
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (typeof document.hidden !== 'undefined' && document.hidden) {
      return isVisibleInBackgroundTab(el);
    }
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    return true;
  }

  /** @returns {HTMLTextAreaElement|HTMLInputElement|null} */
  function findComposer() {
    var candidates = [];
    document.querySelectorAll('textarea').forEach(function (t) {
      if (!isVisible(t)) return;
      if (t.disabled || t.readOnly) return;
      if (t.getAttribute('aria-hidden') === 'true') return;
      candidates.push(t);
    });
    if (candidates.length === 0) {
      document.querySelectorAll('input[type="text"]').forEach(function (t) {
        if (!isVisible(t) || t.disabled || t.readOnly) return;
        candidates.push(t);
      });
    }
    if (candidates.length === 0) {
      document.querySelectorAll('[contenteditable="true"]').forEach(function (t) {
        if (!isVisible(t)) return;
        candidates.push(t);
      });
    }
    if (candidates.length === 0) return null;
    candidates.sort(function (a, b) {
      var ra = a.getBoundingClientRect();
      var rb = b.getBoundingClientRect();
      return rb.bottom - ra.bottom;
    });
    return candidates[0];
  }

  /** Последний композер, в который вставка прошла проверку — стабилизирует выбор между insert и wait. */
  var lastComposerUsed = null;

  /**
   * Левая колонка со списком чатов (Virtuoso), не общий grid-родитель.
   * Важно: на match-club класс `chat-list-layout` висит на контейнере, который оборачивает и список, и колонку треда.
   * С `closest('.chat-list-layout')` любой пузырь в треде считался «в сайдбаре» и исключался из overlay/геометрии (0 лейблов).
   */
  function isInsideChatListSidebar(el) {
    if (!el || typeof el.closest !== 'function') return false;
    return !!el.closest(
      '.chat-list-layout__list-wrap, [class*="chat-list-layout__list-wrap" i]'
    );
  }

  /**
   * Правая колонка открытого диалога (не список слева): иначе ловим поиск/превью в списке.
   */
  function isInOpenThreadColumn(el) {
    if (!el) return false;
    if (isInsideChatListSidebar(el)) return false;
    if (typeof el.closest === 'function') {
      if (
        el.closest(
          '[class*="chat-view" i], [class*="ChatView" i], [class*="conversation-panel" i], [class*="Conversation" i]'
        )
      ) {
        return true;
      }
    }
    return !!findThreadColumnContainingComposer(el);
  }

  /**
   * Собрать textarea / input / contenteditable, включая открытые shadowRoot (часть SPA прячет поле).
   */
  function collectEditableElementsDeep() {
    var out = [];
    function visit(root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('textarea').forEach(function (t) {
        out.push(t);
      });
      root.querySelectorAll('input[type="text"]').forEach(function (t) {
        out.push(t);
      });
      root.querySelectorAll('[contenteditable="true"]').forEach(function (t) {
        out.push(t);
      });
      try {
        root.querySelectorAll('*').forEach(function (node) {
          if (node && node.shadowRoot) visit(node.shadowRoot);
        });
      } catch (eSh) {}
    }
    visit(document);
    return out;
  }

  /**
   * Поле ввода в активном треде, не превью/поиск в левом списке — иначе insertDraft пишет не в тот textarea.
   */
  function findComposerInActiveChat() {
    if (
      lastComposerUsed &&
      lastComposerUsed.nodeType === 1 &&
      document.contains(lastComposerUsed) &&
      isVisible(lastComposerUsed) &&
      !lastComposerUsed.disabled &&
      !lastComposerUsed.readOnly &&
      !isInsideChatListSidebar(lastComposerUsed)
    ) {
      return lastComposerUsed;
    }
    function buildCandidates(requireThreadColumn) {
      var list = [];
      function consider(t) {
        if (!t || t.nodeType !== 1) return;
        if (!isVisible(t)) return;
        if (t.disabled || t.readOnly) return;
        if (t.getAttribute('aria-hidden') === 'true') return;
        if (isInsideChatListSidebar(t)) return;
        if (requireThreadColumn && !isInOpenThreadColumn(t)) return;
        list.push(t);
      }
      collectEditableElementsDeep().forEach(consider);
      if (list.length === 0) {
        document.querySelectorAll('textarea').forEach(consider);
      }
      if (list.length === 0) {
        document.querySelectorAll('input[type="text"]').forEach(consider);
      }
      if (list.length === 0) {
        document.querySelectorAll('[contenteditable="true"]').forEach(consider);
      }
      return list;
    }
    var candidates = buildCandidates(true);
    if (candidates.length === 0) {
      candidates = buildCandidates(false);
    }
    if (candidates.length === 0) {
      return findComposer();
    }
    function score(el) {
      var ph = String((el.getAttribute && el.getAttribute('placeholder')) || '');
      var al = String((el.getAttribute && el.getAttribute('aria-label')) || '');
      var hint = ph + ' ' + al;
      var s = 0;
      if (/write|message|type|reply|send/i.test(hint)) s += 100;
      if (isInOpenThreadColumn(el)) s += 40;
      var r = el.getBoundingClientRect();
      s += r.bottom * 0.001;
      return s;
    }
    candidates.sort(function (a, b) {
      return score(b) - score(a);
    });
    return candidates[0];
  }

  /**
   * Правая колонка с тредом: не содержит обёртку virtuoso-списка чатов (в отличие от левой).
   * Без этого в «сообщения» попадают превью всех строк списка.
   */
  function findThreadColumnContainingComposer(composer) {
    if (!composer) return null;
    var walk = composer;
    for (var depth = 0; depth < 30 && walk; depth++) {
      var parent = walk.parentElement;
      if (!parent) break;
      var siblings = Array.prototype.slice.call(parent.children);
      var si = 0;
      for (si = 0; si < siblings.length; si++) {
        var col = siblings[si];
        if (!col.contains(composer)) continue;
        var hasListWrap = col.querySelector(
          '.chat-list-layout__list-wrap, .chat-list-layout, [class*="chat-list-layout__list" i]'
        );
        if (!hasListWrap) {
          return col;
        }
      }
      walk = parent;
    }
    return null;
  }

  /**
   * Область треда для overlay/extract не должна быть полем ввода: селекторы
   * вроде [class*="message" i] совпадают с textarea.message-input и т.п., тогда region=TEXTAREA и бейджей нет.
   */
  function isValidMessageListRegionRoot(el, composer) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return false;
    var tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON') return false;
    if (el.getAttribute && String(el.getAttribute('contenteditable') || '').toLowerCase() === 'true')
      return false;
    if (composer && el === composer) return false;
    return true;
  }

  function findMessagesRegionNearComposer(composer) {
    if (!composer) return null;
    var root = findThreadColumnContainingComposer(composer);
    if (!root) {
      root = document.documentElement;
    }
    var rectC = composer.getBoundingClientRect();
    var scoped = root.querySelectorAll(
      '[class*="message-list" i], [class*="messages-scroll" i], [class*="conversation-messages" i], [class*="chat-messages" i], [class*="thread-messages" i]'
    );
    var si = 0;
    for (si = 0; si < scoped.length; si++) {
      var sc = scoped[si];
      if (!root.contains(sc) || !isVisible(sc) || isInsideChatListSidebar(sc)) continue;
      if (composer.contains(sc) || sc.contains(composer)) continue;
      var rs = sc.getBoundingClientRect();
      if (rs.bottom > rectC.top + 12) continue;
      var slen = String(sc.innerText || '').replace(/\s+/g, ' ').trim().length;
      if (slen > 35 && isValidMessageListRegionRoot(sc, composer)) return sc;
    }
    var el = composer;
    for (var d = 0; d < 14 && el && root.contains(el); d++) {
      var parent = el.parentElement;
      if (!parent || !root.contains(parent)) break;
      var children = Array.prototype.slice.call(parent.children);
      var idx = children.indexOf(el);
      for (var j = idx - 1; j >= 0; j--) {
        var cand = children[j];
        if (!cand || cand.nodeType !== 1) continue;
        if (isInsideChatListSidebar(cand)) continue;
        if (!root.contains(cand)) continue;
        var tlen = (cand.innerText || '').replace(/\s+/g, ' ').trim().length;
        if (
          tlen > 40 &&
          (cand.scrollHeight > cand.clientHeight + 20 || tlen > 120) &&
          isValidMessageListRegionRoot(cand, composer)
        ) {
          return cand;
        }
      }
      el = parent;
    }
    var main = root.querySelector
      ? root.querySelector('main, [role="main"], .main-content, app-root') ||
        (root.matches && root.matches('main, [role="main"]') ? root : null)
      : null;
    if (!main && root.nodeType === 1 && root.matches && root.matches('main, [role="main"], .main-content, app-root')) {
      main = root;
    }
    if (!main) {
      main = document.querySelector('main, [role="main"], .main-content, app-root');
    }
    if (main && main !== composer && main.contains(composer) && root.contains(main)) {
      var inner = main.querySelector('[class*="message" i], [class*="chat" i], [class*="thread" i]');
      if (
        inner &&
        inner !== composer &&
        !composer.contains(inner) &&
        !isInsideChatListSidebar(inner) &&
        root.contains(inner) &&
        isValidMessageListRegionRoot(inner, composer)
      ) {
        return inner;
      }
    }
    return null;
  }

  /**
   * Область сообщений для overlay и extract: сначала узкая эвристика над композером,
   * иначе правая колонка треда или chat-view/main (без этого region часто null — бейджи ME/THEM не появляются).
   */
  function resolveThreadMessagesRegion(composer) {
    var narrow = findMessagesRegionNearComposer(composer);
    if (narrow && isValidMessageListRegionRoot(narrow, composer)) return narrow;
    if (!composer) return null;
    var col = findThreadColumnContainingComposer(composer);
    if (col && col.nodeType === 1 && !isInsideChatListSidebar(col) && col.isConnected) {
      return col;
    }
    if (typeof composer.closest === 'function') {
      var cv = composer.closest(
        '[class*="chat-view" i], [class*="ChatView" i], [class*="conversation-panel" i], [class*="Conversation" i], main, [role="main"], app-root'
      );
      if (cv && !isInsideChatListSidebar(cv) && cv.isConnected && cv.contains(composer)) {
        return cv;
      }
    }
    return null;
  }

  /** Подняться от композера к крупному предку — колонка треда без строгого isVisible (часто ломает overlay). */
  function resolveThreadRegionWalkFromComposer(composer) {
    if (!composer || !composer.isConnected) return null;
    var w = composer.parentElement;
    var depth = 0;
    for (depth = 0; depth < 28 && w; depth++) {
      if (w.nodeType !== 1 || isInsideChatListSidebar(w)) {
        w = w.parentElement;
        continue;
      }
      var h = w.clientHeight || 0;
      var wd = w.clientWidth || 0;
      if (h > 160 && wd > 200) return w;
      w = w.parentElement;
    }
    return null;
  }

  /** Для overlay: не отсекать узлы с нулевым rect в фоновой вкладке (isVisible строже). */
  function isVisibleForRoleOverlay(el) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return false;
    var st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none') return false;
    if (parseFloat(st.opacity) === 0) return false;
    return true;
  }

  /**
   * Кандидаты узлов сообщений под разные SPA (в т.ч. без подстроки "message" в class).
   */
  function queryMessageCandidateNodes(region) {
    if (!region || !region.querySelectorAll) return [];
    var selectors = [
      '[class*="message" i]',
      '[class*="bubble" i]',
      '[class*="msg" i]',
      '[class*="chat-message" i]',
      '[data-message-id]',
      '[role="listitem"]',
      '[data-testid*="message" i]'
    ];
    var out = [];
    var seen = [];
    function add(n) {
      if (!n) return;
      var j = 0;
      for (j = 0; j < seen.length; j++) {
        if (seen[j] === n) return;
      }
      seen.push(n);
      out.push(n);
    }
    var si = 0;
    for (si = 0; si < selectors.length; si++) {
      var nodes;
      try {
        nodes = region.querySelectorAll(selectors[si]);
      } catch (eSel) {
        continue;
      }
      var ni = 0;
      for (ni = 0; ni < nodes.length; ni++) {
        add(nodes[ni]);
      }
    }
    return out;
  }

  /** Сообщения внутри shadow DOM: селекторы региона их не видят. */
  function queryMessageCandidateNodesDeep(region) {
    var base = queryMessageCandidateNodes(region);
    var seen = {};
    var bi = 0;
    for (bi = 0; bi < base.length; bi++) {
      seen[base[bi]] = true;
    }
    function walkShadow(sr) {
      if (!sr || !sr.querySelectorAll) return;
      var subs = queryMessageCandidateNodes(sr);
      var si = 0;
      for (si = 0; si < subs.length; si++) {
        var n = subs[si];
        if (!seen[n]) {
          seen[n] = true;
          base.push(n);
        }
      }
      try {
        sr.querySelectorAll('*').forEach(function (node) {
          if (node.shadowRoot) walkShadow(node.shadowRoot);
        });
      } catch (eW) {}
    }
    try {
      region.querySelectorAll('*').forEach(function (node) {
        if (node.shadowRoot) walkShadow(node.shadowRoot);
      });
    } catch (eR) {}
    return base;
  }

  /**
   * match-club: по одному узлу на сообщение — div.chat-message[data-id].
   * Иначе [class*="message"] цепляет .chat-message-text / кнопки, после dedupe остаётся один лист.
   */
  function queryMessageRowRootsOrDeep(region, diagOut) {
    if (!region || !region.querySelectorAll) return [];
    try {
      var roots = region.querySelectorAll('div.chat-message[data-id]');
      if (roots && roots.length > 0) {
        if (diagOut) diagOut.usedMatchClubMessageRoots = true;
        return Array.prototype.slice.call(roots);
      }
    } catch (eMc) {}
    if (diagOut) diagOut.usedMatchClubMessageRoots = false;
    return queryMessageCandidateNodesDeep(region);
  }

  /** div/li/article в регионе + открытые shadow roots (для геометрии баблов). */
  function collectNodesDivLiArticleWithShadow(region, max) {
    max = max || 1500;
    var out = [];
    function addFrom(r) {
      if (!r || !r.querySelectorAll || out.length >= max) return;
      var nodes = r.querySelectorAll('div, li, article, p, section');
      var ni = 0;
      for (ni = 0; ni < nodes.length && out.length < max; ni++) {
        out.push(nodes[ni]);
      }
    }
    function walkShadow(sr) {
      if (!sr || out.length >= max) return;
      addFrom(sr);
      try {
        sr.querySelectorAll('*').forEach(function (node) {
          if (node.shadowRoot && out.length < max) walkShadow(node.shadowRoot);
        });
      } catch (eS) {}
    }
    addFrom(region);
    try {
      region.querySelectorAll('*').forEach(function (node) {
        if (node.shadowRoot && out.length < max) walkShadow(node.shadowRoot);
      });
    } catch (e2) {}
    return out;
  }

  /**
   * Если селекторы не находят баблы — эвристика по размеру/положению в полосе над композером (без требования длины текста).
   * Оставляем внешние узлы строки (не вложенные дети), чтобы был один лейбл на сообщение.
   */
  function collectGeometryBubbleOverlayTargets(region, composer) {
    var items = [];
    if (!region || !region.querySelectorAll) return items;
    var regionRect = region.getBoundingClientRect();
    var composerRect = composer && composer.getBoundingClientRect ? composer.getBoundingClientRect() : null;
    var yMax = composerRect ? composerRect.top - 4 : regionRect.bottom;
    var wide =
      region === document.body ||
      region === document.documentElement ||
      regionRect.width > window.innerWidth * 0.85;
    var yMin = wide ? Math.max(regionRect.top + 8, 72) : regionRect.top + 8;
    var centerX = wide ? window.innerWidth * 0.62 : regionRect.left + regionRect.width * 0.5;
    var nodes = collectNodesDivLiArticleWithShadow(region, 1500);
    var i = 0;
    var raw = [];
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (composer && composer.contains(node)) continue;
      if (isInsideChatListSidebar(node)) continue;
      if (node.closest && node.closest('a.chat-list-item')) continue;
      var r = node.getBoundingClientRect();
      if (wide && r.right < Math.min(280, window.innerWidth * 0.28)) continue;
      if (r.bottom < yMin || r.top > yMax) continue;
      if (r.width < 36 || r.height < 14 || r.height > 260) continue;
      if (!wide && r.width > regionRect.width * 0.94) continue;
      var area = r.width * r.height;
      if (area < 400 || area > 220000) continue;
      if (!isVisibleForRoleOverlay(node)) continue;
      if (r.height < 20 && !wide && r.width > regionRect.width * 0.72) continue;
      if (wide && r.height < 18 && r.width > window.innerWidth * 0.55) continue;
      var t = getTextBlob(node);
      if (String(t || '').length > 5000) continue;
      var role = guessMessageRoleFromElement(node);
      if (role === 'unknown') {
        var mid = r.left + r.width / 2;
        if (mid > centerX + 14) role = 'me';
        else if (mid < centerX - 14) role = 'them';
      }
      raw.push({
        el: node,
        top: r.top,
        text: t,
        role: role,
        area: area
      });
    }
    raw.sort(function (a, b) {
      return a.area - b.area;
    });
    var kept = [];
    var j = 0;
    for (i = 0; i < raw.length; i++) {
      var el = raw[i].el;
      var skip = false;
      for (j = 0; j < kept.length; j++) {
        if (kept[j].el.contains(el) && kept[j].el !== el) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      var nk = [];
      for (j = 0; j < kept.length; j++) {
        if (el.contains(kept[j].el) && el !== kept[j].el) continue;
        nk.push(kept[j]);
      }
      kept = nk;
      kept.push(raw[i]);
    }
    kept.sort(function (a, b) {
      return a.top - b.top;
    });
    var maxN = 32;
    for (i = 0; i < kept.length && items.length < maxN; i++) {
      items.push({
        el: kept[i].el,
        top: kept[i].top,
        text: kept[i].text,
        role: kept[i].role
      });
    }
    return items;
  }

  /** Имя «Имя, возраст» из шапки открытого треда (дублирует список, если список пустой). */
  function extractPeerTitleFromThreadHeader() {
    var selectors = [
      '.chat-view header .chat-list-item__title',
      '[class*="chat-view" i] [class*="header" i] .chat-list-item__title',
      '[class*="chat-view" i] [class*="header" i] [class*="title" i]',
      'main [class*="conversation" i] [class*="header" i] h1',
      'main [class*="conversation" i] [class*="header" i] h2',
      '[class*="conversation-header" i] [class*="name" i]',
      '[class*="conversation-header" i] [class*="title" i]'
    ];
    var s = 0;
    for (s = 0; s < selectors.length; s++) {
      var el = document.querySelector(selectors[s]);
      if (!el || !isVisible(el)) continue;
      var t = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length >= 2 && t.length < 200) return t;
    }
    return '';
  }

  function urlLooksLikeChat() {
    var p = (location.pathname || '').toLowerCase();
    if (p.indexOf('message') !== -1) return true;
    if (p.indexOf('chat') !== -1) return true;
    if (p.indexOf('dialog') !== -1) return true;
    if (p.indexOf('conversation') !== -1) return true;
    return false;
  }

  function fallbackTextsAboveComposer(composer) {
    if (!composer) return '';
    var rectC = composer.getBoundingClientRect();
    var chunks = [];
    var nodes = document.querySelectorAll('p, span, div, li');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!isVisible(el)) continue;
      if (composer.contains(el)) continue;
      if (el.contains(composer)) continue;
      var r = el.getBoundingClientRect();
      if (r.bottom > rectC.top) continue;
      var t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (t.length < 12 || t.length > 1500) continue;
      chunks.push(t);
    }
    if (chunks.length === 0) return '';
    var joined = chunks.slice(-45).join('\n');
    if (joined.length > 10000) joined = '…\n' + joined.slice(-10000);
    return joined;
  }

  function getChatContext() {
    var composer = findComposerInActiveChat();
    var region = findMessagesRegionNearComposer(composer);
    var threadText = '';
    if (region) {
      threadText = (region.innerText || '').replace(/\s+\n/g, '\n').trim();
      if (threadText.length > 12000) {
        threadText = '…\n' + threadText.slice(-12000);
      }
    }
    if ((!threadText || threadText.length < 25) && composer) {
      var fb = fallbackTextsAboveComposer(composer);
      if (fb && fb.length > threadText.length) threadText = fb;
    }
    var isChat = !!composer && (urlLooksLikeChat() || (threadText && threadText.length > 30));
    var structured = extractStructuredMessagesFromThread();
    var msgs = structured.messages || [];
    var last = msgs.length ? msgs[msgs.length - 1] : null;
    var lastMessageRole = last ? String(last.role || '') : '';
    var lastMessageText = last ? String(last.text || '').trim() : '';
    var result = {
      ok: true,
      isChat: isChat,
      composerFound: !!composer,
      composerTag: composer ? composer.tagName : null,
      urlLooksLikeChat: urlLooksLikeChat(),
      partnerContext: threadText,
      /** Последнее сообщение в треде (me / them / unknown) — для панели «не предлагать повтор уже отправленного». */
      lastMessageRole: lastMessageRole,
      lastMessageText: lastMessageText,
      structuredMessageCount: msgs.length,
      threadExtractMethod: structured.extractMethod || '',
      url: location.href,
      pathname: location.pathname
    };
    dexLog('getChatContext', result);
    return result;
  }

  function setValueAndNotify(el, text) {
    var t = String(text || '');
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      try {
        el.focus();
      } catch (eF) {}
      try {
        var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        var desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) {
          desc.set.call(el, t);
        } else {
          el.value = t;
        }
      } catch (e0) {
        try {
          el.value = t;
        } catch (e1) {
          return false;
        }
      }
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: t }));
      } catch (eIn) {
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e2) {
          var ev = document.createEvent('Event');
          ev.initEvent('input', true, true);
          el.dispatchEvent(ev);
        }
      }
      try {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (eCh) {}
      try {
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
      } catch (eKu) {}
      return true;
    }
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
      try {
        el.focus();
      } catch (eF2) {}
      try {
        el.textContent = '';
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(true);
        var sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        document.execCommand('insertText', false, t);
      } catch (eEx) {
        try {
          el.textContent = t;
        } catch (e3) {
          return false;
        }
      }
      try {
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: t }));
      } catch (e4) {
        try {
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e5) {}
      }
      try {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e6) {}
      return true;
    }
    return false;
  }

  /**
   * Список чатов: тоггл «Online» (только профили онлайн).
   * Разметка: label.toggle__label > input.toggle__input[name="onlineOnly"]
   */
  function findOnlineOnlyCheckbox() {
    var el =
      document.querySelector('input[name="onlineOnly"][type="checkbox"]') ||
      document.querySelector('input.toggle__input[name="onlineOnly"]') ||
      document.querySelector('label.toggle__label input[name="onlineOnly"]');
    return el && el.type === 'checkbox' ? el : null;
  }

  /**
   * @returns {{ ok: boolean, enabled?: boolean, wasAlreadyOn?: boolean, error?: string }}
   */
  /**
   * Снять фильтр «только онлайн» на списке чатов (зеркало enableOnlineOnlyFilterSync).
   * @returns {{ ok: boolean, enabled?: boolean, wasAlreadyOff?: boolean, error?: string }}
   */
  function disableOnlineOnlyFilterSync() {
    var input = findOnlineOnlyCheckbox();
    if (!input) {
      return { ok: false, error: 'not_found' };
    }
    if (!input.checked) {
      persistOnlineOnlyPreference(false);
      return { ok: true, enabled: false, wasAlreadyOff: true };
    }
    try {
      input.focus();
      input.click();
    } catch (e) {}
    if (!input.checked) {
      persistOnlineOnlyPreference(false);
      return { ok: true, enabled: false, wasAlreadyOff: false };
    }
    try {
      input.checked = false;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e2) {}
    if (!input.checked) {
      persistOnlineOnlyPreference(false);
      return { ok: true, enabled: false, wasAlreadyOff: false };
    }
    var label = input.closest('label.toggle__label');
    if (label) {
      try {
        label.click();
      } catch (e3) {}
    }
    if (!input.checked) {
      persistOnlineOnlyPreference(false);
      return { ok: true, enabled: false, wasAlreadyOff: false };
    }
    return {
      ok: false,
      error:
        'Тоггл Online найден, но не снялся. Снимите фильтр вручную на странице списка чатов.'
    };
  }

  function enableOnlineOnlyFilterSync() {
    var input = findOnlineOnlyCheckbox();
    if (!input) {
      return { ok: false, error: 'not_found' };
    }
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: true };
    }
    try {
      input.focus();
      input.click();
    } catch (e) {}
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    try {
      input.checked = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e2) {}
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    var label = input.closest('label.toggle__label');
    if (label) {
      try {
        label.click();
      } catch (e3) {}
    }
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    return {
      ok: false,
      error:
        'Тоггл Online найден, но не переключился. Включите фильтр вручную на странице списка чатов.'
    };
  }

  /**
   * Ждём появления тоггла (SPA) до timeoutMs, затем включаем.
   * @param {function(Object): void} sendResponse
   * @param {number} timeoutMs
   */
  function enableOnlineOnlyFilterAsync(sendResponse, timeoutMs) {
    var timeoutMsSafe = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 8000;
    var done = false;
    var obs = null;
    var tid = null;
    function finish(payload) {
      if (done) return;
      done = true;
      try {
        if (tid != null) clearTimeout(tid);
      } catch (e) {}
      try {
        if (obs) obs.disconnect();
      } catch (e2) {}
      if (payload && payload.ok && payload.enabled) {
        persistOnlineOnlyPreference(true);
      }
      try {
        sendResponse(payload);
      } catch (e3) {}
    }
    function tryOnce() {
      var r = enableOnlineOnlyFilterSync();
      if (r.ok) {
        finish(r);
        return true;
      }
      if (r.error !== 'not_found') {
        finish(r);
        return true;
      }
      return false;
    }
    if (tryOnce()) return;
    obs = new MutationObserver(function () {
      tryOnce();
    });
    try {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {
      finish({
        ok: false,
        error:
          'Не удалось наблюдать DOM. Откройте страницу списка чатов, например …/chats/…/messages'
      });
      return;
    }
    tid = setTimeout(function () {
      finish({
        ok: false,
        error:
          'Тоггл Online не найден. Откройте страницу со списком чатов (URL с /chats/ и /messages), дождитесь загрузки и повторите.'
      });
    }, timeoutMsSafe);
  }

  /** Пользователь хотел «только онлайн»; после прокрутки Virtuoso / полной перезагрузки страницы тоггл сбрасывается — восстанавливаем. */
  var MATCH_CLUB_ONLINE_PREF_KEY = 'matchClubPreferOnlineOnly';

  function persistOnlineOnlyPreference(enabled) {
    try {
      var o = {};
      o[MATCH_CLUB_ONLINE_PREF_KEY] = !!enabled;
      chrome.storage.local.set(o);
    } catch (e) {}
  }

  /**
   * Включён ли фильтр «только онлайн» для приоритизации очереди watch.
   * Если чекбокс в DOM есть — берём его (актуальнее storage).
   */
  function resolvePreferOnlineOnlyFromDom(storageVal) {
    var el = findOnlineOnlyCheckbox();
    if (el) return !!el.checked;
    return !!storageVal;
  }

  var restoreOnlineOnlyTimer = null;
  function restoreOnlineOnlyFromStorageSoon() {
    if (restoreOnlineOnlyTimer) clearTimeout(restoreOnlineOnlyTimer);
    restoreOnlineOnlyTimer = setTimeout(function () {
      restoreOnlineOnlyTimer = null;
      try {
        chrome.storage.local.get([MATCH_CLUB_ONLINE_PREF_KEY], function (o) {
          if (chrome.runtime.lastError || !o || !o[MATCH_CLUB_ONLINE_PREF_KEY]) return;
          var r = enableOnlineOnlyFilterSync();
          dexLog('restoreOnlineOnly', r.ok, r.wasAlreadyOn);
        });
      } catch (e) {}
    }, 100);
  }

  function syncOnlineOnlyPreferenceFromDomIfChecked() {
    var el = findOnlineOnlyCheckbox();
    if (el && el.checked) persistOnlineOnlyPreference(true);
    if (el && !el.checked) persistOnlineOnlyPreference(false);
  }

  /**
   * Список чатов: тоггл «только платные» (эвристика имён; разметка как у onlineOnly).
   */
  function findPaidOnlyListCheckbox() {
    var names = [
      'paidOnly',
      'paidChatsOnly',
      'onlyPaid',
      'showPaidChats',
      'paidChats',
      'isPaidChat',
      'filterPaid'
    ];
    var ni;
    for (ni = 0; ni < names.length; ni++) {
      var nm = names[ni];
      var el =
        document.querySelector('input[name="' + nm + '"][type="checkbox"]') ||
        document.querySelector('input.toggle__input[name="' + nm + '"]') ||
        document.querySelector('label.toggle__label input[name="' + nm + '"]');
      if (el && el.type === 'checkbox') return el;
    }
    return null;
  }

  function tryUncheckNamedFiltersSync(names) {
    if (!names || !names.length) return;
    var i;
    for (i = 0; i < names.length; i++) {
      var nm = names[i];
      var el =
        document.querySelector('input[name="' + nm + '"][type="checkbox"]') ||
        document.querySelector('input.toggle__input[name="' + nm + '"]');
      if (!el || el.type !== 'checkbox' || !el.checked) continue;
      try {
        el.click();
      } catch (e) {}
      if (el.checked) {
        try {
          el.checked = false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e2) {}
      }
    }
  }

  /**
   * Включить фильтр «только платные» на списке (если чекбокс найден по эвристике).
   * @returns {{ ok: boolean, enabled?: boolean, wasAlreadyOn?: boolean, error?: string }}
   */
  function enablePaidOnlyListFilterSync() {
    var input = findPaidOnlyListCheckbox();
    if (!input) {
      return { ok: false, error: 'not_found' };
    }
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: true };
    }
    try {
      input.focus();
      input.click();
    } catch (e) {}
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    try {
      input.checked = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e2) {}
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    var label = input.closest('label.toggle__label');
    if (label) {
      try {
        label.click();
      } catch (e3) {}
    }
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    return { ok: false, error: 'paid_toggle_found_not_switched' };
  }

  /**
   * Выключить фильтр «только платные» на списке (если чекбокс найден).
   * @returns {{ ok: boolean, disabled?: boolean, wasAlreadyOff?: boolean, error?: string }}
   */
  function disablePaidOnlyListFilterSync() {
    var input = findPaidOnlyListCheckbox();
    if (!input) {
      return { ok: false, error: 'not_found' };
    }
    if (!input.checked) {
      return { ok: true, disabled: true, wasAlreadyOff: true };
    }
    try {
      input.focus();
      input.click();
    } catch (e) {}
    if (!input.checked) {
      return { ok: true, disabled: true, wasAlreadyOff: false };
    }
    try {
      input.checked = false;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e2) {}
    if (!input.checked) {
      return { ok: true, disabled: true, wasAlreadyOff: false };
    }
    var label = input.closest('label.toggle__label');
    if (label) {
      try {
        label.click();
      } catch (e3) {}
    }
    if (!input.checked) {
      return { ok: true, disabled: true, wasAlreadyOff: false };
    }
    return { ok: false, error: 'paid_toggle_found_not_cleared' };
  }

  function findUnreadListCheckbox() {
    var names = [
      'unreadOnly',
      'showUnreadChats',
      'unreadChatsOnly',
      'onlyUnread',
      'filterUnread',
      'isUnreadChat',
      'hasUnread',
      'unreadFilter'
    ];
    var ni;
    for (ni = 0; ni < names.length; ni++) {
      var nm = names[ni];
      var el =
        document.querySelector('input[name="' + nm + '"][type="checkbox"]') ||
        document.querySelector('input.toggle__input[name="' + nm + '"]') ||
        document.querySelector('label.toggle__label input[name="' + nm + '"]');
      if (el && el.type === 'checkbox') return el;
    }
    return null;
  }

  function enableUnreadOnlyListFilterSync() {
    var input = findUnreadListCheckbox();
    if (!input) {
      return { ok: false, error: 'not_found' };
    }
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: true };
    }
    try {
      input.focus();
      input.click();
    } catch (e) {}
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    try {
      input.checked = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e2) {}
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    var label = input.closest('label.toggle__label');
    if (label) {
      try {
        label.click();
      } catch (e3) {}
    }
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    return { ok: false, error: 'unread_toggle_found_not_switched' };
  }

  function findFirstSmsOnlyListCheckbox() {
    var names = [
      'answerFirstOnly',
      'firstSmsOnly',
      'firstSmsChatsOnly',
      'onlyFirstSms',
      'showFirstSms',
      'showFirstSmsChats',
      'firstSms',
      'firstSMS',
      '1stSms',
      'isFirstSms',
      'filterFirstSms'
    ];
    var ni;
    for (ni = 0; ni < names.length; ni++) {
      var nm = names[ni];
      var el =
        document.querySelector('input[name="' + nm + '"][type="checkbox"]') ||
        document.querySelector('input.toggle__input[name="' + nm + '"]') ||
        document.querySelector('label.toggle__label input[name="' + nm + '"]');
      if (el && el.type === 'checkbox') return el;
    }
    try {
      var labels = document.querySelectorAll('label.toggle__label, label');
      var li;
      for (li = 0; li < labels.length; li++) {
        var lb = labels[li];
        var t = String((lb.textContent || '').replace(/\s+/g, ' ').trim());
        if (!/^(1st\s*SMS)$/i.test(t) && !/\b1st\s*SMS\b/i.test(t)) continue;
        var inLabel = lb.querySelector('input[type="checkbox"]');
        if (inLabel) return inLabel;
      }
    } catch (eLbl) {}
    return null;
  }

  function enableFirstSmsOnlyListFilterSync() {
    var input = findFirstSmsOnlyListCheckbox();
    if (!input) {
      return { ok: false, error: 'not_found' };
    }
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: true };
    }
    try {
      input.focus();
      input.click();
    } catch (e) {}
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    try {
      input.checked = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e2) {}
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    var label = input.closest('label.toggle__label');
    if (label) {
      try {
        label.click();
      } catch (e3) {}
    }
    if (input.checked) {
      return { ok: true, enabled: true, wasAlreadyOn: false };
    }
    return { ok: false, error: 'first_sms_toggle_found_not_switched' };
  }

  function disableFirstSmsOnlyListFilterSync() {
    var input = findFirstSmsOnlyListCheckbox();
    if (!input) {
      return { ok: false, error: 'not_found' };
    }
    if (!input.checked) {
      return { ok: true, disabled: true, wasAlreadyOff: true };
    }
    try {
      input.focus();
      input.click();
    } catch (e) {}
    if (!input.checked) {
      return { ok: true, disabled: true, wasAlreadyOff: false };
    }
    try {
      input.checked = false;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e2) {}
    if (!input.checked) {
      return { ok: true, disabled: true, wasAlreadyOff: false };
    }
    var label = input.closest('label.toggle__label');
    if (label) {
      try {
        label.click();
      } catch (e3) {}
    }
    if (!input.checked) {
      return { ok: true, disabled: true, wasAlreadyOff: false };
    }
    return { ok: false, error: 'first_sms_toggle_found_not_cleared' };
  }

  async function ensurePaidOnlyWatchListFiltersAsync() {
    var offOn = disableOnlineOnlyFilterSync();
    watchTrace('paidOnlyFilters onlineOff', offOn.ok, offOn.error || '');
    tryUncheckNamedFiltersSync([
      'notPaidOnly',
      'freeOnly',
      'freeChatsOnly',
      'onlyFree',
      'showFreeChats'
    ]);
    var firstSmsOff = disableFirstSmsOnlyListFilterSync();
    watchTrace(
      'paidOnlyFilters firstSmsOff',
      firstSmsOff.ok,
      firstSmsOff.error || '',
      'wasOff',
      !!firstSmsOff.wasAlreadyOff
    );
    var unreadEl = findUnreadListCheckbox();
    if (unreadEl && unreadEl.checked) {
      try {
        unreadEl.click();
      } catch (eU0) {}
      if (unreadEl.checked) {
        try {
          unreadEl.checked = false;
          unreadEl.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (eU1) {}
      }
    }
    var paidR = enablePaidOnlyListFilterSync();
    watchTrace('paidOnlyFilters paidOn', paidR.ok, paidR.error || '', 'wasOn', !!paidR.wasAlreadyOn);
    await sleep(450);
    watchRefreshOutcomeBadgesFromStorage();
  }

  /** Фаза first_sms: Paid OFF, только 1st SMS ON (если чекбокс найден). */
  async function ensureFirstSmsOnlyWatchListFiltersAsync() {
    var offOn = disableOnlineOnlyFilterSync();
    watchTrace('firstSmsPhaseFilters onlineOff', offOn.ok, offOn.error || '');
    var paidOff = disablePaidOnlyListFilterSync();
    watchTrace('firstSmsPhaseFilters paidOff', paidOff.ok, paidOff.error || '', 'wasOff', !!paidOff.wasAlreadyOff);
    tryUncheckNamedFiltersSync([
      'notPaidOnly',
      'freeOnly',
      'freeChatsOnly',
      'onlyFree',
      'showFreeChats'
    ]);
    var unreadEl2 = findUnreadListCheckbox();
    if (unreadEl2 && unreadEl2.checked) {
      try {
        unreadEl2.click();
      } catch (eU2) {}
      if (unreadEl2.checked) {
        try {
          unreadEl2.checked = false;
          unreadEl2.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (eU3) {}
      }
    }
    var fsR = enableFirstSmsOnlyListFilterSync();
    if (!fsR.ok) {
      // После выключения Paid UI может перерисовать фильтры с задержкой.
      var tries = 0;
      while (!fsR.ok && tries < 6) {
        tries++;
        await sleep(160);
        fsR = enableFirstSmsOnlyListFilterSync();
      }
    }
    watchTrace('firstSmsPhaseFilters firstSmsOn', fsR.ok, fsR.error || '', 'wasOn', !!fsR.wasAlreadyOn);
    await sleep(450);
    watchRefreshOutcomeBadgesFromStorage();
  }

  /** После завершения фазы first_sms: выключить Paid/1st SMS, Unread ON (эвристика чекбоксов). */
  async function ensureUnreadOnlyAfterPaidPassFiltersAsync() {
    var paidOff = disablePaidOnlyListFilterSync();
    watchTrace('unreadPhaseFilters paidOff', paidOff.ok, paidOff.error || '', 'wasOff', !!paidOff.wasAlreadyOff);
    var firstSmsOff2 = disableFirstSmsOnlyListFilterSync();
    watchTrace(
      'unreadPhaseFilters firstSmsOff',
      firstSmsOff2.ok,
      firstSmsOff2.error || '',
      'wasOff',
      !!firstSmsOff2.wasAlreadyOff
    );
    tryUncheckNamedFiltersSync([
      'notPaidOnly',
      'freeOnly',
      'freeChatsOnly',
      'onlyFree',
      'showFreeChats'
    ]);
    var unreadR = enableUnreadOnlyListFilterSync();
    watchTrace(
      'unreadPhaseFilters unreadOn',
      unreadR.ok,
      unreadR.error || '',
      'wasOn',
      !!unreadR.wasAlreadyOn
    );
    await sleep(450);
    watchRefreshOutcomeBadgesFromStorage();
  }

  function attachOnlineOnlyCheckboxPersistence() {
    function tryBind() {
      var el = findOnlineOnlyCheckbox();
      if (!el || el.dataset.dexOnlinePersist === '1') return;
      el.dataset.dexOnlinePersist = '1';
      el.addEventListener(
        'change',
        function () {
          persistOnlineOnlyPreference(!!el.checked);
        },
        false
      );
    }
    tryBind();
    var obs = new MutationObserver(function () {
      tryBind();
    });
    try {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
    setTimeout(tryBind, 400);
    setTimeout(tryBind, 2000);
  }

  function insertDraft(text) {
    var composer = findComposerInActiveChat();
    if (!composer) {
      dexLog('insertDraft: composer not found');
      return { ok: false, error: 'Поле ввода не найдено. Откройте чат с пользователем.' };
    }
    var ok = setValueAndNotify(composer, text);
    if (!ok) return { ok: false, error: 'Не удалось записать текст в поле.' };
    dexLog('insertDraft: ok, length', String(text).length);
    try {
      composer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (e) {}
    lastComposerUsed = composer;
    return { ok: true };
  }

  function normalizeOutboundText(s) {
    return String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Нормализация для сравнения «очередь vs DOM»: апострофы/кавычки из вёрстки и из .md часто различаются;
   * без этого proposedTextAppearsInThreadPlain и пузырьки не совпадают с пунктом очереди.
   */
  function normalizeOutboundTextLoose(s) {
    var x = String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u0060\u00B4]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    try {
      if (x && x.normalize) x = x.normalize('NFC');
    } catch (eNfc) {}
    return x;
  }

  function outboundTextsLooselyMatch(a, b) {
    var x = normalizeOutboundTextLoose(a);
    var y = normalizeOutboundTextLoose(b);
    if (!x || !y) return false;
    if (x === y) return true;
    var n = Math.min(80, Math.min(x.length, y.length));
    if (n >= 24 && x.slice(0, n) === y.slice(0, n)) return true;
    if (x.length >= 16 && y.indexOf(x) !== -1) return true;
    if (y.length >= 16 && x.indexOf(y) !== -1) return true;
    try {
      var xl = x.toLowerCase();
      var yl = y.toLowerCase();
      if (xl === yl) return true;
      if (yl.indexOf(xl) !== -1 || xl.indexOf(yl) !== -1) return true;
    } catch (eLc) {}
    return false;
  }

  /**
   * Индекс пункта очереди, которому соответствует последнее исходящее в треде.
   * Раньше при общем префиксе двух пунктов (первые 32+ символа совпадают) возвращался **первый** qi,
   * хотя в треде уже полная строка queue[1] — тогда branche `role===me` вызывал gateSend(queue[1]) снова = дубликат последнего сообщения в композере.
   * Теперь: точное совпадение; иначе берём **максимальный** qi среди совпадений (loose и префикс), чтобы отдать приоритет более длинному шаблону.
   */
  function findQueueIndexForText(queue, text) {
    var n = normalizeOutboundTextLoose(text);
    if (!n) return -1;
    var qi = 0;
    for (qi = 0; qi < queue.length; qi++) {
      var q = normalizeOutboundTextLoose(queue[qi]);
      if (q === n) return qi;
    }
    var best = -1;
    for (qi = 0; qi < queue.length; qi++) {
      var qLo = normalizeOutboundTextLoose(queue[qi]);
      if (!qLo) continue;
      if (outboundTextsLooselyMatch(qLo, n)) {
        if (qi > best) best = qi;
      }
    }
    for (qi = 0; qi < queue.length; qi++) {
      var qPr = normalizeOutboundTextLoose(queue[qi]);
      if (!qPr) continue;
      var lim = Math.min(72, Math.min(qPr.length, n.length));
      if (lim >= 32 && qPr.slice(0, lim) === n.slice(0, lim)) {
        if (qi > best) best = qi;
      }
    }
    return best;
  }

  /**
   * Предлагаемый текст уже совпадает с любым пузырьком в треде (любая роль).
   * Нужно, когда DOM даёт last role unknown, а пункт очереди уже виден в истории как отправленный.
   */
  function proposedTextMatchesAnyStructuredBubble(msgs, proposedText) {
    var p = normalizeOutboundTextLoose(proposedText);
    if (!p || p.length < 12) return false;
    var mi = 0;
    for (mi = 0; mi < msgs.length; mi++) {
      var t = normalizeOutboundTextLoose((msgs[mi] && msgs[mi].text) || '');
      if (!t || t.length < 12) continue;
      if (outboundTextsLooselyMatch(t, p)) return true;
    }
    return false;
  }

  /**
   * Предлагаемый текст уже есть в пузырях исходящих (me) — не вставлять повторно в композер.
   * Сравнение по normalize + префиксу для длинных строк (DOM может отличаться от файла очереди).
   */
  function proposedTextAlreadyInOutgoingMessages(msgs, proposedText) {
    var p = normalizeOutboundTextLoose(proposedText);
    if (!p) return false;
    var mi = 0;
    for (mi = 0; mi < msgs.length; mi++) {
      if (msgs[mi].role !== 'me') continue;
      var t = normalizeOutboundTextLoose(msgs[mi].text || '');
      if (!t) continue;
      if (outboundTextsLooselyMatch(t, p)) return true;
    }
    return false;
  }

  /**
   * Текст пункта очереди уже встречается в сыром тексте колонки треда (DOM не разобрал пузырьки).
   */
  function proposedTextAppearsInThreadPlain(threadPlain, proposedText) {
    var p = normalizeOutboundTextLoose(proposedText);
    if (!p || p.length < 10) return false;
    var t = normalizeOutboundTextLoose(threadPlain);
    if (!t) return false;
    if (t.indexOf(p) !== -1) return true;
    var n = Math.min(72, Math.min(t.length, p.length));
    if (n >= 28 && p.length >= 28 && t.indexOf(p.slice(0, n)) !== -1) return true;
    try {
      var pl = p.toLowerCase();
      var tl = t.toLowerCase();
      if (tl.indexOf(pl) !== -1) return true;
    } catch (ePl) {}
    return false;
  }

  /**
   * Та же фраза в колонке треда, но вёрстка/разрывы строк мешают indexOf по полному тексту.
   * Сравниваем компактные префиксы (буквы+цифры), чтобы не слать queue[0] второй раз после relaxUnknownMulti / сбоя ролей.
   */
  function proposedTextFuzzyInThreadPlain(threadPlain, proposedText) {
    var p = normalizeOutboundTextLoose(proposedText);
    if (!p || p.length < 20) return false;
    var t = normalizeOutboundTextLoose(threadPlain);
    if (!t || t.length < 20) return false;
    try {
      var compactP = p.replace(/[^a-z0-9]+/gi, '').toLowerCase();
      var compactT = t.replace(/[^a-z0-9]+/gi, '').toLowerCase();
      if (compactP.length < 20 || compactT.length < 20) return false;
      var prefixLen = Math.min(56, compactP.length);
      var needle = compactP.slice(0, prefixLen);
      return compactT.indexOf(needle) !== -1;
    } catch (eFz) {
      return false;
    }
  }

  function threadAlreadyShowsQueuePhrase(msgs, threadPlain, q) {
    if (!q) return false;
    var plain = String(threadPlain || '');
    var m = msgs || [];
    return (
      proposedTextMatchesAnyStructuredBubble(m, q) ||
      proposedTextAlreadyInOutgoingMessages(m, q) ||
      (plain && proposedTextAppearsInThreadPlain(plain, q)) ||
      (plain && proposedTextFuzzyInThreadPlain(plain, q))
    );
  }

  /** Наибольший индекс пункта очереди, чей текст найден в plain (для продолжения цепочки без пузырьков). */
  function findMaxQueueIndexInPlain(threadPlain, queue) {
    var maxIdx = -1;
    var qi = 0;
    var plain = String(threadPlain || '');
    for (qi = 0; qi < queue.length; qi++) {
      if (
        proposedTextAppearsInThreadPlain(plain, queue[qi]) ||
        proposedTextFuzzyInThreadPlain(plain, queue[qi])
      ) {
        maxIdx = qi;
      }
    }
    return maxIdx;
  }

  /**
   * Наибольший индекс пункта очереди, который уже виден в треде (пузырьки + plain).
   * Нужен для watch после «последнее от них»: иначе снова предлагается queue[0], хотя добивка уже ушла в историю.
   */
  function findMaxQueueIndexInThread(queue, msgs, threadPlain) {
    var maxIdx = -1;
    var qi = 0;
    var plain = String(threadPlain || '');
    var m = msgs || [];
    for (qi = 0; qi < queue.length; qi++) {
      var q = queue[qi];
      if (!q) continue;
      if (threadAlreadyShowsQueuePhrase(m, plain, q)) {
        maxIdx = qi;
      }
    }
    return maxIdx;
  }

  /** Запомнить в storage, что эта строка очереди уже «отработана», без успешного wait (перезагрузка SPA и т.п.). */
  function shouldPersistOutboundSkipToMemory(dec) {
    if (!dec || dec.action !== 'skip' || !dec.text) return false;
    var r = String(dec.reason || '');
    return (
      r === 'composer_prefilled_matches_proposed' ||
      r === 'proposed_text_already_in_thread_as_outgoing' ||
      r === 'proposed_text_already_in_any_bubble' ||
      r === 'proposed_text_already_in_thread_plain' ||
      r === 'proposed_text_fuzzy_in_thread_plain'
    );
  }

  /** Память по чату: после успешной отправки добивки не предлагать тот же текст снова при повторном открытии (DOM часто отстаёт). */
  var MATCH_CLUB_OUTBOUND_MEM_KEY = 'matchClubLastOutboundByHref';
  /** Последняя «активность» watch по чату: вставка черновика, чтобы при повторном открытии того же чата соблюдался quietMs, если DOM не отдаёт время. */
  var MATCH_CLUB_WATCH_ACTIVITY_KEY = 'matchClubWatchLastActivityByHref';
  /** Дневной счётчик отправок по локальной дате (для цели 700+). */
  var MATCH_CLUB_DAILY_SENT_KEY = 'matchClubDailySentStatsV1';
  /** Почасовая активность расширения (минуты + активные часы). */
  var MATCH_CLUB_ACTIVITY_LOG_KEY = 'matchClubActivityLogV1';

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

  /**
   * Увеличивает дневной счётчик отправок, которые расширение реально подтвердило.
   * @param {number} delta
   * @param {string=} source
   */
  function incrementDailySentCounter(delta, source) {
    return new Promise(function (resolve) {
      var add = typeof delta === 'number' ? Math.floor(delta) : 0;
      if (add < 1) {
        resolve();
        return;
      }
      try {
        chrome.storage.local.get([MATCH_CLUB_DAILY_SENT_KEY], function (o) {
          var dayKey = getLocalDayKey(new Date());
          var raw = (o && o[MATCH_CLUB_DAILY_SENT_KEY]) || {};
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
          var byDay = raw.byDay;
          if (!byDay || typeof byDay !== 'object' || Array.isArray(byDay)) byDay = {};
          var cur = parseInt(byDay[dayKey], 10);
          if (isNaN(cur) || cur < 0) cur = 0;
          byDay[dayKey] = cur + add;
          raw.byDay = byDay;
          raw.updatedAt = new Date().toISOString();
          if (source) raw.lastSource = String(source);
          var out = {};
          out[MATCH_CLUB_DAILY_SENT_KEY] = raw;
          chrome.storage.local.set(out, function () {
            resolve();
          });
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function getLocalHourKey(dateLike) {
    var d = dateLike instanceof Date ? dateLike : new Date();
    var h = d.getHours();
    return h < 10 ? '0' + String(h) : String(h);
  }

  /**
   * Почасовой лог активности для дневного отчёта.
   * В activity пишется только фактическое время «работы пайплайна» (секунды),
   * а в UI показываются минуты и список часов, где активность была > 0.
   */
  function appendActivityRangeToStorage(startMs, endMs, source, meta) {
    return new Promise(function (resolve) {
      var s0 = typeof startMs === 'number' ? Math.floor(startMs) : 0;
      var e0 = typeof endMs === 'number' ? Math.floor(endMs) : 0;
      if (!s0 || !e0 || e0 <= s0) {
        resolve();
        return;
      }
      var start = Math.max(0, s0);
      var end = Math.max(start + 1, e0);
      try {
        chrome.storage.local.get([MATCH_CLUB_ACTIVITY_LOG_KEY], function (o) {
          var raw = (o && o[MATCH_CLUB_ACTIVITY_LOG_KEY]) || {};
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
          if (typeof raw.schemaVersion !== 'number') raw.schemaVersion = 1;
          var byDay = raw.byDay;
          if (!byDay || typeof byDay !== 'object' || Array.isArray(byDay)) byDay = {};
          var cur = start;
          while (cur < end) {
            var dt = new Date(cur);
            var nextHour = new Date(dt);
            nextHour.setMinutes(0, 0, 0);
            nextHour.setHours(nextHour.getHours() + 1);
            var segEnd = Math.min(end, nextHour.getTime());
            var sec = Math.max(1, Math.round((segEnd - cur) / 1000));
            var dayKey = getLocalDayKey(dt);
            var hourKey = getLocalHourKey(dt);
            var dayRec = byDay[dayKey];
            if (!dayRec || typeof dayRec !== 'object' || Array.isArray(dayRec)) {
              dayRec = { totalSec: 0, hoursSec: {}, sessions: [] };
            }
            if (
              !dayRec.hoursSec ||
              typeof dayRec.hoursSec !== 'object' ||
              Array.isArray(dayRec.hoursSec)
            ) {
              dayRec.hoursSec = {};
            }
            dayRec.totalSec = (parseInt(dayRec.totalSec, 10) || 0) + sec;
            dayRec.hoursSec[hourKey] = (parseInt(dayRec.hoursSec[hourKey], 10) || 0) + sec;
            byDay[dayKey] = dayRec;
            cur = segEnd;
          }
          var sessDay = getLocalDayKey(new Date(start));
          if (!byDay[sessDay]) byDay[sessDay] = { totalSec: 0, hoursSec: {}, sessions: [] };
          if (!Array.isArray(byDay[sessDay].sessions)) byDay[sessDay].sessions = [];
          byDay[sessDay].sessions.push({
            startedAt: new Date(start).toISOString(),
            endedAt: new Date(end).toISOString(),
            durationSec: Math.max(1, Math.round((end - start) / 1000)),
            source: String(source || 'unknown'),
            meta: meta && typeof meta === 'object' ? meta : {}
          });
          if (byDay[sessDay].sessions.length > 200) {
            byDay[sessDay].sessions = byDay[sessDay].sessions.slice(-200);
          }
          var dayKeys = Object.keys(byDay).sort();
          if (dayKeys.length > 21) {
            var dropCount = dayKeys.length - 21;
            var di;
            for (di = 0; di < dropCount; di++) {
              delete byDay[dayKeys[di]];
            }
          }
          raw.byDay = byDay;
          raw.updatedAt = new Date().toISOString();
          raw.lastSource = String(source || 'unknown');
          var out = {};
          out[MATCH_CLUB_ACTIVITY_LOG_KEY] = raw;
          chrome.storage.local.set(out, function () {
            resolve();
          });
        });
      } catch (e) {
        resolve();
      }
    });
  }

  function getLastOutboundMemoryForHref(href) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([MATCH_CLUB_OUTBOUND_MEM_KEY], function (o) {
          var map = o && o[MATCH_CLUB_OUTBOUND_MEM_KEY];
          if (!map || typeof map !== 'object') {
            resolve(null);
            return;
          }
          var k = normalizeChatListHref(String(href || ''));
          resolve(map[k] || null);
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  function setWatchLastActivityForChat(href) {
    return new Promise(function (resolve) {
      try {
        var keys = [];
        var a = normalizeChatListHref(String(href || ''));
        var b = '';
        try {
          b = normalizeChatListHref(
            typeof location !== 'undefined' ? location.pathname + location.search : ''
          );
        } catch (eLoc) {}
        if (a) keys.push(a);
        if (b && b !== a) keys.push(b);
        if (keys.length === 0) {
          resolve();
          return;
        }
        chrome.storage.local.get([MATCH_CLUB_WATCH_ACTIVITY_KEY], function (o) {
          var map = (o && o[MATCH_CLUB_WATCH_ACTIVITY_KEY]) || {};
          if (typeof map !== 'object') map = {};
          var now = Date.now();
          var i;
          for (i = 0; i < keys.length; i++) {
            map[keys[i]] = { at: now };
          }
          var obj = {};
          obj[MATCH_CLUB_WATCH_ACTIVITY_KEY] = map;
          chrome.storage.local.set(obj, function () {
            resolve();
          });
        });
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * SPA меняет путь с временного id (-94242328) на стабильный (48605917): ключи storage расходятся.
   * Перед quiet-check копируем max(at) watch и более свежую outbound-память между обоими нормализованными href.
   */
  function mirrorWatchAndOutboundMemoryBetweenHrefs(hrefFromQueue, rawLoc) {
    return new Promise(function (resolve) {
      try {
        var ka = normalizeChatListHref(String(hrefFromQueue || ''));
        var kb = '';
        try {
          kb = normalizeChatListHref(
            String(
              rawLoc != null && rawLoc !== ''
                ? rawLoc
                : typeof location !== 'undefined'
                  ? location.pathname + location.search
                  : ''
            )
          );
        } catch (eLoc) {}
        if (!ka || !kb || ka === kb) {
          resolve();
          return;
        }
        chrome.storage.local.get(
          [MATCH_CLUB_WATCH_ACTIVITY_KEY, MATCH_CLUB_OUTBOUND_MEM_KEY],
          function (o) {
            var wMap = (o && o[MATCH_CLUB_WATCH_ACTIVITY_KEY]) || {};
            var mMap = (o && o[MATCH_CLUB_OUTBOUND_MEM_KEY]) || {};
            if (typeof wMap !== 'object') wMap = {};
            if (typeof mMap !== 'object') mMap = {};
            var wAt = null;
            if (wMap[ka] && typeof wMap[ka].at === 'number') wAt = wMap[ka].at;
            if (wMap[kb] && typeof wMap[kb].at === 'number') {
              wAt = wAt == null ? wMap[kb].at : Math.max(wAt, wMap[kb].at);
            }
            if (wAt != null) {
              wMap[ka] = { at: wAt };
              wMap[kb] = { at: wAt };
            }
            var mA = mMap[ka];
            var mB = mMap[kb];
            var pick = null;
            if (mA && mB) {
              pick = mergeOutboundMemoryRecords(mA, mB);
            } else {
              pick = mA || mB;
            }
            if (pick) {
              mMap[ka] = pick;
              mMap[kb] = pick;
            }
            var obj = {};
            obj[MATCH_CLUB_WATCH_ACTIVITY_KEY] = wMap;
            obj[MATCH_CLUB_OUTBOUND_MEM_KEY] = mMap;
            chrome.storage.local.set(obj, function () {
              resolve();
            });
          }
        );
      } catch (e) {
        resolve();
      }
    });
  }

  function setLastOutboundMemoryForHref(href, payload) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([MATCH_CLUB_OUTBOUND_MEM_KEY], function (o) {
          var map = (o && o[MATCH_CLUB_OUTBOUND_MEM_KEY]) || {};
          if (typeof map !== 'object') map = {};
          var k = normalizeChatListHref(String(href || ''));
          if (!k) {
            resolve();
            return;
          }
          var prev = map[k] || null;
          var recentTexts = mergeRecentOutboundTexts(prev, payload.text);
          map[k] = {
            queueIndex:
              typeof payload.queueIndex === 'number' ? payload.queueIndex : -1,
            text: String(payload.text || ''),
            at: Date.now(),
            recentTexts: recentTexts
          };
          var obj = {};
          obj[MATCH_CLUB_OUTBOUND_MEM_KEY] = map;
          chrome.storage.local.set(obj, function () {
            resolve();
          });
        });
      } catch (e) {
        resolve();
      }
    });
  }

  /**
   * Тот же href и тот же текст шага очереди уже были успешно отработаны недавно — не вставлять снова.
   * @param {{ text?: string, at?: number, queueIndex?: number }|null} mem
   */
  function shouldSkipOutboundRepeatFromMemory(mem, dec) {
    if (!mem || typeof mem.at !== 'number') return false;
    if (!dec || dec.action !== 'send' || !dec.text) return false;
    var age = Date.now() - mem.at;
    if (age > 7 * 24 * 3600000) return false;
    var candidates = [];
    if (Array.isArray(mem.recentTexts)) {
      var ri = 0;
      for (ri = 0; ri < mem.recentTexts.length; ri++) {
        var c = String(mem.recentTexts[ri] || '').trim();
        if (c) candidates.push(c);
      }
    }
    var lastT = String(mem.text || '').trim();
    if (lastT) candidates.push(lastT);
    var ci = 0;
    for (ci = 0; ci < candidates.length; ci++) {
      if (outboundTextsLooselyMatch(candidates[ci], dec.text)) return true;
    }
    return false;
  }

  function mergeRecentOutboundTexts(prevMem, newText) {
    var list = [];
    var nt = String(newText || '').trim();
    if (nt) list.push(nt);
    function pushUnique(s) {
      var x = String(s || '').trim();
      if (!x) return;
      var j = 0;
      for (j = 0; j < list.length; j++) {
        if (outboundTextsLooselyMatch(list[j], x)) return;
      }
      list.push(x);
    }
    if (prevMem && Array.isArray(prevMem.recentTexts)) {
      var i = 0;
      for (i = 0; i < prevMem.recentTexts.length; i++) {
        pushUnique(prevMem.recentTexts[i]);
      }
    }
    if (prevMem && prevMem.text) pushUnique(prevMem.text);
    if (list.length > 24) list = list.slice(0, 24);
    return list;
  }

  /** Слияние двух записей памяти (разные href до/после редиректа SPA). */
  function mergeOutboundMemoryRecords(mA, mB) {
    if (!mA && !mB) return null;
    if (!mA) return mB;
    if (!mB) return mA;
    var atA = typeof mA.at === 'number' ? mA.at : 0;
    var atB = typeof mB.at === 'number' ? mB.at : 0;
    var newer = atA >= atB ? mA : mB;
    var older = atA >= atB ? mB : mA;
    var recent = mergeRecentOutboundTexts(newer, newer.text);
    recent = mergeRecentOutboundTexts({ recentTexts: recent, text: older.text }, '');
    if (older.recentTexts) {
      var oi = 0;
      for (oi = 0; oi < older.recentTexts.length; oi++) {
        recent = mergeRecentOutboundTexts({ recentTexts: recent }, older.recentTexts[oi]);
      }
    }
    return {
      queueIndex: typeof newer.queueIndex === 'number' ? newer.queueIndex : -1,
      text: String(newer.text || ''),
      at: Math.max(atA, atB),
      recentTexts: recent
    };
  }

  /**
   * Разбор «12:12» / «12:12 today» в миллисекунды сегодняшней даты (локальное время браузера).
   */
  function parseHmStringToTodayMs(str) {
    if (!str) return null;
    var s = String(str).trim();
    var m = s.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (m[3]) {
      var ap = String(m[3]).toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
    }
    if (isNaN(h) || isNaN(min) || min > 59 || h > 23) return null;
    var d = new Date();
    d.setMilliseconds(0);
    d.setSeconds(0, 0);
    d.setHours(h, min, 0, 0);
    return d.getTime();
  }

  /**
   * timeLabel / одна строка метаданных: HH:MM, DD.MM.YYYY HH:MM, DD/MM/YYYY HH:MM, «12:39 today».
   * (Короткие строки; для длинного текста см. getMaxEuropeanDateTimeInPlainMs на всём plain.)
   */
  function parseMessageTimeLabelToMs(label) {
    if (label == null) return null;
    var s = String(label).trim();
    if (!s) return null;
    var t = parseHmStringToTodayMs(s);
    if (t != null) return t;
    var eu = getMaxEuropeanDateTimeInPlainMs(s);
    if (eu != null) return eu;
    var sl = getMaxSlashDateTimeInPlainMs(s);
    if (sl != null) return sl;
    var rel = getLastRelativeTodayYesterdayTimeMs(s);
    if (rel != null) return rel;
    return null;
  }

  /** Время последнего исходящего (me): timeLabel на пузырьке или время в plain после текста сообщения. */
  function getLastMeMessageTimeMs(msgs, plain) {
    var i = 0;
    for (i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'me') break;
    }
    if (i < 0) return null;
    var tms = parseMessageTimeLabelToMs(msgs[i].timeLabel);
    if (tms != null) return tms;
    var snippet = String(msgs[i].text || '').slice(0, 52).trim();
    if (plain && snippet.length > 6) {
      var ix = plain.indexOf(snippet);
      if (ix < 0) {
        snippet = String(msgs[i].text || '').slice(0, 28).trim();
        ix = plain.indexOf(snippet);
      }
      if (ix >= 0) {
        var tail = plain.slice(ix, Math.min(plain.length, ix + 320));
        var bt = bestTimeMsFromMessageTail(tail);
        if (bt != null) return bt;
      }
    }
    return null;
  }

  /**
   * Время последнего сообщения в треде (любая роль): по timeLabel последнего пузырька или по plain.
   * Нужно для правила «не вставлять добивку раньше delayMs после любой активности в чате».
   */
  function getLastAnyMessageTimeMs(msgs, plain) {
    var p = String(plain || '');
    var candidates = [];
    var fromPlain = getLastClockInPlainMs(p);
    if (fromPlain != null) candidates.push(fromPlain);
    if (msgs && msgs.length > 0) {
      var mi;
      for (mi = 0; mi < msgs.length; mi++) {
        var msg = msgs[mi];
        var tl = parseMessageTimeLabelToMs(msg.timeLabel);
        if (tl != null) candidates.push(tl);
        var tx = String(msg.text || '');
        var euTx = getMaxEuropeanDateTimeInPlainMs(tx);
        if (euTx != null) candidates.push(euTx);
        var slTx = getMaxSlashDateTimeInPlainMs(tx);
        if (slTx != null) candidates.push(slTx);
        var hmTx = getLastClockInPlainMs(tx);
        if (hmTx != null) candidates.push(hmTx);
      }
    }
    if (candidates.length === 0) return null;
    return Math.max.apply(null, candidates);
  }

  /**
   * Подрезает абсурдные «будущие» метки (DOM/storage), чтобы age не уходил в минус в логах и в gate.
   * @param {number|null} tms
   * @param {number} [nowMs] один снимок часов для clamp и последующего age
   * @returns {number|null}
   */
  function clampThreadActivityAnchorMs(tms, nowMs) {
    if (tms == null || typeof tms !== 'number' || isNaN(tms)) return tms;
    var now = typeof nowMs === 'number' ? nowMs : Date.now();
    if (tms > now) return now;
    return tms;
  }

  /**
   * Единый якорь «последней активности» для правила quiet: DOM, память отправки, метка после вставки черновика.
   * Возвращает и агрегированный якорь, и диагностику источников.
   * @returns {Promise<{ anchorMs: number|null, debug: object }>}
   */
  function resolveThreadActivityAnchorInfo(msgs, plain, href) {
    return new Promise(function (resolve) {
      var tDom = getLastAnyMessageTimeMs(msgs, plain);
      var keys = [];
      var a = normalizeChatListHref(String(href || ''));
      var b = '';
      try {
        b = normalizeChatListHref(
          typeof location !== 'undefined' ? location.pathname + location.search : ''
        );
      } catch (e) {}
      if (a) keys.push(a);
      if (b && b !== a) keys.push(b);
      try {
        chrome.storage.local.get(
          [MATCH_CLUB_OUTBOUND_MEM_KEY, MATCH_CLUB_WATCH_ACTIVITY_KEY],
          function (o) {
            var nowMerge = Date.now();
            var maxFutureSkewMs = 5 * 60 * 1000;
            var minReasonableMs = 1577836800000; // 2020-01-01T00:00:00.000Z
            var memMap = o && o[MATCH_CLUB_OUTBOUND_MEM_KEY];
            var watchMap = o && o[MATCH_CLUB_WATCH_ACTIVITY_KEY];
            var candidates = [];
            var tDomValid = null;
            var memAtValid = null;
            var watchAtValid = null;
            var rejected = {
              domFuture: false,
              domTooOld: false,
              memFuture: false,
              memTooOld: false,
              watchFuture: false,
              watchTooOld: false
            };
            function validateAnchorMs(ms, kind) {
              if (ms == null || typeof ms !== 'number' || isNaN(ms)) return null;
              if (ms > nowMerge + maxFutureSkewMs) {
                if (kind === 'dom') rejected.domFuture = true;
                else if (kind === 'mem') rejected.memFuture = true;
                else if (kind === 'watch') rejected.watchFuture = true;
                return null;
              }
              if (ms < minReasonableMs) {
                if (kind === 'dom') rejected.domTooOld = true;
                else if (kind === 'mem') rejected.memTooOld = true;
                else if (kind === 'watch') rejected.watchTooOld = true;
                return null;
              }
              return ms;
            }
            tDomValid = validateAnchorMs(tDom, 'dom');
            if (tDomValid != null) candidates.push(tDomValid);
            var memAt = null;
            var watchAt = null;
            var ki;
            for (ki = 0; ki < keys.length; ki++) {
              if (!keys[ki]) continue;
              if (
                memMap &&
                memMap[keys[ki]] &&
                typeof memMap[keys[ki]].at === 'number'
              ) {
                memAt =
                  memAt == null
                    ? memMap[keys[ki]].at
                    : Math.max(memAt, memMap[keys[ki]].at);
              }
              if (
                watchMap &&
                watchMap[keys[ki]] &&
                typeof watchMap[keys[ki]].at === 'number'
              ) {
                watchAt =
                  watchAt == null
                    ? watchMap[keys[ki]].at
                    : Math.max(watchAt, watchMap[keys[ki]].at);
              }
            }
            memAtValid = validateAnchorMs(memAt, 'mem');
            watchAtValid = validateAnchorMs(watchAt, 'watch');
            if (memAtValid != null) candidates.push(memAtValid);
            if (watchAtValid != null) candidates.push(watchAtValid);
            if (candidates.length === 0) {
              resolve({
                anchorMs: null,
                debug: {
                  keys: keys,
                  tDom: tDom,
                  tDomValid: tDomValid,
                  anchorDomRejectedFuture: rejected.domFuture,
                  anchorDomRejectedTooOld: rejected.domTooOld,
                  memAt: memAt,
                  memAtValid: memAtValid,
                  anchorMemRejectedFuture: rejected.memFuture,
                  anchorMemRejectedTooOld: rejected.memTooOld,
                  watchAt: watchAt,
                  watchAtValid: watchAtValid,
                  anchorWatchRejectedFuture: rejected.watchFuture,
                  anchorWatchRejectedTooOld: rejected.watchTooOld,
                  source: 'none'
                }
              });
              return;
            }
            var merged = Math.max.apply(null, candidates);
            var clamped = clampThreadActivityAnchorMs(merged, nowMerge);
            var source = 'mixed';
            if (clamped === tDomValid) source = 'dom';
            else if (clamped === memAtValid) source = 'outbound_mem';
            else if (clamped === watchAtValid) source = 'watch_activity';
            resolve({
              anchorMs: clamped,
              debug: {
                keys: keys,
                tDom: tDom,
                tDomValid: tDomValid,
                anchorDomRejectedFuture: rejected.domFuture,
                anchorDomRejectedTooOld: rejected.domTooOld,
                memAt: memAt,
                memAtValid: memAtValid,
                anchorMemRejectedFuture: rejected.memFuture,
                anchorMemRejectedTooOld: rejected.memTooOld,
                watchAt: watchAt,
                watchAtValid: watchAtValid,
                anchorWatchRejectedFuture: rejected.watchFuture,
                anchorWatchRejectedTooOld: rejected.watchTooOld,
                merged: merged,
                source: source
              }
            });
          }
        );
      } catch (e) {
        resolve({
          anchorMs: clampThreadActivityAnchorMs(tDom != null ? tDom : null),
          debug: {
            keys: keys,
            tDom: tDom,
            memAt: null,
            watchAt: null,
            source: tDom != null ? 'dom_fallback' : 'none_error_fallback'
          }
        });
      }
    });
  }

  /**
   * Backward-compatible wrapper for old callsites.
   * @returns {Promise<number|null>}
   */
  function resolveThreadActivityAnchorMs(msgs, plain, href) {
    return resolveThreadActivityAnchorInfo(msgs, plain, href).then(function (r) {
      return r && typeof r === 'object' ? r.anchorMs : null;
    });
  }

  /**
   * Прошло ли quietMs с момента последнего сообщения в треде (любая сторона).
   * Если время не распарсилось — не блокируем (как в checkOutboundCooldown).
   */
  function watchThreadQuietEnough(msgs, plain, quietMs) {
    if (!quietMs || quietMs <= 0) {
      return {
        ok: true,
        lastActivityMs: null,
        waitMs: 0,
        ageMsAtDecision: null
      };
    }
    var now = Date.now();
    var tmsRaw = getLastAnyMessageTimeMs(msgs, plain);
    if (tmsRaw == null) {
      return {
        ok: true,
        lastActivityMs: null,
        waitMs: 0,
        ageMsAtDecision: null
      };
    }
    var tms = clampThreadActivityAnchorMs(tmsRaw, now);
    var age = now - tms;
    if (age < quietMs) {
      return {
        ok: false,
        lastActivityMs: tms,
        waitMs: quietMs - age,
        ageMsAtDecision: age
      };
    }
    return { ok: true, lastActivityMs: tms, waitMs: 0, ageMsAtDecision: age };
  }

  /**
   * То же для watch: DOM + storage (последняя отправка по памяти + последняя вставка черновика по этому чату).
   */
  function watchThreadQuietEnoughAsync(msgs, plain, quietMs, href) {
    return resolveThreadActivityAnchorInfo(msgs, plain, href).then(function (resolved) {
      var tmsRaw = resolved && typeof resolved === 'object' ? resolved.anchorMs : null;
      var dbg = resolved && typeof resolved === 'object' ? resolved.debug || {} : {};
      var now = Date.now();
      if (!quietMs || quietMs <= 0) {
        return {
          ok: true,
          lastActivityMs:
            tmsRaw != null ? clampThreadActivityAnchorMs(tmsRaw, now) : null,
          waitMs: 0,
          ageMsAtDecision: null,
          anchorDebug: dbg
        };
      }
      if (tmsRaw == null) {
        return {
          ok: true,
          lastActivityMs: null,
          waitMs: 0,
          ageMsAtDecision: null,
          anchorDebug: dbg
        };
      }
      var tms = clampThreadActivityAnchorMs(tmsRaw, now);
      var age = now - tms;
      if (age < quietMs) {
        return {
          ok: false,
          lastActivityMs: tms,
          waitMs: quietMs - age,
          ageMsAtDecision: age,
          anchorDebug: dbg
        };
      }
      return {
        ok: true,
        lastActivityMs: tms,
        waitMs: 0,
        ageMsAtDecision: age,
        anchorDebug: dbg
      };
    });
  }

  /**
   * Англ. UI списка чатов: «12:39 today», «today 12:39», «yesterday», нем. «heute»/«gestern».
   * Берётся время последнего совпадения по индексу в строке (низ треда = новее).
   */
  function getLastRelativeTodayYesterdayTimeMs(plain) {
    var s = String(plain || '');
    var bestMs = null;
    var bestIdx = -1;
    function bump(ms, idx) {
      if (ms == null || isNaN(ms)) return;
      if (idx >= bestIdx) {
        bestIdx = idx;
        bestMs = ms;
      }
    }
    var m = null;
    var re1 = /(\d{1,2}):(\d{2})(?:\s*(am|pm))?\s+today\b/gi;
    while ((m = re1.exec(s)) !== null) {
      bump(
        parseHmStringToTodayMs(
          m[1] + ':' + m[2] + (m[3] ? ' ' + m[3] : '')
        ),
        m.index
      );
    }
    var re2 = /\btoday\b[^\d]{0,40}(\d{1,2}):(\d{2})(?:\s*(am|pm))?/gi;
    while ((m = re2.exec(s)) !== null) {
      bump(
        parseHmStringToTodayMs(
          m[1] + ':' + m[2] + (m[3] ? ' ' + m[3] : '')
        ),
        m.index
      );
    }
    var re2b = /\btoday\s+at\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?/gi;
    while ((m = re2b.exec(s)) !== null) {
      bump(
        parseHmStringToTodayMs(
          m[1] + ':' + m[2] + (m[3] ? ' ' + m[3] : '')
        ),
        m.index
      );
    }
    var re3 = /(\d{1,2}):(\d{2})(?:\s*(am|pm))?\s+yesterday\b/gi;
    while ((m = re3.exec(s)) !== null) {
      var dY = new Date();
      dY.setDate(dY.getDate() - 1);
      var hY = parseInt(m[1], 10);
      var minY = parseInt(m[2], 10);
      if (m[3]) {
        var apY = String(m[3]).toLowerCase();
        if (apY === 'pm' && hY < 12) hY += 12;
        if (apY === 'am' && hY === 12) hY = 0;
      }
      dY.setMilliseconds(0);
      dY.setSeconds(0, 0);
      dY.setHours(hY, minY, 0, 0);
      bump(dY.getTime(), m.index);
    }
    var re4 = /(\d{1,2}):(\d{2})(?:\s*Uhr)?\s+heute\b/gi;
    while ((m = re4.exec(s)) !== null) {
      bump(parseHmStringToTodayMs(m[1] + ':' + m[2]), m.index);
    }
    var re5 = /(\d{1,2}):(\d{2})(?:\s*Uhr)?\s+gestern\b/gi;
    while ((m = re5.exec(s)) !== null) {
      var dG = new Date();
      dG.setDate(dG.getDate() - 1);
      dG.setMilliseconds(0);
      dG.setSeconds(0, 0);
      dG.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
      bump(dG.getTime(), m.index);
    }
    return bestMs;
  }

  function bestTimeMsFromMessageTail(tail) {
    if (!tail) return null;
    var eu = getMaxEuropeanDateTimeInPlainMs(tail);
    var sl = getMaxSlashDateTimeInPlainMs(tail);
    var rel = getLastRelativeTodayYesterdayTimeMs(tail);
    var mm = tail.match(/(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
    var hm = mm
      ? parseHmStringToTodayMs(
          mm[1] + ':' + mm[2] + (mm[3] ? ' ' + mm[3] : '')
        )
      : null;
    var cands = [];
    if (eu != null) cands.push(eu);
    if (sl != null) cands.push(sl);
    if (rel != null) cands.push(rel);
    if (hm != null) cands.push(hm);
    if (cands.length === 0) return null;
    return Math.max.apply(null, cands);
  }

  /**
   * Последнее вхождение даты/времени вида DD.MM.YYYY, HH:MM (как на match-club в колонке треда).
   */
  function getLastEuropeanDateTimeInPlainMs(plain) {
    var s = String(plain || '');
    var re =
      /\b(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})\b/g;
    var last = null;
    var m = null;
    while ((m = re.exec(s)) !== null) {
      last = m;
    }
    if (!last) return null;
    var day = parseInt(last[1], 10);
    var month = parseInt(last[2], 10) - 1;
    var year = parseInt(last[3], 10);
    var h = parseInt(last[4], 10);
    var min = parseInt(last[5], 10);
    var d = new Date(year, month, day, h, min, 0, 0);
    if (isNaN(d.getTime())) return null;
    return d.getTime();
  }

  /**
   * Максимум по всем вхождениям DD.MM.YYYY[, ]HH:MM (хронологически последняя активность в треде).
   */
  function getMaxEuropeanDateTimeInPlainMs(plain) {
    var s = String(plain || '');
    var re =
      /\b(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})\b/g;
    var best = null;
    var m = null;
    while ((m = re.exec(s)) !== null) {
      var day = parseInt(m[1], 10);
      var month = parseInt(m[2], 10) - 1;
      var year = parseInt(m[3], 10);
      var h = parseInt(m[4], 10);
      var min = parseInt(m[5], 10);
      var d = new Date(year, month, day, h, min, 0, 0);
      if (!isNaN(d.getTime())) {
        var t = d.getTime();
        best = best == null ? t : Math.max(best, t);
      }
    }
    return best;
  }

  /** Максимум по DD/MM/YYYY[, ]HH:MM */
  function getMaxSlashDateTimeInPlainMs(plain) {
    var s = String(plain || '');
    var re =
      /\b(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})\b/g;
    var best = null;
    var m = null;
    while ((m = re.exec(s)) !== null) {
      var day = parseInt(m[1], 10);
      var month = parseInt(m[2], 10) - 1;
      var year = parseInt(m[3], 10);
      var h = parseInt(m[4], 10);
      var min = parseInt(m[5], 10);
      var d = new Date(year, month, day, h, min, 0, 0);
      if (!isNaN(d.getTime())) {
        var t = d.getTime();
        best = best == null ? t : Math.max(best, t);
      }
    }
    return best;
  }

  /** Последнее вхождение час:мин в тексте колонки (эвристика, если роли не разобрали). */
  function getLastClockInPlainMs(plain) {
    var s = String(plain || '');
    var candidates = [];
    var eu = getMaxEuropeanDateTimeInPlainMs(s);
    if (eu != null) candidates.push(eu);
    var slashM = getMaxSlashDateTimeInPlainMs(s);
    if (slashM != null) candidates.push(slashM);
    var relAll = getLastRelativeTodayYesterdayTimeMs(s);
    if (relAll != null) candidates.push(relAll);
    var re = /\b(\d{1,2}):(\d{2})\b/g;
    var last = null;
    var m = null;
    while ((m = re.exec(s)) !== null) {
      last = m;
    }
    if (last) {
      var hm = parseHmStringToTodayMs(last[1] + ':' + last[2]);
      if (hm != null) candidates.push(hm);
    }
    if (candidates.length === 0) return null;
    return Math.max.apply(null, candidates);
  }

  /**
   * Не предлагать следующий пункт сразу после недавней отправки (тот же чат открылся снова в экспорте).
   * @param {number} cooldownMs — 0 = выключено
   */
  function checkOutboundCooldown(msgs, plain, cooldownMs) {
    if (!cooldownMs || cooldownMs <= 0) {
      return { tooRecent: false };
    }
    var lastRole = msgs.length ? msgs[msgs.length - 1].role : '';
    var tms = getLastMeMessageTimeMs(msgs, plain);
    if (tms == null && lastRole === 'me') {
      tms = getLastClockInPlainMs(plain);
    }
    if (
      tms == null &&
      (msgs.length === 0 || (msgs.length === 1 && msgs[0].role === 'unknown'))
    ) {
      tms = getLastClockInPlainMs(plain);
    }
    if (tms == null) return { tooRecent: false };
    var nowCd = Date.now();
    var tmsCd = clampThreadActivityAnchorMs(tms, nowCd);
    var age = nowCd - tmsCd;
    if (age < cooldownMs) {
      return { tooRecent: true, ageMs: age, lastClockMs: tmsCd };
    }
    return { tooRecent: false };
  }

  /**
   * Решение: отправить ли следующий пункт очереди и какой текст.
   * @param {string} [threadPlain] — сырой текст колонки треда: если пузырьки не извлечены, по нему ищем уже отправленные пункты очереди и берём следующий.
   * @param {{ cooldownMs?: number, allowFirstAfterPeerLast?: boolean, relaxUnknownMulti?: boolean, forcePlainWhenEmptyExtract?: boolean }} [opts] — cooldown; для watch новых чатов: после сообщения собеседника/бота всё равно предложить queue[0] как первую добивку; `relaxUnknownMulti` — если последнее сообщение с ролью unknown при нескольких пузырьках, не отбрасывать сразу, а свести к plain-only (как в экспорте); `forcePlainWhenEmptyExtract` — если пузырьки ещё не извлечены и plain пустой, всё равно решать по plain-only (последняя попытка в цикле watch/экспорта)
   * @returns {{ action: 'send'|'skip'|'off', text?: string, queueIndex?: number, reason: string }}
   */
  function decideOutboundSend(queue, ctxMessages, threadPlain, opts) {
    opts = opts || {};
    var allowFirstAfterPeerLast = opts.allowFirstAfterPeerLast === true;
    var relaxUnknownMulti = opts.relaxUnknownMulti === true;
    var forcePlainWhenEmptyExtract = opts.forcePlainWhenEmptyExtract === true;
    var cooldownMs =
      typeof opts.cooldownMs === 'number' && opts.cooldownMs >= 0 ? opts.cooldownMs : 120000;
    if (!queue || queue.length === 0) {
      return { action: 'off', reason: 'no_queue' };
    }
    var msgs = ctxMessages || [];
    var plain = String(threadPlain || '').replace(/\s+\n/g, '\n').trim();

    function gateSend(text, queueIndex, reason) {
      var composerPre = findComposerInActiveChat();
      var preFill = getComposerText(composerPre);
      if (preFill && outboundTextsLooselyMatch(preFill, text)) {
        return {
          action: 'skip',
          reason: 'composer_prefilled_matches_proposed',
          text: text,
          queueIndex: queueIndex
        };
      }
      if (proposedTextAlreadyInOutgoingMessages(msgs, text)) {
        return {
          action: 'skip',
          reason: 'proposed_text_already_in_thread_as_outgoing',
          text: text,
          queueIndex: queueIndex
        };
      }
      if (proposedTextMatchesAnyStructuredBubble(msgs, text)) {
        return {
          action: 'skip',
          reason: 'proposed_text_already_in_any_bubble',
          text: text,
          queueIndex: queueIndex
        };
      }
      if (plain && proposedTextAppearsInThreadPlain(plain, text)) {
        return {
          action: 'skip',
          reason: 'proposed_text_already_in_thread_plain',
          text: text,
          queueIndex: queueIndex
        };
      }
      if (plain && proposedTextFuzzyInThreadPlain(plain, text)) {
        return {
          action: 'skip',
          reason: 'proposed_text_fuzzy_in_thread_plain',
          text: text,
          queueIndex: queueIndex
        };
      }
      var cd = checkOutboundCooldown(msgs, plain, cooldownMs);
      if (cd.tooRecent) {
        return {
          action: 'skip',
          reason: 'last_outgoing_too_recent',
          cooldownMs: cooldownMs,
          lastOutgoingAgeMs: cd.ageMs,
          lastClockMs: cd.lastClockMs
        };
      }
      return {
        action: 'send',
        text: text,
        queueIndex: queueIndex,
        reason: reason
      };
    }

    function decideFromPlainOnly(reasonFirst, reasonSeq) {
      var maxQ = findMaxQueueIndexInThread(queue, msgs, plain);
      if (maxQ >= 0) {
        if (maxQ >= queue.length - 1) {
          return {
            action: 'skip',
            reason: 'queue_exhausted_detected_in_plain_only'
          };
        }
        return gateSend(queue[maxQ + 1], maxQ + 1, reasonSeq || 'plain_only_sequence_continue');
      }
      var plainStrippedForAnchor = plain.replace(/\s/g, '');
      if (plainStrippedForAnchor.length < 12) {
        return {
          action: 'skip',
          reason: 'plain_too_short_to_anchor_queue'
        };
      }
      return gateSend(queue[0], 0, reasonFirst || 'empty_thread_send_first');
    }

    if (msgs.length === 0) {
      var plainStripped = plain.replace(/\s/g, '');
      if (
        !forcePlainWhenEmptyExtract &&
        plainStripped.length < 12
      ) {
        return {
          action: 'skip',
          reason: 'thread_not_ready_empty_extract'
        };
      }
      return decideFromPlainOnly('empty_thread_send_first', 'plain_only_sequence_continue');
    }
    var last = msgs[msgs.length - 1];
    var role = last.role;
    var text = last.text || '';
    if (role === 'unknown') {
      if (
        msgs.length === 1 &&
        plain &&
        String(text).trim() === plain.trim()
      ) {
        return decideFromPlainOnly(
          'unknown_blob_try_first',
          'unknown_blob_sequence_from_plain'
        );
      }
      if (relaxUnknownMulti && msgs.length > 1) {
        return decideFromPlainOnly(
          'watch_unknown_multi_relaxed',
          'plain_only_sequence_continue'
        );
      }
      return { action: 'skip', reason: 'last_message_role_unknown' };
    }
    if (role === 'them') {
      if (allowFirstAfterPeerLast && queue && queue.length > 0) {
        var maxAfterPeer = findMaxQueueIndexInThread(queue, msgs, plain);
        if (maxAfterPeer >= queue.length - 1) {
          return {
            action: 'skip',
            reason: 'queue_exhausted_after_peer_last'
          };
        }
        return gateSend(
          queue[maxAfterPeer + 1],
          maxAfterPeer + 1,
          'watch_first_followup_after_peer'
        );
      }
      return { action: 'skip', reason: 'last_message_from_peer' };
    }
    if (role === 'me') {
      if (!String(text).trim()) {
        return { action: 'skip', reason: 'empty_last_outgoing' };
      }
      var idx = findQueueIndexForText(queue, text);
      if (idx < 0) {
        var bestT = -1;
        var ti = 0;
        for (ti = 0; ti < queue.length; ti++) {
          if (outboundTextsLooselyMatch(queue[ti], text)) {
            if (ti > bestT) bestT = ti;
          }
        }
        idx = bestT;
      }
      if (idx < 0) {
        return { action: 'skip', reason: 'outgoing_last_not_in_queue' };
      }
      if (idx >= queue.length - 1) {
        return { action: 'skip', reason: 'queue_exhausted_last_matches_final' };
      }
      dexLog(
        'decideOutboundSend sequence: last matched queue',
        idx,
        'inserting',
        idx + 1,
        'reason',
        'sequence_continue'
      );
      return gateSend(queue[idx + 1], idx + 1, 'sequence_continue');
    }
    return { action: 'skip', reason: 'unexpected_last_role' };
  }

  /** Кнопка отправки рядом с композером (SPA без стабильного class). */
  function findSendButtonNearComposer(composer) {
    if (!composer) return null;
    var el = composer;
    var d = 0;
    for (d = 0; d < 10 && el; d++) {
      var root = el.closest('form');
      if (!root) {
        root = el.parentElement;
      }
      if (!root) break;
      var btns = root.querySelectorAll('button');
      var bi = 0;
      for (bi = 0; bi < btns.length; bi++) {
        var b = btns[bi];
        if (!isVisible(b)) continue;
        var al = (b.getAttribute('aria-label') || '').toLowerCase();
        var cls = String(b.className || '');
        if (b.getAttribute('disabled') != null || b.disabled) continue;
        if (b.type === 'submit') return b;
        if (al.indexOf('send') !== -1) return b;
        if (/send|submit|plane/i.test(cls)) return b;
      }
      el = root.parentElement;
    }
    var fallback = document.querySelector(
      'button[type="submit"][form], form button[type="submit"], button[aria-label*="send" i]'
    );
    return fallback && isVisible(fallback) ? fallback : null;
  }

  /**
   * Подставить текст и нажать отправку (или Enter).
   * @returns {Promise<{ok: boolean, error?: string, method?: string}>}
   */
  async function sendMessageToChat(text) {
    var dr = insertDraft(text);
    if (!dr.ok) {
      return { ok: false, error: dr.error || 'insertDraft' };
    }
    await sleep(60);
    var composer = findComposerInActiveChat();
    var btn = findSendButtonNearComposer(composer);
    if (btn) {
      try {
        btn.click();
        dexLog('sendMessageToChat: button click');
        return { ok: true, method: 'button_click' };
      } catch (e) {
        return { ok: false, error: 'click_failed' };
      }
    }
    if (composer) {
      try {
        composer.focus();
        composer.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
        );
        composer.dispatchEvent(
          new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
        );
        dexLog('sendMessageToChat: Enter fallback');
        return { ok: true, method: 'enter_fallback' };
      } catch (e2) {
        return { ok: false, error: 'enter_failed' };
      }
    }
    return { ok: false, error: 'no_send_control' };
  }

  /**
   * Нажать отправку для уже вставленного текста в активном композере.
   * @returns {{ok: boolean, error?: string, method?: string}}
   */
  function sendExistingDraftFromComposer() {
    var composer = findComposerInActiveChat();
    var btn = findSendButtonNearComposer(composer);
    if (btn) {
      try {
        btn.click();
        dexLog('sendExistingDraftFromComposer: button click');
        return { ok: true, method: 'button_click' };
      } catch (e) {
        return { ok: false, error: 'click_failed' };
      }
    }
    if (composer) {
      try {
        composer.focus();
        composer.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
        );
        composer.dispatchEvent(
          new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
        );
        dexLog('sendExistingDraftFromComposer: Enter fallback');
        return { ok: true, method: 'enter_fallback' };
      } catch (e2) {
        return { ok: false, error: 'enter_failed' };
      }
    }
    return { ok: false, error: 'no_send_control' };
  }

  /**
   * Фаза human-in-the-loop: текст уже в поле «Write message», ждём ручную отправку.
   * Успех: в треде появилось новое сообщение с ролью me (число сообщений выросло).
   * @param {{ strictThreadConfirm?: boolean, priorityHumanSend?: boolean, allowDraftDeletionExit?: boolean, composerEmptyConfirmTicks?: number, expectedChatHrefKey?: string }} [opts]
   * - priorityHumanSend: Paid/First SMS, черновик только в композере; не считать «уже в треде» по подстроке в plain (ложный ok -> следующий чат). Исходящее строго только role === me.
   * - allowDraftDeletionExit: если пользователь удалил черновик из композера, выходим из wait и продолжаем pipeline.
   * - composerEmptyConfirmTicks: сколько подряд тиков с пустым композером для draft_deleted_by_user (по умолчанию 6; для paid_only режима короче).
   */
  async function waitForUserManualSend(messageCountBefore, timeoutMs, opts) {
    opts = opts || {};
    var strictThreadConfirm = opts.strictThreadConfirm === true;
    var priorityHumanSend = opts.priorityHumanSend === true;
    var allowDraftDeletionExit = opts.allowDraftDeletionExit === true;
    var composerEmptyConfirmTicks =
      typeof opts.composerEmptyConfirmTicks === 'number' && opts.composerEmptyConfirmTicks >= 1
        ? Math.min(20, Math.floor(opts.composerEmptyConfirmTicks))
        : 6;
    var cap =
      typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 600000;
    var deadline = Date.now() + cap;
    var expectedHrefNorm = normalizeChatListHref(opts.expectedChatHrefKey || '');
    var composer0 = findComposerInActiveChat();
    var draftAtStart = String(getComposerText(composer0) || '').trim();
    var emptyComposerStreak = 0;
    var sawComposerFocused = false;
    var lastUserDeleteIntentAt = 0;
    var userDeleteIntentCount = 0;
    function eventBelongsToActiveComposer(target) {
      var cmp = findComposerInActiveChat();
      if (!cmp || !target) return false;
      return target === cmp || (typeof cmp.contains === 'function' && cmp.contains(target));
    }
    function markUserDeleteIntentFromEvent(target) {
      if (!priorityHumanSend || !allowDraftDeletionExit) return;
      if (!eventBelongsToActiveComposer(target)) return;
      lastUserDeleteIntentAt = Date.now();
      userDeleteIntentCount += 1;
    }
    function onDocBeforeInput(ev) {
      try {
        var t = String((ev && ev.inputType) || '').toLowerCase();
        if (t.indexOf('delete') === 0) markUserDeleteIntentFromEvent(ev.target);
      } catch (eBI) {}
    }
    function onDocKeyDown(ev) {
      try {
        var k = String((ev && ev.key) || '');
        if (k === 'Backspace' || k === 'Delete') {
          markUserDeleteIntentFromEvent(ev.target);
        }
      } catch (eKD) {}
    }
    function onDocCut(ev) {
      try {
        markUserDeleteIntentFromEvent(ev && ev.target);
      } catch (eCut) {}
    }
    try {
      document.addEventListener('beforeinput', onDocBeforeInput, true);
      document.addEventListener('keydown', onDocKeyDown, true);
      document.addEventListener('cut', onDocCut, true);
    } catch (eListen) {}
    function cleanupManualDeleteListeners() {
      try {
        document.removeEventListener('beforeinput', onDocBeforeInput, true);
        document.removeEventListener('keydown', onDocKeyDown, true);
        document.removeEventListener('cut', onDocCut, true);
      } catch (eRm) {}
    }
    function finishWait(res) {
      cleanupManualDeleteListeners();
      return res;
    }
    var ctxWaitBaseline = extractStructuredMessagesFromThread();
    var msgsWaitBaseline = ctxWaitBaseline.messages || [];
    var hadOutgoingDraftAtStart = proposedTextAlreadyInOutgoingMessages(
      msgsWaitBaseline,
      draftAtStart
    );
    dexLog(
      'waitForUserManualSend: start, countBefore=',
      messageCountBefore,
      'draftLen=',
      draftAtStart.length,
      'timeoutMs=',
      cap,
      'strictThreadConfirm=',
      strictThreadConfirm,
      'priorityHumanSend=',
      priorityHumanSend,
      'hadOutgoingDraftAtStart=',
      hadOutgoingDraftAtStart
    );
    while (Date.now() < deadline) {
      await sleep(450);
      if (watchAbortWaitRequested) {
        watchAbortWaitRequested = false;
        if (priorityHumanSend) {
          // Для Paid/First SMS ложный abort (фокус/сайдпанель) не должен уводить на следующий чат.
          dexLog('waitForUserManualSend: ignore abort in priorityHumanSend mode');
        } else {
          dexLog('waitForUserManualSend: aborted by user');
          return finishWait({ ok: false, reason: 'user_aborted_wait' });
        }
      }
      var ctx2 = extractStructuredMessagesFromThread();
      var msgs = ctx2.messages || [];
      var threadPlain2 = ctx2.threadPlain || '';
      if (!priorityHumanSend && draftAtStart.length >= 6) {
        var visibleInThread =
          proposedTextMatchesAnyStructuredBubble(msgs, draftAtStart) ||
          proposedTextAppearsInThreadPlain(threadPlain2, draftAtStart);
        if (visibleInThread) {
          dexLog('waitForUserManualSend: draft already visible in thread (reload / count mismatch)');
          try {
            var cmpTh = findComposerInActiveChat();
            if (cmpTh) {
              var curTh = String(getComposerText(cmpTh) || '').trim();
              if (curTh && outboundTextsLooselyMatch(curTh, draftAtStart)) {
                setValueAndNotify(cmpTh, '');
              }
            }
          } catch (eTh) {}
          return finishWait({ ok: true, reason: 'draft_visible_in_thread' });
        }
      }
      if (msgs.length > messageCountBefore) {
        var last = msgs[msgs.length - 1];
        var newMsgs = msgs.slice(messageCountBefore);
        var draftNorm = normalizeOutboundText(draftAtStart);
        var lastNorm = normalizeOutboundText(last && last.text ? last.text : '');
        var nPref = Math.min(56, Math.min(draftNorm.length, lastNorm.length));
        var prefixMatch =
          draftNorm.length >= 24 &&
          lastNorm.length >= 24 &&
          nPref >= 24 &&
          draftNorm.slice(0, nPref) === lastNorm.slice(0, nPref);
        var textMatchesDraft =
          draftNorm.length >= 6 && (lastNorm === draftNorm || prefixMatch);
        var inThreadPlain =
          draftAtStart.length >= 10 && proposedTextAppearsInThreadPlain(threadPlain2, draftAtStart);
        var outgoingDetected;
        if (priorityHumanSend) {
          // Для Paid/First SMS считаем отправку только по НОВОМУ исходящему bubble после старта wait.
          // Это убирает ложные срабатывания, когда в треде уже был последний "me" или realtime шумит.
          // geometry_fallback иногда помечает новый пузырёк как unknown — допускаем совпадение текста с черновиком.
          var newOutgoingMe = false;
          var ni;
          for (ni = 0; ni < newMsgs.length; ni++) {
            var candNew = newMsgs[ni];
            if (!candNew) continue;
            if (candNew.role === 'me') {
              newOutgoingMe = true;
              break;
            }
            if (
              candNew.role === 'unknown' &&
              draftAtStart.length >= 6 &&
              outboundTextsLooselyMatch(candNew.text || '', draftAtStart)
            ) {
              newOutgoingMe = true;
              break;
            }
          }
          outgoingDetected = newOutgoingMe;
        } else {
          outgoingDetected =
            last &&
            (last.role === 'me' ||
              (last.role !== 'them' && textMatchesDraft) ||
              (last.role !== 'them' && inThreadPlain));
        }
        if (outgoingDetected) {
          dexLog('waitForUserManualSend: new outgoing detected');
          try {
            var cmpOut = findComposerInActiveChat();
            if (cmpOut && draftAtStart.length > 0) {
              var curOut = String(getComposerText(cmpOut) || '').trim();
              if (
                curOut &&
                normalizeOutboundText(curOut) === normalizeOutboundText(draftAtStart)
              ) {
                setValueAndNotify(cmpOut, '');
                dexLog('waitForUserManualSend: cleared stale composer after send');
              }
            }
          } catch (eClr) {}
          return finishWait({ ok: true, reason: 'new_outgoing_me' });
        }
      }
      if (
        priorityHumanSend &&
        draftAtStart.length >= 6 &&
        !hadOutgoingDraftAtStart &&
        msgs.length <= messageCountBefore
      ) {
        var cmpStable = findComposerInActiveChat();
        var curStable = String(getComposerText(cmpStable) || '').trim();
        if (
          curStable.length === 0 &&
          proposedTextAlreadyInOutgoingMessages(msgs, draftAtStart)
        ) {
          dexLog(
            'waitForUserManualSend: priorityHumanSend stable bubble count, draft now in outgoing me + empty composer'
          );
          try {
            var cmpOut2 = findComposerInActiveChat();
            if (cmpOut2 && draftAtStart.length > 0) {
              var curOut2 = String(getComposerText(cmpOut2) || '').trim();
              if (
                curOut2 &&
                normalizeOutboundText(curOut2) === normalizeOutboundText(draftAtStart)
              ) {
                setValueAndNotify(cmpOut2, '');
                dexLog(
                  'waitForUserManualSend: cleared stale composer after send (stable-count path)'
                );
              }
            }
          } catch (eClr2) {}
          return finishWait({ ok: true, reason: 'new_outgoing_me' });
        }
      }
      if (draftAtStart.length > 0) {
        var composerNow = findComposerInActiveChat();
        if (
          composerNow &&
          document.activeElement &&
          (document.activeElement === composerNow || composerNow.contains(document.activeElement))
        ) {
          sawComposerFocused = true;
        }
        var cur = String(getComposerText(composerNow) || '').trim();
        var currentHrefNorm = normalizeChatListHref(location.pathname || '');
        var sameChatAsExpected = !expectedHrefNorm || currentHrefNorm === expectedHrefNorm;
        var deleteIntentRecent =
          userDeleteIntentCount > 0 && Date.now() - lastUserDeleteIntentAt <= 7000;
        var canTreatAsManualDeletion =
          allowDraftDeletionExit &&
          priorityHumanSend &&
          !document.hidden &&
          sameChatAsExpected &&
          sawComposerFocused &&
          deleteIntentRecent &&
          !!composerNow &&
          isVisible(composerNow) &&
          !composerNow.disabled &&
          !composerNow.readOnly;
        if (cur.length === 0 && draftAtStart.length >= 1) {
          if (canTreatAsManualDeletion) emptyComposerStreak += 1;
          else emptyComposerStreak = 0;
          dexLog('waitForUserManualSend: composer empty after draft');
          if (
            canTreatAsManualDeletion &&
            msgs.length <= messageCountBefore &&
            emptyComposerStreak >= composerEmptyConfirmTicks
          ) {
            // После ручной отправки композер часто очищается раньше, чем в DOM появляется новый
            // пузырёк me. Без короткого poll ложно выходим с draft_deleted_by_user при успешном send.
            var pollI = 0;
            for (pollI = 0; pollI < 14; pollI++) {
              await sleep(140);
              var pollCtx = extractStructuredMessagesFromThread();
              var pollMsgs = pollCtx.messages || [];
              var pollPlain = pollCtx.threadPlain || '';
              if (pollMsgs.length > messageCountBefore) {
                var newSlice = pollMsgs.slice(messageCountBefore);
                var nj = 0;
                var sawNewMe = false;
                for (nj = 0; nj < newSlice.length; nj++) {
                  var candPollSlice = newSlice[nj];
                  if (!candPollSlice) continue;
                  if (candPollSlice.role === 'me') {
                    sawNewMe = true;
                    break;
                  }
                  if (
                    candPollSlice.role === 'unknown' &&
                    draftAtStart.length >= 6 &&
                    outboundTextsLooselyMatch(candPollSlice.text || '', draftAtStart)
                  ) {
                    sawNewMe = true;
                    break;
                  }
                }
                if (sawNewMe) {
                  dexLog(
                    'waitForUserManualSend: new outgoing detected (poll after empty composer, paid wait)'
                  );
                  return finishWait({ ok: true, reason: 'new_outgoing_me' });
                }
              }
              if (
                priorityHumanSend &&
                !hadOutgoingDraftAtStart
              ) {
                var cmpPollMe = findComposerInActiveChat();
                var curPollMe = String(getComposerText(cmpPollMe) || '').trim();
                if (
                  curPollMe.length === 0 &&
                  proposedTextAlreadyInOutgoingMessages(pollMsgs, draftAtStart)
                ) {
                  dexLog(
                    'waitForUserManualSend: new outgoing detected (poll after empty composer, stable count, paid wait)'
                  );
                  return finishWait({ ok: true, reason: 'new_outgoing_me' });
                }
              }
              if (
                draftAtStart.length >= 10 &&
                (proposedTextMatchesAnyStructuredBubble(pollMsgs, draftAtStart) ||
                  proposedTextAppearsInThreadPlain(pollPlain, draftAtStart))
              ) {
                if (!priorityHumanSend) {
                  dexLog(
                    'waitForUserManualSend: draft visible in thread after empty composer (send lag, poll)'
                  );
                  return finishWait({ ok: true, reason: 'new_outgoing_me' });
                }
              }
            }
            dexLog('waitForUserManualSend: draft deleted by user, continue pipeline');
            return finishWait({ ok: true, reason: 'draft_deleted_by_user' });
          }
          if (!strictThreadConfirm) {
            return finishWait({ ok: true, reason: 'composer_empty_after_draft' });
          }
          dexLog(
            'waitForUserManualSend: strictThreadConfirm, ignore composer_empty until thread evidence'
          );
        } else {
          emptyComposerStreak = 0;
        }
        if (
          draftAtStart.length >= 6 &&
          cur.length <= Math.max(2, Math.floor(draftAtStart.length * 0.15))
        ) {
          dexLog('waitForUserManualSend: composer mostly cleared');
          if (!strictThreadConfirm) {
            return finishWait({ ok: true, reason: 'composer_cleared_after_send' });
          }
          dexLog(
            'waitForUserManualSend: strictThreadConfirm, ignore composer_cleared until thread evidence'
          );
        }
      }
    }
    dexLog('waitForUserManualSend: timeout');
    return finishWait({ ok: false, reason: 'timeout_waiting_manual_send' });
  }

  /**
   * Неблокирующий звук-колокольчик, когда черновик вставлен и ждём ручную отправку.
   * Может быть заблокирован политикой autoplay браузера — в этом случае просто возвращаем false.
   */
  function playPriorityDraftReadySound() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      var ctx = new Ctx();
      var now = ctx.currentTime;
      function beep(offsetSec, freq, durSec, gainVal) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = Math.max(0.0001, gainVal || 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        var start = now + Math.max(0, offsetSec || 0);
        var end = start + Math.max(0.03, durSec || 0.08);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainVal || 0.05), start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.start(start);
        osc.stop(end + 0.01);
      }
      beep(0.00, 880, 0.09, 0.05);
      beep(0.16, 1174, 0.10, 0.05);
      setTimeout(function () {
        try {
          ctx.close();
        } catch (eClose) {}
      }, 700);
      return true;
    } catch (e) {
      return false;
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Раньше ждали видимости вкладки до 10 с — при постоянной работе из фона сценарий не шёл.
   * Теперь не блокируем: композер ищется с ослабленным isVisible, поллинг в waitForChatComposerReady.
   */
  async function waitForDocumentVisible(maxMs) {
    if (typeof document.hidden === 'undefined' || !document.hidden) {
      try {
        window.focus();
      } catch (e) {}
      return true;
    }
    dexLog('waitForDocumentVisible: tab in background, continue without waiting for focus');
    return true;
  }

  function rafTwo() {
    return new Promise(function (resolve) {
      if (typeof document.hidden !== 'undefined' && document.hidden) {
        setTimeout(function () {
          setTimeout(function () {
            resolve();
          }, 45);
        }, 45);
        return;
      }
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          resolve();
        });
      });
    });
  }

  /**
   * Ждём появления поля ввода вне списка чатов (после «Chat must be initialized» / SignalR на стороне сайта).
   */
  async function waitForChatComposerReady(maxMs) {
    await waitForDocumentVisible(10000);
    var cap = typeof maxMs === 'number' && maxMs > 0 ? maxMs : 12000;
    if (typeof document.hidden !== 'undefined' && document.hidden) {
      cap = Math.max(cap, 22000);
    }
    var deadline = Date.now() + cap;
    var step = 220;
    while (Date.now() < deadline) {
      var c = findComposerInActiveChat();
      if (c && isVisible(c) && !c.disabled && !c.readOnly) {
        return true;
      }
      await sleep(step);
      if (step < 500) step += 45;
    }
    return false;
  }

  /**
   * Асинхронные повторы вставки с проверкой значения (React может сбросить синхронный .value).
   */
  async function insertDraftWithRetriesAsync(text, maxAttempts, delayMs) {
    await waitForDocumentVisible(10000);
    var raw = String(text || '');
    var maxA = typeof maxAttempts === 'number' && maxAttempts > 0 ? maxAttempts : 10;
    var del = typeof delayMs === 'number' && delayMs >= 0 ? delayMs : 450;
    var i = 0;
    for (i = 0; i < maxA; i++) {
      if (i > 0) await sleep(del);
      var composer = findComposerInActiveChat();
      if (!composer) {
        dexLog('insertDraftWithRetriesAsync: no composer', i);
        continue;
      }
      var existingPre = getComposerText(composer);
      if (existingPre && outboundTextsLooselyMatch(existingPre, raw)) {
        dexLog('insertDraftWithRetriesAsync: composer already matches, skip write', i);
        try {
          composer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (eSkip) {}
        lastComposerUsed = composer;
        return { ok: true };
      }
      var ok = setValueAndNotify(composer, raw);
      if (!ok) continue;
      await rafTwo();
      var v = normalizeOutboundTextLoose(getComposerText(composer));
      var e = normalizeOutboundTextLoose(raw);
      if (e.length < 5) {
        try {
          composer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (eSc) {}
        lastComposerUsed = composer;
        return { ok: true };
      }
      if (
        v.length > 0 &&
        (outboundTextsLooselyMatch(v, e) ||
          v.indexOf(e.slice(0, Math.min(28, e.length))) !== -1 ||
          e.indexOf(v.slice(0, Math.min(28, v.length))) !== -1)
      ) {
        try {
          composer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } catch (eSc2) {}
        lastComposerUsed = composer;
        return { ok: true };
      }
      dexLog('insertDraftWithRetriesAsync: verify mismatch', i, v.slice(0, 48), e.slice(0, 48));
    }
    return {
      ok: false,
      error:
        'Текст не зафиксировался в поле после нескольких попыток. Дождитесь готовности чата (Chat hub), при необходимости переключитесь на вкладку match-club на пару секунд и повторите.'
    };
  }

  /** Скроллер списка чатов (Virtuoso). */
  function findListScroller() {
    var wrap = document.querySelector('.chat-list-layout__list-wrap');
    var inner =
      (wrap && wrap.querySelector('[data-test-id="virtuoso-scroller"]')) ||
      document.querySelector('.chat-list-layout__list-wrap [data-test-id="virtuoso-scroller"]');
    if (inner) return inner;
    return (
      document.querySelector('[data-test-id="virtuoso-scroller"]') ||
      document.querySelector('[data-virtuoso-scroller="true"]')
    );
  }

  /**
   * Разбор строки списка «Имя, 70».
   * @returns {{ peerDisplayName: string, peerAge: number|null }}
   */
  function parseNameAgeFromTitle(peerTitle) {
    var s = String(peerTitle || '').trim();
    var m = s.match(/^(.+?),\s*(\d{1,3})\s*$/);
    if (m) {
      return { peerDisplayName: m[1].trim(), peerAge: parseInt(m[2], 10) };
    }
    return { peerDisplayName: s, peerAge: null };
  }

  function hrefToAbsoluteChatUrl(href) {
    var h = String(href || '');
    if (!h) return '';
    try {
      return new URL(h, location.origin).href;
    } catch (e) {
      return location.origin + (h.indexOf('/') === 0 ? h : '/' + h);
    }
  }

  /** Путь чата без ведущего слэша, для сравнения с `location.pathname` (и полные URL, и относительные). */
  function normalizeChatPathFromHref(href) {
    var h = String(href || '').trim();
    if (!h) return '';
    try {
      if (/^https?:\/\//i.test(h)) {
        return new URL(h).pathname.replace(/^\//, '');
      }
    } catch (ePath) {}
    return (h.split('?')[0].split('#')[0] || '').replace(/^\//, '');
  }

  /**
   * Единый вид ссылки на чат для ключа в seen и для клика (сайт может отдавать `/chats/id` без `/messages`).
   */
  function normalizeChatListHref(raw) {
    var h = String(raw || '')
      .trim()
      .split('#')[0]
      .split('?')[0];
    if (!h) return '';
    h = h.replace(/\/+$/, '');
    if (/\/messages$/i.test(h)) return h;
    var m = h.match(/^(\/chats\/[^/\s#?]+)$/);
    if (m) return m[1] + '/messages';
    return h;
  }

  function alternateChatHrefForms(href) {
    var h = String(href || '').split('?')[0].split('#')[0];
    var out = [];
    if (!h) return out;
    if (/\/messages\/?$/i.test(h)) {
      var wo = h.replace(/\/messages\/?$/i, '');
      if (wo && wo !== h) out.push(wo);
    } else if (/\/chats\/[^/]+$/i.test(h)) {
      out.push(h.replace(/\/?$/, '') + '/messages');
    }
    return out;
  }

  /** @returns {string} */
  function getComposerText(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return String(el.value != null ? el.value : '');
    }
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
      return String(el.innerText != null ? el.innerText : el.textContent || '');
    }
    return '';
  }

  function normalizeCssFontWeight(fw) {
    if (fw == null || fw === '') return 400;
    if (typeof fw === 'number' && !isNaN(fw)) return fw;
    var s = String(fw).trim().toLowerCase();
    if (s === 'bold' || s === 'bolder') return 700;
    var n = parseInt(s, 10);
    return isNaN(n) ? 400 : n;
  }

  /**
   * В списках чатов «непрочитано» часто помечают только полужирным заголовком, без класса unread.
   */
  function isProbablyUnreadByTitleWeight(titleEl) {
    if (!titleEl || titleEl.nodeType !== 1) return false;
    try {
      var w = normalizeCssFontWeight(window.getComputedStyle(titleEl).fontWeight);
      return w >= 600;
    } catch (e) {
      return false;
    }
  }

  /**
   * Метаданные строки списка: имя/возраст, 1st SMS (бейдж у аватара), онлайн, paid-label, unread.
   * @returns {{ peerTitle: string, peerDisplayName: string, peerAge: number|null, chatUrl: string, isFirstSms: boolean, isPeerOnline: boolean, isPaidChat: boolean, isUnread: boolean }}
   */
  function extractChatListRowMeta(a) {
    var href = normalizeChatListHref(a.getAttribute('href') || '');
    var title = '';
    var tEl = a.querySelector('.chat-list-item__title');
    if (tEl) title = String(tEl.textContent || '').trim();
    if (!title) {
      tEl = a.querySelector('[class*="title" i][class*="chat-list" i], .chat-list-item [class*="name" i]');
      if (tEl) title = String(tEl.textContent || '').trim();
    }
    if (!title) {
      title = String(a.getAttribute('aria-label') || '').trim();
    }
    if (!title) {
      var parts = String(a.innerText || '')
        .split(/\n/)
        .map(function (x) {
          return x.trim();
        })
        .filter(Boolean);
      var pi = 0;
      for (pi = 0; pi < parts.length; pi++) {
        if (/^.+,\s*\d{1,3}$/.test(parts[pi])) {
          title = parts[pi];
          break;
        }
      }
      if (!title && parts[0]) title = parts[0];
    }
    var parsed = parseNameAgeFromTitle(title);
    var rowRoot =
      (a && a.closest && a.closest('.chat-list-item, [class*="chat-list-item" i], li')) || a;
    var rowText = String((rowRoot && rowRoot.innerText) || a.innerText || '');
    var rowHead = rowText.slice(0, 200);
    var paidByText = /\bPaid\b/i.test(rowText) && !/\bNot\s+Paid\b/i.test(rowText);
    var paidByAttr = false;
    var paidByBadge = false;
    try {
      var paidEl = rowRoot
        ? rowRoot.querySelector(
            '[class*="paid" i]:not([class*="not-paid" i]), [title*="Paid" i]:not([title*="Not Paid" i]), [aria-label*="Paid" i]:not([aria-label*="Not Paid" i])'
          )
        : null;
      paidByAttr = !!paidEl;
      if (!paidByAttr && rowRoot && rowRoot.querySelectorAll) {
        var badgeEls = rowRoot.querySelectorAll(
          '[class*="badge" i], [class*="label" i], [class*="tag" i], [class*="chip" i], [class*="status" i]'
        );
        var bi;
        for (bi = 0; bi < badgeEls.length; bi++) {
          var bt = String(badgeEls[bi].innerText || badgeEls[bi].textContent || '').trim();
          if (/\bPaid\b/i.test(bt) && !/\bNot\s+Paid\b/i.test(bt)) {
            paidByBadge = true;
            break;
          }
        }
      }
    } catch (ePaid) {}
    var isPaidChat = !!(paidByText || paidByAttr || paidByBadge);
    var av = a.querySelector(
      '.chat-list-item__avatar, [class*="avatar" i], [class*="Avatar" i], [class*="photo" i]'
    );
    var avText = av ? String(av.innerText || '') + ' ' + String(av.getAttribute('aria-label') || '') : '';
    var isFirstSms =
      /\b1st\s*SMS\b/i.test(avText) ||
      /\b1st\s*SMS\b/i.test(rowHead) ||
      !!(av && av.querySelector && av.querySelector('[class*="badge" i], [class*="label" i], [class*="tag" i]') && /\b1st\s*SMS\b/i.test(rowHead));
    var isPeerOnline = false;
    if (
      a.querySelector(
        '[class*="online" i]:not([class*="offline" i]):not([class*="not-online" i])'
      )
    ) {
      isPeerOnline = true;
    }
    if (!isPeerOnline && a.querySelector('[title*="Online" i], [aria-label*="Online" i]')) {
      isPeerOnline = true;
    }
    var isUnread = false;
    try {
      if (rowRoot) {
        if (
          (typeof rowRoot.matches === 'function' &&
            rowRoot.matches(
              '[class*="unread" i], [data-unread="true"], [aria-label*="unread" i], [title*="unread" i]'
            )) ||
          (typeof rowRoot.querySelector === 'function' &&
            rowRoot.querySelector(
              '[class*="unread" i], [data-unread="true"], [aria-label*="unread" i], [title*="unread" i]'
            ))
        ) {
          isUnread = true;
        }
        if (!isUnread && typeof rowRoot.querySelectorAll === 'function') {
          var unreadBadgeEls = rowRoot.querySelectorAll(
            '[class*="badge" i], [class*="counter" i], [class*="chip" i], [class*="label" i], [class*="tag" i]'
          );
          var ui;
          for (ui = 0; ui < unreadBadgeEls.length; ui++) {
            var ut = String(unreadBadgeEls[ui].innerText || unreadBadgeEls[ui].textContent || '').trim();
            if (!ut) continue;
            if (/\bunread\b/i.test(ut) || /\bnew\b/i.test(ut)) {
              isUnread = true;
              break;
            }
            var n = parseInt(ut, 10);
            if (!isNaN(n) && n > 0) {
              isUnread = true;
              break;
            }
          }
        }
      }
    } catch (eUnread) {}
    try {
      var rowClass = '';
      if (rowRoot && rowRoot.getAttribute) {
        rowClass = String(rowRoot.getAttribute('class') || '').toLowerCase();
      }
      var aClass = a.getAttribute ? String(a.getAttribute('class') || '').toLowerCase() : '';
      var classBlob = ' ' + rowClass + ' ' + aClass + ' ';
      if (
        !isUnread &&
        (/\bunread\b/.test(classBlob) ||
          /\bnew-message\b/.test(classBlob) ||
          /\bhas-unread\b/.test(classBlob) ||
          /\bis-unread\b/.test(classBlob) ||
          /\bitem_unread\b/.test(classBlob))
      ) {
        isUnread = true;
      }
      if (!isUnread && rowRoot && rowRoot.querySelector) {
        if (
          rowRoot.querySelector(
            '[class*="unread" i][class*="dot" i], [class*="unread-indicator" i], [class*="unread_dot" i], [class*="unread-dot" i]'
          )
        ) {
          isUnread = true;
        }
      }
      if (!isUnread) {
        var tw =
          tEl ||
          (rowRoot && rowRoot.querySelector
            ? rowRoot.querySelector('.chat-list-item__title')
            : null) ||
          (a.querySelector ? a.querySelector('.chat-list-item__title') : null);
        if (tw && isProbablyUnreadByTitleWeight(tw)) isUnread = true;
      }
      if (!isUnread && isProbablyUnreadByTitleWeight(a)) isUnread = true;
    } catch (eUnread2) {}
    // Важно: не используем общий текст rowHead как fallback для online —
    // в нём могут быть лейблы фильтров UI (Online/Not Paid) и это даёт ложные "онлайн".
    return {
      peerTitle: title,
      peerDisplayName: parsed.peerDisplayName,
      peerAge: parsed.peerAge,
      chatUrl: hrefToAbsoluteChatUrl(href),
      isFirstSms: isFirstSms,
      isPeerOnline: isPeerOnline,
      isPaidChat: isPaidChat,
      isUnread: isUnread
    };
  }

  /**
   * @param {Object<string,string>} seen href -> peerTitle (короткая строка для совместимости)
   * @param {Object<string,Object>} seenMeta href -> extractChatListRowMeta
   * @param {string[]|null} order если задан — добавлять href при первом появлении (порядок как при скролле сверху вниз)
   */
  function gatherChatLinksInto(seen, seenMeta, order) {
    document.querySelectorAll('a.chat-list-item[href*="/chats/"]').forEach(function (a) {
      var raw = a.getAttribute('href') || '';
      var href = normalizeChatListHref(raw);
      if (!href || href.indexOf('/chats/') === -1) return;
      if (href.indexOf('/messages') === -1) return;
      var meta = extractChatListRowMeta(a);
      if (order && !Object.prototype.hasOwnProperty.call(seen, href)) {
        order.push(href);
      }
      var prevTitle = seen[href] || '';
      if (!seen[href] || (meta.peerTitle && meta.peerTitle.length > String(prevTitle).length)) {
        seen[href] = meta.peerTitle;
      }
      if (!seenMeta[href]) {
        seenMeta[href] = meta;
      } else {
        var om = seenMeta[href];
        if (meta.peerTitle && (!om.peerTitle || meta.peerTitle.length > String(om.peerTitle).length)) {
          om.peerTitle = meta.peerTitle;
          om.peerDisplayName = meta.peerDisplayName;
          om.peerAge = meta.peerAge;
        }
        om.isFirstSms = !!(om.isFirstSms || meta.isFirstSms);
        om.isPeerOnline = !!(om.isPeerOnline || meta.isPeerOnline);
        om.isPaidChat = !!(om.isPaidChat || meta.isPaidChat);
        om.isUnread = !!(om.isUnread || meta.isUnread);
        om.chatUrl = om.chatUrl || meta.chatUrl;
      }
    });
  }

  /**
   * Быстрая проверка paid-лейбла по текущему DOM списка чатов.
   * Используем перед отправкой как защиту для уже стоящих в очереди элементов.
   */
  function isPaidChatByHrefInList(href) {
    var a = findChatListAnchorByHref(href);
    if (!a) return false;
    try {
      var meta = extractChatListRowMeta(a);
      return !!(meta && meta.isPaidChat);
    } catch (e) {
      return false;
    }
  }

  function isFirstSmsByHrefInList(href) {
    var a = findChatListAnchorByHref(href);
    if (!a) return false;
    try {
      var meta = extractChatListRowMeta(a);
      return !!(meta && meta.isFirstSms);
    } catch (e) {
      return false;
    }
  }

  /**
   * Лейбл Paid в шапке открытого треда (строка списка не в DOM / устаревшая мета).
   */
  function isPaidChatFromOpenThreadHeader() {
    try {
      var selectors = [
        '.chat-view header',
        '[class*="chat-view" i] [class*="header" i]',
        '[class*="conversation-header" i]',
        'main [class*="conversation" i] [class*="header" i]'
      ];
      var si;
      for (si = 0; si < selectors.length; si++) {
        var h = document.querySelector(selectors[si]);
        if (!h || !isVisible(h)) continue;
        var ht = String(h.innerText || h.textContent || '');
        if (/\bPaid\b/i.test(ht) && !/\bNot\s+Paid\b/i.test(ht)) return true;
        var paidEl = h.querySelector(
          '[class*="paid" i]:not([class*="not-paid" i]), [title*="Paid" i]:not([title*="Not Paid" i]), [aria-label*="Paid" i]:not([aria-label*="Not Paid" i])'
        );
        if (paidEl) return true;
      }
    } catch (ePaidTh) {}
    return false;
  }

  /**
   * Онлайн-статус строки для pending: свежий DOM списка, иначе поле из очереди.
   * @returns {boolean|null}
   */
  function getLivePeerOnlineForPendingItem(p) {
    var a = findChatListAnchorByHref(p.href || p.hrefKey);
    if (!a) {
      return typeof p.isPeerOnline === 'boolean' ? p.isPeerOnline : null;
    }
    try {
      return !!extractChatListRowMeta(a).isPeerOnline;
    } catch (e) {
      return typeof p.isPeerOnline === 'boolean' ? p.isPeerOnline : null;
    }
  }

  function watchOnlineSortKey(isOn) {
    if (isOn === true) return 0;
    if (isOn === false) return 2;
    return 1;
  }

  /**
   * При включённом «только онлайн» — сначала due с онлайн-строкой, внутри группы по scheduledAt.
   */
  function watchSortDueByScheduleAndOnline(due, preferOnlineOnly) {
    if (!due || due.length === 0) return;
    function priorityKey(p) {
      if (!p) return 3;
      if (p.isPaidChat || p.isFirstSms) return p.isUnread ? 0 : 1;
      return 2;
    }
    if (!preferOnlineOnly || due.length < 2) {
      due.sort(function (a, b) {
        var pa = priorityKey(a);
        var pb = priorityKey(b);
        if (pa !== pb) return pa - pb;
        return a.scheduledAt - b.scheduledAt;
      });
      return;
    }
    due.sort(function (a, b) {
      var pa = priorityKey(a);
      var pb = priorityKey(b);
      if (pa !== pb) return pa - pb;
      var ka = watchOnlineSortKey(getLivePeerOnlineForPendingItem(a));
      var kb = watchOnlineSortKey(getLivePeerOnlineForPendingItem(b));
      if (ka !== kb) return ka - kb;
      return a.scheduledAt - b.scheduledAt;
    });
  }

  function findChatListAnchorByHref(href) {
    var tryList = [href].concat(alternateChatHrefForms(href));
    var ti = 0;
    for (ti = 0; ti < tryList.length; ti++) {
      var h = tryList[ti];
      if (!h) continue;
      var esc = h.replace(/"/g, '\\"');
      var anchor =
        document.querySelector('a.chat-list-item[href="' + esc + '"]') ||
        document.querySelector('a[href="' + esc + '"]');
      if (anchor) return anchor;
    }
    return null;
  }

  /** Лейблы исхода по строке списка чатов (не в треде): отправлено / пропуск / ошибка / очередь. */
  var watchListOutcomeStylesInjected = false;

  function watchEnsureListOutcomeBadgeStyles() {
    if (watchListOutcomeStylesInjected) return;
    watchListOutcomeStylesInjected = true;
    try {
      if (document.getElementById('dex-mc-list-outcome-styles')) return;
      var st = document.createElement('style');
      st.id = 'dex-mc-list-outcome-styles';
      st.textContent =
        '.dex-mc-list-outcome{position:absolute;right:4px;top:50%;transform:translateY(-50%);max-width:48%;' +
        'padding:2px 5px;border-radius:4px;font:10px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
        'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;z-index:6;' +
        'box-shadow:0 0 0 1px rgba(0,0,0,.15);}' +
        '.dex-mc-list-outcome[data-outcome="sent"]{background:#0d7a3d;color:#fff;}' +
        '.dex-mc-list-outcome[data-outcome="skip"]{background:#a85a00;color:#fff;}' +
        '.dex-mc-list-outcome[data-outcome="err"]{background:#a40018;color:#fff;}' +
        '.dex-mc-list-outcome[data-outcome="wait"]{background:#4a3fad;color:#fff;}' +
        '.dex-mc-list-outcome[data-outcome="proc"]{background:#1565c0;color:#fff;}' +
        '.dex-mc-list-outcome[data-outcome="sched"]{background:#37474f;color:#eef;}';
      (document.head || document.documentElement).appendChild(st);
    } catch (eSt) {}
  }

  function watchChatListRowRootForOutcomeBadge(anchor) {
    if (!anchor) return null;
    try {
      return (
        anchor.closest &&
        anchor.closest('.chat-list-item, [class*="chat-list-item" i], li')
      ) || anchor;
    } catch (e) {
      return anchor;
    }
  }

  function watchTruncateOutcomeText(s, maxLen) {
    var t = String(s || '').trim();
    var m = typeof maxLen === 'number' ? maxLen : 34;
    if (t.length <= m) return t;
    return t.slice(0, Math.max(0, m - 1)) + '…';
  }

  function watchSetListOutcomeBadgeOnAnchor(anchor, kind, line) {
    watchEnsureListOutcomeBadgeStyles();
    if (!anchor || !kind) return;
    var row = watchChatListRowRootForOutcomeBadge(anchor);
    if (!row) return;
    try {
      var cs = window.getComputedStyle(row);
      if (cs && cs.position === 'static') row.style.position = 'relative';
    } catch (eP) {}
    var rawHref = anchor.getAttribute('href') || '';
    var nh = normalizeChatListHref(rawHref);
    var old = row.querySelector('.dex-mc-list-outcome');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var sp = document.createElement('span');
    sp.className = 'dex-mc-list-outcome';
    sp.setAttribute('data-outcome', kind);
    sp.setAttribute('data-dex-mc-outcome-href', nh);
    sp.textContent = watchTruncateOutcomeText(line, 40);
    row.appendChild(sp);
  }

  function watchClearAllListOutcomeBadges() {
    try {
      var wrap =
        document.querySelector('.chat-list-layout__list-wrap') ||
        document.querySelector('[class*="chat-list-layout__list" i]') ||
        document.body;
      if (!wrap || !wrap.querySelectorAll) return;
      var nodes = wrap.querySelectorAll('.dex-mc-list-outcome');
      var i;
      for (i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.parentNode) n.parentNode.removeChild(n);
      }
    } catch (eC) {}
  }

  /** Перечитать watch из storage и обновить бейджи (после reload расширения / смены фильтра). */
  function watchRefreshOutcomeBadgesFromStorage() {
    try {
      watchLoadState(function (st) {
        watchSyncAllListOutcomeBadges(st);
      });
    } catch (eR) {}
  }

  /**
   * Синхронизирует лейблы на видимых строках списка с `state.pending` (и activeProcessingId).
   * Удаляет «чужие» лейблы при виртуализации (href строки != data на бейдже).
   * Не требует baselineCaptured: можно сразу после reload по данным из chrome.storage.
   */
  function watchSyncAllListOutcomeBadges(state) {
    if (!state || !state.enabled) return;
    watchEnsureListOutcomeBadgeStyles();
    try {
      document.querySelectorAll('a.chat-list-item[href*="/chats/"]').forEach(function (a) {
        var row = watchChatListRowRootForOutcomeBadge(a);
        if (!row) return;
        var badge = row.querySelector('.dex-mc-list-outcome');
        if (!badge) return;
        var anchorHref = normalizeChatListHref(a.getAttribute('href') || '');
        var badgeHref = normalizeChatListHref(badge.getAttribute('data-dex-mc-outcome-href') || '');
        if (anchorHref && badgeHref && anchorHref !== badgeHref) {
          badge.parentNode.removeChild(badge);
        }
      });
    } catch (eMis) {}

    function watchOutcomeCandidateFromPending(p, isActive) {
      if (!p) return null;
      var stt = p.status;
      var isDraftDeletedSkip = stt === 'skipped' && String(p.lastError || '') === 'draft_deleted_by_user';
      var score =
        stt === 'waiting_send'
          ? 700
          : stt === 'processing' || isActive
            ? 650
            : isDraftDeletedSkip
              ? 620
              : stt === 'scheduled'
                ? 600
                : stt === 'done'
                  ? 500
                  : stt === 'skipped'
                    ? 450
                    : stt === 'error'
                      ? 400
                      : 0;
      var d = null;
      if (stt === 'done') {
        d = {
          kind: 'sent',
          text: '✓ ' + watchTruncateOutcomeText(p.lastError || 'sent', 32)
        };
      } else if (stt === 'skipped') {
        d = {
          kind: 'skip',
          text: '⊘ ' + watchTruncateOutcomeText(p.lastError || 'skip', 36)
        };
      } else if (stt === 'error') {
        d = {
          kind: 'err',
          text: '! ' + watchTruncateOutcomeText(p.lastError || 'error', 36)
        };
      } else if (stt === 'waiting_send') {
        d = { kind: 'wait', text: 'черновик' };
      } else if (stt === 'processing' || isActive) {
        d = { kind: 'proc', text: '⋯ обработка' };
      } else if (stt === 'scheduled') {
        d = { kind: 'sched', text: '⏱ в очереди' };
      }
      if (!d) return null;
      return {
        score: score,
        tieAt: Math.max(
          typeof p.scheduledAt === 'number' ? p.scheduledAt : 0,
          typeof p.detectedAt === 'number' ? p.detectedAt : 0
        ),
        kind: d.kind,
        text: d.text
      };
    }

    var desired = Object.create(null);
    var pend = state.pending || [];
    var activeId = state.activeProcessingId || null;
    var pi;
    for (pi = 0; pi < pend.length; pi++) {
      var p = pend[pi];
      if (!p) continue;
      var hk = normalizeChatListHref(p.hrefKey || p.href || '');
      if (!hk || hk.indexOf('/chats/') === -1) continue;
      var isActive = !!(activeId && p.id === activeId);
      var cand = watchOutcomeCandidateFromPending(p, isActive);
      if (!cand) continue;
      var cur = desired[hk];
      if (!cur || cand.score > cur.score || (cand.score === cur.score && cand.tieAt >= (cur.tieAt || 0))) {
        desired[hk] = cand;
      }
    }

    try {
      var wrap =
        document.querySelector('.chat-list-layout__list-wrap') ||
        document.querySelector('[class*="chat-list-layout__list" i]') ||
        document.body;
      if (wrap && wrap.querySelectorAll) {
        var badges = wrap.querySelectorAll('.dex-mc-list-outcome');
        var bi;
        for (bi = 0; bi < badges.length; bi++) {
          var b = badges[bi];
          var dh = normalizeChatListHref(b.getAttribute('data-dex-mc-outcome-href') || '');
          if (!dh || !Object.prototype.hasOwnProperty.call(desired, dh)) {
            if (b.parentNode) b.parentNode.removeChild(b);
          }
        }
      }
    } catch (eOr) {}

    var hkApply;
    for (hkApply in desired) {
      if (!Object.prototype.hasOwnProperty.call(desired, hkApply)) continue;
      var d = desired[hkApply];
      var anch = findChatListAnchorByHref(hkApply);
      if (!anch) continue;
      watchSetListOutcomeBadgeOnAnchor(anch, d.kind, d.text);
    }
  }

  /**
   * Один проход: шагать scroller вниз, пока не найдём ссылку или не упрёмся в стабильное дно.
   * @param {boolean} resetToTop — в начале выставить scrollTop = 0
   */
  async function sweepScrollerDownUntilHref(scroller, href, stepPx, pauseMs, maxGuard, resetToTop) {
    if (resetToTop) {
      try {
        scroller.scrollTop = 0;
      } catch (e0) {}
      await sleep(pauseMs);
    }
    var a = findChatListAnchorByHref(href);
    if (a) {
      return { ok: true, anchor: a };
    }
    var guard = 0;
    var bottomSame = 0;
    var lastBottomSh = -1;
    while (guard < maxGuard) {
      guard++;
      a = findChatListAnchorByHref(href);
      if (a) {
        return { ok: true, anchor: a };
      }
      var sh = scroller.scrollHeight;
      var ch = scroller.clientHeight || 1;
      var maxScroll = Math.max(0, sh - ch);
      var st = scroller.scrollTop;
      if (st >= maxScroll - 1) {
        try {
          scroller.scrollTop = maxScroll;
        } catch (e2) {}
        await sleep(pauseMs);
        a = findChatListAnchorByHref(href);
        if (a) {
          return { ok: true, anchor: a };
        }
        sh = scroller.scrollHeight;
        maxScroll = Math.max(0, sh - ch);
        if (scroller.scrollTop < maxScroll - 1) {
          bottomSame = 0;
          continue;
        }
        if (sh === lastBottomSh) {
          bottomSame++;
          if (bottomSame >= 2) {
            break;
          }
        } else {
          bottomSame = 0;
          lastBottomSh = sh;
        }
        continue;
      }
      bottomSame = 0;
      lastBottomSh = -1;
      var next = Math.min(st + stepPx, maxScroll);
      if (next <= st) {
        next = st + 1;
      }
      try {
        scroller.scrollTop = next;
      } catch (e3) {}
      await sleep(pauseMs);
    }
    a = findChatListAnchorByHref(href);
    if (a) {
      return { ok: true, anchor: a };
    }
    return { ok: false };
  }

  /**
   * Прокрутить virtuoso-scroller, пока строка с данным href не окажется в DOM (иначе клик невозможен).
   * Сначала ищем вниз от текущей позиции (следующий чат в списке обычно ниже), затем полный проход сверху.
   */
  async function scrollListUntilChatLinkVisible(href, opts) {
    opts = opts || {};
    var stepPx =
      typeof opts.listScrollStepPx === 'number' && opts.listScrollStepPx > 0 ? opts.listScrollStepPx : 56;
    var pauseMs =
      typeof opts.listScrollPauseMs === 'number' && opts.listScrollPauseMs >= 0
        ? opts.listScrollPauseMs
        : 110;
    var maxGuard =
      typeof opts.openRevealMaxSteps === 'number' && opts.openRevealMaxSteps > 0
        ? opts.openRevealMaxSteps
        : 12000;
    var a = findChatListAnchorByHref(href);
    if (a) {
      return { ok: true, anchor: a };
    }
    var scroller = findListScroller();
    if (!scroller) {
      return { ok: false, error: 'virtuoso_scroller_not_found' };
    }
    var r1 = await sweepScrollerDownUntilHref(scroller, href, stepPx, pauseMs, maxGuard, false);
    if (r1.ok) {
      return r1;
    }
    var r2 = await sweepScrollerDownUntilHref(scroller, href, stepPx, pauseMs, maxGuard, true);
    if (r2.ok) {
      return r2;
    }
    return { ok: false, error: 'chat_row_not_in_dom' };
  }

  /**
   * Один проход сверху вниз с мелким шагом — Virtuoso монтирует строки только у видимой области;
   * прыжок scrollTop = scrollHeight не «прокатывает» весь список.
   */
  async function sweepChatListScroller(scroller, seen, seenMeta, stepPx, pauseMs, order) {
    try {
      scroller.scrollTop = 0;
    } catch (e) {}
    await sleep(pauseMs);
    gatherChatLinksInto(seen, seenMeta, order);
    var guard = 0;
    var maxGuard = 8000;
    var bottomSame = 0;
    var lastBottomSh = -1;
    while (guard < maxGuard) {
      guard++;
      var sh = scroller.scrollHeight;
      var ch = scroller.clientHeight || 1;
      var maxScroll = Math.max(0, sh - ch);
      var st = scroller.scrollTop;
      gatherChatLinksInto(seen, seenMeta, order);
      if (st >= maxScroll - 1) {
        try {
          scroller.scrollTop = maxScroll;
        } catch (e2) {}
        await sleep(pauseMs);
        gatherChatLinksInto(seen, seenMeta, order);
        sh = scroller.scrollHeight;
        maxScroll = Math.max(0, sh - ch);
        if (scroller.scrollTop < maxScroll - 1) {
          bottomSame = 0;
          continue;
        }
        if (sh === lastBottomSh) {
          bottomSame++;
          if (bottomSame >= 2) break;
        } else {
          bottomSame = 0;
          lastBottomSh = sh;
        }
        continue;
      }
      bottomSame = 0;
      lastBottomSh = -1;
      var next = Math.min(st + stepPx, maxScroll);
      if (next <= st) {
        next = st + 1;
      }
      try {
        scroller.scrollTop = next;
      } catch (e3) {}
      await sleep(pauseMs);
    }
  }

  /**
   * Финальный проход только для порядка: идём сверху вниз и фиксируем href в визуальном порядке списка.
   * Берём только известные href (из полного сбора seenAll), чтобы порядок был стабильным и без «рандома» по времени обнаружения.
   */
  async function collectOrderedKnownHrefs(scroller, seenAll, stepPx, pauseMs) {
    var ordered = [];
    var orderedSeen = {};
    function pushVisibleKnown() {
      var anchors = document.querySelectorAll('a.chat-list-item[href*="/chats/"], a[href*="/chats/"]');
      anchors.forEach(function (a) {
        if (!a) return;
        var href = normalizeChatListHref(a.getAttribute('href') || '');
        if (!href) return;
        if (!Object.prototype.hasOwnProperty.call(seenAll, href)) return;
        if (orderedSeen[href]) return;
        orderedSeen[href] = true;
        ordered.push(href);
      });
    }
    try {
      scroller.scrollTop = 0;
    } catch (e) {}
    await sleep(pauseMs);
    pushVisibleKnown();
    var guard = 0;
    var maxGuard = 8000;
    var bottomSame = 0;
    var lastBottomSh = -1;
    while (guard < maxGuard && ordered.length < Object.keys(seenAll).length) {
      guard++;
      var sh = scroller.scrollHeight;
      var ch = scroller.clientHeight || 1;
      var maxScroll = Math.max(0, sh - ch);
      var st = scroller.scrollTop;
      if (st >= maxScroll - 1) {
        try {
          scroller.scrollTop = maxScroll;
        } catch (e2) {}
        await sleep(pauseMs);
        pushVisibleKnown();
        sh = scroller.scrollHeight;
        maxScroll = Math.max(0, sh - ch);
        if (scroller.scrollTop < maxScroll - 1) {
          bottomSame = 0;
          continue;
        }
        if (sh === lastBottomSh) {
          bottomSame++;
          if (bottomSame >= 2) break;
        } else {
          bottomSame = 0;
          lastBottomSh = sh;
        }
        continue;
      }
      bottomSame = 0;
      lastBottomSh = -1;
      var next = Math.min(st + stepPx, maxScroll);
      if (next <= st) next = st + 1;
      try {
        scroller.scrollTop = next;
      } catch (e3) {}
      await sleep(pauseMs);
      pushVisibleKnown();
    }
    return ordered;
  }

  /**
   * Пошаговая прокрутка виртуального списка + несколько проходов, пока счётчик ссылок растёт или стабилен дважды подряд.
   * Зачем несколько проходов (часто 3–4, не «открытие профилей»): Virtuoso монтирует строки только у видимой области;
   * один проход сверху вниз набирает ссылки постепенно; следующий проход снова с scrollTop=0 подхватывает хвост, пока два прохода подряд не дадут одинаковое число ссылок (тогда список стабилен).
   * @param {Object} [opts] listScrollStepPx (~высота строки), listScrollPauseMs, maxListPasses, scrollPauseMs (legacy → listScrollPauseMs)
   * @returns {Promise<{ ok: boolean, error?: string, links: Array<Object>, passesUsed?: number }>}
   */
  async function collectAllChatLinks(opts) {
    opts = opts || {};
    var stepPx =
      typeof opts.listScrollStepPx === 'number' && opts.listScrollStepPx > 0 ? opts.listScrollStepPx : 56;
    var pauseMs =
      typeof opts.listScrollPauseMs === 'number' && opts.listScrollPauseMs >= 0
        ? opts.listScrollPauseMs
        : 110;
    if (opts.listScrollPauseMs == null && opts.scrollPauseMs != null) {
      pauseMs = typeof opts.scrollPauseMs === 'number' ? opts.scrollPauseMs : pauseMs;
    }
    var maxPasses =
      typeof opts.maxListPasses === 'number' && opts.maxListPasses > 0 ? opts.maxListPasses : 15;
    var scroller = findListScroller();
    if (!scroller) {
      return { ok: false, error: 'virtuoso_scroller_not_found', links: [] };
    }
    var seen = {};
    var seenMeta = {};
    var order = [];
    var stablePasses = 0;
    var passIdx = 0;
    for (passIdx = 0; passIdx < maxPasses; passIdx++) {
      var lenBefore = Object.keys(seen).length;
      await sweepChatListScroller(scroller, seen, seenMeta, stepPx, pauseMs, order);
      var lenAfter = Object.keys(seen).length;
      dexLog('collectAllChatLinks pass', passIdx + 1, '/', maxPasses, 'links', lenAfter);
      if (lenAfter === lenBefore) {
        stablePasses++;
        if (stablePasses >= 2) break;
      } else {
        stablePasses = 0;
      }
    }
    var hrefsOrdered = order.length ? order : Object.keys(seen);
    try {
      var finalOrdered = await collectOrderedKnownHrefs(scroller, seen, stepPx, pauseMs);
      if (finalOrdered && finalOrdered.length) {
        var finalSeen = {};
        hrefsOrdered = [];
        var fi = 0;
        for (fi = 0; fi < finalOrdered.length; fi++) {
          var fh = finalOrdered[fi];
          if (!fh || finalSeen[fh]) continue;
          finalSeen[fh] = true;
          hrefsOrdered.push(fh);
        }
        Object.keys(seen).forEach(function (h) {
          if (!finalSeen[h]) hrefsOrdered.push(h);
        });
      }
    } catch (eOrder) {}
    var links = hrefsOrdered.map(function (href) {
      var m = seenMeta[href];
      var pt = (m && m.peerTitle) || seen[href] || '';
      var parsed = parseNameAgeFromTitle(pt);
      return {
        href: href,
        peerTitle: pt,
        peerDisplayName: (m && m.peerDisplayName) != null ? m.peerDisplayName : parsed.peerDisplayName,
        peerAge: m && m.peerAge != null ? m.peerAge : parsed.peerAge,
        chatUrl: (m && m.chatUrl) || hrefToAbsoluteChatUrl(href),
        isFirstSms: !!(m && m.isFirstSms),
        isPeerOnline: !!(m && m.isPeerOnline),
        isPaidChat: !!(m && m.isPaidChat),
        isUnread: !!(m && m.isUnread)
      };
    });
    restoreOnlineOnlyFromStorageSoon();
    return { ok: true, links: links, passesUsed: passIdx + 1, linkCount: links.length };
  }

  function getTextBlob(el) {
    return String((el && el.innerText) || '')
      .replace(/\s+\n/g, '\n')
      .trim();
  }

  function guessMessageRoleFromElement(el) {
    if (el && typeof el.closest === 'function') {
      try {
        var row = el.closest('div.chat-message');
        if (!row) row = el.closest('.chat-message');
        if (row && row.classList) {
          if (row.classList.contains('chat-message-mine')) return 'me';
          return 'them';
        }
      } catch (eClose) {}
    }
    var chain = '';
    var n = el;
    for (var d = 0; d < 12 && n; d++) {
      if (n.className) {
        chain +=
          typeof n.className === 'string' ? n.className + ' ' : String(n.className.baseVal || '') + ' ';
      }
      n = n.parentElement;
    }
    chain = chain.toLowerCase();
    var mePat =
      /outgoing|own|self|sent|from-me|message-right|message--out|my-message|user-message|message_mine|is-mine|author-me|align-self-end|ml-auto|message-item--own|bubble--me|chat-message--sent|chat-message-mine/;
    var themPat =
      /incoming|partner|interlocutor|from-them|message-left|message--in|their-message|from_partner|is-theirs|author-them/;
    var meHit = mePat.test(chain);
    var themHit = themPat.test(chain);
    if (meHit && !themHit) return 'me';
    if (themHit && !meHit) return 'them';
    n = el;
    for (var i = 0; i < 8 && n; i++) {
      var st = window.getComputedStyle(n);
      var jc = st.justifyContent;
      var ji = st.alignItems;
      if (jc === 'flex-end' || jc === 'end') return 'me';
      if (jc === 'flex-start' || jc === 'start') return 'them';
      if (ji === 'flex-end' || ji === 'end') return 'me';
      if (ji === 'flex-start' || ji === 'start') return 'them';
      n = n.parentElement;
    }
    return 'unknown';
  }

  /**
   * Строка чата во flex: justify-content flex-end -> обычно исходящие, flex-start -> входящие.
   * Выполняется раньше сравнения центра пузыря с центром колонки (широкая обёртка даёт ложный ME).
   */
  function refineRoleByChatRowFlex(el) {
    var n = el;
    var i = 0;
    for (i = 0; i < 14 && n; i++) {
      var st = window.getComputedStyle(n);
      var disp = st.display;
      if (disp === 'flex' || disp === 'inline-flex') {
        var fd = st.flexDirection || 'row';
        if (fd === 'row' || fd === 'row-reverse') {
          var jc = String(st.justifyContent || '');
          if (jc.indexOf('flex-end') !== -1 || jc === 'end') return 'me';
          if (jc.indexOf('flex-start') !== -1 || jc === 'start') return 'them';
        }
      }
      var as = String(st.alignSelf || '');
      if (as.indexOf('flex-end') !== -1 || as === 'end') return 'me';
      if (as.indexOf('flex-start') !== -1 || as === 'start') return 'them';
      n = n.parentElement;
    }
    return null;
  }

  /**
   * Если классы/CSS не дают роль (типично для match-club): сначала flex-строка, иначе центр пузыря
   * относительно колонки — только если пузырь не на всю ширину колонки (иначе ложный ME).
   */
  function refineMessageRoleWithColumnPosition(el, composer) {
    if (!el || !composer) return 'unknown';
    var flexRole = refineRoleByChatRowFlex(el);
    if (flexRole) return flexRole;
    var col = findThreadColumnContainingComposer(composer);
    if (!col || !col.getBoundingClientRect) return 'unknown';
    var cr = col.getBoundingClientRect();
    if (cr.width < 80) return 'unknown';
    var er = el.getBoundingClientRect();
    if (er.width < 2 || er.height < 2) return 'unknown';
    var widthRatio = er.width / cr.width;
    if (widthRatio > 0.82) return 'unknown';
    var mid = er.left + er.width / 2;
    var colMid = cr.left + cr.width / 2;
    var margin = Math.max(12, cr.width * 0.04);
    if (mid > colMid + margin) return 'me';
    if (mid < colMid - margin) return 'them';
    return 'unknown';
  }

  /** Строка только с относительным временем (не отдельное сообщение). */
  function isProbablyRelativeTimeLine(s) {
    var t = String(s || '').trim();
    if (t.length > 56) return false;
    if (/^\d{1,2}:\d{2}\s*(am|pm)?\s*(today|yesterday)?$/i.test(t)) return true;
    if (/^\d{1,2}:\d{2}\s+today$/i.test(t)) return true;
    if (/^\d{1,2}:\d{2}\s+yesterday$/i.test(t)) return true;
    if (
      /^\d{1,2}\.\d{1,2}\.\d{4}(?:,\s*|\s+)\d{1,2}:\d{2}$/.test(t)
    ) {
      return true;
    }
    if (
      /^\d{1,2}\/\d{1,2}\/\d{4}(?:,\s*|\s+)\d{1,2}:\d{2}$/.test(t)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Убирает из потока отдельные DOM-кусочки «15:38 today» и «1st SMS», приклеивая к предыдущему сообщению.
   * @param {Array<{role:string,text:string}>} arr
   * @returns {Array<{role:string,text:string,timeLabel:?string,firstSmsMark:boolean}>}
   */
  function normalizeMessageCandidates(arr) {
    var out = [];
    var i = 0;
    for (i = 0; i < arr.length; i++) {
      var txt = String(arr[i].text || '').trim();
      var role = arr[i].role;
      if (txt.length < 1) continue;
      if (isProbablyRelativeTimeLine(txt)) {
        if (out.length) {
          out[out.length - 1].timeLabel = txt;
        }
        continue;
      }
      if (/^1st\s*SMS$/i.test(txt)) {
        if (out.length) {
          out[out.length - 1].firstSmsMark = true;
        }
        continue;
      }
      out.push({
        role: role,
        text: txt,
        timeLabel: null,
        firstSmsMark: false
      });
    }
    return out;
  }

  /**
   * Кандидаты баблов для визуальной отладки ролей (ME/THEM/UNKNOWN),
   * тем же правилом, что используется в extractStructuredMessagesFromThread.
   * @returns {{ region: Element|null, items: Array, diag: Object }}
   */
  function collectMessageRoleOverlayTargets() {
    var diag = {
      composer: false,
      regionTag: '',
      regionIsBody: false,
      pathname: '',
      queryNodes: 0,
      domSkippedComposer: 0,
      domSkippedSidebar: 0,
      domSkippedChatHref: 0,
      domSkippedVisibility: 0,
      domSkippedEmptyText: 0,
      domRaw: 0,
      domAfterNest: 0,
      usedGeometry: false,
      geometryCount: 0,
      finalItems: 0,
      regionReplacedInvalid: '',
      usedMatchClubMessageRoots: false,
      documentHidden: typeof document.hidden !== 'undefined' ? !!document.hidden : false
    };
    try {
      diag.pathname = String(location.pathname || '');
    } catch (eP) {}
    try {
      diag.inIframe = typeof window !== 'undefined' && window.self !== window.top;
    } catch (eI) {
      diag.inIframe = false;
    }
    var composer = findComposerInActiveChat();
    diag.composer = !!composer;
    var region =
      resolveThreadMessagesRegion(composer) || resolveThreadRegionWalkFromComposer(composer);
    if (region && !isValidMessageListRegionRoot(region, composer)) {
      diag.regionReplacedInvalid = region.nodeName || '';
      region =
        resolveThreadRegionWalkFromComposer(composer) ||
        findThreadColumnContainingComposer(composer) ||
        null;
    }
    if (!region && composer) {
      region = document.body;
    }
    if (!region) {
      diag.reason = 'no_region';
      return { region: null, items: [], diag: diag };
    }
    diag.regionTag = region.nodeName || '';
    diag.regionIsBody = region === document.body;
    var q = queryMessageRowRootsOrDeep(region, diag);
    diag.queryNodes = q.length;
    var candidates = [];
    var i = 0;
    for (i = 0; i < q.length; i++) {
      var node = q[i];
      if (composer && composer.contains(node)) {
        diag.domSkippedComposer++;
        continue;
      }
      if (isInsideChatListSidebar(node)) {
        diag.domSkippedSidebar++;
        continue;
      }
      if (node.closest && node.closest('a[href*="/chats/"]')) {
        var cl = node.closest('a[href*="/chats/"]');
        if (cl && cl.classList && cl.classList.contains('chat-list-item')) {
          diag.domSkippedChatHref++;
          continue;
        }
      }
      if (!isVisibleForRoleOverlay(node)) {
        diag.domSkippedVisibility++;
        continue;
      }
      var t = getTextBlob(node);
      if (t.length < 1) {
        diag.domSkippedEmptyText++;
        continue;
      }
      var role = guessMessageRoleFromElement(node);
      if (role === 'unknown' && composer) {
        role = refineMessageRoleWithColumnPosition(node, composer);
      }
      candidates.push({ el: node, top: node.getBoundingClientRect().top, text: t, role: role });
    }
    diag.domRaw = candidates.length;
    candidates.sort(function (a, b) {
      return a.top - b.top;
    });
    var filtered = [];
    var j = 0;
    for (j = 0; j < candidates.length; j++) {
      var skip = false;
      var k = 0;
      for (k = 0; k < candidates.length; k++) {
        if (j === k) continue;
        if (candidates[k].el.contains(candidates[j].el) && candidates[j].el !== candidates[k].el) {
          skip = true;
          break;
        }
      }
      if (!skip) filtered.push(candidates[j]);
    }
    diag.domAfterNest = filtered.length;
    if (filtered.length === 0) {
      filtered = collectGeometryBubbleOverlayTargets(region, composer);
      diag.usedGeometry = true;
      diag.geometryCount = filtered.length;
    }
    diag.finalItems = filtered.length;
    return { region: region, items: filtered, diag: diag };
  }

  var roleOverlayEnabled = true;
  var roleOverlayTimer = null;
  var roleOverlayObserver = null;
  var roleOverlayBoundRegion = null;
  var roleOverlayScrollHandler = null;
  var roleOverlayRaf = null;
  var roleOverlayDiagLastLog = 0;

  /**
   * Диагностика overlay ролей в консоль (всегда, с throttling; чаще и подробнее при matchClubDebug).
   * Префикс [Dex MC role] — искать в фильтре консоли.
   */
  function roleOverlayConsoleDiag(diag, placedBadges, skippedBadRect) {
    if (!diag) return;
    var now = Date.now();
    var intervalMs = debugEnabled ? 700 : 2800;
    if (now - roleOverlayDiagLastLog < intervalMs) return;
    roleOverlayDiagLastLog = now;
    var payload = {
      placedBadges: placedBadges,
      skippedZeroRect: skippedBadRect,
      overlayEnabled: roleOverlayEnabled
    };
    var key = '';
    for (key in diag) {
      if (Object.prototype.hasOwnProperty.call(diag, key)) {
        payload[key] = diag[key];
      }
    }
    try {
      console.info('[Dex MC role]', payload);
    } catch (eLog) {}
  }

  var roleOverlayHintLogged = false;

  function roleOverlayLogOnceHint() {
    if (roleOverlayHintLogged) return;
    roleOverlayHintLogged = true;
    try {
      console.info(
        '[Dex MC role] Diagnostics on (throttled). Filter: [Dex MC role]. Enable matchClubDebug in extension storage for 700ms logs.'
      );
    } catch (eH) {}
  }

  function ensureFixedRoleOverlayRoot() {
    var root = document.getElementById('dex-mc-role-fixed-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'dex-mc-role-fixed-root';
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText =
      'position:fixed;left:0;top:0;right:0;bottom:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;overflow:visible;';
    document.documentElement.appendChild(root);
    return root;
  }

  function clearFixedRoleOverlayRoot() {
    var root = document.getElementById('dex-mc-role-fixed-root');
    if (root) root.innerHTML = '';
  }

  function scheduleRoleOverlayRefresh() {
    if (roleOverlayRaf != null) return;
    roleOverlayRaf = requestAnimationFrame(function () {
      roleOverlayRaf = null;
      try {
        renderRoleOverlayNow();
      } catch (eRf) {}
    });
  }

  function attachRoleOverlayScrollRefresh() {
    if (roleOverlayScrollHandler) return;
    roleOverlayScrollHandler = function () {
      if (!roleOverlayEnabled) return;
      scheduleRoleOverlayRefresh();
    };
    window.addEventListener('scroll', roleOverlayScrollHandler, true);
    window.addEventListener('resize', roleOverlayScrollHandler);
    try {
      document.addEventListener('scroll', roleOverlayScrollHandler, true);
    } catch (eSc) {}
  }

  function detachRoleOverlayScrollRefresh() {
    if (!roleOverlayScrollHandler) return;
    window.removeEventListener('scroll', roleOverlayScrollHandler, true);
    window.removeEventListener('resize', roleOverlayScrollHandler);
    try {
      document.removeEventListener('scroll', roleOverlayScrollHandler, true);
    } catch (eSc2) {}
    roleOverlayScrollHandler = null;
  }

  function ensureRoleOverlayStyle() {
    if (document.getElementById('dex-mc-role-overlay-style')) return;
    var st = document.createElement('style');
    st.id = 'dex-mc-role-overlay-style';
    st.textContent =
      '.dex-mc-role-badge{' +
      'font:700 10px/1.1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;' +
      'padding:2px 6px;border-radius:999px;letter-spacing:.2px;' +
      'border:1px solid rgba(0,0,0,.35);pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.35);white-space:nowrap;' +
      '}' +
      '.dex-mc-role-badge[data-role="me"]{background:#00c853;color:#041b08;}' +
      '.dex-mc-role-badge[data-role="them"]{background:#4fc3f7;color:#031926;}' +
      '.dex-mc-role-badge[data-role="unknown"]{background:#ffb300;color:#2a1a00;}';
    document.documentElement.appendChild(st);
  }

  function clearRoleOverlay() {
    try {
      clearFixedRoleOverlayRoot();
    } catch (eFx) {}
  }

  function renderRoleOverlayNow() {
    if (!roleOverlayEnabled) {
      clearRoleOverlay();
      return;
    }
    ensureRoleOverlayStyle();
    var data = collectMessageRoleOverlayTargets();
    var diag = data.diag || {};
    if (!data.region) {
      roleOverlayConsoleDiag(diag, 0, 0);
      return;
    }
    clearRoleOverlay();
    var root = ensureFixedRoleOverlayRoot();
    var placedBadges = 0;
    var skippedZeroRect = 0;
    data.items.forEach(function (it) {
      var el = it.el;
      if (!el || !el.isConnected) return;
      var role = it.role === 'me' || it.role === 'them' ? it.role : 'unknown';
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        skippedZeroRect++;
        return;
      }
      placedBadges++;
      var badge = document.createElement('span');
      badge.className = 'dex-mc-role-badge';
      badge.dataset.role = role;
      badge.textContent = role.toUpperCase();
      badge.style.position = 'fixed';
      badge.style.left = Math.round(r.left + 2) + 'px';
      badge.style.top = Math.round(r.top + 2) + 'px';
      badge.style.zIndex = '2147483647';
      root.appendChild(badge);
    });
    roleOverlayConsoleDiag(diag, placedBadges, skippedZeroRect);
  }

  function bindRoleOverlayObserver() {
    var data = collectMessageRoleOverlayTargets();
    var region = data.region;
    if (!region) return;
    if (roleOverlayBoundRegion === region && roleOverlayObserver) return;
    if (roleOverlayObserver) {
      try {
        roleOverlayObserver.disconnect();
      } catch (e0) {}
      roleOverlayObserver = null;
    }
    roleOverlayBoundRegion = region;
    roleOverlayObserver = new MutationObserver(function () {
      renderRoleOverlayNow();
    });
    try {
      roleOverlayObserver.observe(region, { childList: true, subtree: true });
    } catch (e1) {}
  }

  function setRoleOverlayEnabled(enabled) {
    roleOverlayEnabled = !!enabled;
    if (!roleOverlayEnabled) {
      detachRoleOverlayScrollRefresh();
      if (roleOverlayObserver) {
        try {
          roleOverlayObserver.disconnect();
        } catch (e2) {}
        roleOverlayObserver = null;
      }
      roleOverlayBoundRegion = null;
      clearRoleOverlay();
      return;
    }
    attachRoleOverlayScrollRefresh();
    roleOverlayLogOnceHint();
    renderRoleOverlayNow();
    bindRoleOverlayObserver();
    if (!roleOverlayTimer) {
      roleOverlayTimer = setInterval(function () {
        renderRoleOverlayNow();
        bindRoleOverlayObserver();
      }, 1500);
    }
  }

  /**
   * Структурированные сообщения из области треда (роли me/them по классам и flex).
   * role — направление отправителя (не имя; имя в peerTitle на объекте чата).
   * @returns {{ messages: Array, threadPlain: string, extractMethod: string, threadColumnFound: boolean }}
   */
  function extractStructuredMessagesFromThread() {
    var composer = findComposerInActiveChat();
    var threadCol = findThreadColumnContainingComposer(composer);
    var region =
      resolveThreadMessagesRegion(composer) || resolveThreadRegionWalkFromComposer(composer);
    var threadPlain = '';
    if (region) {
      threadPlain = String(region.innerText || '')
        .replace(/\s+\n/g, '\n')
        .trim();
    }
    var messages = [];
    if (!region) {
      return {
        messages: messages,
        threadPlain: threadPlain,
        extractMethod: 'no_region',
        threadColumnFound: !!threadCol
      };
    }
    var q = queryMessageRowRootsOrDeep(region, null);
    var candidates = [];
    for (var i = 0; i < q.length; i++) {
      var node = q[i];
      if (composer && composer.contains(node)) continue;
      if (isInsideChatListSidebar(node)) continue;
      if (node.closest && node.closest('a[href*="/chats/"]')) {
        var cl = node.closest('a[href*="/chats/"]');
        if (cl && cl.classList && cl.classList.contains('chat-list-item')) continue;
      }
      if (!isVisibleForRoleOverlay(node)) continue;
      var t = getTextBlob(node);
      if (t.length < 2) continue;
      var role = guessMessageRoleFromElement(node);
      if (role === 'unknown' && composer) {
        role = refineMessageRoleWithColumnPosition(node, composer);
      }
      candidates.push({ el: node, top: node.getBoundingClientRect().top, text: t, role: role });
    }
    candidates.sort(function (a, b) {
      return a.top - b.top;
    });
    var filtered = [];
    for (var j = 0; j < candidates.length; j++) {
      var skip = false;
      for (var k = 0; k < candidates.length; k++) {
        if (j === k) continue;
        if (candidates[k].el.contains(candidates[j].el) && candidates[j].el !== candidates[k].el) {
          skip = true;
          break;
        }
      }
      if (!skip) filtered.push(candidates[j]);
    }
    var usedGeometryFallback = false;
    if (filtered.length === 0 && composer) {
      var geo = collectGeometryBubbleOverlayTargets(region, composer);
      if (geo.length === 0) {
        var wideRegion =
          findThreadColumnContainingComposer(composer) ||
          resolveThreadRegionWalkFromComposer(composer) ||
          region;
        if (wideRegion && wideRegion !== region) {
          geo = collectGeometryBubbleOverlayTargets(wideRegion, composer);
        }
      }
      if (geo.length === 0 && document.body && region !== document.body) {
        geo = collectGeometryBubbleOverlayTargets(document.body, composer);
      }
      if (geo.length > 0) {
        usedGeometryFallback = true;
        var gx = 0;
        for (gx = 0; gx < geo.length; gx++) {
          filtered.push({
            el: geo[gx].el,
            top: geo[gx].top,
            text: geo[gx].text,
            role: geo[gx].role
          });
        }
        filtered.sort(function (a, b) {
          return a.top - b.top;
        });
      }
    }
    var rawMsgs = [];
    filtered.forEach(function (c) {
      rawMsgs.push({ role: c.role, text: c.text });
    });
    messages = normalizeMessageCandidates(rawMsgs);
    if (messages.length === 0 && threadPlain) {
      messages.push({
        role: 'unknown',
        text: threadPlain,
        timeLabel: null,
        firstSmsMark: false
      });
    }
    var usedFallbackBlob =
      messages.length === 1 &&
      messages[0].role === 'unknown' &&
      String(messages[0].text || '').trim() === threadPlain.trim();
    var extractMethod = 'fallback_plain';
    if (messages.length === 0) {
      extractMethod = 'no_messages';
    } else if (usedGeometryFallback) {
      extractMethod = 'geometry_fallback';
    } else if (!usedFallbackBlob) {
      extractMethod = threadCol ? 'dom_thread_column' : 'dom_walk';
    }
    return {
      messages: messages,
      threadPlain: threadPlain,
      extractMethod: extractMethod,
      threadColumnFound: !!threadCol
    };
  }

  /**
   * Fallback, если строка чата не в DOM: без полной перезагрузки страницы.
   * Синтетический `createElement('a').click()` даёт обычную навигацию браузера и полный reload
   * документа — сбрасывается SPA (в т.ч. тоггл Online).
   * Порядок: ещё раз реальный `a` из разметки (мог появиться), затем `pushState` + синтетический `popstate`.
   */
  function tryOpenChatWithoutDocumentReload(href, navOpts) {
    navOpts = navOpts || {};
    var skipDomAnchorClick = !!navOpts.skipDomAnchorClick;
    var normalized = normalizeChatListHref(href);
    if (!normalized) return false;
    if (!skipDomAnchorClick) {
      var again = findChatListAnchorByHref(normalized);
      if (again) {
        try {
          again.click();
          watchTrace('openChat fallback dom anchor click', normalized);
          return true;
        } catch (eClick) {}
      }
    }
    try {
      var abs = hrefToAbsoluteChatUrl(normalized);
      var u = new URL(abs, location.href);
      if (u.origin !== location.origin) return false;
      var next = u.pathname + u.search + u.hash;
      var cur = location.pathname + location.search + location.hash;
      if (next === cur) {
        watchTrace('openChat fallback pushState skip same URL', next);
        return true;
      }
      window.history.pushState({ dexMatchClubNav: 1 }, '', next);
      try {
        window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      } catch (ePop) {
        try {
          window.dispatchEvent(new Event('popstate'));
        } catch (eEv) {}
      }
      watchTrace('openChat fallback pushState', next);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Открыть чат по ссылке из списка и дождаться композера.
   * По умолчанию для Virtuoso: прокрутка до появления строки в DOM, затем клик.
   * В режиме noListRescroll: без повторной прокрутки списка (после уже собранного списка чатов).
   * Если строка не найдена, пробуем DOM/History API без reload.
   */
  async function openChatAndWait(href, timeoutMs, scrollOpts) {
    var ms = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 4500;
    var pathWant = normalizeChatPathFromHref(href);
    var curP = (location.pathname || '').replace(/^\//, '');
    if (pathWant && curP === pathWant) {
      dexLog('openChat: already on chat, skip list click and fallback navigation');
      restoreOnlineOnlyFromStorageSoon();
      await sleep(400);
      var composerEarly = await waitForChatComposerReady(Math.max(ms, 12000));
      return { ok: composerEarly, composerFound: composerEarly };
    }
    var noListRescroll = !!(scrollOpts && scrollOpts.noListRescroll);
    if (noListRescroll) {
      // Экспортный режим: не трогаем список вообще (ни scroll, ни click по строкам).
      if (!tryOpenChatWithoutDocumentReload(href, { skipDomAnchorClick: true })) {
        return { ok: false, error: 'open_without_list_interaction_failed' };
      }
      restoreOnlineOnlyFromStorageSoon();
      var startNoScroll = Date.now();
      while (Date.now() - startNoScroll < ms) {
        await sleep(350);
        var pNoScroll = (location.pathname || '').replace(/^\//, '');
        if (pNoScroll === pathWant) break;
      }
      await sleep(500);
      restoreOnlineOnlyFromStorageSoon();
      var composerNoScroll = await waitForChatComposerReady(Math.max(ms, 12000));
      return { ok: composerNoScroll, composerFound: composerNoScroll };
    }
    var revealed = null;
    revealed = await scrollListUntilChatLinkVisible(href, scrollOpts || {});
    restoreOnlineOnlyFromStorageSoon();
    if (revealed.ok) {
      try {
        revealed.anchor.click();
      } catch (e) {
        return { ok: false, error: 'click_failed' };
      }
    } else {
      var err = revealed.error || 'chat_row_not_in_dom';
      if (err === 'chat_row_not_in_dom' || err === 'virtuoso_scroller_not_found') {
        if (curP === pathWant) {
          dexLog('openChat: fallback skipped, path already matches');
        } else if (!tryOpenChatWithoutDocumentReload(href)) {
          return { ok: false, error: err };
        } else {
          dexLog('openChat history/DOM fallback (no synthetic <a>)', href);
          restoreOnlineOnlyFromStorageSoon();
        }
      } else {
        return { ok: false, error: err };
      }
    }
    var start = Date.now();
    while (Date.now() - start < ms) {
      await sleep(350);
      var p = (location.pathname || '').replace(/^\//, '');
      if (p === pathWant) break;
    }
    await sleep(500);
    restoreOnlineOnlyFromStorageSoon();
    var composerReady = await waitForChatComposerReady(Math.max(ms, 12000));
    return { ok: composerReady, composerFound: composerReady };
  }

  /**
   * Обход списка чатов: сбор ссылок, по очереди открытие, извлечение сообщений.
   * Опционально: очередь `outboundQueue` — после анализа треда следующий шаблон (см. decideOutboundSend).
   * `outboundInsertOnly` (по умолчанию true): только insertDraft, затем ожидание ручной отправки; false — sendMessageToChat.
   * @param {Object} [opts] maxChats, outboundQueue, outboundInsertOnly, outboundManualSendTimeoutMs, waitPerChatMs, …
   */
  async function runExportAllChats(opts) {
    opts = opts || {};
    var maxChats = typeof opts.maxChats === 'number' && opts.maxChats > 0 ? opts.maxChats : 120;
    var outboundQueue = [];
    if (Array.isArray(opts.outboundQueue)) {
      var oi = 0;
      for (oi = 0; oi < opts.outboundQueue.length; oi++) {
        var os = String(opts.outboundQueue[oi] || '').trim();
        if (os) outboundQueue.push(os);
      }
    }
    var scrollOpts = {
      listScrollStepPx:
        typeof opts.listScrollStepPx === 'number' && opts.listScrollStepPx > 0
          ? opts.listScrollStepPx
          : 56,
      listScrollPauseMs:
        typeof opts.listScrollPauseMs === 'number' && opts.listScrollPauseMs >= 0
          ? opts.listScrollPauseMs
          : 110,
      maxListPasses:
        typeof opts.maxListPasses === 'number' && opts.maxListPasses > 0 ? opts.maxListPasses : 15,
      openRevealMaxSteps:
        typeof opts.openRevealMaxSteps === 'number' && opts.openRevealMaxSteps > 0
          ? opts.openRevealMaxSteps
          : 12000,
      /** Экспорт: не скроллить Virtuoso перед каждым чатом, список уже собран collectAllChatLinks. */
      noListRescroll: opts.noListRescroll !== false,
      scrollPauseMs: typeof opts.scrollPauseMs === 'number' ? opts.scrollPauseMs : undefined
    };
    var waitPerChat =
      typeof opts.waitPerChatMs === 'number' && opts.waitPerChatMs > 0 ? opts.waitPerChatMs : 2800;
    /** По умолчанию true: только вставка в поле, ждать ручную отправку (фаза контроля). false — автоотправка как раньше. */
    var outboundInsertOnly = opts.outboundInsertOnly !== false;
    var outboundManualSendTimeoutMs =
      typeof opts.outboundManualSendTimeoutMs === 'number' && opts.outboundManualSendTimeoutMs > 0
        ? opts.outboundManualSendTimeoutMs
        : 600000;
    var qs = opts.outboundQueueSource;
    var outboundQueueSource =
      qs === 'file_via_server' || qs === 'approved_followup' || qs === 'match_club_file' ? qs : null;
    var outboundQueueSourcePath =
      typeof opts.outboundQueueSourcePath === 'string' && String(opts.outboundQueueSourcePath).trim()
        ? String(opts.outboundQueueSourcePath).trim()
        : 'match-club-outbound-queue.md';
    /** Не вставлять следующий пункт очереди сразу после недавней исходящей (тот же чат снова открылся в экспорте). 0 = выключить. */
    var outboundCooldownMs =
      typeof opts.outboundCooldownMs === 'number' && opts.outboundCooldownMs >= 0
        ? opts.outboundCooldownMs
        : 120000;
    var capturedAt = new Date().toISOString();
    var outboundStats = { sent: 0, skipped: 0, failed: 0, byReason: {} };
    var sentCountDelta = 0;
    function bumpOutbound(kind, reason) {
      var r = reason || 'unknown';
      if (!outboundStats.byReason[r]) outboundStats.byReason[r] = 0;
      outboundStats.byReason[r]++;
      if (kind === 'sent') outboundStats.sent++;
      else if (kind === 'failed') outboundStats.failed++;
      else outboundStats.skipped++;
    }
    var listResult = await collectAllChatLinks(scrollOpts);
    if (!listResult.ok) {
      return {
        schemaVersion: 4,
        messageRoleSemantics: MESSAGE_ROLE_SEMANTICS,
        ok: false,
        capturedAt: capturedAt,
        sourceUrl: location.href,
        error: listResult.error,
        chats: [],
        errors: [{ step: 'collect_links', error: listResult.error }],
        outboundRun: {
          enabled: outboundQueue.length > 0,
          queueLength: outboundQueue.length,
          queueSource: outboundQueueSource || undefined,
          queueSourceFile: outboundQueueSourcePath,
          insertOnly: outboundQueue.length > 0 ? outboundInsertOnly : undefined,
          outboundCooldownMs: outboundQueue.length > 0 ? outboundCooldownMs : undefined,
          stats: outboundStats
        }
      };
    }
    if (!listResult.links || listResult.links.length === 0) {
      return {
        schemaVersion: 4,
        messageRoleSemantics: MESSAGE_ROLE_SEMANTICS,
        ok: false,
        capturedAt: capturedAt,
        sourceUrl: location.href,
        error: 'no_chat_links_found',
        chats: [],
        errors: [
          {
            step: 'collect_links',
            error:
              'no_chat_links_found: не найдено ни одной ссылки a.chat-list-item на /chats/…/messages. Откройте список чатов (split-view) и обновите страницу.'
          }
        ],
        outboundRun: {
          enabled: outboundQueue.length > 0,
          queueLength: outboundQueue.length,
          queueSource: outboundQueueSource || undefined,
          queueSourceFile: outboundQueueSourcePath,
          insertOnly: outboundQueue.length > 0 ? outboundInsertOnly : undefined,
          outboundCooldownMs: outboundQueue.length > 0 ? outboundCooldownMs : undefined,
          stats: outboundStats
        }
      };
    }
    var linksSlice = listResult.links.slice(0, maxChats);
    /** Один нормализованный href на чат (Virtuoso иногда даёт дубликаты порядка). */
    var linksDedupSeen = {};
    var links = [];
    var ld = 0;
    for (ld = 0; ld < linksSlice.length; ld++) {
      var lhref = normalizeChatListHref(linksSlice[ld].href || '');
      if (!lhref) continue;
      if (linksDedupSeen[lhref]) continue;
      linksDedupSeen[lhref] = true;
      links.push(linksSlice[ld]);
    }
    /**
     * Исходящий сценарий для href уже выполняли в этом runExportAllChats (вставка или отправка).
     * Повторное открытие того же чата не должно снова дергать insertDraft / анализ.
     */
    var outboundHandledHrefKeys = {};
    var chats = [];
    var errors = [];
    for (var i = 0; i < links.length; i++) {
      var L = links[i];
      var hrefKey = normalizeChatListHref(L.href || '');
      if (outboundQueue.length > 0 && hrefKey && outboundHandledHrefKeys[hrefKey]) {
        dexLog('skip chat outbound already handled this run', hrefKey);
        bumpOutbound('skipped', 'already_outbound_this_run');
        var peerTitleSkip = String(L.peerTitle || '').trim();
        var parsedSkip = parseNameAgeFromTitle(peerTitleSkip);
        chats.push({
          href: L.href,
          chatUrl: L.chatUrl || hrefToAbsoluteChatUrl(L.href),
          peerTitle: peerTitleSkip,
          peerDisplayName: L.peerDisplayName || parsedSkip.peerDisplayName,
          peerAge: L.peerAge != null ? L.peerAge : parsedSkip.peerAge,
          peerTitleNormalized: String(L.peerDisplayName || peerTitleSkip || '')
            .replace(/\s*,\s*\d+\s*$/, '')
            .trim(),
          isFirstSms: !!L.isFirstSms,
          isPeerOnline: !!L.isPeerOnline,
          isPaidChat: !!(L.isPaidChat) || isPaidChatByHrefInList(L.href),
          peerTitleFromThread: null,
          messages: [],
          threadPlain: '',
          extractMethod: null,
          threadColumnFound: false,
          outbound: { action: 'skipped', reason: 'already_outbound_this_run' },
          skippedEarly: true,
          url: location.href
        });
        continue;
      }
      dexLog('export chat', i + 1, '/', links.length, L.href);
      var opened = await openChatAndWait(L.href, waitPerChat, scrollOpts);
      if (!opened.ok) {
        errors.push({
          href: L.href,
          chatUrl: L.chatUrl || hrefToAbsoluteChatUrl(L.href),
          peerTitle: L.peerTitle,
          peerDisplayName: L.peerDisplayName,
          peerAge: L.peerAge,
          isFirstSms: !!L.isFirstSms,
          isPeerOnline: !!L.isPeerOnline,
          step: 'open',
          error: opened.error || 'open_failed'
        });
        continue;
      }
      var ctx;
      var fallback;
      var plain;
      var headerTitle = extractPeerTitleFromThreadHeader();
      var peerTitle = String(L.peerTitle || '').trim();
      if (!peerTitle && headerTitle) peerTitle = String(headerTitle).trim();
      var parsedFromList = parseNameAgeFromTitle(peerTitle);
      var peerDisplayName = L.peerDisplayName || parsedFromList.peerDisplayName;
      var peerAge = L.peerAge != null ? L.peerAge : parsedFromList.peerAge;
      var peerTitleNormalized = String(peerDisplayName || peerTitle || '')
        .replace(/\s*,\s*\d+\s*$/, '')
        .trim();
      var outbound = null;
      var isPaidChatResolved =
        !!(L.isPaidChat) || isPaidChatByHrefInList(L.href) || isPaidChatFromOpenThreadHeader();
      if (outboundQueue.length === 0) {
        await sleep(350);
        ctx = extractStructuredMessagesFromThread();
        fallback = getChatContext();
        plain = ctx.threadPlain || (fallback.partnerContext || '');
        if (ctx.messages.length === 1 && ctx.messages[0].role === 'unknown' && plain && plain.length > ctx.messages[0].text.length) {
          ctx.messages[0].text = plain;
        }
      } else if (isPaidChatResolved) {
        dexLog('export skip outbound paid chat', hrefKey);
        bumpOutbound('skipped', 'chat_paid_label');
        await sleep(350);
        ctx = extractStructuredMessagesFromThread();
        fallback = getChatContext();
        plain = ctx.threadPlain || (fallback.partnerContext || '');
        if (ctx.messages.length === 1 && ctx.messages[0].role === 'unknown' && plain && plain.length > ctx.messages[0].text.length) {
          ctx.messages[0].text = plain;
        }
        outbound = {
          action: 'skipped',
          reason: 'chat_paid_label',
          isPaidChat: true
        };
      } else {
        var dec = { action: 'off', reason: 'no_attempt' };
        var expAttempt = 0;
        for (expAttempt = 0; expAttempt < 4; expAttempt++) {
          if (expAttempt > 0) {
            await sleep(450 + expAttempt * 150);
          } else {
            await sleep(350);
          }
          ctx = extractStructuredMessagesFromThread();
          fallback = getChatContext();
          plain = ctx.threadPlain || (fallback.partnerContext || '');
          if (ctx.messages.length === 1 && ctx.messages[0].role === 'unknown' && plain && plain.length > ctx.messages[0].text.length) {
            ctx.messages[0].text = plain;
          }
          dec = decideOutboundSend(outboundQueue, ctx.messages, plain, {
            cooldownMs: outboundCooldownMs,
            forcePlainWhenEmptyExtract: expAttempt >= 3
          });
          dexLog('outbound decision', peerTitle, dec, 'export_attempt', expAttempt);
          if (dec.action === 'send' && dec.text) break;
          if (!isWatchOutboundDecisionRecoverable(dec)) break;
        }
        if (dec.action === 'send') {
          var memEx = await getLastOutboundMemoryForHref(L.href);
          if (shouldSkipOutboundRepeatFromMemory(memEx, dec)) {
            outbound = {
              action: 'skipped',
              reason: 'outbound_repeat_same_text_memory',
              queueIndex: dec.queueIndex,
              decisionReason: dec.reason,
              textPreview: String(dec.text).slice(0, 160)
            };
            bumpOutbound('skipped', 'outbound_repeat_same_text_memory');
          } else {
          var countBeforeSend = ctx.messages.length;
          if (outboundInsertOnly) {
            var ins = await insertDraftWithRetriesAsync(dec.text, 12, 480);
            if (!ins.ok) {
              outbound = {
                action: 'insert_failed',
                insertOnly: true,
                decisionReason: dec.reason,
                queueIndex: dec.queueIndex,
                error: ins.error || 'insertDraft',
                textPreview: String(dec.text).slice(0, 320)
              };
              bumpOutbound('failed', ins.error || 'insert_failed');
            } else {
              if (hrefKey) outboundHandledHrefKeys[hrefKey] = true;
              var waitR = await waitForUserManualSend(countBeforeSend, outboundManualSendTimeoutMs);
              if (waitR.ok) {
                outbound = {
                  action: 'user_confirmed_send',
                  insertOnly: true,
                  decisionReason: dec.reason,
                  queueIndex: dec.queueIndex,
                  textPreview: String(dec.text).slice(0, 320),
                  waitReason: waitR.reason
                };
                bumpOutbound('sent', 'user_confirmed_send');
                sentCountDelta += 1;
                await setLastOutboundMemoryForHref(L.href, {
                  queueIndex: dec.queueIndex,
                  text: dec.text
                });
                try {
                  var cmpAfter = findComposerInActiveChat();
                  if (cmpAfter && dec.text) {
                    var curAfter = String(getComposerText(cmpAfter) || '').trim();
                    if (
                      curAfter &&
                      normalizeOutboundText(curAfter) === normalizeOutboundText(String(dec.text))
                    ) {
                      setValueAndNotify(cmpAfter, '');
                    }
                  }
                } catch (eClr) {}
                await sleep(600);
              } else {
                outbound = {
                  action: 'insert_only_wait_timeout',
                  insertOnly: true,
                  decisionReason: dec.reason,
                  queueIndex: dec.queueIndex,
                  textPreview: String(dec.text).slice(0, 320),
                  error: waitR.reason
                };
                bumpOutbound('failed', waitR.reason);
              }
            }
          } else {
            var sr = await sendMessageToChat(dec.text);
            if (sr.ok) {
              if (hrefKey) outboundHandledHrefKeys[hrefKey] = true;
              outbound = {
                action: 'sent',
                insertOnly: false,
                decisionReason: dec.reason,
                queueIndex: dec.queueIndex,
                textPreview: String(dec.text).slice(0, 320),
                sendMethod: sr.method || null
              };
              bumpOutbound('sent', dec.reason || 'sent');
              sentCountDelta += 1;
              await setLastOutboundMemoryForHref(L.href, {
                queueIndex: dec.queueIndex,
                text: dec.text
              });
              try {
                var cmpAuto = findComposerInActiveChat();
                if (cmpAuto && dec.text) {
                  var curAuto = String(getComposerText(cmpAuto) || '').trim();
                  if (
                    curAuto &&
                    normalizeOutboundText(curAuto) === normalizeOutboundText(String(dec.text))
                  ) {
                    setValueAndNotify(cmpAuto, '');
                  }
                }
              } catch (eClr2) {}
              await sleep(1400);
            } else {
              outbound = {
                action: 'send_failed',
                insertOnly: false,
                decisionReason: dec.reason,
                queueIndex: dec.queueIndex,
                error: sr.error || 'send',
                textPreview: String(dec.text).slice(0, 320)
              };
              bumpOutbound('failed', sr.error || 'send_failed');
            }
          }
          }
        } else if (dec.action === 'skip') {
          outbound = { action: 'skipped', reason: dec.reason };
          if (dec.reason === 'last_outgoing_too_recent') {
            if (dec.lastOutgoingAgeMs != null) outbound.lastOutgoingAgeMs = dec.lastOutgoingAgeMs;
            if (dec.cooldownMs != null) outbound.cooldownMs = dec.cooldownMs;
            if (dec.lastClockMs != null) outbound.lastClockParsedAtMs = dec.lastClockMs;
          }
          bumpOutbound('skipped', dec.reason);
          if (shouldPersistOutboundSkipToMemory(dec)) {
            await setLastOutboundMemoryForHref(L.href, {
              queueIndex:
                typeof dec.queueIndex === 'number' ? dec.queueIndex : -1,
              text: dec.text
            });
          }
        } else {
          outbound = { action: 'skipped', reason: dec.reason || 'off' };
          bumpOutbound('skipped', dec.reason || 'off');
        }
      }
      chats.push({
        href: L.href,
        chatUrl: L.chatUrl || hrefToAbsoluteChatUrl(L.href),
        peerTitle: peerTitle,
        peerDisplayName: peerDisplayName,
        peerAge: peerAge,
        peerTitleNormalized: peerTitleNormalized,
        isFirstSms: !!L.isFirstSms,
        isPeerOnline: !!L.isPeerOnline,
        isPaidChat: !!isPaidChatResolved,
        peerTitleFromThread: headerTitle && headerTitle !== peerTitle ? headerTitle : null,
        messages: ctx.messages,
        threadPlain: plain,
        extractMethod: ctx.extractMethod,
        threadColumnFound: ctx.threadColumnFound,
        outbound: outbound,
        url: location.href
      });
    }
    var outboundRunObj = {
      enabled: outboundQueue.length > 0,
      queueLength: outboundQueue.length,
      queueSource: outboundQueueSource || undefined,
      queueSourceFile: outboundQueueSourcePath,
      insertOnly: outboundQueue.length > 0 ? outboundInsertOnly : undefined,
      manualSendTimeoutMs: outboundQueue.length > 0 ? outboundManualSendTimeoutMs : undefined,
      outboundCooldownMs: outboundQueue.length > 0 ? outboundCooldownMs : undefined,
      stats: outboundStats
    };
    if (outboundQueue.length > 0) {
      outboundRunObj.perChat = chats.map(function (c) {
        return {
          peerTitle: c.peerTitle,
          peerTitleNormalized: c.peerTitleNormalized,
          chatUrl: c.chatUrl,
          outbound: c.outbound
        };
      });
    }
    if (sentCountDelta > 0) {
      await incrementDailySentCounter(sentCountDelta, 'runExportAllChats');
    }
    return {
      schemaVersion: 4,
      messageRoleSemantics: MESSAGE_ROLE_SEMANTICS,
      ok: true,
      capturedAt: capturedAt,
      sourceUrl: location.href,
      chatListTotal: listResult.links.length,
      chatListPassesUsed: listResult.passesUsed,
      chatListExported: chats.length,
      chats: chats,
      errors: errors,
      outboundRun: outboundRunObj
    };
  }

  /** Список чатов: новая строка -> отложенная вставка первой добивки из очереди (human-in-the-loop). */
  var MATCH_CLUB_WATCH_KEY = 'matchClubWatchV1';
  var watchIntervalId = null;
  var watchMo = null;
  var watchScanDebounceTimer = null;
  /** DOM списка (фильтр, виртуализация): быстрый пересъём бейджей из storage без полного scan. */
  var watchBadgeMoDebounceTimer = null;
  var watchPipelineBusy = false;
  var watchLastNoDueTraceAt = 0;
  var watchCatchupLastQueuedAtByHref = Object.create(null);
  /**
   * hrefNorm -> expiresAt (ms): priority (Paid/1st SMS) + unread уже получили bump или постановку в очередь.
   * Персистится в chrome.storage (TTL 48h), чтобы после F5 или обновления расширения тот же href не попадал в очередь снова, пока в pending есть terminal done и dup-логика его игнорирует.
   */
  var watchPaidUnreadOnePassUntilByHref = Object.create(null);
  var WATCH_PAID_UNREAD_ONE_PASS_PERSIST_MS = 48 * 60 * 60 * 1000;
  /** Полный скан списка (с автоскроллом) — не чаще заданного интервала. */
  var watchDeepScanInFlight = false;
  var watchDeepScanLastAt = 0;
  var WATCH_DEEP_SCAN_MIN_INTERVAL_MS = 45000;
  /** Для Paid/First SMS: повторный авто-проход по тому же чату не чаще одного раза в час. */
  var WATCH_PRIORITY_REQUEUE_INTERVAL_MS = 60 * 60 * 1000;
  /** После выхода из priority-wait: дать окну времени на форсированный deep-scan (без ожидания throttle). */
  var watchForceDeepScanUntil = 0;
  /** Сбрасывается в начале watchExecuteFollowUpItem; true -> waitForUserManualSend выходит с user_aborted_wait. */
  var watchAbortWaitRequested = false;
  /** Активность текущего pipeline-шага (для почасового отчёта). */
  var watchPipelineActiveSinceMs = 0;
  var watchPipelineActiveMeta = null;
  /** Приоритетный режим: draft для Paid/1st SMS вставлен, ждём ручную отправку и не сканируем/не берём новые due. */
  var watchPauseMonitoringForManualSend = false;
  /** Нормализованный watchMode из последнего pick в watchTryProcessDue (для веток в watchExecuteFollowUpItem). */
  var watchEffectiveModeCache = 'all';
  /** Фаза прохода paid_only: paid -> first_sms -> unread (DOM-фильтры синхронизированы с очередью). */
  var watchPaidOnlyPassPhaseCache = 'paid';
  /** Один раз за фазу paid: снять Online, включить Paid-фильтр в DOM (если найден). */
  var watchPaidOnlyDomPaidSetupDone = false;
  /** Один раз за фазу first_sms: Paid OFF, только 1st SMS в DOM (если найден чекбокс). */
  var watchPaidOnlyDomFirstSmsSetupDone = false;
  /** Один раз за фазу unread: выключить Paid, включить Unread в DOM (если найден). */
  var watchPaidOnlyDomUnreadSetupDone = false;
  /** Сколько максимум ждать ручную отправку в priority-flow перед мягким re-schedule. */
  var WATCH_PRIORITY_WAIT_SEND_TIMEOUT_MS = 12 * 60 * 60 * 1000;
  /** Защита от «вечной паузы»: подготовка priority draft (профиль + LLM) должна завершиться за разумное время. */
  var WATCH_PRIORITY_PREP_TIMEOUT_MS = 90000;
  /**
   * После загрузки вкладки не запускать обработку очереди сразу: SPA и storage ещё стабилизируются;
   * иначе мгновенный openChatAndWait (клик / синтетическая ссылка) мог приводить к полной перезагрузке страницы в цикле.
   */
  var watchTabLoadProcessNotBefore = 0;
  /** После пустой очереди или ошибки fetch: не дергать pick, чтобы не спамить сервер и storage. */
  var watchOutboundBackoffUntil = 0;
  var WATCH_OUTBOUND_EMPTY_BACKOFF_MS = 45000;
  var WATCH_OUTBOUND_FETCH_FAIL_BACKOFF_MS = 12000;
  /** При падении локального suggest-сервера не "пробегать" по всем чатам подряд. */
  var watchSuggestBackoffUntil = 0;
  var WATCH_SUGGEST_FAIL_BACKOFF_MS = 12000;
  var WATCH_PRIORITY_SUGGEST_RETRY_FAST_DELAY_MS = 1200;
  /**
   * После явного удаления черновика в priority (платный проход) не ставим тот же href снова
   * из скана (paid unread / catchup), пока не истечёт TTL.
   */
  var WATCH_DRAFT_DELETE_NO_REQUEUE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

  function defaultWatchState() {
    return {
      schemaVersion: 1,
      enabled: false,
      watchMode: 'all',
      /** paid_only: 'paid' -> 'first_sms' -> 'unread' (см. normalizePaidOnlyPassPhase). */
      paidOnlyPassPhase: 'paid',
      delayMs: 180000,
      seenHrefKeys: [],
      baselineCaptured: false,
      pending: [],
      activeProcessingId: null,
      /** { hrefNorm, until } — until = Date.now() + TTL при удалении драфта в priority-flow. */
      draftDeletedNoRequeueEntries: [],
      /** hrefNorm -> expiresAt: не ставить снова priority paid unread до истечения (см. WATCH_PAID_UNREAD_ONE_PASS_PERSIST_MS). */
      paidUnreadOnePassUntilByHref: {}
    };
  }

  function watchMergeState(st) {
    var base = defaultWatchState();
    if (!st || typeof st !== 'object') return base;
    if (typeof st.enabled === 'boolean') base.enabled = st.enabled;
    if (st.watchMode === 'free_only' || st.watchMode === 'all' || st.watchMode === 'paid_only') {
      base.watchMode = st.watchMode;
    }
    if (typeof st.delayMs === 'number' && st.delayMs >= 60000 && st.delayMs <= 3600000) {
      base.delayMs = st.delayMs;
    }
    if (Array.isArray(st.seenHrefKeys)) base.seenHrefKeys = st.seenHrefKeys.slice();
    base.baselineCaptured = !!st.baselineCaptured;
    if (Array.isArray(st.pending)) base.pending = st.pending;
    if (typeof st.activeProcessingId === 'string' || st.activeProcessingId === null) {
      base.activeProcessingId = st.activeProcessingId;
    }
    if (st.paidOnlyPassPhase === 'unread') {
      base.paidOnlyPassPhase = 'unread';
    } else if (st.paidOnlyPassPhase === 'first_sms') {
      base.paidOnlyPassPhase = 'first_sms';
    } else {
      base.paidOnlyPassPhase = 'paid';
    }
    if (Array.isArray(st.draftDeletedNoRequeueEntries)) {
      var nowDr = Date.now();
      base.draftDeletedNoRequeueEntries = st.draftDeletedNoRequeueEntries
        .filter(function (e) {
          return (
            e &&
            typeof e.hrefNorm === 'string' &&
            e.hrefNorm.indexOf('/chats/') !== -1 &&
            typeof e.until === 'number' &&
            e.until > nowDr
          );
        })
        .slice(-400);
    }
    base.paidUnreadOnePassUntilByHref = {};
    if (st.paidUnreadOnePassUntilByHref && typeof st.paidUnreadOnePassUntilByHref === 'object') {
      var nowOp = Date.now();
      var hkOp;
      for (hkOp in st.paidUnreadOnePassUntilByHref) {
        if (!Object.prototype.hasOwnProperty.call(st.paidUnreadOnePassUntilByHref, hkOp)) continue;
        var untilOp = st.paidUnreadOnePassUntilByHref[hkOp];
        if (typeof untilOp === 'number' && untilOp > nowOp) {
          base.paidUnreadOnePassUntilByHref[hkOp] = untilOp;
        }
      }
    }
    if (!base.enabled) {
      base.paidUnreadOnePassUntilByHref = {};
    }
    return base;
  }

  function watchPruneDraftDeletedNoRequeue(state) {
    if (!state || !Array.isArray(state.draftDeletedNoRequeueEntries)) {
      if (state) state.draftDeletedNoRequeueEntries = [];
      return;
    }
    var now = Date.now();
    state.draftDeletedNoRequeueEntries = state.draftDeletedNoRequeueEntries.filter(function (e) {
      return (
        e &&
        typeof e.hrefNorm === 'string' &&
        typeof e.until === 'number' &&
        e.until > now
      );
    });
  }

  function watchIsHrefBlockedAfterDraftDelete(state, hrefKey) {
    if (!state || !Array.isArray(state.draftDeletedNoRequeueEntries)) return false;
    var hk = normalizeChatListHref(hrefKey || '');
    if (!hk) return false;
    var now = Date.now();
    var di;
    for (di = 0; di < state.draftDeletedNoRequeueEntries.length; di++) {
      var e = state.draftDeletedNoRequeueEntries[di];
      if (!e || e.hrefNorm !== hk) continue;
      if (typeof e.until === 'number' && e.until > now) return true;
    }
    return false;
  }

  function watchMarkHrefNoRequeueAfterDraftDelete(state, hrefKey) {
    if (!state) return;
    watchPruneDraftDeletedNoRequeue(state);
    if (!Array.isArray(state.draftDeletedNoRequeueEntries)) state.draftDeletedNoRequeueEntries = [];
    var hk = normalizeChatListHref(hrefKey || '');
    if (!hk || hk.indexOf('/chats/') === -1) return;
    var until = Date.now() + WATCH_DRAFT_DELETE_NO_REQUEUE_TTL_MS;
    var found = false;
    var i;
    for (i = 0; i < state.draftDeletedNoRequeueEntries.length; i++) {
      if (state.draftDeletedNoRequeueEntries[i].hrefNorm === hk) {
        state.draftDeletedNoRequeueEntries[i].until = until;
        found = true;
        break;
      }
    }
    if (!found) state.draftDeletedNoRequeueEntries.push({ hrefNorm: hk, until: until });
  }

  function watchIsPriorityPendingItem(p) {
    return !!(p && (p.isPaidChat || p.isFirstSms));
  }

  function normalizeWatchModeFromState(st) {
    var m = st && st.watchMode;
    if (m === 'free_only') return 'free_only';
    if (m === 'paid_only') return 'paid_only';
    return 'all';
  }

  function normalizePaidOnlyPassPhase(state) {
    if (!state || normalizeWatchModeFromState(state) !== 'paid_only') return 'paid';
    if (state.paidOnlyPassPhase === 'unread') return 'unread';
    if (state.paidOnlyPassPhase === 'first_sms') return 'first_sms';
    return 'paid';
  }

  /**
   * Есть ли в pending незавершённая работа для фазы paid_only (включая processing / waiting_send).
   * @param {'paid'|'first_sms'} phase
   */
  function watchPendingPhaseHasActiveWork(state, phase) {
    var pend = (state && state.pending) || [];
    var i;
    for (i = 0; i < pend.length; i++) {
      var p = pend[i];
      if (!p) continue;
      var pStat = p.status;
      if (pStat === 'done' || pStat === 'error' || pStat === 'skipped') continue;
      if (phase === 'paid') {
        if (p.isPaidChat) return true;
      } else if (phase === 'first_sms') {
        if (p.isFirstSms && !p.isPaidChat) return true;
      }
    }
    return false;
  }

  function watchIsPendingAllowedByMode(p, watchMode, paidOnlyPassPhase) {
    if (watchMode === 'free_only') return !watchIsPriorityPendingItem(p);
    if (watchMode === 'paid_only') {
      if (paidOnlyPassPhase === 'unread') return !!p.isUnread;
      if (paidOnlyPassPhase === 'first_sms') {
        return !!(p.isFirstSms && !p.isPaidChat);
      }
      return !!p.isPaidChat;
    }
    return true;
  }

  function watchLoadState(cb) {
    try {
      chrome.storage.local.get([MATCH_CLUB_WATCH_KEY], function (o) {
        var merged = watchMergeState(o && o[MATCH_CLUB_WATCH_KEY]);
        watchHydratePaidUnreadOnePassFromState(merged);
        cb(merged);
      });
    } catch (e) {
      var def = defaultWatchState();
      watchHydratePaidUnreadOnePassFromState(def);
      cb(def);
    }
  }

  function watchSaveState(state, cb) {
    try {
      if (state) {
        state.paidUnreadOnePassUntilByHref = state.paidUnreadOnePassUntilByHref || {};
        watchPaidUnreadOnePassPruneExpiredMap(state.paidUnreadOnePassUntilByHref);
        var mk;
        for (mk in watchPaidUnreadOnePassUntilByHref) {
          if (!Object.prototype.hasOwnProperty.call(watchPaidUnreadOnePassUntilByHref, mk)) continue;
          var utMem = watchPaidUnreadOnePassUntilByHref[mk];
          if (typeof utMem !== 'number' || utMem <= Date.now()) continue;
          var prevUt = state.paidUnreadOnePassUntilByHref[mk];
          state.paidUnreadOnePassUntilByHref[mk] =
            typeof prevUt === 'number' ? Math.max(prevUt, utMem) : utMem;
        }
      }
      var obj = {};
      obj[MATCH_CLUB_WATCH_KEY] = state;
      chrome.storage.local.set(obj, function () {
        if (state && state.enabled) watchSyncAllListOutcomeBadges(state);
        if (typeof cb === 'function') cb();
      });
    } catch (e) {
      if (typeof cb === 'function') cb();
    }
  }

  /** Сохранить state после завершения pipeline-шага: снять busy и сразу взять следующий due. */
  function watchReleasePipelineAfterSave(state) {
    if (watchPipelineActiveSinceMs > 0) {
      var meta = watchPipelineActiveMeta || {};
      appendActivityRangeToStorage(
        watchPipelineActiveSinceMs,
        Date.now(),
        'watch_pipeline',
        meta
      );
      watchPipelineActiveSinceMs = 0;
      watchPipelineActiveMeta = null;
    }
    watchSaveState(state, function () {
      watchTrace('pipelineRelease saved busy->false tryProcessDue');
      watchPipelineBusy = false;
      if (Date.now() < watchForceDeepScanUntil) {
        watchTrace('pipelineRelease trigger forced scan after priority wait');
        watchScanForNewChats();
      }
      watchTryProcessDue();
    });
  }

  function watchStopHooks() {
    watchPauseMonitoringForManualSend = false;
    watchPaidOnlyDomPaidSetupDone = false;
    watchPaidOnlyDomFirstSmsSetupDone = false;
    watchPaidOnlyDomUnreadSetupDone = false;
    // Do not reset watchPaidOnlyPassPhaseCache here: watchStartHooks calls watchStopHooks
    // after storage.onChanged already set the cache from persisted state; resetting to
    // 'paid' caused followUp to run paid-only DOM + gates while storage was first_sms/unread.
    watchPaidUnreadOnePassReset();
    if (watchIntervalId) {
      clearInterval(watchIntervalId);
      watchIntervalId = null;
      watchTrace('hooksStop interval cleared');
    }
    if (watchMo) {
      try {
        watchMo.disconnect();
      } catch (e) {}
      watchMo = null;
      watchTrace('hooksStop mutationObserver disconnected');
    }
    if (watchScanDebounceTimer) {
      clearTimeout(watchScanDebounceTimer);
      watchScanDebounceTimer = null;
    }
    if (watchBadgeMoDebounceTimer) {
      clearTimeout(watchBadgeMoDebounceTimer);
      watchBadgeMoDebounceTimer = null;
    }
  }

  function watchScheduleScanDebounced() {
    if (watchScanDebounceTimer) clearTimeout(watchScanDebounceTimer);
    watchScanDebounceTimer = setTimeout(function () {
      watchScanDebounceTimer = null;
      watchScanForNewChats();
      watchTryProcessDue();
      watchLoadState(function (st) {
        if (st && st.enabled) watchSyncAllListOutcomeBadges(st);
      });
    }, 650);
  }

  function watchCaptureBaselineIfNeeded(done) {
    watchLoadState(function (state) {
      if (state.baselineCaptured) {
        watchTrace('baselineSkip alreadyCaptured keys', (state.seenHrefKeys || []).length);
        if (typeof done === 'function') done();
        return;
      }
      watchTrace('baselineStart collectAllChatLinks fullScroll');
      var scrollOpts = {
        listScrollStepPx: 56,
        listScrollPauseMs: 110,
        maxListPasses: 15
      };
      collectAllChatLinks(scrollOpts)
        .then(function (result) {
          var seen = {};
          var seenMeta = {};
          if (result && result.ok && result.links && result.links.length) {
            var li;
            for (li = 0; li < result.links.length; li++) {
              var L = result.links[li];
              var hk = L.href;
              if (!hk) continue;
              seen[hk] = L.peerTitle || '';
              seenMeta[hk] = {
                peerTitle: L.peerTitle,
                peerDisplayName: L.peerDisplayName,
                peerAge: L.peerAge,
                chatUrl: L.chatUrl,
                isFirstSms: L.isFirstSms,
                isPeerOnline: L.isPeerOnline,
                isPaidChat: !!L.isPaidChat,
                isUnread: !!L.isUnread
              };
            }
          } else {
            gatherChatLinksInto(seen, seenMeta, null);
          }
          state.seenHrefKeys = Object.keys(seen);
          state.baselineCaptured = true;
          watchSaveState(state, function () {
            dexLog(
              'watch baseline (full scroll)',
              state.seenHrefKeys.length,
              result && result.passesUsed != null ? 'passes=' + result.passesUsed : ''
            );
            watchTrace(
              'baselineOk fullScroll keys',
              state.seenHrefKeys.length,
              'passesUsed',
              result && result.passesUsed != null ? result.passesUsed : '?',
              'linkCount',
              result && result.linkCount != null ? result.linkCount : '?'
            );
            if (typeof done === 'function') done();
          });
        })
        .catch(function (err) {
          watchTrace('baselineError collectAllChatLinks', String(err && err.message ? err.message : err));
          var seen = {};
          var seenMeta = {};
          gatherChatLinksInto(seen, seenMeta, null);
          state.seenHrefKeys = Object.keys(seen);
          state.baselineCaptured = true;
          watchSaveState(state, function () {
            dexLog('watch baseline (fallback visible only)', state.seenHrefKeys.length);
            watchTrace('baselineOk fallbackVisibleOnly keys', state.seenHrefKeys.length);
            if (typeof done === 'function') done();
          });
        });
    });
  }

  function watchPaidUnreadOnePassPruneExpiredMap(map) {
    if (!map || typeof map !== 'object') return;
    var nowPr = Date.now();
    var kPr;
    for (kPr in map) {
      if (!Object.prototype.hasOwnProperty.call(map, kPr)) continue;
      var uPr = map[kPr];
      if (typeof uPr !== 'number' || uPr <= nowPr) delete map[kPr];
    }
  }

  function watchHydratePaidUnreadOnePassFromState(state) {
    watchPaidUnreadOnePassReset();
    var m = state && state.paidUnreadOnePassUntilByHref;
    if (!m || typeof m !== 'object') return;
    watchPaidUnreadOnePassPruneExpiredMap(m);
    var kh;
    for (kh in m) {
      if (!Object.prototype.hasOwnProperty.call(m, kh)) continue;
      var exp = m[kh];
      if (typeof exp === 'number' && exp > Date.now()) {
        watchPaidUnreadOnePassUntilByHref[kh] = exp;
      }
    }
  }

  function watchPaidUnreadOnePassNorm(hrefKey) {
    return normalizeChatListHref(hrefKey || '');
  }

  function watchPaidUnreadOnePassHas(hrefNorm) {
    if (!hrefNorm) return false;
    var until = watchPaidUnreadOnePassUntilByHref[hrefNorm];
    if (typeof until !== 'number' || until <= Date.now()) {
      if (until != null) delete watchPaidUnreadOnePassUntilByHref[hrefNorm];
      return false;
    }
    return true;
  }

  function watchPaidUnreadOnePassMark(hrefNorm, state) {
    if (!hrefNorm || hrefNorm.indexOf('/chats/') === -1) return;
    var exp = Date.now() + WATCH_PAID_UNREAD_ONE_PASS_PERSIST_MS;
    watchPaidUnreadOnePassUntilByHref[hrefNorm] = exp;
    if (state) {
      if (!state.paidUnreadOnePassUntilByHref) state.paidUnreadOnePassUntilByHref = {};
      state.paidUnreadOnePassUntilByHref[hrefNorm] = Math.max(
        typeof state.paidUnreadOnePassUntilByHref[hrefNorm] === 'number'
          ? state.paidUnreadOnePassUntilByHref[hrefNorm]
          : 0,
        exp
      );
    }
  }

  function watchPaidUnreadOnePassReset() {
    watchPaidUnreadOnePassUntilByHref = Object.create(null);
  }

  /** @returns {boolean} true если сброшен persisted one-pass — нужно watchSaveState(st). */
  function watchPaidUnreadOnePassMaybeResetFromStorage(oldSt, newSt) {
    if (!newSt) return false;
    if (!newSt.enabled) {
      watchPaidUnreadOnePassReset();
      newSt.paidUnreadOnePassUntilByHref = {};
      return true;
    }
    var oldEn = !!(oldSt && oldSt.enabled);
    var newEn = !!newSt.enabled;
    if (!oldEn && newEn) {
      watchPaidUnreadOnePassReset();
      newSt.paidUnreadOnePassUntilByHref = {};
      return true;
    }
    if (oldSt && oldSt.baselineCaptured && !newSt.baselineCaptured) {
      watchPaidUnreadOnePassReset();
      newSt.paidUnreadOnePassUntilByHref = {};
      return true;
    }
    var oldMode = oldSt ? normalizeWatchModeFromState(oldSt) : '';
    var newMode = normalizeWatchModeFromState(newSt);
    if (oldMode === 'paid_only' && newMode !== 'paid_only') {
      watchPaidUnreadOnePassReset();
      newSt.paidUnreadOnePassUntilByHref = {};
      return true;
    }
    if (newMode === 'paid_only' && oldSt) {
      var oldPh = normalizePaidOnlyPassPhase(oldSt);
      var newPh = normalizePaidOnlyPassPhase(newSt);
      if (
        (oldPh === 'unread' && newPh === 'paid') ||
        (oldPh === 'paid' && newPh === 'first_sms') ||
        (oldPh === 'first_sms' && newPh === 'paid')
      ) {
        watchPaidUnreadOnePassReset();
        newSt.paidUnreadOnePassUntilByHref = {};
        return true;
      }
    }
    return false;
  }

  /**
   * Подтянуть уже существующий scheduled-пункт: paid/1st SMS + unread в DOM -> сразу в начало очереди.
   * Иначе старый catch-up с отложенным scheduledAt блокирует приоритетные чаты.
   */
  function watchBumpPendingPriorityForMeta(state, hrefKey, meta) {
    if (!state || !state.pending || !meta) return false;
    var passPhBump = normalizePaidOnlyPassPhase(state);
    var modeBump = normalizeWatchModeFromState(state);
    var pri =
      modeBump === 'paid_only' && passPhBump === 'paid'
        ? !!meta.isPaidChat
        : modeBump === 'paid_only' && passPhBump === 'first_sms'
          ? !!(meta.isFirstSms && !meta.isPaidChat)
          : !!(meta.isPaidChat || meta.isFirstSms);
    var unread = !!meta.isUnread;
    if (!pri || !unread) return false;
    var hk = normalizeChatListHref(hrefKey || '');
    if (!hk || hk.indexOf('/chats/') === -1) return false;
    if (watchIsHrefBlockedAfterDraftDelete(state, hk)) {
      return false;
    }
    if (watchPaidUnreadOnePassHas(hk)) {
      return false;
    }
    var bumpTo = Date.now() + 500;
    var changed = false;
    var pi;
    for (pi = 0; pi < state.pending.length; pi++) {
      var p = state.pending[pi];
      if (!p || p.status !== 'scheduled') continue;
      var ph = normalizeChatListHref(p.hrefKey || p.href || '');
      if (ph !== hk) continue;
      var rowChanged = false;
      if (typeof p.scheduledAt !== 'number' || p.scheduledAt > bumpTo) {
        p.scheduledAt = bumpTo;
        rowChanged = true;
      }
      if (meta.isPaidChat && !p.isPaidChat) {
        p.isPaidChat = true;
        rowChanged = true;
      }
      if (meta.isFirstSms && !p.isFirstSms) {
        p.isFirstSms = true;
        rowChanged = true;
      }
      if (!p.isUnread) {
        p.isUnread = true;
        rowChanged = true;
      }
      if (rowChanged) {
        p.lastError = 'priority_paid_unread_bump';
        changed = true;
      }
    }
    if (changed) {
      watchPaidUnreadOnePassMark(hk, state);
    }
    return changed;
  }

  function watchScanForNewChats() {
    var pausedForManualSend = watchPauseMonitoringForManualSend;
    if (pausedForManualSend) {
      // Во время ожидания ручной отправки не открываем новые чаты, но продолжаем видеть новые строки в списке.
      watchTrace('scan pausedForManualSend queueOnlyMode');
    }
    if (watchPipelineBusy) {
      watchTrace('scan skip pipelineBusy');
      return;
    }
    watchLoadState(function (state) {
      if (!state.enabled || !state.baselineCaptured) return;
      var watchMode = normalizeWatchModeFromState(state);
      var passPhaseScan = normalizePaidOnlyPassPhase(state);
      function applyScanResult(seen, seenMeta, seenOrder, sourceTag) {
        var keys = Object.keys(seen);
        var seenSet = {};
        var si;
        for (si = 0; si < state.seenHrefKeys.length; si++) {
          seenSet[state.seenHrefKeys[si]] = true;
        }
        var changed = false;
        watchPruneDraftDeletedNoRequeue(state);
        var ki;
        for (ki = 0; ki < keys.length; ki++) {
          var hk = keys[ki];
          if (seenSet[hk]) continue;
          if (watchIsHrefBlockedAfterDraftDelete(state, hk)) {
            state.seenHrefKeys.push(hk);
            seenSet[hk] = true;
            changed = true;
            watchTrace('scanNewChat skip draftDeletedNoRequeue', hk, 'source', sourceTag);
            continue;
          }
          var dup = state.pending.some(function (p) {
            if (!p || p.status === 'done' || p.status === 'error' || p.status === 'skipped') return false;
            return normalizeChatListHref(p.hrefKey || p.href || '') === normalizeChatListHref(hk);
          });
          if (dup) {
            state.seenHrefKeys.push(hk);
            seenSet[hk] = true;
            changed = true;
            watchTrace('scanNewChat mergeSeenKey wasInPending', hk, 'source', sourceTag);
            var metaDupBump = seenMeta[hk] || {};
            if (watchBumpPendingPriorityForMeta(state, hk, metaDupBump)) {
              changed = true;
              watchTrace(
                'scanNewChat bumpPending paidUnread',
                hk,
                'isUnread',
                !!metaDupBump.isUnread,
                'source',
                sourceTag
              );
            }
            continue;
          }
          var meta = seenMeta[hk] || {};
          var isPriorityNew;
          if (watchMode === 'paid_only' && passPhaseScan === 'paid') {
            isPriorityNew = !!(meta && meta.isPaidChat);
          } else if (watchMode === 'paid_only' && passPhaseScan === 'first_sms') {
            isPriorityNew = !!(meta && meta.isFirstSms && !meta.isPaidChat);
          } else {
            isPriorityNew = !!(meta && (meta.isPaidChat || meta.isFirstSms));
          }
          if (watchMode === 'free_only' && isPriorityNew) {
            continue;
          }
          if (watchMode === 'paid_only' && passPhaseScan === 'paid' && !(meta && meta.isPaidChat)) {
            continue;
          }
          if (
            watchMode === 'paid_only' &&
            passPhaseScan === 'first_sms' &&
            !(meta && meta.isFirstSms && !meta.isPaidChat)
          ) {
            continue;
          }
          if (watchMode === 'paid_only' && passPhaseScan === 'unread' && !meta.isUnread) {
            continue;
          }
          var nowNew = Date.now();
          var scheduleAtNew = isPriorityNew ? nowNew + 500 : nowNew + state.delayMs;
          state.pending.push({
            id: 'mcw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
            hrefKey: hk,
            href: hk,
            peerTitle: meta.peerTitle || seen[hk] || '',
            isPaidChat: !!meta.isPaidChat,
            isFirstSms: !!meta.isFirstSms,
            isPeerOnline: !!meta.isPeerOnline,
            isUnread: !!meta.isUnread,
            detectedAt: nowNew,
            scheduledAt: scheduleAtNew,
            status: 'scheduled',
            lastError: isPriorityNew ? 'priority_paid_or_first_sms' : null
          });
          if (isPriorityNew) {
            watchCatchupLastQueuedAtByHref[hk] = nowNew;
          }
          if (isPriorityNew && meta.isUnread) {
            watchPaidUnreadOnePassMark(watchPaidUnreadOnePassNorm(hk), state);
          }
          state.seenHrefKeys.push(hk);
          seenSet[hk] = true;
          changed = true;
          dexLog('watch new chat queued', hk, 'inMs', Math.max(0, scheduleAtNew - nowNew));
          watchTrace(
            'scanNewChat queued',
            hk,
            'peer',
            String(meta.peerTitle || '').slice(0, 48),
            'scheduledInMs',
            Math.max(0, scheduleAtNew - nowNew),
            'isPriority',
            isPriorityNew,
            'pendingId',
            state.pending[state.pending.length - 1] && state.pending[state.pending.length - 1].id,
            'source',
            sourceTag
          );
        }
        // Для уже известных href: если у paid/1st SMS появился unread, ставим в приоритетную очередь немедленно.
        var nowPriority = Date.now();
        for (ki = 0; ki < keys.length; ki++) {
          var hkSeen = keys[ki];
          if (!seenSet[hkSeen]) continue;
          var metaSeenExisting = seenMeta[hkSeen] || {};
          if (!(metaSeenExisting.isPaidChat || metaSeenExisting.isFirstSms)) continue;
          if (watchMode === 'free_only') continue;
          if (watchMode === 'paid_only' && passPhaseScan === 'paid' && !metaSeenExisting.isPaidChat) {
            continue;
          }
          if (
            watchMode === 'paid_only' &&
            passPhaseScan === 'first_sms' &&
            (!metaSeenExisting.isFirstSms || metaSeenExisting.isPaidChat)
          ) {
            continue;
          }
          if (!metaSeenExisting.isUnread) continue;
          var hkSeenNorm = watchPaidUnreadOnePassNorm(hkSeen);
          if (watchPaidUnreadOnePassHas(hkSeenNorm)) {
            continue;
          }
          var dupExisting = state.pending.some(function (p) {
            if (!p || p.status === 'done' || p.status === 'error' || p.status === 'skipped') return false;
            return normalizeChatListHref(p.hrefKey || p.href || '') === normalizeChatListHref(hkSeen);
          });
          if (dupExisting) {
            if (watchBumpPendingPriorityForMeta(state, hkSeen, metaSeenExisting)) {
              changed = true;
              watchTrace(
                'scanPriority bumpExistingPaidUnread',
                hkSeen,
                String(metaSeenExisting.peerTitle || '').slice(0, 48),
                'source',
                sourceTag
              );
            }
            continue;
          }
          if (watchIsHrefBlockedAfterDraftDelete(state, hkSeen)) {
            watchTrace(
              'scanPriority skip draftDeletedNoRequeue',
              hkSeen,
              String(metaSeenExisting.peerTitle || '').slice(0, 48),
              'source',
              sourceTag
            );
            continue;
          }
          var lastQueuedPriority = watchCatchupLastQueuedAtByHref[hkSeen];
          if (
            typeof lastQueuedPriority === 'number' &&
            nowPriority - lastQueuedPriority < WATCH_PRIORITY_REQUEUE_INTERVAL_MS
          ) {
            continue;
          }
          state.pending.push({
            id: 'mcw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
            hrefKey: hkSeen,
            href: hkSeen,
            peerTitle: metaSeenExisting.peerTitle || seen[hkSeen] || '',
            isPaidChat: !!metaSeenExisting.isPaidChat,
            isFirstSms: !!metaSeenExisting.isFirstSms,
            isPeerOnline: !!metaSeenExisting.isPeerOnline,
            isUnread: true,
            detectedAt: nowPriority,
            scheduledAt: nowPriority + 500,
            status: 'scheduled',
            lastError: 'priority_paid_unread'
          });
          watchPaidUnreadOnePassMark(hkSeenNorm, state);
          watchCatchupLastQueuedAtByHref[hkSeen] = nowPriority;
          changed = true;
          watchTrace(
            'scanPriority queuedExistingPaidUnread',
            hkSeen,
            'peer',
            String(metaSeenExisting.peerTitle || '').slice(0, 48),
            'source',
            sourceTag
          );
        }
        var hasDueNow = state.pending.some(function (p) {
          return p && p.status === 'scheduled' && p.scheduledAt <= Date.now();
        });
        if (!hasDueNow) {
          var nowCatchup = Date.now();
          var preferOnlineOnly = resolvePreferOnlineOnlyFromDom(false);
          var catchupCap = 3;
          var catchupAdded = 0;
          var oi;
          for (oi = 0; oi < seenOrder.length && catchupAdded < catchupCap; oi++) {
            var ch = seenOrder[oi];
            if (!ch) continue;
            var metaSeen = seenMeta[ch] || {};
            var isPrioritySeen;
            if (watchMode === 'paid_only' && passPhaseScan === 'paid') {
              isPrioritySeen = !!metaSeen.isPaidChat;
            } else if (watchMode === 'paid_only' && passPhaseScan === 'first_sms') {
              isPrioritySeen = !!(metaSeen.isFirstSms && !metaSeen.isPaidChat);
            } else {
              isPrioritySeen = !!(metaSeen.isPaidChat || metaSeen.isFirstSms);
            }
            if (watchMode === 'free_only' && isPrioritySeen) {
              continue;
            }
            if (watchMode === 'paid_only' && passPhaseScan === 'paid' && !metaSeen.isPaidChat) {
              continue;
            }
            if (
              watchMode === 'paid_only' &&
              passPhaseScan === 'first_sms' &&
              !(metaSeen.isFirstSms && !metaSeen.isPaidChat)
            ) {
              continue;
            }
            if (watchMode === 'paid_only' && passPhaseScan === 'unread' && !metaSeen.isUnread) {
              continue;
            }
            if (preferOnlineOnly && !metaSeen.isPeerOnline && !isPrioritySeen) continue;
            var chNormCatch = watchPaidUnreadOnePassNorm(ch);
            if (isPrioritySeen && metaSeen.isUnread && watchPaidUnreadOnePassHas(chNormCatch)) {
              continue;
            }
            var dupSeen = state.pending.some(function (p) {
              if (!p || p.status === 'done' || p.status === 'error' || p.status === 'skipped') return false;
              return normalizeChatListHref(p.hrefKey || p.href || '') === normalizeChatListHref(ch);
            });
            if (dupSeen) continue;
            var lastQueuedAt = watchCatchupLastQueuedAtByHref[ch];
            var minRequeueGapMs = isPrioritySeen
              ? WATCH_PRIORITY_REQUEUE_INTERVAL_MS
              : state.delayMs;
            if (typeof lastQueuedAt === 'number' && nowCatchup - lastQueuedAt < minRequeueGapMs) {
              continue;
            }
            if (watchIsHrefBlockedAfterDraftDelete(state, ch)) {
              watchTrace(
                'scanCatchup skip draftDeletedNoRequeue',
                ch,
                'peer',
                String(metaSeen.peerTitle || '').slice(0, 48),
                'source',
                sourceTag
              );
              continue;
            }
            state.pending.push({
              id: 'mcw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
              hrefKey: ch,
              href: ch,
              peerTitle: metaSeen.peerTitle || seen[ch] || '',
              isPaidChat: !!metaSeen.isPaidChat,
              isFirstSms: !!metaSeen.isFirstSms,
              isPeerOnline: !!metaSeen.isPeerOnline,
              isUnread: !!metaSeen.isUnread,
              detectedAt: isPrioritySeen ? nowCatchup : nowCatchup - state.delayMs - 1000,
              scheduledAt: nowCatchup + (isPrioritySeen ? 500 : 1000),
              status: 'scheduled',
              lastError: isPrioritySeen ? 'priority_catchup_existing' : 'catchup_existing_chat'
            });
            if (isPrioritySeen && metaSeen.isUnread) {
              watchPaidUnreadOnePassMark(chNormCatch, state);
            }
            watchCatchupLastQueuedAtByHref[ch] = nowCatchup;
            catchupAdded++;
            changed = true;
            watchTrace(
              'scanCatchup queuedExisting',
              ch,
              'peer',
              String(metaSeen.peerTitle || '').slice(0, 48),
              'online',
              !!metaSeen.isPeerOnline,
              'source',
              sourceTag
            );
          }
        }
        var ks;
        for (ks = 0; ks < keys.length; ks++) {
          var hkSw = keys[ks];
          var metaSw = seenMeta[hkSw] || {};
          if (watchMode === 'free_only') continue;
          if (
            (metaSw.isPaidChat || metaSw.isFirstSms) &&
            metaSw.isUnread &&
            !(
              watchMode === 'paid_only' &&
              passPhaseScan === 'paid' &&
              !metaSw.isPaidChat
            ) &&
            !(
              watchMode === 'paid_only' &&
              passPhaseScan === 'first_sms' &&
              (!metaSw.isFirstSms || metaSw.isPaidChat)
            )
          ) {
            if (watchBumpPendingPriorityForMeta(state, hkSw, metaSw)) {
              changed = true;
              watchTrace(
                'scanPriority bumpSweep',
                hkSw,
                String(metaSw.peerTitle || '').slice(0, 40),
                'source',
                sourceTag
              );
            }
          }
        }
        if (changed) watchSaveState(state);
      }

      function runVisibleScan(sourceTag) {
        var seen = {};
        var seenMeta = {};
        var seenOrder = [];
        gatherChatLinksInto(seen, seenMeta, seenOrder);
        applyScanResult(seen, seenMeta, seenOrder, sourceTag || 'visible_only');
      }

      // В фазе first_sms full-scroll почти не даёт пользы, но визуально «дёргает» список.
      // Здесь достаточно visible-scan без прокрутки.
      if (watchMode === 'paid_only' && passPhaseScan === 'first_sms') {
        runVisibleScan('visible_first_sms_no_deep');
        return;
      }

      var now = Date.now();
      var deepScanForced = !pausedForManualSend && now < watchForceDeepScanUntil;
      var deepScanAllowed =
        !pausedForManualSend &&
        (deepScanForced || now - watchDeepScanLastAt >= WATCH_DEEP_SCAN_MIN_INTERVAL_MS);
      if (pausedForManualSend) {
        runVisibleScan('visible_paused_for_manual_send');
        return;
      }
      if (watchDeepScanInFlight || !deepScanAllowed) {
        runVisibleScan(watchDeepScanInFlight ? 'visible_while_deep_inflight' : 'visible_throttled');
        return;
      }
      watchDeepScanInFlight = true;
      watchDeepScanLastAt = now;
      if (deepScanForced) watchForceDeepScanUntil = 0;
      collectAllChatLinks({
        listScrollStepPx: 56,
        listScrollPauseMs: 110,
        maxListPasses: 8
      })
        .then(function (result) {
          watchDeepScanInFlight = false;
          if (result && result.ok && Array.isArray(result.links) && result.links.length > 0) {
            var seen = {};
            var seenMeta = {};
            var seenOrder = [];
            var li;
            for (li = 0; li < result.links.length; li++) {
              var L = result.links[li];
              var hk = L && L.href ? normalizeChatListHref(L.href) : '';
              if (!hk) continue;
              if (!Object.prototype.hasOwnProperty.call(seen, hk)) seenOrder.push(hk);
              seen[hk] = L.peerTitle || seen[hk] || '';
              seenMeta[hk] = {
                peerTitle: L.peerTitle || '',
                peerDisplayName: L.peerDisplayName || '',
                peerAge: L.peerAge != null ? L.peerAge : null,
                chatUrl: L.chatUrl || hrefToAbsoluteChatUrl(hk),
                isFirstSms: !!L.isFirstSms,
                isPeerOnline: !!L.isPeerOnline,
                isPaidChat: !!L.isPaidChat,
                isUnread: !!L.isUnread
              };
            }
            applyScanResult(seen, seenMeta, seenOrder, 'full_scroll');
            watchTrace(
              'scanDeep fullScroll ok',
              'links',
              result.links.length,
              'passesUsed',
              result.passesUsed != null ? result.passesUsed : '?'
            );
            return;
          }
          runVisibleScan('visible_after_deep_failed');
        })
        .catch(function (err) {
          watchDeepScanInFlight = false;
          watchTrace('scanDeep error fallbackVisible', String(err && err.message ? err.message : err));
          runVisibleScan('visible_after_deep_error');
        });
    });
  }

  /** Повторить извлечение треда и decide, если SPA ещё не отдал роли пузырьков. */
  function isWatchOutboundDecisionRecoverable(dec) {
    if (!dec || dec.action === 'send') return false;
    var r = String(dec.reason || '');
    if (r === 'last_message_role_unknown') return true;
    if (r === 'empty_last_outgoing') return true;
    if (r === 'unexpected_last_role') return true;
    if (r === 'thread_not_ready_empty_extract') return true;
    return false;
  }

  /**
   * @returns {Promise<{ ok: boolean, messages: string[] }>}
   * ok:false — нет ответа / невалидный JSON / нет messages[] (отличать от пустого списка фраз).
   * ok:true — сервер ответил; messages может быть [] (очередь намеренно пуста).
   */
  function watchFetchOutboundQueue() {
    return new Promise(function (resolve) {
      chrome.storage.local.get({ dexChatReplyPort: 8777 }, function (o) {
        var port = parseInt(o && o.dexChatReplyPort, 10) || 8777;
        function parseQueueText(text) {
          try {
            var j = JSON.parse(text);
            if (j && Array.isArray(j.messages)) {
              return {
                ok: true,
                messages: j.messages.filter(function (x) {
                  return typeof x === 'string' && String(x).trim();
                })
              };
            }
          } catch (e) {}
          return { ok: false, messages: [] };
        }
        function tryViaBackground() {
          try {
            chrome.runtime.sendMessage(
              { action: 'dexChatReplyGet', path: '/api/match-club-outbound-queue', base: 'http://127.0.0.1:' + port },
              function (resp) {
                if (chrome.runtime.lastError || !resp || typeof resp.text !== 'string') {
                  resolve({ ok: false, messages: [] });
                  return;
                }
                resolve(parseQueueText(resp.text));
              }
            );
          } catch (eBg) {
            resolve({ ok: false, messages: [] });
          }
        }
        // Important: always go through background so auto-start via native host can run.
        tryViaBackground();
      });
    });
  }

  function watchPostSuggestReplies(payloadObj) {
    function normalizeSuggestVariant(x) {
      if (typeof x === 'string') {
        return x.replace(/\s+/g, ' ').trim();
      }
      if (!x || typeof x !== 'object') return '';
      var candidates = [
        x.text,
        x.reply,
        x.message,
        x.content,
        x.variant
      ];
      var i;
      for (i = 0; i < candidates.length; i++) {
        if (typeof candidates[i] === 'string' && candidates[i].trim()) {
          return candidates[i].replace(/\s+/g, ' ').trim();
        }
      }
      return '';
    }

    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get({ dexChatReplyPort: 8777 }, function (o) {
          var port = parseInt(o && o.dexChatReplyPort, 10) || 8777;
          var body = JSON.stringify(payloadObj || {});
          chrome.runtime.sendMessage(
            {
              action: 'dexChatReplyPost',
              path: '/api/suggest-replies',
              base: 'http://127.0.0.1:' + port,
              body: body
            },
            function (resp) {
              if (chrome.runtime.lastError || !resp) {
                resolve({ ok: false, error: 'suggest_unreachable', variants: [] });
                return;
              }
              if (!resp.ok) {
                var httpErr = 'suggest_http_' + String(resp.status || 0);
                if (resp.error) {
                  httpErr += ': ' + String(resp.error);
                } else if (resp.data && resp.data.error) {
                  httpErr += ': ' + String(resp.data.error);
                }
                resolve({ ok: false, error: httpErr, variants: [] });
                return;
              }
              if (!resp.data) {
                resolve({ ok: false, error: 'suggest_empty_response', variants: [] });
                return;
              }
              if (resp.data.error) {
                resolve({ ok: false, error: String(resp.data.error), variants: [] });
                return;
              }
              var hadRawVariants =
                Array.isArray(resp.data.variants) && resp.data.variants.length > 0;
              var vars = Array.isArray(resp.data.variants)
                ? resp.data.variants
                    .map(normalizeSuggestVariant)
                    .filter(function (v) {
                      if (!v) return false;
                      if (/^\[object\s+object\]$/i.test(v)) return false;
                      return true;
                    })
                : [];
              if (hadRawVariants && vars.length === 0) {
                resolve({ ok: false, error: 'suggest_invalid_variants', variants: [], raw: resp.data });
                return;
              }
              resolve({ ok: vars.length > 0, variants: vars, raw: resp.data });
            }
          );
        });
      } catch (e) {
        resolve({ ok: false, error: String(e && e.message ? e.message : e), variants: [] });
      }
    });
  }

  function withTimeoutResult(promise, timeoutMs, timeoutResult) {
    return new Promise(function (resolve) {
      var settled = false;
      var tid = setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(timeoutResult);
      }, Math.max(1000, parseInt(timeoutMs, 10) || 1000));
      Promise.resolve(promise)
        .then(function (v) {
          if (settled) return;
          settled = true;
          clearTimeout(tid);
          resolve(v);
        })
        .catch(function () {
          if (settled) return;
          settled = true;
          clearTimeout(tid);
          resolve(timeoutResult);
        });
    });
  }

  function findProfileUrlInActiveChat() {
    var root = null;
    try {
      root = locateOpenThreadRoot();
    } catch (e) {
      root = null;
    }
    if (root && root.querySelectorAll) {
      var localAnchors = root.querySelectorAll('a[href*="/profile/"]');
      var li;
      for (li = 0; li < localAnchors.length; li++) {
        var la = localAnchors[li];
        var lhref = String((la && la.href) || '').trim();
        if (!/\/profile\/\d+/i.test(lhref)) continue;
        return lhref;
      }
    }
    var sels = [
      'a[href*="/profile/"]',
      '[class*="chat-view" i] a[href*="/profile/"]',
      '[class*="conversation" i] a[href*="/profile/"]'
    ];
    var si;
    for (si = 0; si < sels.length; si++) {
      var nodes = document.querySelectorAll(sels[si]);
      var i;
      for (i = 0; i < nodes.length; i++) {
        var a = nodes[i];
        if (!a || !a.href) continue;
        var href = String(a.href || '').trim();
        if (!/\/profile\/\d+/i.test(href)) continue;
        if (isVisible(a)) return href;
        return href;
      }
    }
    return '';
  }

  function stripHtmlToCompactText(html) {
    if (!html) return '';
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var rm = doc.querySelectorAll('script,style,noscript,svg');
      var i;
      for (i = 0; i < rm.length; i++) rm[i].remove();
      var txt = String((doc.body && doc.body.innerText) || '')
        .replace(/\r/g, '')
        .split('\n')
        .map(function (x) {
          return String(x || '').trim();
        })
        .filter(Boolean)
        .slice(0, 140)
        .join('\n');
      if (txt.length > 5000) txt = txt.slice(0, 5000);
      return txt;
    } catch (e) {
      return '';
    }
  }

  function fetchProfileContextText(profileUrl) {
    return new Promise(function (resolve) {
      var u = String(profileUrl || '').trim();
      if (!u) {
        resolve({ ok: false, profileUrl: '', profileText: '', error: 'profile_url_missing' });
        return;
      }
      fetch(u, { method: 'GET', credentials: 'include', cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('profile_http_' + String(r.status));
          return r.text();
        })
        .then(function (html) {
          var txt = stripHtmlToCompactText(html);
          resolve({
            ok: !!txt,
            profileUrl: u,
            profileText: txt,
            error: txt ? '' : 'profile_text_empty'
          });
        })
        .catch(function (e) {
          resolve({
            ok: false,
            profileUrl: u,
            profileText: '',
            error: String(e && e.message ? e.message : e)
          });
        });
    });
  }

  function formatRecentThreadForPrompt(msgs) {
    var m = Array.isArray(msgs) ? msgs : [];
    if (m.length === 0) return '(no messages)';
    var take = m.slice(-16);
    var out = [];
    var i;
    for (i = 0; i < take.length; i++) {
      var role = take[i] && take[i].role ? String(take[i].role) : 'unknown';
      var txt = String((take[i] && take[i].text) || '').replace(/\s+/g, ' ').trim();
      if (!txt) continue;
      if (txt.length > 260) txt = txt.slice(0, 260) + '...';
      out.push((role === 'me' ? '[ME]' : role === 'them' ? '[THEM]' : '[UNKNOWN]') + ' ' + txt);
    }
    return out.join('\n');
  }

  function compactProfileContextText(rawText) {
    var text = String(rawText || '').replace(/\r/g, '');
    if (!text.trim()) return '';
    var noise = [
      'sign out',
      'my profile',
      'my messages',
      'settings',
      'withdraw',
      'coins',
      'retention',
      'online',
      'paid',
      'add to favorites',
      'almost texted you',
      'i am pretending my inbox'
    ];
    var out = [];
    var seen = {};
    var lines = text.split('\n');
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = String(lines[i] || '').replace(/\s+/g, ' ').trim();
      if (!line) continue;
      if (line.length < 2 || line.length > 140) continue;
      var lower = line.toLowerCase();
      var ni;
      var skip = false;
      for (ni = 0; ni < noise.length; ni++) {
        if (lower.indexOf(noise[ni]) !== -1) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      var key = lower;
      if (seen[key]) continue;
      seen[key] = true;
      out.push(line);
      if (out.length >= 28) break;
    }
    return out.join('\n');
  }

  function extractProfileFactsFromActiveChatDom() {
    var facts = [];
    var seen = {};
    function pushFact(v) {
      var line = String(v || '').replace(/\s+/g, ' ').trim();
      if (!line) return;
      var k = line.toLowerCase();
      if (seen[k]) return;
      seen[k] = true;
      facts.push(line);
    }
    var root = null;
    try {
      root = locateOpenThreadRoot();
    } catch (e) {
      root = null;
    }
    if (root && root.querySelectorAll) {
      var hs = root.querySelectorAll(
        '[class*="conversation-header" i], [class*="chat-header" i], main [class*="conversation" i] [class*="header" i]'
      );
      var hi;
      for (hi = 0; hi < hs.length; hi++) {
        var htxt = String((hs[hi] && hs[hi].innerText) || '')
          .replace(/\r/g, '')
          .split('\n')
          .map(function (x) {
            return String(x || '').trim();
          })
          .filter(Boolean);
        var li;
        for (li = 0; li < htxt.length; li++) {
          pushFact(htxt[li]);
          if (facts.length >= 12) break;
        }
        if (facts.length >= 12) break;
      }
    }
    if (facts.length === 0) {
      var fallbackPeer = '';
      try {
        fallbackPeer = String(getActiveChatPeerTitle() || '').trim();
      } catch (ePeer) {
        fallbackPeer = '';
      }
      if (fallbackPeer) pushFact('Peer: ' + fallbackPeer);
    }
    return facts.join('\n');
  }

  function buildPriorityPromptContext(threadText, profileText, peerTitle) {
    var compactProfile = compactProfileContextText(profileText);
    var domFacts = extractProfileFactsFromActiveChatDom();
    var peer = String(peerTitle || '').trim();
    return (
      'Task: Draft 3 candidate replies for a real dating chat. They must sound like a real person, not AI.\n' +
      'Hard rules:\n' +
      '- Reply to the latest peer intent first (answer-first).\n' +
      '- Keep each reply short (1-2 sentences max).\n' +
      '- Include exactly one simple follow-up question.\n' +
      '- Use at least one concrete hook from profile/chat when available.\n' +
      '- Avoid generic compliments, salesy tone, or template phrasing.\n' +
      '- Do not repeat text that is already in the thread.\n' +
      '- Role semantics are strict: [ME] = operator (you), [THEM] = peer. Never assign [THEM] personal facts to [ME].\n' +
      '- Never flip ownership/pronouns (my/his/her/their) for pets, children, home, job, city, or family facts.\n' +
      (peer ? '- Peer label: ' + peer + '.\n' : '') +
      '\nRecent chat:\n' +
      (threadText || '(no messages)') +
      '\n\nProfile facts (fetched page):\n' +
      (compactProfile || '(profile unavailable)') +
      '\n\nProfile facts (visible in current chat DOM):\n' +
      (domFacts || '(no visible DOM facts)')
    );
  }

  function trimOneLine(s, maxLen) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    var lim = typeof maxLen === 'number' && maxLen > 0 ? maxLen : 140;
    if (t.length > lim) t = t.slice(0, lim) + '...';
    return t;
  }

  function pickLastPeerLineFromThread(threadText) {
    var lines = String(threadText || '').split('\n');
    var i;
    for (i = lines.length - 1; i >= 0; i--) {
      var ln = String(lines[i] || '').trim();
      if (!ln) continue;
      if (ln.indexOf('[THEM]') === 0 || ln.indexOf('[UNKNOWN]') === 0) {
        return trimOneLine(ln.replace(/^\[(THEM|UNKNOWN)\]\s*/i, ''), 220);
      }
    }
    return '';
  }

  function extractProfileKeywordHints(compactProfile, domFacts) {
    var src = String(compactProfile || '') + '\n' + String(domFacts || '');
    var lines = src
      .split('\n')
      .map(function (x) {
        return String(x || '').replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean)
      .slice(0, 36);
    var hints = [];
    function addHint(v) {
      var k = String(v || '').toLowerCase().trim();
      if (!k || hints.indexOf(k) !== -1) return;
      hints.push(k);
    }
    var i;
    for (i = 0; i < lines.length; i++) {
      var l = lines[i].toLowerCase();
      if (l.indexOf('cooking') !== -1 || l.indexOf('cook') !== -1) addHint('cook');
      if (l.indexOf('nature') !== -1 || l.indexOf('walk') !== -1) addHint('nature');
      if (l.indexOf('movie') !== -1 || l.indexOf('series') !== -1) addHint('movie');
      if (l.indexOf('sports') !== -1 || l.indexOf('fitness') !== -1) addHint('sport');
      if (l.indexOf('service industry') !== -1) addHint('service');
      if (l.indexOf('divorced') !== -1) addHint('divorc');
      if (l.indexOf('serious') !== -1 || l.indexOf('long-term') !== -1) addHint('serious');
      if (l.indexOf('ithaca') !== -1) addHint('ithaca');
      if (l.indexOf('boston') !== -1) addHint('boston');
      if (l.indexOf('romantic') !== -1) addHint('romantic');
      if (l.indexOf('trust') !== -1) addHint('trust');
    }
    return hints.slice(0, 10);
  }

  function scorePriorityDraftCandidate(text, ctx) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return -999;
    if (/\[(ME|THEM)\]/i.test(t)) return -999;
    if (/\[\s*[A-Za-z][^\]]{0,80}\]/.test(t)) return -999;
    var lower = t.toLowerCase();
    var score = 0;
    if (t.length >= 35 && t.length <= 260) score += 2;
    else if (t.length < 20 || t.length > 320) score -= 2;
    var qCount = (t.match(/\?/g) || []).length;
    if (qCount === 1) score += 3;
    else if (qCount === 0) score -= 2;
    else score -= 1;
    if (ctx && ctx.hasSeriousSignal) {
      var hasSeriousReply =
        /serious|long[- ]?term|commit|relationship|marriage|trust|honest/i.test(t);
      score += hasSeriousReply ? 6 : -4;
    }
    var genericPatterns = [
      'laid out in bed',
      'looking so relaxed',
      "i'm curious",
      'so relaxed',
      'besides chatting with me'
    ];
    var gi;
    for (gi = 0; gi < genericPatterns.length; gi++) {
      if (lower.indexOf(genericPatterns[gi]) !== -1) score -= 3;
    }
    var hints = (ctx && ctx.profileHints) || [];
    var hi;
    var hintHit = 0;
    for (hi = 0; hi < hints.length; hi++) {
      if (hints[hi] && lower.indexOf(hints[hi]) !== -1) {
        hintHit++;
      }
    }
    score += Math.min(6, hintHit * 2);
    if (ctx && ctx.lastPeerLineLower) {
      var lp = ctx.lastPeerLineLower;
      if (lp.indexOf('how are you') !== -1 && /i('| a)?m|doing|good|fine|well/.test(lower)) score += 2;
      if (lp.indexOf('what are you up to') !== -1 && /(right now|at the moment|currently|i('| a)?m)/.test(lower))
        score += 2;
      if (lp.indexOf('serious relationship') !== -1 && /serious|long[- ]?term|relationship|marriage/.test(lower))
        score += 3;
    }
    return score;
  }

  function chooseBestPriorityDraftVariant(variants, ctx) {
    var arr = Array.isArray(variants) ? variants : [];
    if (arr.length === 0) return { draft: '', pickedIndex: -1, score: -999 };
    var best = null;
    var i;
    for (i = 0; i < arr.length; i++) {
      var v = String(arr[i] || '').trim();
      var s = scorePriorityDraftCandidate(v, ctx);
      if (s <= -900) continue;
      if (!best || s > best.score) {
        best = { draft: v, pickedIndex: i, score: s };
      }
    }
    if (!best) return { draft: '', pickedIndex: -1, score: -999 };
    return best;
  }

  async function watchHandlePriorityDraft(item, msgs) {
    watchPauseMonitoringForManualSend = true;
    watchTrace(
      'priorityFlow pause monitoring from draft start',
      item.id,
      item.hrefKey || item.href
    );
    var profileUrl = findProfileUrlInActiveChat();
    var profileCtx = await withTimeoutResult(
      fetchProfileContextText(profileUrl),
      Math.min(30000, WATCH_PRIORITY_PREP_TIMEOUT_MS),
      { ok: false, profileUrl: profileUrl || '', profileText: '', error: 'profile_fetch_timeout' }
    );
    var threadForPrompt = formatRecentThreadForPrompt(msgs);
    var compactProfile = compactProfileContextText(
      profileCtx && profileCtx.profileText ? profileCtx.profileText : ''
    );
    var domFacts = extractProfileFactsFromActiveChatDom();
    watchTrace(
      'priorityFlow context evidence',
      'profileUrl',
      profileCtx.profileUrl || 'n/a',
      'profileErr',
      (profileCtx && profileCtx.error) || '',
      'rawProfileLen',
      String((profileCtx && profileCtx.profileText && profileCtx.profileText.length) || 0),
      'compactProfileLen',
      String(compactProfile.length),
      'domFactsLen',
      String(String(domFacts || '').length),
      'threadLen',
      String(String(threadForPrompt || '').length),
      'profileSample',
      trimOneLine(compactProfile.split('\n')[0] || '', 90),
      'domSample',
      trimOneLine(String(domFacts || '').split('\n')[0] || '', 90)
    );
    var prompt = buildPriorityPromptContext(
      threadForPrompt,
      compactProfile,
      item && item.peerTitle ? item.peerTitle : ''
    );
    var suggested = await withTimeoutResult(
      watchPostSuggestReplies({ message: prompt, style: 'warm' }),
      WATCH_PRIORITY_PREP_TIMEOUT_MS,
      { ok: false, error: 'priority_suggest_timeout', variants: [] }
    );
    var fastRetryErr = suggested && suggested.error ? String(suggested.error) : '';
    var canFastRetrySuggest =
      !suggested.ok &&
      (fastRetryErr === 'suggest_unreachable' ||
        fastRetryErr === 'priority_suggest_timeout' ||
        /^suggest_http_/i.test(fastRetryErr) ||
        fastRetryErr === 'suggest_empty_response' ||
        fastRetryErr === 'suggest_invalid_variants');
    if (canFastRetrySuggest) {
      watchTrace('priorityFlow suggest fastRetry', fastRetryErr);
      await new Promise(function (r) {
        setTimeout(r, WATCH_PRIORITY_SUGGEST_RETRY_FAST_DELAY_MS);
      });
      suggested = await withTimeoutResult(
        watchPostSuggestReplies({ message: prompt, style: 'warm' }),
        WATCH_PRIORITY_PREP_TIMEOUT_MS,
        { ok: false, error: 'priority_suggest_timeout', variants: [] }
      );
    }
    if (!suggested.ok || !suggested.variants || suggested.variants.length === 0) {
      var genErr = suggested.error || 'priority_reply_generate_failed';
      watchTrace('priorityFlow suggest failed', genErr);
      watchPauseMonitoringForManualSend = false;
      watchLoadState(function (s) {
        var isTransientSuggestFail =
          genErr === 'suggest_unreachable' ||
          genErr === 'priority_suggest_timeout' ||
          /^suggest_http_/i.test(String(genErr || '')) ||
          genErr === 'suggest_empty_response' ||
          genErr === 'suggest_invalid_variants';
        var retrySuggestMs = isTransientSuggestFail ? 8000 : 20000;
        if (isTransientSuggestFail) {
          watchSuggestBackoffUntil = Date.now() + WATCH_SUGGEST_FAIL_BACKOFF_MS;
        }
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            // Временный сбой генерации не должен "сжигать" чат: ставим на повтор.
            s.pending[pi].status = 'scheduled';
            s.pending[pi].scheduledAt = Date.now() + retrySuggestMs;
            s.pending[pi].lastError = genErr || 'priority_reply_generate_failed';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    var selectionCtx = {
      hasSeriousSignal: /serious relationship|marriage|long[- ]?term|commit/i.test(threadForPrompt),
      lastPeerLineLower: pickLastPeerLineFromThread(threadForPrompt).toLowerCase(),
      profileHints: extractProfileKeywordHints(compactProfile, domFacts)
    };
    var picked = chooseBestPriorityDraftVariant(suggested.variants, selectionCtx);
    var draft = String(picked.draft || '').trim();
    watchTrace(
      'priorityFlow draft picked',
      'pickedIndex',
      picked.pickedIndex,
      'score',
      picked.score,
      'hints',
      (selectionCtx.profileHints || []).join('|'),
      'draft',
      trimOneLine(draft, 140)
    );
    if (!draft) {
      watchTrace('priorityFlow empty draft after ranking');
      watchPauseMonitoringForManualSend = false;
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'scheduled';
            s.pending[pi].scheduledAt = Date.now() + 20000;
            s.pending[pi].lastError = 'priority_draft_empty_after_ranking';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    var dr = await insertDraftWithRetriesAsync(draft, 12, 480);
    if (!dr.ok) {
      watchTrace('priorityFlow insert failed', dr.error || 'insert_draft_failed');
      watchPauseMonitoringForManualSend = false;
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'error';
            s.pending[pi].lastError = dr.error || 'insert_draft_failed';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    var readySoundPlayed = playPriorityDraftReadySound();
    watchTrace(
      'priorityFlow draft ready',
      'profile',
      profileCtx.profileUrl || 'n/a',
      'profileErr',
      (profileCtx && profileCtx.error) || '',
      'profileLen',
      String((profileCtx && profileCtx.profileText && profileCtx.profileText.length) || 0),
      'sound',
      readySoundPlayed ? 'played' : 'blocked'
    );
    await new Promise(function (resolveMarkWaiting) {
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'waiting_send';
            s.pending[pi].lastError = 'priority_draft_ready';
            s.pending[pi].priorityDraftText = draft;
            s.pending[pi].waitingSince = Date.now();
            break;
          }
        }
        watchSaveState(s, resolveMarkWaiting);
      });
    });
    watchTrace('priorityFlow wait manual send', item.id, item.hrefKey || item.href);
    // Baseline must reflect DOM *now*, not `msgs` from start of priorityFlow: after profile fetch,
    // suggest, insert, and SignalR reconnect the parsed thread length can differ (often lower),
    // so `msgs.length` as countBefore makes `msgs.length > messageCountBefore` never true and
    // `waitForUserManualSend` never completes -> pipelineBusy until timeout.
    var waitBaseline = extractStructuredMessagesFromThread();
    var countBefore = Array.isArray(waitBaseline.messages) ? waitBaseline.messages.length : 0;
    watchTrace(
      'priorityFlow wait baseline',
      'countBefore',
      countBefore,
      'promptMsgsLen',
      Array.isArray(msgs) ? msgs.length : -1,
      'extractMethod',
      waitBaseline.extractMethod || ''
    );
    var waitOutcome = null;
    try {
      waitOutcome = await waitForUserManualSend(countBefore, WATCH_PRIORITY_WAIT_SEND_TIMEOUT_MS, {
        strictThreadConfirm: true,
        priorityHumanSend: true,
        allowDraftDeletionExit: true,
        expectedChatHrefKey: item.hrefKey || item.href,
        composerEmptyConfirmTicks:
          watchEffectiveModeCache === 'paid_only' &&
          (watchPaidOnlyPassPhaseCache === 'paid' ||
            watchPaidOnlyPassPhaseCache === 'first_sms')
            ? 8
            : 6
      });
    } finally {
      watchPauseMonitoringForManualSend = false;
      watchForceDeepScanUntil = Date.now() + 15000;
    }
    watchTrace(
      'priorityFlow wait manual send done',
      'ok',
      !!(waitOutcome && waitOutcome.ok),
      'reason',
      waitOutcome && waitOutcome.reason ? waitOutcome.reason : 'unknown'
    );
    if (waitOutcome && waitOutcome.ok) {
      var isDraftDeletedByUser = waitOutcome.reason === 'draft_deleted_by_user';
      if (!isDraftDeletedByUser) {
        try {
          await setWatchLastActivityForChat(item.href);
        } catch (eAct) {}
      }
      watchLoadState(function (s) {
        if (isDraftDeletedByUser) {
          watchMarkHrefNoRequeueAfterDraftDelete(s, item.hrefKey || item.href);
        }
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            if (isDraftDeletedByUser) {
              s.pending[pi].status = 'skipped';
              s.pending[pi].lastError = 'draft_deleted_by_user';
            } else {
              s.pending[pi].status = 'done';
              s.pending[pi].sentAt = Date.now();
              s.pending[pi].lastError = waitOutcome.reason || 'priority_manual_send_confirmed';
            }
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    watchLoadState(function (s) {
      var retryAt = Date.now() + 30000;
      var pi;
      for (pi = 0; pi < s.pending.length; pi++) {
        if (s.pending[pi].id === item.id) {
          s.pending[pi].status = 'scheduled';
          s.pending[pi].scheduledAt = retryAt;
          s.pending[pi].lastError =
            (waitOutcome && waitOutcome.reason) || 'priority_wait_send_not_confirmed';
          break;
        }
      }
      s.activeProcessingId = null;
      watchReleasePipelineAfterSave(s);
    });
  }

  async function watchExecuteFollowUpItem(item) {
    watchAbortWaitRequested = false;
    lastComposerUsed = null;
    watchTrace(
      'followUp start',
      item.id,
      item.hrefKey || item.href,
      'peer',
      String(item.peerTitle || '').slice(0, 40)
    );
    if (watchEffectiveModeCache === 'paid_only' && watchPaidOnlyPassPhaseCache === 'paid') {
      try {
        await ensurePaidOnlyWatchListFiltersAsync();
      } catch (eDomF) {
        watchTrace(
          'paidOnlyFilters ensure err',
          String(eDomF && eDomF.message ? eDomF.message : eDomF)
        );
      }
      watchPaidOnlyDomPaidSetupDone = true;
    }
    if (
      watchEffectiveModeCache === 'paid_only' &&
      watchPaidOnlyPassPhaseCache === 'first_sms'
    ) {
      try {
        await ensureFirstSmsOnlyWatchListFiltersAsync();
      } catch (eDomFs) {
        watchTrace(
          'firstSmsPhaseFilters ensure err',
          String(eDomFs && eDomFs.message ? eDomFs.message : eDomFs)
        );
      }
      watchPaidOnlyDomFirstSmsSetupDone = true;
    }
    if (watchEffectiveModeCache === 'paid_only' && watchPaidOnlyPassPhaseCache === 'unread') {
      try {
        await ensureUnreadOnlyAfterPaidPassFiltersAsync();
      } catch (eDomU) {
        watchTrace(
          'unreadPhaseFilters ensure err',
          String(eDomU && eDomU.message ? eDomU.message : eDomU)
        );
      }
      watchPaidOnlyDomUnreadSetupDone = true;
    }
    var qres = await watchFetchOutboundQueue();
    if (!qres || !qres.ok) {
      watchTrace('followUp reschedule outbound_queue_fetch_failed');
      var retryFailMs = WATCH_OUTBOUND_FETCH_FAIL_BACKOFF_MS;
      watchOutboundBackoffUntil = Date.now() + retryFailMs;
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'scheduled';
            s.pending[pi].scheduledAt = Date.now() + retryFailMs;
            s.pending[pi].lastError = 'outbound_queue_fetch_failed';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    var queue = qres.messages || [];
    if (queue.length === 0) {
      watchTrace('followUp reschedule outbound_queue_empty');
      var retryEmptyMs = WATCH_OUTBOUND_EMPTY_BACKOFF_MS;
      watchOutboundBackoffUntil = Date.now() + retryEmptyMs;
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'scheduled';
            s.pending[pi].scheduledAt = Date.now() + retryEmptyMs;
            s.pending[pi].lastError = 'outbound_queue_empty';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    watchOutboundBackoffUntil = 0;
    var delayMs = 180000;
    await new Promise(function (resolve) {
      watchLoadState(function (s) {
        delayMs =
          typeof s.delayMs === 'number' && s.delayMs >= 60000 && s.delayMs <= 3600000
            ? s.delayMs
            : 180000;
        resolve();
      });
    });
    watchTrace('followUp delayMs', delayMs, 'queueLen', queue.length);
    var paidPhaseTag = watchEffectiveModeCache === 'paid_only' ? watchPaidOnlyPassPhaseCache : '';
    var priorityFlow;
    if (paidPhaseTag === 'paid') {
      priorityFlow = !!((item && item.isPaidChat) || isPaidChatByHrefInList(item.href));
    } else if (paidPhaseTag === 'first_sms') {
      priorityFlow = !!(
        item &&
        item.isFirstSms &&
        !item.isPaidChat &&
        !isPaidChatByHrefInList(item.href)
      );
      if (
        !priorityFlow &&
        item &&
        item.isFirstSms &&
        !item.isPaidChat &&
        isFirstSmsByHrefInList(item.href) &&
        !isPaidChatByHrefInList(item.href)
      ) {
        priorityFlow = true;
      }
    } else {
      priorityFlow = !!(item && item.isFirstSms);
      if ((item && item.isPaidChat) || isPaidChatByHrefInList(item.href)) {
        priorityFlow = true;
      }
    }
    var scrollOpts = {
      listScrollStepPx: 56,
      listScrollPauseMs: 110,
      maxListPasses: 15,
      openRevealMaxSteps: 12000,
      // Watch: переходить между чатами без прокрутки/кликов по списку.
      noListRescroll: true
    };
    var opened = await openChatAndWait(item.href, 6000, scrollOpts);
    if (!opened.ok) {
      watchTrace('followUp openChat failed', opened.error || 'unknown');
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'error';
            s.pending[pi].lastError = opened.error || 'open_chat_failed';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    watchTrace('followUp openChat ok');
    var composerReady2 = await waitForChatComposerReady(14000);
    if (!composerReady2) {
      watchTrace('followUp composer not ready');
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'error';
            s.pending[pi].lastError = 'chat_composer_not_ready';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    watchTrace('followUp composer ready');
    await sleep(600);
    try {
      await mirrorWatchAndOutboundMemoryBetweenHrefs(
        item.href,
        typeof location !== 'undefined' ? location.pathname + location.search : ''
      );
    } catch (eMir) {}
    var threadPaidHeader = isPaidChatFromOpenThreadHeader();
    if (threadPaidHeader && paidPhaseTag !== 'first_sms') {
      priorityFlow = true;
    }
    if (watchEffectiveModeCache === 'paid_only' && watchPaidOnlyPassPhaseCache === 'paid' && !priorityFlow) {
      watchTrace('paidOnly skip non-paid-phase after open', item.id);
      watchLoadState(function (s) {
        var pix;
        for (pix = 0; pix < s.pending.length; pix++) {
          if (s.pending[pix].id === item.id) {
            s.pending[pix].status = 'skipped';
            s.pending[pix].lastError = 'paid_only_requires_paid_phase_after_open';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    if (watchEffectiveModeCache === 'paid_only' && watchPaidOnlyPassPhaseCache === 'first_sms' && !priorityFlow) {
      watchTrace('paidOnly skip non-first-sms-phase after open', item.id);
      watchLoadState(function (s) {
        var pix2;
        for (pix2 = 0; pix2 < s.pending.length; pix2++) {
          if (s.pending[pix2].id === item.id) {
            s.pending[pix2].status = 'skipped';
            s.pending[pix2].lastError = 'paid_only_requires_first_sms_phase_after_open';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    if (priorityFlow) {
      watchTrace(
        'priorityFlow start',
        item.id,
        item.hrefKey || item.href,
        'isPaidChat',
        !!item.isPaidChat,
        'isFirstSms',
        !!item.isFirstSms
      );
      var pctx = extractStructuredMessagesFromThread();
      var pmsgs = pctx.messages || [];
      var pplain = pctx.threadPlain || '';
      var pquiet = await watchThreadQuietEnoughAsync(pmsgs, pplain, delayMs, item.href);
      if (!pquiet.ok) {
        var presumeAt =
          pquiet.lastActivityMs != null
            ? Math.max(Date.now(), pquiet.lastActivityMs + delayMs)
            : Date.now() + Math.max(pquiet.waitMs || 1000, 1000);
        watchTrace('priorityFlow threadTooActive reschedule', 'resumeAt', presumeAt);
        watchLoadState(function (s) {
          var pqi;
          for (pqi = 0; pqi < s.pending.length; pqi++) {
            if (s.pending[pqi].id === item.id) {
              s.pending[pqi].status = 'scheduled';
              s.pending[pqi].scheduledAt = presumeAt;
              s.pending[pqi].lastError = 'thread_too_active_wait';
              break;
            }
          }
          s.activeProcessingId = null;
          watchReleasePipelineAfterSave(s);
        });
        return;
      }
      await watchHandlePriorityDraft(item, pmsgs);
      return;
    }
    var ctx = null;
    var msgs = [];
    var plain = '';
    var countBefore = 0;
    var dec = null;
    var attempt = 0;
    for (attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep(450 + attempt * 150);
      ctx = extractStructuredMessagesFromThread();
      msgs = ctx.messages || [];
      plain = ctx.threadPlain || '';
      if (attempt === 0) {
        var quiet = await watchThreadQuietEnoughAsync(msgs, plain, delayMs, item.href);
        if (!quiet.ok) {
          var resumeAt =
            quiet.lastActivityMs != null
              ? Math.max(Date.now(), quiet.lastActivityMs + delayMs)
              : Date.now() + Math.max(quiet.waitMs || 1000, 1000);
          dexLog('watch: thread too active, reschedule', item.href, 'resumeAt', resumeAt);
          watchTrace(
            'followUp threadTooActive reschedule',
            'resumeAt',
            resumeAt,
            'lastActivityMs',
            quiet.lastActivityMs,
            'waitMsLeft',
            quiet.waitMs,
            'anchorSource',
            quiet.anchorDebug && quiet.anchorDebug.source ? quiet.anchorDebug.source : 'unknown',
            'anchorDom',
            quiet.anchorDebug && typeof quiet.anchorDebug.tDom === 'number'
              ? quiet.anchorDebug.tDom
              : null,
            'anchorDomRejectedFuture',
            quiet.anchorDebug && quiet.anchorDebug.anchorDomRejectedFuture ? true : false,
            'anchorDomRejectedTooOld',
            quiet.anchorDebug && quiet.anchorDebug.anchorDomRejectedTooOld ? true : false,
            'anchorMem',
            quiet.anchorDebug && typeof quiet.anchorDebug.memAt === 'number'
              ? quiet.anchorDebug.memAt
              : null,
            'anchorWatch',
            quiet.anchorDebug && typeof quiet.anchorDebug.watchAt === 'number'
              ? quiet.anchorDebug.watchAt
              : null,
            'msgCount',
            msgs.length
          );
          watchLoadState(function (s) {
            var pi;
            for (pi = 0; pi < s.pending.length; pi++) {
              if (s.pending[pi].id === item.id) {
                s.pending[pi].status = 'scheduled';
                s.pending[pi].scheduledAt = resumeAt;
                s.pending[pi].lastError = 'thread_too_active_wait';
                break;
              }
            }
            s.activeProcessingId = null;
            watchReleasePipelineAfterSave(s);
          });
          return;
        }
        watchTrace(
          'followUp threadQuiet ok',
          'lastActivityMs',
          quiet.lastActivityMs,
          'ageMsAtDecision',
          typeof quiet.ageMsAtDecision === 'number' ? quiet.ageMsAtDecision : null,
          'anchorSource',
          quiet.anchorDebug && quiet.anchorDebug.source ? quiet.anchorDebug.source : 'unknown',
          'anchorDom',
          quiet.anchorDebug && typeof quiet.anchorDebug.tDom === 'number'
            ? quiet.anchorDebug.tDom
            : null,
          'anchorDomRejectedFuture',
          quiet.anchorDebug && quiet.anchorDebug.anchorDomRejectedFuture ? true : false,
          'anchorDomRejectedTooOld',
          quiet.anchorDebug && quiet.anchorDebug.anchorDomRejectedTooOld ? true : false,
          'anchorMem',
          quiet.anchorDebug && typeof quiet.anchorDebug.memAt === 'number'
            ? quiet.anchorDebug.memAt
            : null,
          'anchorWatch',
          quiet.anchorDebug && typeof quiet.anchorDebug.watchAt === 'number'
            ? quiet.anchorDebug.watchAt
            : null,
          'msgCount',
          msgs.length
        );
        if (quiet.lastActivityMs == null && msgs.length > 0) {
          var nowAnchorFallback = Date.now();
          var detectedAtMs =
            item && typeof item.detectedAt === 'number' ? item.detectedAt : null;
          var detectedAtAgeMs =
            detectedAtMs != null ? nowAnchorFallback - detectedAtMs : null;
          if (
            detectedAtMs != null &&
            typeof detectedAtAgeMs === 'number' &&
            detectedAtAgeMs >= delayMs
          ) {
            watchTrace(
              'followUp threadAnchorUnknown fallbackDetectedAt continue',
              'detectedAt',
              detectedAtMs,
              'detectedAtAgeMs',
              detectedAtAgeMs,
              'delayMs',
              delayMs,
              'msgCount',
              msgs.length
            );
          } else {
            var retryAtAnchor =
              detectedAtMs != null
                ? Math.max(nowAnchorFallback + 12000, detectedAtMs + delayMs)
                : nowAnchorFallback + 12000;
          watchTrace(
            'followUp threadAnchorUnknown reschedule',
            'msgCount',
            msgs.length,
            'detectedAt',
            detectedAtMs,
            'detectedAtAgeMs',
            detectedAtAgeMs,
            'retryAt',
            retryAtAnchor
          );
          watchLoadState(function (s) {
            var pix;
            for (pix = 0; pix < s.pending.length; pix++) {
              if (s.pending[pix].id === item.id) {
                s.pending[pix].status = 'scheduled';
                s.pending[pix].scheduledAt = retryAtAnchor;
                s.pending[pix].lastError = 'thread_time_anchor_unparsed';
                break;
              }
            }
            s.activeProcessingId = null;
            watchReleasePipelineAfterSave(s);
          });
          return;
          }
        }
      }
      countBefore = msgs.length;
      dec = decideOutboundSend(queue, msgs, plain, {
        cooldownMs: 0,
        allowFirstAfterPeerLast: true,
        relaxUnknownMulti: true,
        // Для watch не форсим plain-only при пустом extract:
        // иначе можно отправить, когда тред ещё не дорендерился.
        forcePlainWhenEmptyExtract: false
      });
      if (dec.action === 'send' && dec.text) {
        watchTrace('followUp decide send', 'attempt', attempt, 'queueIndex', dec.queueIndex);
        break;
      }
      watchTrace(
        'followUp decide notSend',
        'attempt',
        attempt,
        'action',
        dec.action,
        'reason',
        dec.reason || ''
      );
      if (!isWatchOutboundDecisionRecoverable(dec)) break;
    }
    if (dec.action !== 'send' || !dec.text) {
      watchTrace('followUp final skip', dec.reason || 'no_send', 'action', dec.action);
      if (shouldPersistOutboundSkipToMemory(dec)) {
        try {
          await setLastOutboundMemoryForHref(item.href, {
            queueIndex:
              typeof dec.queueIndex === 'number' ? dec.queueIndex : -1,
            text: dec.text
          });
        } catch (eSkipMem) {}
      }
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'skipped';
            s.pending[pi].lastError = dec.reason || 'no_send';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    if ((msgs || []).length === 0) {
      var retryAt = Date.now() + 15000;
      watchTrace(
        'followUp block send threadNotLoaded reschedule',
        'retryInMs',
        15000,
        'plainLen',
        String(plain || '').replace(/\s/g, '').length
      );
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'scheduled';
            s.pending[pi].scheduledAt = retryAt;
            s.pending[pi].lastError = 'thread_not_loaded_for_send';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    var memPre = await getLastOutboundMemoryForHref(item.href);
    if (shouldSkipOutboundRepeatFromMemory(memPre, dec)) {
      dexLog('watch: skip repeat outbound (memory)', item.href, String(dec.text).slice(0, 48));
      watchTrace('followUp skip repeatOutboundMemory');
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'skipped';
            s.pending[pi].lastError = 'outbound_repeat_same_text_memory';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    var dr = await insertDraftWithRetriesAsync(dec.text, 12, 480);
    if (!dr.ok) {
      watchTrace('followUp insertDraft failed', dr.error || 'insert_draft_failed');
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'error';
            s.pending[pi].lastError = dr.error || 'insert_draft_failed';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    watchTrace('followUp insertDraft ok');
    try {
      await setWatchLastActivityForChat(item.href);
    } catch (eWatchAct) {}
    watchLoadState(function (s) {
      var pi;
      for (pi = 0; pi < s.pending.length; pi++) {
        if (s.pending[pi].id === item.id) {
          s.pending[pi].status = 'waiting_send';
          break;
        }
      }
      watchSaveState(s);
    });
    await sleep(1000);
    var sendNow = sendExistingDraftFromComposer();
    watchTrace(
      'followUp autoSend click',
      'ok',
      !!sendNow.ok,
      'method',
      sendNow.method || '',
      'error',
      sendNow.error || ''
    );
    if (!sendNow.ok) {
      watchLoadState(function (s) {
        var pi;
        for (pi = 0; pi < s.pending.length; pi++) {
          if (s.pending[pi].id === item.id) {
            s.pending[pi].status = 'error';
            s.pending[pi].lastError = sendNow.error || 'send_click_failed';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
      return;
    }
    var outboundSendConfirmTimeoutMs = 45000;
    var waitOutcome = await waitForUserManualSend(countBefore, outboundSendConfirmTimeoutMs, {
      strictThreadConfirm: true
    });
    watchTrace('followUp waitSendConfirm done', 'ok', waitOutcome.ok, 'reason', waitOutcome.reason || '');
    if (waitOutcome.ok) {
      try {
        await setLastOutboundMemoryForHref(item.href, {
          queueIndex: dec.queueIndex,
          text: dec.text
        });
      } catch (eMemW) {}
      try {
        await incrementDailySentCounter(1, 'watch_auto_send_confirmed');
      } catch (eDayInc) {}
      watchLoadState(function (s) {
        s.pending = (s.pending || []).filter(function (p) {
          return p.id !== item.id;
        });
        s.activeProcessingId = null;
        watchTrace('followUp pendingRemoved after step');
        watchReleasePipelineAfterSave(s);
      });
    } else {
      var retryAtConfirm = Date.now() + 20000;
      watchTrace(
        'followUp waitSendConfirm failed reschedule',
        'reason',
        waitOutcome.reason || '',
        'retryAt',
        retryAtConfirm
      );
      watchLoadState(function (s) {
        var pif;
        for (pif = 0; pif < s.pending.length; pif++) {
          if (s.pending[pif].id === item.id) {
            s.pending[pif].status = 'scheduled';
            s.pending[pif].scheduledAt = retryAtConfirm;
            s.pending[pif].lastError =
              String(waitOutcome.reason || '') || 'send_confirm_failed';
            break;
          }
        }
        s.activeProcessingId = null;
        watchReleasePipelineAfterSave(s);
      });
    }
  }

  function watchTryProcessDue() {
    if (watchPauseMonitoringForManualSend) {
      watchLoadState(function (stPaused) {
        var hasPriorityWait = (stPaused.pending || []).some(function (p) {
          if (!p || p.status !== 'waiting_send') return false;
          return !!(p.isPaidChat || p.isFirstSms || p.priorityDraftText);
        });
        if (!hasPriorityWait && !watchPipelineBusy) {
          watchPauseMonitoringForManualSend = false;
          watchTrace('tryProcessDue stalePauseCleared noWaitingSendInState');
          setTimeout(function () {
            watchTryProcessDue();
          }, 0);
        }
      });
      watchTrace('tryProcessDue skip pausedForManualSend');
      return;
    }
    if (watchPipelineBusy) {
      watchTrace('tryProcessDue skip pipelineBusy');
      return;
    }
    if (Date.now() < watchTabLoadProcessNotBefore) {
      watchTrace('tryProcessDue skip tabLoadCooldown until', watchTabLoadProcessNotBefore);
      return;
    }
    if (Date.now() < watchOutboundBackoffUntil) {
      watchTrace('tryProcessDue skip outboundBackoffUntil', watchOutboundBackoffUntil);
      return;
    }
    if (Date.now() < watchSuggestBackoffUntil) {
      watchTrace('tryProcessDue skip suggestBackoffUntil', watchSuggestBackoffUntil);
      return;
    }
    try {
      chrome.storage.local.get(
        [MATCH_CLUB_WATCH_KEY, MATCH_CLUB_ONLINE_PREF_KEY],
        function (o) {
          if (chrome.runtime.lastError) {
            dexLog('watchTryProcessDue storage', chrome.runtime.lastError.message || 'error');
            return;
          }
          var state = watchMergeState(o && o[MATCH_CLUB_WATCH_KEY]);
          watchHydratePaidUnreadOnePassFromState(state);
          var watchMode = normalizeWatchModeFromState(state);
          watchEffectiveModeCache = watchMode;
          var passPhase = normalizePaidOnlyPassPhase(state);
          watchPaidOnlyPassPhaseCache = passPhase;
          var preferOnlineOnly = resolvePreferOnlineOnlyFromDom(
            o && o[MATCH_CLUB_ONLINE_PREF_KEY]
          );
          if (!state.enabled || !state.baselineCaptured) return;
          if (watchPipelineBusy) {
            watchTrace('tryProcessDue skip pipelineBusy async');
            return;
          }
          if (
            watchMode === 'paid_only' &&
            passPhase === 'paid' &&
            !watchPendingPhaseHasActiveWork(state, 'paid')
          ) {
            state.paidOnlyPassPhase = 'first_sms';
            watchPaidOnlyDomFirstSmsSetupDone = false;
            watchTrace(
              'paidOnlyPassPhase advance to first_sms',
              'pendingTotal',
              (state.pending || []).length
            );
            watchSaveState(state, function () {
              watchScanForNewChats();
              watchTryProcessDue();
            });
            return;
          }
          if (
            watchMode === 'paid_only' &&
            passPhase === 'first_sms' &&
            !watchPendingPhaseHasActiveWork(state, 'first_sms')
          ) {
            state.paidOnlyPassPhase = 'unread';
            watchPaidOnlyDomUnreadSetupDone = false;
            watchTrace('paidOnlyPassPhase advance to unread', 'pendingTotal', (state.pending || []).length);
            watchSaveState(state, function () {
              watchScanForNewChats();
              watchTryProcessDue();
            });
            return;
          }
          var due = state.pending.filter(function (p) {
            return (
              p.status === 'scheduled' &&
              p.scheduledAt <= Date.now() &&
              watchIsPendingAllowedByMode(p, watchMode, passPhase)
            );
          });
          watchSortDueByScheduleAndOnline(due, preferOnlineOnly);
          if (due.length === 0) {
            var nowNoDue = Date.now();
            if (nowNoDue - watchLastNoDueTraceAt > 15000) {
              watchLastNoDueTraceAt = nowNoDue;
              var pendingScheduled = (state.pending || []).filter(function (p) {
                return p && p.status === 'scheduled';
              });
              var nextScheduledAt = null;
              var ni;
              for (ni = 0; ni < pendingScheduled.length; ni++) {
                var at = pendingScheduled[ni].scheduledAt;
                if (typeof at !== 'number') continue;
                nextScheduledAt = nextScheduledAt == null ? at : Math.min(nextScheduledAt, at);
              }
              watchTrace(
                'tryProcessDue noDueScheduled',
                'scheduledCount',
                pendingScheduled.length,
                'nextScheduledAt',
                nextScheduledAt
              );
            }
            return;
          }
          var item = due[0];
          var liveOn = getLivePeerOnlineForPendingItem(item);
          item.status = 'processing';
          state.activeProcessingId = item.id;
          watchPipelineBusy = true;
          watchPipelineActiveSinceMs = Date.now();
          watchPipelineActiveMeta = {
            itemId: item.id,
            hrefKey: item.hrefKey || item.href || '',
            isPaidChat: !!item.isPaidChat,
            isFirstSms: !!item.isFirstSms,
            pickedFrom: 'main'
          };
          watchTrace(
            'tryProcessDue pick',
            item.id,
            item.hrefKey || item.href,
            'scheduledAt',
            item.scheduledAt,
            'isPaidChat',
            !!item.isPaidChat,
            'isFirstSms',
            !!item.isFirstSms,
            'isUnread',
            !!item.isUnread,
            'preferOnlineOnly',
            preferOnlineOnly,
            'liveOnline',
            liveOn,
            'dueCount',
            due.length,
            'watchMode',
            watchMode,
            'pendingTotal',
            (state.pending || []).length
          );
          watchSaveState(state, function () {
            watchExecuteFollowUpItem(item).then(
              function () {},
              function (e) {
                dexLog('watchExecuteFollowUpItem', e);
                watchTrace('followUp error', String(e && e.message ? e.message : e));
                watchLoadState(function (s) {
                  var pi;
                  for (pi = 0; pi < s.pending.length; pi++) {
                    if (s.pending[pi].id === item.id) {
                      s.pending[pi].status = 'error';
                      s.pending[pi].lastError = String(e && e.message ? e.message : e);
                      break;
                    }
                  }
                  s.activeProcessingId = null;
                  watchReleasePipelineAfterSave(s);
                });
              }
            );
          });
        }
      );
    } catch (e) {
      watchLoadState(function (state) {
        if (!state.enabled || !state.baselineCaptured) return;
        var watchMode = normalizeWatchModeFromState(state);
        watchEffectiveModeCache = watchMode;
        var passPhaseFb = normalizePaidOnlyPassPhase(state);
        watchPaidOnlyPassPhaseCache = passPhaseFb;
        if (watchPauseMonitoringForManualSend) return;
        if (watchPipelineBusy) return;
        var due = state.pending.filter(function (p) {
          return (
            p.status === 'scheduled' &&
            p.scheduledAt <= Date.now() &&
            watchIsPendingAllowedByMode(p, watchMode, passPhaseFb)
          );
        });
        watchSortDueByScheduleAndOnline(due, resolvePreferOnlineOnlyFromDom(false));
        if (due.length === 0) return;
        var itemFb = due[0];
        itemFb.status = 'processing';
        state.activeProcessingId = itemFb.id;
        watchPipelineBusy = true;
        watchPipelineActiveSinceMs = Date.now();
        watchPipelineActiveMeta = {
          itemId: itemFb.id,
          hrefKey: itemFb.hrefKey || itemFb.href || '',
          isPaidChat: !!itemFb.isPaidChat,
          isFirstSms: !!itemFb.isFirstSms,
          pickedFrom: 'fallback'
        };
        watchTrace('tryProcessDue pick fallback', itemFb.id);
        watchSaveState(state, function () {
          watchExecuteFollowUpItem(itemFb).then(
            function () {},
            function (err) {
              watchLoadState(function (s) {
                var pi;
                for (pi = 0; pi < s.pending.length; pi++) {
                  if (s.pending[pi].id === itemFb.id) {
                    s.pending[pi].status = 'error';
                    s.pending[pi].lastError = String(err && err.message ? err.message : err);
                    break;
                  }
                }
                s.activeProcessingId = null;
                watchReleasePipelineAfterSave(s);
              });
            }
          );
        });
      });
    }
  }

  /**
   * После перезагрузки вкладки в storage могли остаться processing/waiting_send без живого async —
   * иначе watchTryProcessDue никогда не возьмёт следующие scheduled.
   */
  function watchSanitizePendingOnTabLoad(st) {
    var changed = false;
    /** Как у новых чатов из списка: не «сейчас», иначе сразу после F5 снова открывается чат и возможен цикл полных перезагрузок. */
    var delayMs =
      typeof st.delayMs === 'number' && st.delayMs >= 60000 ? st.delayMs : 180000;
    var resumeAtDefault = Date.now() + delayMs;
    var i;
    for (i = 0; i < st.pending.length; i++) {
      var p = st.pending[i];
      if (p.status === 'processing' || p.status === 'waiting_send') {
        var resumeAt =
          typeof p.scheduledAt === 'number'
            ? Math.min(p.scheduledAt, resumeAtDefault)
            : resumeAtDefault;
        p.status = 'scheduled';
        p.scheduledAt = resumeAt;
        p.lastError = 'recovered_on_tab_load';
        changed = true;
      }
    }
    if (st.activeProcessingId) {
      st.activeProcessingId = null;
      changed = true;
    }
    if (changed) {
      var nRec = 0;
      for (var ri = 0; ri < (st.pending || []).length; ri++) {
        if (st.pending[ri].lastError === 'recovered_on_tab_load') nRec++;
      }
      watchTrace(
        'sanitizePendingOnTabLoad',
        'recoveredRows',
        nRec,
        'resumeAtDefault',
        resumeAtDefault
      );
    }
    return changed;
  }

  function watchStartHooks() {
    watchStopHooks();
    watchLoadState(function (state) {
      if (!state.enabled) return;
      watchTrace(
        'hooksStart',
        'delayMs',
        state.delayMs,
        'baselineCaptured',
        state.baselineCaptured,
        'seenKeys',
        (state.seenHrefKeys || []).length
      );
      watchCaptureBaselineIfNeeded(function () {
        watchScanForNewChats();
        watchTryProcessDue();
        watchRefreshOutcomeBadgesFromStorage();
      });
      watchIntervalId = setInterval(function () {
        watchScanForNewChats();
        watchTryProcessDue();
      }, 20000);
      watchTrace('hooksStart interval 20000ms');
      var scroller = findListScroller();
      var target = scroller || document.body;
      try {
        watchMo = new MutationObserver(function () {
          watchScheduleScanDebounced();
          if (watchBadgeMoDebounceTimer) clearTimeout(watchBadgeMoDebounceTimer);
          watchBadgeMoDebounceTimer = setTimeout(function () {
            watchBadgeMoDebounceTimer = null;
            watchRefreshOutcomeBadgesFromStorage();
          }, 220);
        });
        watchMo.observe(target, { childList: true, subtree: true });
        watchTrace('hooksStart mutationObserver on', target === document.body ? 'body' : 'scroller');
      } catch (e) {
        watchTrace('hooksStart mutationObserver failed', String(e && e.message ? e.message : e));
      }
    });
  }

  loadDebug(function () {
    watchTabLoadProcessNotBefore = Date.now() + 15000;
    dexLog('match-club-chat loaded', location.pathname);
    attachOnlineOnlyCheckboxPersistence();
    try {
      window.addEventListener('pageshow', function () {
        restoreOnlineOnlyFromStorageSoon();
      });
    } catch (ePs) {}
    restoreOnlineOnlyFromStorageSoon();
    setTimeout(syncOnlineOnlyPreferenceFromDomIfChecked, 600);
    setTimeout(syncOnlineOnlyPreferenceFromDomIfChecked, 3200);
    setRoleOverlayEnabled(true);
    watchLoadState(function (st) {
      if (watchSanitizePendingOnTabLoad(st)) {
        watchSaveState(st, function () {
          if (st.enabled) {
            watchLoadState(function (st2) {
              watchSyncAllListOutcomeBadges(st2);
              watchStartHooks();
            });
          }
        });
      } else if (st.enabled) {
        watchSyncAllListOutcomeBadges(st);
        watchStartHooks();
      }
    });
  });

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[DEBUG_KEY]) return;
      debugEnabled = !!changes[DEBUG_KEY].newValue;
      dexLog('debug toggled', debugEnabled);
    });
  } catch (e) {}

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes[MATCH_CLUB_WATCH_KEY]) return;
      var ch = changes[MATCH_CLUB_WATCH_KEY];
      var nv = ch && ch.newValue;
      var oldWatchMerged = ch && ch.oldValue != null ? watchMergeState(ch.oldValue) : null;
      if (nv == null) {
        watchLoadState(function (loaded) {
          if (loaded.enabled) watchStartHooks();
          else {
            watchPaidOnlyPassPhaseCache = 'paid';
            watchStopHooks();
            watchClearAllListOutcomeBadges();
          }
        });
        return;
      }
      var st = watchMergeState(nv);
      var onePassPersistCleared = watchPaidUnreadOnePassMaybeResetFromStorage(oldWatchMerged, st);
      watchHydratePaidUnreadOnePassFromState(st);
      if (onePassPersistCleared) {
        watchSaveState(st, function () {});
      }
      if (!st.enabled || normalizeWatchModeFromState(st) !== 'paid_only') {
        watchPaidOnlyDomPaidSetupDone = false;
        watchPaidOnlyDomFirstSmsSetupDone = false;
        watchPaidOnlyDomUnreadSetupDone = false;
        watchPaidOnlyPassPhaseCache = 'paid';
      } else {
        watchPaidOnlyPassPhaseCache = normalizePaidOnlyPassPhase(st);
      }
      if (st.enabled) {
        watchStartHooks();
      } else {
        watchStopHooks();
        watchClearAllListOutcomeBadges();
      }
    });
  } catch (e) {}

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.action === 'matchClubWatchAbortWait') {
      watchAbortWaitRequested = true;
      watchTrace(
        'abortWaitRequested',
        'senderTabId',
        sender && sender.tab ? sender.tab.id : null,
        'url',
        sender && sender.url ? sender.url : ''
      );
      sendResponse({ ok: true });
      return true;
    }
    if (msg.action === 'matchClubWatchTick') {
      try {
        watchScanForNewChats();
        watchTryProcessDue();
        watchRefreshOutcomeBadgesFromStorage();
      } catch (e) {}
      sendResponse({ ok: true });
      return true;
    }
    if (msg.action === 'matchClubWatchApplyState') {
      try {
        watchLoadState(function (st) {
          if (st.enabled) watchStartHooks();
          else {
            watchPaidOnlyPassPhaseCache = 'paid';
            watchStopHooks();
            watchClearAllListOutcomeBadges();
          }
        });
      } catch (eA) {}
      sendResponse({ ok: true });
      return true;
    }
    if (msg.action === 'matchClubPing') {
      sendResponse({ ok: true, script: 'match-club-chat' });
      return;
    }
    if (msg.action === 'matchClubGetChatContext') {
      try {
        chrome.storage.local.get([DEBUG_KEY], function (o) {
          debugEnabled = !!(o && o[DEBUG_KEY]);
          sendResponse(getChatContext());
        });
      } catch (e) {
        sendResponse(getChatContext());
      }
      return true;
    }
    if (msg.action === 'matchClubRoleOverlay') {
      try {
        setRoleOverlayEnabled(msg.enabled !== false);
        sendResponse({ ok: true, enabled: roleOverlayEnabled });
      } catch (eOv) {
        sendResponse({ ok: false, error: String(eOv && eOv.message ? eOv.message : eOv) });
      }
      return true;
    }
    if (msg.action === 'matchClubInsertDraft') {
      try {
        chrome.storage.local.get([DEBUG_KEY], function (o) {
          debugEnabled = !!(o && o[DEBUG_KEY]);
          sendResponse(insertDraft(msg.text));
        });
      } catch (e) {
        sendResponse(insertDraft(msg.text));
      }
      return true;
    }
    if (msg.action === 'matchClubEnableOnlineOnly') {
      try {
        chrome.storage.local.get([DEBUG_KEY], function (o) {
          debugEnabled = !!(o && o[DEBUG_KEY]);
          dexLog('matchClubEnableOnlineOnly');
          enableOnlineOnlyFilterAsync(sendResponse, msg.timeoutMs);
        });
      } catch (e) {
        enableOnlineOnlyFilterAsync(sendResponse, msg.timeoutMs);
      }
      return true;
    }
    if (msg.action === 'matchClubExportAllChats') {
      try {
        chrome.storage.local.get([DEBUG_KEY], function (o) {
          debugEnabled = !!(o && o[DEBUG_KEY]);
          (async function () {
            try {
              var doc = await runExportAllChats(msg);
              sendResponse({ ok: doc.ok !== false, export: doc });
            } catch (e) {
              sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
            }
          })();
        });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
      return true;
    }
  });
})();
