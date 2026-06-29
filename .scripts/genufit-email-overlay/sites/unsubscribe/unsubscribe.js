(function () {
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function readMeta(name) {
    var el = document.querySelector('meta[name="' + name + '"]');
    return el && el.getAttribute('content') ? el.getAttribute('content').trim() : '';
  }

  function resolveApiBase() {
    var configured = readMeta('unsubscribe-api-base');
    if (configured) return configured.replace(/\/$/, '');
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }
    if (window.location.hostname.indexOf('staging.') === 0) {
      return 'https://staging.genufit.app';
    }
    return 'https://genufit.app';
  }

  function showMessage(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.className = 'message' + (kind ? ' ' + kind : '');
  }

  function bootstrap() {
    var form = document.getElementById('unsubscribe-form');
    if (!form) return;

    var messageEl = document.getElementById('unsubscribe-message');
    var endpoint = resolveApiBase() + '/api/v1/waitlist/unsubscribe/';

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = form.querySelector('input[type="email"]');
      var button = form.querySelector('button[type="submit"]');
      var email = (input && input.value ? input.value : '').trim().toLowerCase();

      if (!EMAIL_RE.test(email)) {
        showMessage(messageEl, 'Enter a valid email address.', 'error');
        return;
      }

      var honey = form.querySelector('input[name="website"]');
      if (honey && honey.value) {
        showMessage(messageEl, 'Something went wrong. Try again.', 'error');
        return;
      }

      button.disabled = true;
      showMessage(messageEl, '', '');

      fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
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
            var detail =
              (result.data && (result.data.detail || result.data.message)) ||
              'We could not process that request. Try again in a moment.';
            throw new Error(detail);
          }
          form.reset();
          showMessage(
            messageEl,
            (result.data && result.data.message) ||
              'You are unsubscribed. You will not receive further waitlist emails from Genufit.',
            'success'
          );
        })
        .catch(function (err) {
          showMessage(
            messageEl,
            (err && err.message) || 'Something went wrong. Try again in a moment.',
            'error'
          );
        })
        .finally(function () {
          button.disabled = false;
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
