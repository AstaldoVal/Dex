/* ════════════════════════════════════════════════════════════════════
   LA Fit Studio — "lux" motion layer
   Shared across every page. Self-contained: injects its own CSS, then
   adds (1) soft staggered scroll-reveal fades and (2) subtle, GPU-light
   parallax on imagery. Quiet-luxury feel, buttery on phones.

   • Transform-free parallax (drives background-position) so it never
     fights the existing Ken Burns / hover-scale transforms.
   • Respects prefers-reduced-motion.
   • Safety net: if anything throws, everything is revealed.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOBILE = window.matchMedia &&
    window.matchMedia('(max-width: 767px)').matches;

  /* ── 1. Inject styles ──────────────────────────────────────────── */
  var css = [
    /* hidden state is only applied via JS (.lux-reveal), so a JS failure
       never leaves content invisible */
    '.lux-reveal{opacity:0;transform:translateY(28px);' +
      'transition:opacity 1.05s cubic-bezier(.22,.61,.36,1),' +
      'transform 1.05s cubic-bezier(.22,.61,.36,1);' +
      'will-change:opacity,transform;}',
    '.lux-reveal.lux-in{opacity:1;transform:none;}',
    /* slight scale-settle variant for image-y blocks */
    '.lux-reveal.lux-soft{transform:translateY(34px) scale(1.015);}',
    '.lux-reveal.lux-soft.lux-in{transform:none;}',
    '.lux-parallax{will-change:background-position;background-repeat:no-repeat;}',
    /* class cards get a clipped overflow buffer so the photo has room to
       drift without ever exposing an edge (parent .class-card clips it) */
    '.class-bg.lux-parallax{top:-12%;bottom:auto;height:124%;}',
    /* coach photos & <img> fade in once loaded */
    '.lux-img{opacity:0;transition:opacity 1s ease;}',
    '.lux-img.lux-img-in{opacity:1;}',
    '@media (prefers-reduced-motion: reduce){' +
      '.lux-reveal,.lux-reveal.lux-soft{opacity:1!important;transform:none!important;}' +
      '.lux-img{opacity:1!important;}}'
  ].join('');
  var style = document.createElement('style');
  style.id = 'lux-style';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  /* ── helpers ───────────────────────────────────────────────────── */
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function $all(sel, root) { return (root || document).querySelectorAll(sel); }

  function init() {
    try { setupReveals(); } catch (e) { revealEverything(); }
    try { setupParallax(); } catch (e) { /* parallax is optional */ }
    try { setupImageFades(); } catch (e) {}
    /* hard safety net: nothing should ever stay hidden */
    setTimeout(revealEverything, 4000);
  }

  function revealEverything() {
    each($all('.lux-reveal'), function (el) { el.classList.add('lux-in'); });
    each($all('.lux-img'), function (el) { el.classList.add('lux-img-in'); });
  }

  /* ── 2. Scroll reveals ─────────────────────────────────────────── */
  function setupReveals() {
    /* Curated targets that exist across the homepage and class pages.
       We deliberately skip #hero (it has its own entrance animation) and
       the transform-animated background layers. */
    var SELECTORS = [
      '#stats .stat',
      '#classes .section-head',
      '#classes .class-card',
      '#booking .booking-inner > *',
      '#about .about-col-img',
      '#about .about-col-text > *',
      '#about .about-feature',
      '#contact .contact-col-text > *',
      '#contact .contact-btn',
      '#contact .map-wrap',
      '#instagram .ig-embed-frame',
      'footer .footer-logo',
      'footer .footer-sub',
      'footer .footer-links',
      'footer .footer-bottom',
      /* class-page content */
      '.page-content .section-block',
      '.page-content hr.divider',
      '.page-content .coach-card',
      '.page-content .info-row',
      '.page-content .warn-row',
      '.page-content .sched-row',
      '.booking-cta'
    ];

    var seen = [];
    each(SELECTORS, function (sel) {
      each($all(sel), function (el) {
        if (el.__lux) return;
        el.__lux = true;
        el.classList.add('lux-reveal');
        if (/class-card|ig-embed-frame|about-col-img|coach-card/.test(el.className)) {
          el.classList.add('lux-soft');
        }
        seen.push(el);
      });
    });

    if (REDUCED || !('IntersectionObserver' in window)) {
      revealEverything();
      return;
    }

    /* Stagger elements that share a parent so groups cascade gently */
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var parent = el.parentNode;
        var sibs = parent ? parent.__luxSibs : null;
        if (!sibs) {
          sibs = Array.prototype.filter.call(
            (parent ? parent.children : [el]),
            function (c) { return c.classList && c.classList.contains('lux-reveal'); }
          );
          if (parent) parent.__luxSibs = sibs;
        }
        var idx = sibs.indexOf(el);
        var delay = Math.min(idx < 0 ? 0 : idx, 6) * 90; /* cap cascade */
        el.style.transitionDelay = delay + 'ms';
        el.classList.add('lux-in');
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    each(seen, function (el) { io.observe(el); });
  }

  /* ── 3. Parallax (background-position, transform-free) ─────────── */
  function setupParallax() {
    if (REDUCED) return;

    /* Big imagery only — keeps it tasteful and cheap. */
    var targets = [];
    each($all('.hero-bg, .class-bg'), function (el) {
      /* don't parallax the gradient-only "Coming soon" card */
      var bg = getComputedStyle(el).backgroundImage || '';
      if (bg.indexOf('url(') === -1) return;
      targets.push(el);
      el.classList.add('lux-parallax');
    });
    if (!targets.length) return;

    /* Travel is a fraction of each image's OWN height, kept inside the
       built-in overflow buffer (hero paints 120% tall, class cards 124%),
       so the photo can never slip past its edge or repeat — regardless of
       the photo's aspect ratio. Mobile gets a touch more than desktop. */
    var BF = MOBILE ? 0.08 : 0.06;
    var ticking = false;

    function frame() {
      ticking = false;
      var vh = window.innerHeight;
      var mid = vh / 2;
      for (var i = 0; i < targets.length; i++) {
        var el = targets[i];
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue; /* offscreen */
        var elMid = r.top + r.height / 2;
        var frac = (elMid - mid) / vh;          /* -1 .. 1 ish */
        if (frac > 1) frac = 1; else if (frac < -1) frac = -1;
        var offset = (frac * BF * r.height).toFixed(1);
        el.style.backgroundPositionX = 'center';
        el.style.backgroundPositionY = 'calc(50% + ' + offset + 'px)';
      }
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(frame); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    frame();
  }

  /* ── 4. Image fade-in on load ──────────────────────────────────── */
  function setupImageFades() {
    if (REDUCED) return;
    each($all('img.coach-photo-img'), function (img) {
      img.classList.add('lux-img');
      if (img.complete && img.naturalWidth) {
        img.classList.add('lux-img-in');
      } else {
        img.addEventListener('load', function () { img.classList.add('lux-img-in'); });
        img.addEventListener('error', function () { img.classList.add('lux-img-in'); });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ════════════════════════════════════════════════════════════════════
   LANGUAGE PERSISTENCE
   A visitor picks a language once; it should follow them across every
   page (and survive reloads). We save the choice whenever a .lang-btn is
   clicked, and re-apply it on load by calling the page's own applyLang().
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var KEY = 'lafit_lang';

  /* Save on any language-button click (delegated — works on every page) */
  function setHtmlLang(l) { document.documentElement.lang = (l === 'ua') ? 'uk' : l; }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.lang-btn[data-lang]');
    if (!b) return;
    try { localStorage.setItem(KEY, b.dataset.lang); } catch (err) {}
    setHtmlLang(b.dataset.lang);
  });

  /* Re-apply the saved language on load via the page's own applyLang() */
  function applySaved() {
    var lang = null;
    try { lang = localStorage.getItem(KEY); } catch (err) {}
    if (lang && lang !== 'en' && typeof window.applyLang === 'function') {
      try { window.applyLang(lang); } catch (err) {}
      setHtmlLang(lang);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySaved);
  } else {
    applySaved();
  }
})();
