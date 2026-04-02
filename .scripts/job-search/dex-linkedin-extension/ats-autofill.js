/**
 * Dex ATS Autofill — content script for application forms (Ashby, Greenhouse, HiBob, Teamtailor, Navero, etc.).
 * Loads profile from http://127.0.0.1:8765/ats-profile (save-server) or chrome.storage.local.
 * Finds form fields by label text and fills values; dispatches input/change for React/Vue.
 * Skips Resume and Cover Letter (file inputs).
 * Navero: fills email, requests code from GET /navero-code (Gmail), fills code and submits, then fills clarifying form.
 */
(function () {
  const PROFILE_URL = 'http://127.0.0.1:8765/ats-profile';
  const CAPTURE_FIELDS_URL = 'http://127.0.0.1:8765/ats-capture-fields';
  const NAVERO_CODE_URL = 'http://127.0.0.1:8765/navero-code';
  const DELAY_MS = 1800;
  const NAVERO_WAIT_AFTER_EMAIL_MS = 12000;
  const NAVERO_POLL_CODE_MS = 3000;
  const NAVERO_POLL_CODE_MAX = 20;
  const NAVERO_AFTER_CODE_SUBMIT_MS = 2500;
  const FILL_ORDER = [
    'first_name',
    'last_name',
    'full_name',
    'email',
    'preferred_language',
    'preferred_communication',
    'phone_country_code',
    'phone_number',
    'phone',
    'location',
    'country',
    'city',
    'linkedin_url',
    'website',
    'github_url',
    'twitter_url',
    'right_to_work',
    'visa_sponsorship',
    'earliest_start_date',
    'salary_expectations',
    'how_did_you_hear',
    'family_at_company',
    'family_at_company_details',
    'outside_business_activity',
    'outside_business_activity_details',
    'worked_here_before',
    'agree_terms',
    'agree_terms_2'
  ];
  const YES_NO_KEYS = ['right_to_work', 'visa_sponsorship', 'family_at_company', 'outside_business_activity', 'worked_here_before'];

  function normalizeText(s) {
    if (typeof s !== 'string') return '';
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function getVisibleText(el) {
    if (!el || !el.getAttribute) return '';
    const aria = el.getAttribute('aria-label') || el.getAttribute('placeholder');
    if (aria) return aria;
    const text = (el.innerText || el.textContent || '').trim();
    return text;
  }

  function getLabelForInput(input) {
    if (!input || !input.id) return '';
    const labelEl = document.querySelector('label[for="' + input.id.replace(/"/g, '\\"') + '"]');
    if (labelEl) return getVisibleText(labelEl).trim();
    const aria = input.getAttribute('aria-label') || input.getAttribute('placeholder');
    if (aria) return aria.trim();
    let p = input.closest('label');
    if (p) return getVisibleText(p).trim();
    p = input.closest('[role="group"]');
    if (p) return getVisibleText(p).trim();
    p = input.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      const t = (p.querySelector('label, [class*="label"], span, div') && getVisibleText(p)) || '';
      if (t && t.length < 200) return t.trim();
      p = p.parentElement;
    }
    return '';
  }

  function collectFormFields() {
    const out = [];
    const seen = new Set();
    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea');
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      if (inp.disabled || (inp.offsetParent === null && inp.type !== 'hidden')) continue;
      const key = (inp.name || '') + '|' + (inp.id || '') + '|' + (inp.type || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const label = getLabelForInput(inp) || inp.getAttribute('placeholder') || inp.getAttribute('aria-label') || inp.name || inp.id || '';
      const tag = (inp.tagName || '').toLowerCase();
      const type = (inp.type || '').toLowerCase();
      const rec = { label: (label || '').trim().slice(0, 300), type: type || tag, name: inp.name || '', id: inp.id || '' };
      if (tag === 'select') {
        rec.options = [];
        for (let j = 0; j < inp.options.length; j++) {
          const o = inp.options[j];
          rec.options.push({ value: (o.value || '').slice(0, 200), text: (o.text || '').trim().slice(0, 200) });
        }
      }
      out.push(rec);
    }
    return out;
  }

  function findInputForLabel(labelEl) {
    if (!labelEl) return null;
    const forId = labelEl.getAttribute('for');
    if (forId) {
      const input = document.getElementById(forId) || document.querySelector(`[id="${forId}"]`);
      if (input && (input.matches('input, select, textarea') || input.querySelector('input, select, textarea')))
        return input.matches('input, select, textarea') ? input : input.querySelector('input, select, textarea');
    }
    const inside = labelEl.querySelector('input, select, textarea');
    if (inside) return inside;
    let parent = labelEl.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      const inputs = parent.querySelectorAll('input:not([type="file"]), select, textarea');
      for (const inp of inputs) {
        if (!inp.disabled && inp.offsetParent !== null) return inp;
      }
      parent = parent.parentElement;
    }
    let next = labelEl.nextElementSibling;
    for (let j = 0; j < 3 && next; j++) {
      const inp = next.querySelector('input:not([type="file"]), select, textarea') || (next.matches('input, select, textarea') ? next : null);
      if (inp && !inp.disabled && inp.offsetParent !== null) return inp;
      next = next.nextElementSibling;
    }
    return null;
  }

  function inputSuitsKey(input, labelEl, key) {
    if (!input) return false;
    const tag = (input.tagName || '').toLowerCase();
    const type = (input.type || '').toLowerCase();
    const labelText = (labelEl && getVisibleText(labelEl)) || '';
    const labelNorm = normalizeText(labelText);
    if (key === 'phone_country_code') {
      return tag === 'select' && (labelNorm.includes('country') || labelNorm.includes('codephone') || labelNorm.includes('code'));
    }
    if (key === 'phone_number') {
      if (tag === 'select') return false;
      return labelNorm.includes('phone') || labelNorm.includes('number');
    }
    if (key === 'phone') {
      if (tag === 'select') return false;
      if (labelNorm.includes('country') || (labelNorm.includes('location') && !labelNorm.includes('phone'))) return false;
      return true;
    }
    if (key === 'location' || key === 'country') {
      if (type === 'tel') return false;
      if (labelNorm.includes('phone') || labelNorm.includes('telephone')) return false;
      if (key === 'country' && tag !== 'select' && type !== 'radio') return false;
      return true;
    }
    return true;
  }

  function findLabelByVariant(variants, filledInputs, key) {
    if (!Array.isArray(variants) || variants.length === 0) return null;
    const candidates = document.querySelectorAll('label, [role="group"], .form-group, [class*="field"], [class*="label"], span, div, p');
    for (const el of candidates) {
      const text = getVisibleText(el);
      if (!text || text.length > 500) continue;
      const norm = normalizeText(text);
      for (const v of variants) {
        const vNorm = normalizeText(v);
        if (vNorm.length < 2) continue;
        const match = norm.includes(vNorm) || vNorm.includes(norm) || norm === vNorm;
        if (match) {
          const input = findInputForLabel(el);
          if (input && !filledInputs.has(input) && input.type !== 'file' && inputSuitsKey(input, el, key)) return { input, label: el };
        }
      }
    }
    return null;
  }

  function setInputValue(input, value) {
    if (!input || value == null || value === undefined) return;
    const str = String(value).trim();
    const tag = (input.tagName || '').toLowerCase();
    if (input.type === 'radio' || input.type === 'checkbox') {
      const val = str.toLowerCase();
      if (val === 'yes' || val === 'no') {
        if ((val === 'yes' && input.value && normalizeText(input.value).includes('yes')) || (val === 'no' && input.value && normalizeText(input.value).includes('no')) || (input.value && normalizeText(input.value) === val)) {
          input.checked = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }
      if (input.type === 'radio' && input.name) {
        const group = document.querySelectorAll('input[type="radio"][name="' + input.name.replace(/"/g, '\\"') + '"]');
        const match = Array.from(group).find(function (r) {
          const label = (r.nextElementSibling && (r.nextElementSibling.textContent || '').trim()) || (r.closest('label') && (r.closest('label').textContent || '').trim()) || r.value || '';
          const n = normalizeText(label);
          return n.includes(val) || val.includes(n) || (r.value && normalizeText(r.value).includes(val));
        });
        if (match) {
          match.checked = true;
          match.dispatchEvent(new Event('change', { bubbles: true }));
          match.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      return;
    }
    if (tag === 'select') {
      const strNorm = normalizeText(str);
      const opt = Array.from(input.options).find(o => {
        const textNorm = normalizeText(o.text || '');
        const valueNorm = normalizeText(o.value || '');
        return textNorm.includes(strNorm) || valueNorm.includes(strNorm) || strNorm.includes(textNorm) || strNorm.includes(valueNorm);
      });
      if (opt) {
        input.value = opt.value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
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

  function findAndSelectYesNo(variants, value, filledInputs) {
    if (!Array.isArray(variants) || variants.length === 0) return false;
    const val = String(value).trim().toLowerCase();
    const wantYes = val === 'yes';
    const candidates = document.querySelectorAll('label, [role="group"], [class*="question"], [class*="field"], div, p, span');
    for (const el of candidates) {
      const text = getVisibleText(el);
      if (!text || text.length > 600) continue;
      const norm = normalizeText(text);
      let matched = false;
      for (const v of variants) {
        const vNorm = normalizeText(v);
        if (vNorm.length < 3) continue;
        if (norm.includes(vNorm) || vNorm.includes(norm)) { matched = true; break; }
      }
      if (!matched) continue;
      let container = el;
      for (let up = 0; up < 8 && container; up++) {
        const radios = container.querySelectorAll('input[type="radio"]');
        if (radios.length >= 2) {
          for (const r of radios) {
            const labelText = (r.nextElementSibling && getVisibleText(r.nextElementSibling)) || (r.closest('label') && getVisibleText(r.closest('label'))) || (r.getAttribute('aria-label') || r.value || '');
            const n = normalizeText(labelText);
            const isYes = n.includes('yes');
            const isNo = n.includes('no');
            if (wantYes && isYes && !filledInputs.has(r)) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); filledInputs.add(r); return true; }
            if (!wantYes && isNo && !filledInputs.has(r)) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); filledInputs.add(r); return true; }
          }
        }
        const sel = container.querySelector('select');
        if (sel && !filledInputs.has(sel)) {
          const opt = Array.from(sel.options).find(o => {
            const t = normalizeText(o.text || o.value);
            return (wantYes && t.includes('yes')) || (!wantYes && (t.includes('no') || t.includes('don\'t')));
          });
          if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); filledInputs.add(sel); return true; }
        }
        container = container.parentElement;
      }
    }
    return false;
  }

  /** Adecco (recruitmentplatform.com): fill by known field ids when label matching misses. */
  function fillAdeccoByIds(profile) {
    const map = [
      { id: 'first_name_2', value: profile.first_name },
      { id: 'last_name_3', value: profile.last_name },
      { id: 'preferred_communication_language_of_the_candidate_4', value: 'preferred_communication_language_of_the_candidate_uk' },
      { id: 'custom_question_918_5', value: 'custom_question_918_phone_call' },
      { id: 'country-code_phone__mobile__6', value: profile.phone_country_code || 'PT' },
      { id: 'phone-number_phone__mobile__6', value: profile.phone_number || profile.phone ? profile.phone.replace(/^\+?\d+/, '').trim() : '' },
      { id: 'e-mail_address_7', value: profile.email },
      { id: 'dps_dps_17', value: 'true' },
      { id: 'dps_dps_18', value: 'true' }
    ];
    let n = 0;
    for (const { id, value } of map) {
      if (value == null || String(value).trim() === '') continue;
      const el = document.getElementById(id);
      if (!el) continue;
      setInputValue(el, value);
      n++;
    }
    return n;
  }

  function fillForm(profile) {
    const filledInputs = new Set();
    const filledKeys = new Set();
    const variants = profile.label_variants || {};
    let filled = 0;
    for (const key of FILL_ORDER) {
      const value = profile[key];
      if (value == null || value === undefined) continue;
      if ((key === 'website' || key === 'twitter_url' || key === 'family_at_company_details' || key === 'outside_business_activity_details') && String(value).trim() === '') continue;
      if (YES_NO_KEYS.includes(key)) {
        const v = variants[key];
        if (findAndSelectYesNo(v, value, filledInputs)) { filled++; filledKeys.add(key); }
        continue;
      }
      if (key === 'full_name') {
        if (filledKeys.has('first_name') || filledKeys.has('last_name')) continue;
        const nameVariants = variants.full_name_single_field || variants.first_name || ['Name'];
        const found = findLabelByVariant(nameVariants, filledInputs, 'full_name');
        if (found && profile.full_name) {
          setInputValue(found.input, profile.full_name);
          filledInputs.add(found.input);
          filledKeys.add(key);
          filled++;
        }
        continue;
      }
      const labelVariants = variants[key];
      if (!labelVariants) continue;
      const found = findLabelByVariant(labelVariants, filledInputs, key);
      if (found) {
        setInputValue(found.input, value);
        filledInputs.add(found.input);
        filledKeys.add(key);
        filled++;
      }
    }
    return filled;
  }

  function loadProfile() {
    function log(msg) { if (typeof console !== 'undefined') console.log('[Dex ATS]', msg); }
    function fallbackStorage(resolve) {
      chrome.storage.local.get('atsProfile', function (data) {
        if (data && data.atsProfile) {
          log('Profile loaded from storage (fallback)');
          resolve(data.atsProfile);
        } else {
          log('Profile not loaded. Is save-server running? Run: npm run dex-save-server');
          resolve(null);
        }
      });
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return new Promise(function (resolve) {
        var done = false;
        function finish(profile) {
          if (done) return;
          done = true;
          resolve(profile);
        }
        var t = setTimeout(function () {
          if (done) return;
          log('Profile request timed out, trying storage...');
          fallbackStorage(finish);
        }, 9000);
        chrome.runtime.sendMessage({ action: 'atsProfile' }, function (r) {
          if (chrome.runtime.lastError) {
            log('Profile message error: ' + (chrome.runtime.lastError.message || 'port closed'));
            clearTimeout(t);
            // Background may be priming storage; retry storage once after 2.5s
            fallbackStorage(function (p) {
              if (p) finish(p);
              else {
                setTimeout(function () {
                  chrome.storage.local.get('atsProfile', function (data) {
                    if (data && data.atsProfile) { log('Profile loaded from storage (retry)'); finish(data.atsProfile); }
                    else finish(null);
                  });
                }, 2500);
              }
            });
            return;
          }
          clearTimeout(t);
          if (r && r.ok && r.profile) {
            log('Profile loaded from save-server');
            finish(r.profile);
          } else {
            fallbackStorage(finish);
          }
        });
      });
    }
    return fetch(PROFILE_URL, { method: 'GET', mode: 'cors' })
      .then(r => { if (r.ok) return r.json(); throw new Error('Not found'); })
      .then(p => { log('Profile loaded from fetch'); return p; })
      .catch(() => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          return new Promise(resolve => {
            chrome.storage.local.get('atsProfile', (data) => {
              if (data && data.atsProfile) resolve(data.atsProfile);
              else { log('Profile not loaded'); resolve(null); }
            });
          });
        }
        return null;
      });
  }

  function findInputByPlaceholderOrLabel(placeholders) {
    const inputs = document.querySelectorAll('input:not([type="file"]):not([type="hidden"])');
    for (const inp of inputs) {
      const p = (inp.getAttribute('placeholder') || inp.getAttribute('aria-label') || '').toLowerCase();
      const parentText = (inp.closest('label') && getVisibleText(inp.closest('label'))) || (inp.parentElement && getVisibleText(inp.parentElement)) || '';
      const combined = (p + ' ' + parentText).toLowerCase();
      for (const ph of placeholders) {
        if (combined.includes(ph.toLowerCase())) return inp;
      }
    }
    return null;
  }

  function findButtonByText(texts) {
    // Navero: exact match for green "Send Verification Code" button
    const greenBtns = document.querySelectorAll('button[class*="bg-green"]');
    for (const btn of greenBtns) {
      const t = normalizeText(getVisibleText(btn)).toLowerCase();
      if (t === 'send verification code' || (t.includes('send') && t.includes('verification')))
        return btn;
    }
    const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"], a[class*="button"]');
    for (const btn of buttons) {
      const raw = getVisibleText(btn);
      const t = normalizeText(raw).toLowerCase();
      for (const text of texts) {
        const want = normalizeText(text).toLowerCase();
        if (want.length >= 2 && (t.includes(want) || want.includes(t))) return btn;
      }
    }
    return null;
  }

  function fetchNaveroCode() {
    function log(msg) { if (typeof console !== 'undefined') console.log('[Dex ATS]', msg); }
    var CODE_MAX_AGE_MS = 120000;
    var MESSAGE_TIMEOUT_MS = 13000;
    return new Promise(function (resolve) {
      var done = false;
      function useCode(code) { if (!done) { done = true; resolve({ ok: true, code: code }); } }
      function noCode() { if (!done) { done = true; resolve({ ok: false }); } }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['naveroCode', 'naveroCodeTime'], function (data) {
          if (data.naveroCode && data.naveroCodeTime && (Date.now() - data.naveroCodeTime) < CODE_MAX_AGE_MS) {
            log('Code from storage');
            useCode(data.naveroCode);
            return;
          }
          if (typeof chrome.runtime !== 'undefined' && chrome.runtime.sendMessage) {
            var t = setTimeout(function () { noCode(); }, MESSAGE_TIMEOUT_MS);
            chrome.runtime.sendMessage({ action: 'naveroCode' }, function (r) {
              clearTimeout(t);
              if (r && r.ok && r.code) useCode(r.code);
              else noCode();
            });
          } else noCode();
        });
      } else noCode();
    });
  }

  function findNaveroCodeInput() {
    return document.getElementById('otp') ||
      document.querySelector('input[data-input-otp="true"]') ||
      document.querySelector('input[inputmode="numeric"][maxlength="6"]') ||
      findInputByPlaceholderOrLabel(['code', 'verification', 'otp', 'pin']);
  }

  function findNaveroVerifyButton() {
    var greenBtns = document.querySelectorAll('button[class*="bg-green"]');
    for (var i = 0; i < greenBtns.length; i++) {
      var t = normalizeText(getVisibleText(greenBtns[i])).toLowerCase();
      if (t.indexOf('verify') !== -1 && t.indexOf('code') !== -1) return greenBtns[i];
    }
    return findButtonByText(['verify code', 'verify', 'continue', 'submit', 'confirm', 'next']);
  }

  function submitCodeAndThenFillForm(profile) {
    function log(msg) { if (typeof console !== 'undefined') console.log('[Dex ATS]', msg); }
    function tryFillCode(attempt) {
      if (attempt > 0 && attempt <= NAVERO_POLL_CODE_MAX) log('Fetching code attempt ' + attempt + '/' + NAVERO_POLL_CODE_MAX);
      fetchNaveroCode().then(function (data) {
        if (data.ok && data.code) {
          log('Code received, filling...');
          var codeInput = findNaveroCodeInput();
          if (codeInput) {
            setInputValue(codeInput, data.code);
            function clickVerify() {
              var verifyBtn = findNaveroVerifyButton();
              if (!verifyBtn) { log('Verify Code button not found'); return; }
              verifyBtn.scrollIntoView({ block: 'center' });
              verifyBtn.focus();
              verifyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window, cancelable: true }));
              verifyBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window, cancelable: true }));
              verifyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window, cancelable: true }));
              log('Verify Code clicked, will fill form in ' + (NAVERO_AFTER_CODE_SUBMIT_MS / 1000) + 's');
            }
            setTimeout(clickVerify, 600);
            setTimeout(function () { if (findNaveroVerifyButton() && findNaveroVerifyButton().disabled) setTimeout(clickVerify, 800); }, 1200);
            setTimeout(function () { fillForm(profile); }, NAVERO_AFTER_CODE_SUBMIT_MS + 600);
          } else { log('Code input not found'); }
          return;
        }
        if (attempt < NAVERO_POLL_CODE_MAX) setTimeout(function () { tryFillCode(attempt + 1); }, NAVERO_POLL_CODE_MS);
      });
    }
    tryFillCode(1);
  }

  function naveroFlow(profile) {
    function log(msg) { if (typeof console !== 'undefined') console.log('[Dex ATS]', msg); }
    log('Navero flow started');
    const emailInput = document.querySelector('input[type="email"]') || findInputByPlaceholderOrLabel(['email', 'e-mail']);
    const codeInput = findNaveroCodeInput();
    if (codeInput && !emailInput) {
      log('Code step detected, fetching code...');
      submitCodeAndThenFillForm(profile);
      return;
    }
    if (emailInput && (emailInput.value || '').trim() === '' && profile.email) {
      log('Email field found, filling and sending code...');
      setInputValue(emailInput, profile.email);
      // Only match the email→code button; avoid "Continue"/"Submit" on the same page
      const sendBtn = findButtonByText(['send verification code', 'send code', 'get code', 'verification code']);
      if (sendBtn) {
        sendBtn.scrollIntoView({ block: 'center' });
        sendBtn.focus();
        sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, view: window, cancelable: true }));
        sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window, cancelable: true }));
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, view: window, cancelable: true }));
        log('Send Verification Code clicked. Waiting ' + (NAVERO_WAIT_AFTER_EMAIL_MS / 1000) + 's for email, then will fetch code.');
        setTimeout(function () { submitCodeAndThenFillForm(profile); }, NAVERO_WAIT_AFTER_EMAIL_MS);
      } else {
        log('Send code button not found, trying to fetch code anyway');
        submitCodeAndThenFillForm(profile);
      }
      return;
    }
    if (codeInput) {
      log('Code field visible, fetching code...');
      submitCodeAndThenFillForm(profile);
      return;
    }
    log('No email/code step, filling form directly');
    fillForm(profile);
  }

  function run() {
    if (typeof console !== 'undefined') console.log('[Dex ATS] Running on', window.location.hostname);
    var host = (window.location.hostname || '').toLowerCase();
    var extraDelay = host === 'app.navero.me' ? 2000 : 0;
    function doRun() {
      loadProfile().then(profile => {
        if (!profile || typeof profile !== 'object') {
          if (typeof console !== 'undefined') console.log('[Dex ATS] No profile — exit. Start save-server: npm run dex-save-server');
          return;
        }
        if (host === 'app.navero.me') {
          naveroFlow(profile);
        } else {
          var count = fillForm(profile);
          if (host === 'adecco.recruitmentplatform.com' || (host || '').endsWith('recruitmentplatform.com')) {
            var adeccoCount = fillAdeccoByIds(profile);
            if (adeccoCount > 0) count += adeccoCount;
            if (typeof console !== 'undefined') console.log('[Dex ATS] Filled', count, 'fields (Adecco by-id:', adeccoCount, ')');
          } else {
            if (typeof console !== 'undefined') console.log('[Dex ATS] Filled', count, 'fields');
          }
        }
      });
    }
    if (extraDelay > 0) setTimeout(doRun, extraDelay);
    else doRun();
  }

  var delay = (window.location.hostname || '').toLowerCase() === 'app.navero.me' ? 5000 : DELAY_MS;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(run, delay));
  } else {
    setTimeout(run, delay);
  }

  function showCaptureToast(message, isError) {
    var div = document.createElement('div');
    div.id = 'dex-ats-capture-toast';
    div.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;padding:12px 20px;border-radius:8px;font-family:sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2);max-width:320px;' + (isError ? 'background:#f8d7da;color:#721c24;' : 'background:#d4edda;color:#155724;');
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 5000);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (msg.action === 'fillAtsForm') {
        loadProfile().then(function (profile) {
          if (!profile || typeof profile !== 'object') {
            if (typeof console !== 'undefined') console.log('[Dex ATS] No profile for manual fill');
            sendResponse({ filled: 0, error: 'No profile' });
            showCaptureToast('Dex: No profile. Start save-server (npm run dex-save-server).', true);
            return;
          }
          var host = (window.location.hostname || '').toLowerCase();
          var count = fillForm(profile);
          if (host === 'adecco.recruitmentplatform.com' || (host || '').endsWith('recruitmentplatform.com')) {
            count += fillAdeccoByIds(profile);
          }
          sendResponse({ filled: count });
          showCaptureToast('Dex: filled ' + count + ' fields.');
        }).catch(function () { sendResponse({ filled: 0 }); });
        return true;
      }
      if (msg.action !== 'captureAtsFields') return;
      var fields = collectFormFields();
      var payload = { url: window.location.href, title: document.title || '', fields: fields };
      fetch(CAPTURE_FIELDS_URL, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok && r.status === 404) {
          sendResponse({ ok: false, error: '404 — restart save-server (npm run dex-save-server) and reload extension.' });
          showCaptureToast('Dex: 404 — restart save-server, then try again.', true);
          return null;
        }
        return r.json();
      }).then(function (data) {
        if (!data) return;
        if (typeof console !== 'undefined') console.log('[Dex ATS] Captured', fields.length, 'fields →', data.path || data);
        sendResponse({ ok: !!data.ok, count: fields.length, path: data.path });
        if (data.ok) {
          showCaptureToast('Dex: captured ' + fields.length + ' fields. Tell the assistant in Cursor: "fill the form" or "captured".');
        } else {
          showCaptureToast('Dex: capture failed — ' + (data.error || 'unknown'), true);
        }
      }).catch(function (err) {
        if (typeof console !== 'undefined') console.warn('[Dex ATS] Capture POST failed:', err);
        sendResponse({ ok: false, error: err.message });
        showCaptureToast('Dex: capture failed — is save-server running? (npm run dex-save-server)', true);
      });
      return true;
    });
  }
})();
