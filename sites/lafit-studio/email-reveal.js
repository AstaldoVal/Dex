/* ════════════════════════════════════════════════════════════════════
   LA Fit Studio — email click-to-reveal
   Keeps the contact address out of the raw HTML (split across two
   data-attributes, joined on click) so basic spam scrapers that just
   regex the page source never see a plain "user@domain" string.
   First click reveals the address and activates the mailto: link;
   it never blocks or delays a real visitor beyond that one click,
   which keeps it a direct, immediate contact method.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function reveal(el) {
    var user = el.getAttribute('data-eu');
    var domain = el.getAttribute('data-ed');
    if (!user || !domain) return;
    var addr = user + String.fromCharCode(64) + domain;
    var valueEl = el.querySelector('.contact-btn-value');
    if (valueEl) {
      valueEl.textContent = addr;
    } else {
      el.textContent = addr;
    }
    el.setAttribute('href', 'mailto:' + addr);
    el.removeAttribute('data-eu');
    el.removeAttribute('data-ed');
  }

  document.querySelectorAll('a[data-eu][data-ed]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (el.hasAttribute('data-eu')) {
        e.preventDefault();
        reveal(el);
      }
    });
  });
})();
