/**
 * Dex LinkedIn Job Capture — content script.
 * Runs only on LinkedIn job view pages. Reads DOM (same approach as Applicator extension).
 * No Playwright, no headless — user opens the page in their browser; we just parse and export.
 */

(function () {
  const SELECTORS = {
    title: [
      '.jobs-details-top-card__job-title',
      '.jobs-details-top-card__job-title-link',
      'h2.t-24',
      '.job-details-jobs-unified-top-card__job-title',
      'h1[class*="job-title"]'
    ],
    company: [
      '.jobs-details-top-card__company-name',
      '.jobs-details-top-card__company-name-link',
      '.job-details-jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name a',
      '[data-test-id="job-company"]'
    ],
    location: [
      '.jobs-details-top-card__bullet',
      '.jobs-details-top-card__job-insight',
      '.job-details-jobs-unified-top-card__bullet'
    ],
    description: [
      '.jobs-box__html-content',
      '.jobs-description-content__text',
      '.jobs-details__main-content',
      '.jobs-description__content',
      '[data-testid="expandable-text-box"]',
      'div[class*="jobs-description"]',
      'section[class*="description"]'
    ],
    showMore: 'button.jobs-description__footer-button, button[aria-label*="Show more"], button.jobs-details__show-more-button'
  };

  function getEl(selectors) {
    const arr = Array.isArray(selectors) ? selectors : [selectors];
    for (const s of arr) {
      const el = document.querySelector(s);
      if (el && el.textContent && el.textContent.trim().length > 0) return el;
    }
    return null;
  }

  function extractText(root) {
    if (!root) return '';
    let text = '';
    function walk(node) {
      if (node.nodeType === 3) text += node.nodeValue || '';
      else if (node.nodeType === 1) {
        const tag = node.nodeName.toLowerCase();
        if (tag === 'li') text += '\n• ';
        if (tag === 'p' || tag === 'br' || tag === 'div') text += '\n';
        for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
        if (tag === 'p' || tag === 'div') text += '\n';
      }
    }
    walk(root);
    return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  }

  function getWorkTypeFromPage() {
    const body = document.body ? document.body.innerText || '' : '';
    const lower = body.toLowerCase();
    if (/\bhybrid\b/.test(lower)) return 'hybrid';
    if (/\bon-?site\b|onsite\b|in-?office\b|in office\b/.test(lower)) return 'on-site';
    if (/\bremote\b/.test(lower)) return 'remote';
    return 'unknown';
  }

  function isJobClosed() {
    const body = document.body ? document.body.innerText || '' : '';
    return /no longer accepting applications|this (?:job|position) (?:is )?no longer accepting|applications? (?:are )?closed/i.test(body);
  }

  function getJobIdFromUrl() {
    const m = window.location.href.match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : null;
  }

  function captureCurrentPage() {
    const jobId = getJobIdFromUrl();
    if (!jobId) return null;

    const titleEl = getEl(SELECTORS.title);
    const companyEl = getEl(SELECTORS.company);
    const locationEl = getEl(SELECTORS.location);
    const descEl = getEl(SELECTORS.description);

    const showMore = document.querySelector(SELECTORS.showMore);
    if (showMore && typeof showMore.click === 'function') {
      showMore.click();
    }

    const title = titleEl ? titleEl.textContent.trim() : '';
    const company = companyEl ? companyEl.textContent.split('\n')[0].trim() : '';
    const location = locationEl ? locationEl.textContent.split('·')[0].trim() : '';
    const description = descEl ? extractText(descEl) : '';

    const workType = getWorkTypeFromPage();
    const closed = isJobClosed();

    return {
      id: jobId,
      url: window.location.href.split('?')[0],
      job_title: title || '—',
      company: company || '—',
      location: location || '',
      work_type: workType,
      job_description: description,
      closed
    };
  }

  function showBanner() {
    if (document.getElementById('dex-job-capture-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'dex-job-capture-banner';
    banner.innerHTML = `
      <span>Dex: page captured</span>
      <button type="button" id="dex-export-btn">Export for Dex</button>
    `;
    banner.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;background:#0a66c2;color:#fff;padding:8px 12px;border-radius:6px;font-size:13px;display:flex;align-items:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.2);';
    const btn = banner.querySelector('#dex-export-btn');
    btn.style.cssText = 'background:#fff;color:#0a66c2;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-weight:600;';
    btn.addEventListener('click', exportAll);
    document.body.appendChild(banner);
  }

  function exportAll() {
    chrome.storage.local.get(['dexJobCaptures'], function (result) {
      const captures = result.dexJobCaptures || {};
      const filterResults = {};
      const jobs = {};
      for (const [jobId, data] of Object.entries(captures)) {
        if (data.closed) {
          filterResults[jobId] = { remove: true };
        } else if (data.work_type === 'hybrid' || data.work_type === 'on-site') {
          filterResults[jobId] = { remove: true };
        } else {
          const typeDisplay = (data.work_type === 'remote' ? 'Remote' : data.work_type === 'unknown' ? 'Unknown' : data.work_type);
          filterResults[jobId] = {
            remove: false,
            newLine: null,
            title: data.job_title,
            company: data.company,
            workType: typeDisplay
          };
          jobs[jobId] = {
            job_title: data.job_title,
            company: data.company,
            work_type: typeDisplay,
            job_description: data.job_description || ''
          };
        }
      });
      const digestName = document.querySelector('meta[property="dex:digest"]')?.getAttribute('content') || '';
      const payload = {
        digestName,
        exportedAt: new Date().toISOString(),
        filter: { results: filterResults },
        jobs
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dex-linkedin-export-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  const DELAY_BEFORE_NEXT_MS = 4500;

  function goToNextOrFinish() {
    chrome.storage.local.get(['dexCaptureQueue'], function (result) {
      const q = result.dexCaptureQueue;
      if (!q || !q.urls || q.urls.length === 0) {
        showBanner();
        return;
      }
      var nextIndex = (q.index || 0) + 1;
      if (nextIndex >= q.urls.length) {
        chrome.storage.local.remove('dexCaptureQueue', function () {
          showBanner();
        });
        return;
      }
      var nextUrl = q.urls[nextIndex];
      var href = (nextUrl && nextUrl.url) ? nextUrl.url : nextUrl;
      if (!href) {
        showBanner();
        return;
      }
      chrome.storage.local.set({ dexCaptureQueue: { urls: q.urls, index: nextIndex, digestName: q.digestName } }, function () {
        setTimeout(function () {
          window.location.href = href;
        }, DELAY_BEFORE_NEXT_MS);
      });
    });
  }

  function runCapture() {
    const jobId = getJobIdFromUrl();
    if (!jobId) return;
    setTimeout(function () {
      const data = captureCurrentPage();
      if (!data) return;
      chrome.storage.local.get(['dexJobCaptures', 'dexCaptureQueue'], function (result) {
        const captures = result.dexJobCaptures || {};
        captures[jobId] = data;
        const updates = { dexJobCaptures: captures };
        const q = result.dexCaptureQueue;
        if (q && q.urls && q.urls.length > 0) {
          var currentIndex = q.index || 0;
          updates.dexCaptureQueue = { urls: q.urls, index: currentIndex, digestName: q.digestName };
        }
        chrome.storage.local.set(updates, function () {
          if (q && q.urls && q.urls.length > 0) {
            goToNextOrFinish();
          } else {
            showBanner();
          }
        });
      });
    }, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runCapture);
  } else {
    runCapture();
  }
})();
