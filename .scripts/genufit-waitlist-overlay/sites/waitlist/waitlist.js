(function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var EU_HOST = 'https://eu.i.posthog.com';
  var DEFAULT_SUCCESS =
    "You're on the list. Check your inbox for a confirmation email from Genufit.";
  var ALREADY_REGISTERED_BODY =
    'This email is already on the Genufit waitlist.';
  var ALREADY_REGISTERED_HINT =
    'We did not send another confirmation email. Check your inbox or spam for the original message.';
  var ALREADY_REGISTERED_INLINE = "You're already on the waitlist.";

  /** preview-people inlines page CSS and does not load waitlist.css — modal needs these rules in JS. */
  var SUCCESS_DIALOG_STYLE_ID = 'waitlist-success-dialog-styles';
  var SUCCESS_DIALOG_CSS =
    'body.waitlist-success-dialog-open{overflow:hidden}' +
    '.waitlist-success-dialog{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:1.25rem}' +
    '.waitlist-success-dialog[hidden]{display:none!important}' +
    '.waitlist-success-dialog__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.55);border:0;padding:0;cursor:pointer}' +
    '.waitlist-success-dialog__panel{position:relative;z-index:1;width:min(100%,28rem);padding:1.75rem 1.5rem 1.5rem;border-radius:1rem;background:#fff;box-shadow:0 24px 60px rgba(15,23,42,.22);text-align:center}' +
    '.waitlist-success-dialog__eyebrow{margin:0 0 .35rem;font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#1e6b58}' +
    '.waitlist-success-dialog__title{margin:0 0 .75rem;font-family:Fraunces,Georgia,serif;font-size:1.5rem;line-height:1.2;color:#0f172a}' +
    '.waitlist-success-dialog__body{margin:0 0 .75rem;font-size:1rem;line-height:1.5;color:#334155}' +
    '.waitlist-success-dialog__hint{margin:0 0 1.25rem;font-size:.875rem;line-height:1.45;color:#64748b}' +
    '.waitlist-success-dialog__close{width:100%;justify-content:center}' +
    '.waitlist-success-dialog--existing .waitlist-success-dialog__eyebrow{color:#475569}' +
    '.faq-item .faq-a{display:none}' +
    '.faq-item.open .faq-a{display:block}' +
    '.faq-q{cursor:pointer}' +
    '.form-message.success{font-weight:600;color:#166534}';

  /** preview-people FAQ items ship without answer nodes for collapsed rows. */
  var FAQ_ANSWERS = {
    'What is GenuFit?':
      'GenuFit tailors your existing CV to a specific job description in about 60 seconds, using only your real experience.',
    'Is this a resume builder from scratch?':
      'No. GenuFit starts from the resume you already have. It is for people who want a matched version for each application without rewriting it manually every time.',
    'How is this different from ChatGPT?':
      'ChatGPT gives generic text. GenuFit is built for job applications: it reads the job description, maps your real CV to it, and exports an ATS-friendly resume in one flow.',
    "Will you invent experience I don't have?":
      'No. GenuFit only rephrases and reorders what is already in your CV. It does not add skills, titles, or employers you did not list.',
    'What do I get by joining the waitlist?':
      'Early access when we open the beta, 10 free resume optimizations for life (lifetime cap), and the launch price locked in. No credit card required to join.',
    'When will you launch?':
      'We are finishing the beta now. Waitlist members get access first, in the order they signed up.',
  };

  function ensureSuccessDialogStyles() {
    if (document.getElementById(SUCCESS_DIALOG_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = SUCCESS_DIALOG_STYLE_ID;
    style.textContent = SUCCESS_DIALOG_CSS;
    document.head.appendChild(style);
  }

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
    ensureSuccessDialogStyles();
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
      '<p class="waitlist-success-dialog__hint" data-waitlist-success-hint></p>' +
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

  function showWaitlistDialog(variant, message) {
    var dialog = ensureSuccessDialog();
    var isExisting = variant === 'already_registered';
    var title = dialog.querySelector('#waitlist-success-title');
    var body = dialog.querySelector('[data-waitlist-success-body]');
    var hint = dialog.querySelector('[data-waitlist-success-hint]');
    var panel = dialog.querySelector('.waitlist-success-dialog__panel');

    if (title) {
      title.textContent = isExisting ? "You're already on the list" : "You're on the list";
    }
    if (body) {
      body.textContent = isExisting
        ? message || ALREADY_REGISTERED_BODY
        : message || DEFAULT_SUCCESS;
    }
    if (hint) {
      hint.textContent = isExisting
        ? ALREADY_REGISTERED_HINT
        : 'We sent a confirmation email. Check spam if you do not see it in a few minutes.';
    }
    if (panel) {
      panel.classList.toggle('waitlist-success-dialog--existing', isExisting);
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
    showWaitlistDialog('created', text);
  }

  function notifyWaitlistAlreadyRegistered(form, message) {
    showMessage(form, ALREADY_REGISTERED_INLINE, 'success');
    showWaitlistDialog('already_registered', message);
  }

  function isWaitlistDuplicateSignup(data) {
    return Boolean(data && data.created === false);
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
        var data = result.data || {};
        if (isWaitlistDuplicateSignup(data)) {
          notifyWaitlistAlreadyRegistered(form, data.message);
          capture(
            'waitlist_submit',
            Object.assign({ result: 'already_registered', mode: 'api' }, utm)
          );
        } else {
          var successText = data.message || DEFAULT_SUCCESS;
          notifyWaitlistSuccess(form, successText);
          capture('waitlist_submit', Object.assign({ result: 'success', mode: 'api' }, utm));
        }
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

  function faqQuestionText(item) {
    var q = item.querySelector('.faq-q span:first-child');
    return q && q.textContent ? q.textContent.trim() : '';
  }

  function faqToggleSign(item, open) {
    var sign = item.querySelector('.faq-q span:last-child');
    if (!sign) return;
    sign.textContent = open ? '−' : '+';
    sign.style.color = open ? '#1E6B58' : '#94A3B8';
  }

  function ensureFaqAnswer(item, question) {
    var answerText = FAQ_ANSWERS[question];
    if (!answerText) return item.querySelector('.faq-a');
    var answer = item.querySelector('.faq-a');
    if (!answer) {
      answer = document.createElement('div');
      answer.className = 'faq-a';
      item.appendChild(answer);
    }
    if (!answer.textContent.trim()) {
      answer.textContent = answerText;
    }
    return answer;
  }

  function bindFaqAccordion() {
    var items = document.querySelectorAll('.faq-item');
    if (!items.length) return;

    items.forEach(function (item) {
      var question = faqQuestionText(item);
      ensureFaqAnswer(item, question);
      faqToggleSign(item, item.classList.contains('open'));

      var q = item.querySelector('.faq-q');
      if (!q || q.dataset.faqBound === '1') return;
      q.dataset.faqBound = '1';
      q.setAttribute('role', 'button');
      q.setAttribute('tabindex', '0');
      q.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');

      function toggleItem() {
        var wasOpen = item.classList.contains('open');
        items.forEach(function (el) {
          el.classList.remove('open');
          faqToggleSign(el, false);
          var head = el.querySelector('.faq-q');
          if (head) head.setAttribute('aria-expanded', 'false');
        });
        if (!wasOpen) {
          item.classList.add('open');
          faqToggleSign(item, true);
          q.setAttribute('aria-expanded', 'true');
        }
      }

      q.addEventListener('click', toggleItem);
      q.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleItem();
        }
      });
    });
  }

  function bootstrap() {
    ensureSuccessDialogStyles();

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
    bindFaqAccordion();
    handleJoinHashOnLoad();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
