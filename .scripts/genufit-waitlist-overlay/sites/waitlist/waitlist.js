(function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var EU_HOST = 'https://eu.i.posthog.com';
  var DEFAULT_SUCCESS =
    "You're on the list. Check your inbox for a confirmation email from Genufit.";

  function readMeta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el && el.getAttribute('content') ? el.getAttribute('content').trim() : '';
  }

  function readUtm() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
    };
  }

  var posthogClient = null;

  function isPostHogEnabled() {
    if (readMeta('posthog-enabled') !== 'true') {
      return false;
    }
    return Boolean(readMeta('posthog-key'));
  }

  function getEnvironment() {
    return readMeta('posthog-environment') || 'staging';
  }

  function withEnvironment(props) {
    return Object.assign({ environment: getEnvironment() }, props || {});
  }

  function initPostHog() {
    if (!isPostHogEnabled() || typeof window.posthog === 'undefined') {
      return null;
    }
    var key = readMeta('posthog-key');
    var host = readMeta('posthog-host') || EU_HOST;
    window.posthog.init(key, {
      api_host: host,
      person_profiles: 'identified_only',
      capture_pageview: false,
    });
    window.posthog.register({ environment: getEnvironment() });
    posthogClient = window.posthog;
    return posthogClient;
  }

  function capture(event, props) {
    if (!isPostHogEnabled()) {
      return;
    }
    if (!posthogClient) {
      posthogClient = initPostHog();
    }
    if (!posthogClient) {
      return;
    }
    posthogClient.capture(event, withEnvironment(props));
  }

  function trackPageView() {
    var utm = readUtm();
    capture('waitlist_page_view', utm);
  }

  /** Message may live inside the form or as the next sibling (preview-people layout). */
  function findFormMessageEl(form) {
    if (!form) return null;
    var el = form.querySelector('[data-form-message]');
    if (el) return el;
    var sibling = form.nextElementSibling;
    if (sibling && sibling.matches && sibling.matches('[data-form-message]')) {
      return sibling;
    }
    if (form.parentElement) {
      el = form.parentElement.querySelector('[data-form-message]');
      if (el) return el;
    }
    return null;
  }

  function showMessage(form, text, kind) {
    var el = findFormMessageEl(form);
    if (!el) return;
    el.textContent = text;
    el.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  var successDialog = null;
  var successDialogLastFocus = null;

  function ensureSuccessDialog() {
    if (successDialog) return successDialog;

    var overlay = document.createElement('div');
    overlay.id = 'waitlist-success-dialog';
    overlay.className = 'waitlist-success-dialog';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'waitlist-success-title');
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="waitlist-success-dialog__backdrop" data-waitlist-success-close tabindex="-1"></div>' +
      '<div class="waitlist-success-dialog__panel">' +
      '<p class="waitlist-success-dialog__eyebrow">Waitlist</p>' +
      '<h2 id="waitlist-success-title" class="waitlist-success-dialog__title">You\'re on the list</h2>' +
      '<p class="waitlist-success-dialog__body" data-waitlist-success-body></p>' +
      '<p class="waitlist-success-dialog__hint">We sent a confirmation email. Check spam if you do not see it in a few minutes.</p>' +
      '<button type="button" class="waitlist-success-dialog__close btn btn--primary" data-waitlist-success-close>Got it</button>' +
      '</div>';

    document.body.appendChild(overlay);

    function closeDialog() {
      overlay.hidden = true;
      overlay.classList.remove('is-open');
      document.body.classList.remove('waitlist-success-dialog-open');
      if (successDialogLastFocus && successDialogLastFocus.focus) {
        successDialogLastFocus.focus();
      }
    }

    overlay.querySelectorAll('[data-waitlist-success-close]').forEach(function (node) {
      node.addEventListener('click', closeDialog);
    });

    overlay.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
    });

    successDialog = overlay;
    return overlay;
  }

  function showSuccessDialog(message) {
    var dialog = ensureSuccessDialog();
    var body = dialog.querySelector('[data-waitlist-success-body]');
    if (body) {
      body.textContent = message || DEFAULT_SUCCESS;
    }
    successDialogLastFocus = document.activeElement;
    dialog.hidden = false;
    dialog.classList.add('is-open');
    document.body.classList.add('waitlist-success-dialog-open');
    var closeBtn = dialog.querySelector('.waitlist-success-dialog__close');
    if (closeBtn) closeBtn.focus();
  }

  function notifyWaitlistSuccess(form, message) {
    var text = message || DEFAULT_SUCCESS;
    showMessage(form, text, 'success');
    showSuccessDialog(text);
  }

  function isWaitlistApiEndpoint(endpoint) {
    return /\/api\/v1\/waitlist\/signup\/?$/i.test(endpoint);
  }

  function readHoneypot(form) {
    var honey = form.querySelector('input[name="_honey"], input[name="website"]');
    return honey && honey.value ? String(honey.value).trim() : '';
  }

  function submitWaitlistApi(endpoint, form, email, button) {
    var utm = readUtm();
    var payload = {
      email: email,
      utm_source: utm.utm_source || null,
      utm_medium: utm.utm_medium || null,
      utm_campaign: utm.utm_campaign || null,
      website: readHoneypot(form) || null,
    };
    var input = form.querySelector('input[type="email"]');
    return fetch(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        return response
          .json()
          .then(function (data) {
            return { ok: response.ok, data: data };
          })
          .catch(function () {
            return { ok: response.ok, data: {} };
          });
      })
      .then(function (result) {
        if (!result.ok) {
          var detail = (result.data && (result.data.detail || result.data.message)) || '';
          throw new Error(detail || 'request_failed');
        }
        var successText =
          (result.data && result.data.message) || DEFAULT_SUCCESS;
        notifyWaitlistSuccess(form, successText);
        capture('waitlist_submit', Object.assign({ result: 'success', mode: 'api' }, utm));
        if (input) input.value = '';
      })
      .catch(function (err) {
        var message =
          err && err.message && err.message !== 'request_failed'
            ? String(err.message)
            : 'Something went wrong. Try again in a moment.';
        showMessage(form, message, 'error');
        capture('waitlist_submit', { result: 'error', error_code: 'network' });
      })
      .finally(function () {
        button.disabled = false;
      });
  }

  function bindForm(form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var button = form.querySelector('button[type="submit"]');
      var email = (input && input.value ? input.value : '').trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        showMessage(form, 'Enter a valid email address.', 'error');
        capture('waitlist_submit', { result: 'error', error_code: 'invalid_email' });
        return;
      }

      var endpoint = (form.getAttribute('data-form-endpoint') || '').trim();
      button.disabled = true;

      if (!endpoint) {
        notifyWaitlistSuccess(form, DEFAULT_SUCCESS);
        capture('waitlist_submit', { result: 'success', mode: 'local_only' });
        if (input) input.value = '';
        button.disabled = false;
        return;
      }

      if (isWaitlistApiEndpoint(endpoint)) {
        submitWaitlistApi(endpoint, form, email, button);
        return;
      }

      var body = new FormData(form);
      var utm = readUtm();
      Object.keys(utm).forEach(function (key) {
        if (utm[key]) body.append(key, utm[key]);
      });

      fetch(endpoint, { method: 'POST', body: body, mode: 'no-cors' })
        .then(function () {
          notifyWaitlistSuccess(form, DEFAULT_SUCCESS);
          capture('waitlist_submit', Object.assign({ result: 'success' }, utm));
          if (input) input.value = '';
        })
        .catch(function () {
          showMessage(form, 'Something went wrong. Try again in a moment.', 'error');
          capture('waitlist_submit', { result: 'error', error_code: 'network' });
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  }

  function findWaitlistForm(root) {
    if (!root) return null;
    if (root.matches && root.matches('[data-waitlist-form]')) return root;
    return root.querySelector('[data-waitlist-form]');
  }

  function waitlistCardForForm(form) {
    if (!form) return null;
    return form.closest('.card') || form;
  }

  function clearWaitlistHighlights() {
    document.querySelectorAll('.card.waitlist-focus-highlight').forEach(function (card) {
      card.classList.remove('waitlist-focus-highlight');
    });
  }

  function highlightWaitlistForm(form) {
    clearWaitlistHighlights();
    var card = waitlistCardForForm(form);
    if (!card) return;
    card.classList.add('waitlist-focus-highlight');
    window.setTimeout(function () {
      card.classList.remove('waitlist-focus-highlight');
    }, 2200);
  }

  function focusWaitlistEmail(root) {
    var form = findWaitlistForm(root);
    if (!form) return;
    var input = form.querySelector('input[type="email"]');
    if (!input) return;
    highlightWaitlistForm(form);
    try {
      input.focus({ preventScroll: true });
    } catch (_err) {
      input.focus();
    }
  }

  function resolveWaitlistScrollTarget(hash) {
    if (hash === '#join') hash = '#hero-signup';
    var target = document.querySelector(hash);
    if (target) return target;
    if (hash === '#waitlist') {
      return document.querySelector('#hero-signup') || document.querySelector('#waitlist');
    }
    return null;
  }

  function pickJoinTarget(link, hash) {
    var hero = document.getElementById('hero-signup');
    var waitlist = document.getElementById('waitlist');
    if (!hero || !waitlist || !link) {
      return resolveWaitlistScrollTarget(hash);
    }
    if (hash === '#waitlist') return waitlist;
    if (hash === '#hero-signup' || hash === '#join') {
      var linkTop = link.getBoundingClientRect().top + window.scrollY;
      var heroTop = hero.getBoundingClientRect().top + window.scrollY;
      var waitlistTop = waitlist.getBoundingClientRect().top + window.scrollY;
      var distHero = Math.abs(linkTop - heroTop);
      var distWaitlist = Math.abs(linkTop - waitlistTop);
      return distWaitlist < distHero ? waitlist : hero;
    }
    return resolveWaitlistScrollTarget(hash);
  }

  function activateJoinTarget(target, sourceHash) {
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(function () {
      focusWaitlistEmail(target);
    }, 450);
    var form = findWaitlistForm(target);
    capture('waitlist_cta_click', {
      target: (target.id || sourceHash || '').replace('#', ''),
      form_id: target.id || '',
    });
  }

  function bindJoinLinks() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      var hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      if (hash !== '#waitlist' && hash !== '#hero-signup' && hash !== '#join') return;
      link.addEventListener('click', function (event) {
        var target = pickJoinTarget(link, hash);
        if (!target) return;
        event.preventDefault();
        activateJoinTarget(target, hash);
      });
    });
  }

  function handleJoinHashOnLoad() {
    var hash = window.location.hash;
    if (hash !== '#waitlist' && hash !== '#hero-signup' && hash !== '#join') return;
    window.setTimeout(function () {
      var target = resolveWaitlistScrollTarget(hash);
      if (!target) return;
      activateJoinTarget(target, hash);
    }, 120);
  }

  function bootstrap() {
    if (isPostHogEnabled()) {
      var host = (readMeta('posthog-host') || EU_HOST).replace(/\/$/, '');
      var script = document.createElement('script');
      script.src = host + '/static/array.js';
      script.async = true;
      script.onload = trackPageView;
      document.head.appendChild(script);
    }

    document.querySelectorAll('[data-waitlist-form]').forEach(bindForm);
    bindJoinLinks();
    handleJoinHashOnLoad();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
