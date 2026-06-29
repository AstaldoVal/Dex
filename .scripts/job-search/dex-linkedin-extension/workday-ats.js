/**
 * Dex Workday ATS — runs inside Workday apply iframe (*.myworkdayjobs.com).
 * 1) Capture: collect all form fields (label, type, options), POST to save-server /workday-fields.
 * 2) Fill: load schema + profile + custom answers from server, fill form.
 * Requires save-server (npm run dex-save-server) and manifest content_script with all_frames: true.
 */
(function () {
  const SERVER = 'http://127.0.0.1:8765';
  const DELAY_MS = 2500;

  function log(msg) {
    if (typeof console !== 'undefined') console.log('[Dex Workday]', msg);
  }

  function getTenant() {
    const h = (window.location.hostname || '').toLowerCase();
    if (!h) return 'latest';
    const parts = h.split('.');
    if (parts.length >= 3 && parts[parts.length - 2] === 'myworkdayjobs') {
      return parts.slice(0, -2).join('.');
    }
    return h.replace(/\./g, '_');
  }

  function getLabelForInput(input) {
    if (!input) return '';
    const id = input.id;
    if (id) {
      const labelEl = document.querySelector('label[for="' + id.replace(/"/g, '\\"') + '"]');
      if (labelEl && labelEl.textContent) return labelEl.textContent.trim();
    }
    const aria = input.getAttribute('aria-label');
    if (aria) return aria.trim();
    let el = input.closest('[data-automation-id]');
    if (el) {
      const parent = el.parentElement;
      if (parent) {
        const labelCandidate = parent.querySelector('[data-automation-id="prompt"], [data-automation-id="label"], .wd-form-label, [class*="label"]');
        if (labelCandidate && labelCandidate.textContent) return labelCandidate.textContent.trim();
      }
    }
    el = input.closest('label, [role="group"], [class*="form"], [class*="field"]');
    for (let i = 0; i < 5 && el; i++) {
      const firstLabel = el.querySelector('label, [class*="label"], [data-automation-id="prompt"]');
      if (firstLabel && firstLabel !== input && firstLabel.textContent) return firstLabel.textContent.trim();
      const prev = el.previousElementSibling;
      if (prev && prev.textContent && prev.textContent.length < 300) return prev.textContent.trim();
      el = el.parentElement;
    }
    const placeholder = input.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();
    return '';
  }

  function getCurrentValue(input) {
    if (!input) return '';
    const tag = (input.tagName || '').toLowerCase();
    if (tag === 'select') {
      const opt = input.options[input.selectedIndex];
      return opt ? (opt.textContent || opt.value || '').trim() : '';
    }
    if (input.type === 'checkbox') {
      return input.checked ? 'yes' : '';
    }
    if (input.type === 'radio') {
      const group = document.querySelectorAll('input[type="radio"][name="' + (input.name || '').replace(/"/g, '\\"') + '"]');
      const checked = Array.from(group).find(function (r) { return r.checked; });
      if (!checked) return '';
      return (checked.nextElementSibling && checked.nextElementSibling.textContent) || checked.value || 'yes';
    }
    return (input.value || '').trim();
  }

  function collectWorkdayFields() {
    const fields = [];
    const seen = new Set();
    const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
    for (const input of inputs) {
      if (input.type === 'hidden' || !input.offsetParent) continue;
      const name = (input.name || input.id || input.getAttribute('data-automation-id') || '');
      const key = (name || getLabelForInput(input) || input.placeholder || '') + '|' + input.type;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = getLabelForInput(input) || input.placeholder || name || ('Field ' + fields.length);
      const entry = {
        label: label.substring(0, 500),
        type: input.type || (input.tagName && input.tagName.toLowerCase() === 'select' ? 'select-one' : 'text'),
        name: input.name || '',
        id: input.id || '',
        required: input.required || input.getAttribute('aria-required') === 'true'
      };
      if (input.tagName && input.tagName.toLowerCase() === 'select') {
        entry.options = Array.from(input.options).map(function (o) {
          return { value: o.value, text: (o.textContent || o.value || '').trim().substring(0, 200) };
        }).filter(function (o) { return o.text || o.value; });
      }
      if (input.type === 'radio') {
        const nameAttr = input.name;
        if (nameAttr && !fields.some(function (f) { return f.name === nameAttr && f.type === 'radio'; })) {
          const group = document.querySelectorAll('input[type="radio"][name="' + nameAttr.replace(/"/g, '\\"') + '"]');
          entry.options = Array.from(group).map(function (r) {
            const l = r.nextElementSibling ? r.nextElementSibling.textContent : (r.value || '');
            return { value: r.value, text: (l || r.value || '').trim().substring(0, 200) };
          });
          entry.type = 'radio';
          var checkedRadio = Array.from(group).find(function (r) { return r.checked; });
          if (checkedRadio) entry.value = (checkedRadio.nextElementSibling && checkedRadio.nextElementSibling.textContent) || checkedRadio.value || 'yes';
          fields.push(entry);
        }
        continue;
      }
      if (input.type === 'file') {
        entry.type = 'file';
        fields.push(entry);
        continue;
      }
      var currentVal = getCurrentValue(input);
      if (currentVal) entry.value = currentVal.substring(0, 2000);
      fields.push(entry);
    }
    return fields;
  }

  function captureAndSend() {
    const tenant = getTenant();
    const fields = collectWorkdayFields();
    const payload = { tenant, url: window.location.href, fields };
    log('Capturing ' + fields.length + ' fields for tenant ' + tenant);
    fetch(SERVER + '/workday-fields', {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          const n = data.count || fields.length;
          const v = data.capturedValues || 0;
          log('Saved ' + n + ' fields, ' + v + ' values to server');
          showToast(v > 0 ? 'Saved ' + n + ' fields and ' + v + ' values' : 'Saved ' + n + ' fields');
        } else {
          log('Server error: ' + (data.error || ''));
          showToast('Error: ' + (data.error || 'Is save-server running?'));
        }
      })
      .catch(function (e) {
        log('Capture failed: ' + e.message);
        showToast('Capture failed. Run: npm run dex-save-server');
      });
  }

  function showToast(message) {
    const id = 'dex-workday-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;bottom:16px;right:16px;background:#333;color:#fff;padding:10px 14px;border-radius:8px;font-size:13px;z-index:999999;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      document.body.appendChild(el);
    }
    el.textContent = message;
    setTimeout(function () { el.textContent = ''; }, 4000);
  }

  function addCaptureButton() {
    if (document.getElementById('dex-workday-capture-btn')) return;
    const wrap = document.createElement('div');
    wrap.id = 'dex-workday-buttons';
    wrap.style.cssText = 'position:fixed;top:8px;right:8px;z-index:999999;display:flex;gap:6px;font-family:sans-serif;';
    const btn1 = document.createElement('button');
    btn1.id = 'dex-workday-capture-btn';
    btn1.textContent = 'Capture fields';
    btn1.style.cssText = 'background:#0d6efd;color:#fff;border:none;padding:8px 12px;border-radius:6px;font-size:12px;cursor:pointer;';
    btn1.onclick = function () { captureAndSend(); };
    const btn2 = document.createElement('button');
    btn2.textContent = 'Fill form';
    btn2.style.cssText = 'background:#198754;color:#fff;border:none;padding:8px 12px;border-radius:6px;font-size:12px;cursor:pointer;';
    btn2.onclick = function () { runFill(); };
    wrap.appendChild(btn1);
    wrap.appendChild(btn2);
    document.body.appendChild(wrap);
  }

  function normalizeText(s) {
    if (typeof s !== 'string') return '';
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function setInputValue(input, value) {
    if (!input || value == null || value === undefined) return;
    const str = String(value).trim();
    if (input.type === 'radio' || input.type === 'checkbox') {
      const val = str.toLowerCase();
      const group = document.querySelectorAll('input[type="' + input.type + '"][name="' + (input.name || '').replace(/"/g, '\\"') + '"]');
      const match = Array.from(group).find(function (r) {
        const t = normalizeText((r.nextElementSibling && r.nextElementSibling.textContent) || r.value || '');
        return t.includes(val) || (val === 'yes' && t.includes('yes')) || (val === 'no' && (t.includes('no') || t.includes('don\'t')));
      });
      if (match) {
        match.checked = true;
        match.dispatchEvent(new Event('change', { bubbles: true }));
        match.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (input.type === 'checkbox' && (val === 'yes' || val === 'true' || val === '1')) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }
    if (input.tagName && input.tagName.toLowerCase() === 'select') {
      const opt = Array.from(input.options).find(function (o) {
        const t = normalizeText(o.text || o.value || '');
        return t.includes(str.toLowerCase()) || normalizeText(str).includes(t);
      });
      if (opt) {
        input.value = opt.value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    input.focus();
    input.value = str;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: str }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    input.blur();
  }

  function findInputByLabel(labelText) {
    const norm = normalizeText(labelText);
    if (!norm) return null;
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea');
    for (const input of inputs) {
      const l = getLabelForInput(input) || input.placeholder || '';
      if (normalizeText(l).includes(norm) || norm.includes(normalizeText(l))) return input;
    }
    return null;
  }

  function fillFromSchemaAndProfile(schema, profile, customAnswers) {
    const tenant = getTenant();
    const answers = (customAnswers && customAnswers.answers && customAnswers.answers[tenant]) || (customAnswers && customAnswers[tenant]) || {};
    const variants = (profile && profile.label_variants) || {};
    const profileKeys = ['first_name', 'last_name', 'full_name', 'email', 'phone', 'location', 'linkedin_url', 'website', 'github_url', 'right_to_work', 'visa_sponsorship', 'how_did_you_hear'];
    let filled = 0;
    for (const field of schema.fields || []) {
      if (field.type === 'file') continue;
      let value = null;
      const labelNorm = normalizeText(field.label);
      for (const key of profileKeys) {
        const vars = variants[key];
        if (!Array.isArray(vars)) continue;
        for (const v of vars) {
          if (normalizeText(v).includes(labelNorm) || labelNorm.includes(normalizeText(v))) {
            value = profile[key];
            break;
          }
        }
        if (value != null) break;
      }
      if (value == null && field.label) value = answers[field.label] || answers[field.label.trim()];
      if (value == null || String(value).trim() === '') continue;
      const input = findInputByLabel(field.label);
      if (input) {
        setInputValue(input, value);
        filled++;
      }
    }
    return filled;
  }

  function runFill() {
    const tenant = getTenant();
    Promise.all([
      fetch(SERVER + '/workday-fields?tenant=' + encodeURIComponent(tenant)).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(SERVER + '/ats-profile').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      fetch(SERVER + '/workday-custom-answers').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (results) {
      const schema = results[0];
      const profile = results[1];
      const customAnswers = results[2];
      if (!schema || !(schema.fields && schema.fields.length)) {
        log('No Workday schema. Capture fields first (click "Capture Workday fields").');
        showToast('No schema. Capture fields first.');
        return;
      }
      if (!profile) {
        log('No ATS profile. Run save-server and ensure ats-application-profile.json exists.');
        showToast('No profile. Start save-server.');
        return;
      }
      const filled = fillFromSchemaAndProfile(schema, profile, customAnswers);
      log('Filled ' + filled + ' fields');
      showToast('Filled ' + filled + ' fields');
    });
  }

  function hasFormFields() {
    return document.querySelectorAll('input:not([type="hidden"]), select, textarea').length > 0;
  }

  function init() {
    const url = (window.location.href || '').toLowerCase();
    if (!url.includes('myworkdayjobs.com')) return;

    var isApplyPage = url.indexOf('/apply') !== -1 || url.indexOf('/job') !== -1;
    var hasForm = hasFormFields();

    if (hasForm) {
      addCaptureButton();
      setTimeout(function () {
        if (hasFormFields()) runFill();
      }, DELAY_MS);
      return;
    }

    if (isApplyPage && !document.getElementById('dex-workday-capture-btn')) {
      addCaptureButton();
      var toastEl = document.getElementById('dex-workday-toast');
      if (toastEl) toastEl.textContent = '';
      showToast('Form not in this frame. Scroll to the form or wait for it to load — button will appear there.');
    }
  }

  var initRetries = 0;
  var MAX_INIT_RETRIES = 5;

  function tryInit() {
    init();
    initRetries += 1;
    if (!document.getElementById('dex-workday-capture-btn') && (window.location.href || '').toLowerCase().includes('myworkdayjobs.com') && initRetries < MAX_INIT_RETRIES) {
      setTimeout(tryInit, 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(tryInit, 500); });
  } else {
    setTimeout(tryInit, 500);
  }
})();
