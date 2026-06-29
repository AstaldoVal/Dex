/**
 * Dex LinkedIn Job Capture — content script.
 * Runs only on LinkedIn job view pages. Reads DOM (same approach as Applicator extension).
 * No Playwright, no headless — user opens the page in their browser; we just parse and export.
 */

(function () {
  const SELECTORS = {
    title: [
      'h1[class*="job-title"]',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title',
      '.jobs-details-top-card__job-title',
      '.jobs-details-top-card__job-title-link',
      'h2.t-24',
      '[data-test-id="job-details"] h1',
      'main h1',
      'h1'
    ],
    company: [
      '.job-details-jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name a',
      '.jobs-details-top-card__company-name',
      '.jobs-details-top-card__company-name-link',
      '[data-test-id="job-company"]',
      'a[href*="/company/"][href*="linkedin.com"]',
      'main a[href*="/company/"]',
      '.jobs-unified-top-card__company-name'
    ],
    location: [
      '.jobs-details-top-card__bullet',
      '.jobs-details-top-card__job-insight',
      '.job-details-jobs-unified-top-card__bullet'
    ],
    description: [
      '[data-testid="expandable-text-box"]',
      '.jobs-box__html-content',
      '.jobs-description-content__text',
      '.jobs-details__main-content',
      '.jobs-description__content',
      'div[class*="jobs-description"]',
      'section[class*="description"]',
      '.jobs-details-content__content',
      '[data-test-id="job-details"]',
      'main',
      'article'
    ],
    showMore: 'button[data-testid="expandable-text-button"], button.jobs-description__footer-button, button[aria-label*="Show more"], button.jobs-details__show-more-button'
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

  // Work type: (1) LinkedIn top card / insights, (2) if unknown, from job description (e.g. "remote position", "hybrid model").
  // Do not infer from location (e.g. Barcelona can be Remote). Only use explicit type or description wording.
  function getWorkTypeFromPage(descriptionText) {
    const topCard = document.querySelector('.job-details-jobs-unified-top-card') ||
      document.querySelector('.jobs-unified-top-card') ||
      document.querySelector('.jobs-details-top-card') ||
      document.querySelector('[data-test-id="job-details"]') ||
      document.querySelector('main');
    const topText = (topCard ? topCard.innerText || '' : (document.body ? document.body.innerText || '' : '')).slice(0, 4000);
    const topLower = topText.toLowerCase();
    if (/\bremote\b/.test(topLower)) return 'remote';
    if (/\bhybrid\b/.test(topLower)) return 'hybrid';
    if (/\bon-?site\b|onsite\b|in-?office\b|in office\b/.test(topLower)) return 'on-site';
    // Fallback: job description may state work type (e.g. "fully remote", "hybrid work model", "on-site only").
    if (descriptionText && typeof descriptionText === 'string' && descriptionText.length > 0) {
      const descSlice = descriptionText.slice(0, 4000).toLowerCase();
      if (/\bremote\b|fully remote|work remotely|remote (?:position|role|work)/.test(descSlice)) return 'remote';
      if (/\bhybrid\b|hybrid (?:work|model|position|role)/.test(descSlice)) return 'hybrid';
      if (/\bon-?site\b|onsite\b|in-?office\b|in office\b|on site only/.test(descSlice)) return 'on-site';
    }
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

  function captureCurrentPage(cb) {
    const jobId = getJobIdFromUrl();
    if (!jobId) {
      if (cb) cb(null);
      return null;
    }

    function getDescriptionElement() {
      var boxes = document.querySelectorAll('[data-testid="expandable-text-box"]');
      if (boxes.length === 0) return null;
      if (boxes.length === 1) return boxes[0];
      var aboutH2 = null;
      var h2s = document.querySelectorAll('h2');
      for (var i = 0; i < h2s.length; i++) {
        if (h2s[i].textContent && h2s[i].textContent.trim().toLowerCase().indexOf('about the job') !== -1) {
          aboutH2 = h2s[i];
          break;
        }
      }
      if (aboutH2) {
        var el = aboutH2;
        while (el && el !== document.body) {
          el = el.parentElement;
          if (el && el.querySelector) {
            var box = el.querySelector('[data-testid="expandable-text-box"]');
            if (box) return box;
          }
        }
      }
      var longest = boxes[0];
      for (var j = 1; j < boxes.length; j++) {
        if (boxes[j].textContent.length > longest.textContent.length) longest = boxes[j];
      }
      return longest;
    }

    function readAndReturn() {
      // Prefer LinkedIn job view DOM blocks that stay stable: title from data-display-contents block, company from aria-label
      var title = '';
      var company = '';
      var titleBlock = document.querySelector('[data-display-contents="true"]');
      if (titleBlock) {
        var firstP = titleBlock.querySelector('p');
        if (firstP) {
          var t = (firstP.textContent || '').trim();
          if (t && t.length >= 3 && t.length <= 120 && t.toLowerCase().indexOf('about the job') === -1 && t.toLowerCase().indexOf('key responsibilities') !== 0) title = t;
        }
      }
      var companyLabelEl = document.querySelector('[aria-label^="Company,"]');
      if (companyLabelEl && companyLabelEl.getAttribute('aria-label')) {
        var label = companyLabelEl.getAttribute('aria-label').replace(/^Company,\s*/i, '').trim().replace(/\.\s*$/, '');
        if (label && label.length >= 2 && label.length <= 120) company = label;
      }
      if (!title || !company) {
        const titleEl = getEl(SELECTORS.title);
        const companyEl = getEl(SELECTORS.company);
        if (!title) title = titleEl ? titleEl.textContent.trim() : '';
        if (!company) company = companyEl ? companyEl.textContent.split('\n')[0].trim() : '';
      }
      const locationEl = getEl(SELECTORS.location);
      let descEl = getDescriptionElement() || getEl(SELECTORS.description);
      if (!descEl) {
        descEl = document.querySelector('.jobs-details-content__content') ||
          document.querySelector('[data-test-id="job-details"]') ||
          document.querySelector('main') ||
          document.querySelector('article');
      }
      if (!title) {
        var h1s = document.querySelectorAll('h1');
        for (var hi = 0; hi < h1s.length; hi++) {
          var t = (h1s[hi].textContent || '').trim();
          if (t && t.length > 1 && t.toLowerCase().indexOf('about the job') === -1 && t.toLowerCase().indexOf('key responsibilities') !== 0) {
            title = t;
            break;
          }
        }
      }
      if (!company) {
        var companyLinks = document.querySelectorAll('a[href*="/company/"]');
        for (var ci = 0; ci < companyLinks.length; ci++) {
          var c = (companyLinks[ci].textContent || '').trim();
          if (c && c.length >= 2 && c.length <= 120) {
            company = c;
            break;
          }
        }
      }
      const location = locationEl ? locationEl.textContent.split('·')[0].trim() : '';
      let description = descEl ? extractText(descEl) : '';
      if (!description || description.length < 100) {
        const bodySection = document.querySelector('#main .scaffold-layout__main') || document.querySelector('#main');
        if (bodySection) description = (description + '\n' + extractText(bodySection)).trim();
      }
      const workType = getWorkTypeFromPage(description);
      const closed = isJobClosed();
      const data = {
        id: jobId,
        url: window.location.href.split('?')[0],
        job_title: title || '—',
        company: company || '—',
        location: location || '',
        work_type: workType,
        job_description: description,
        closed
      };
      if (cb) cb(data);
      return data;
    }

    var expandButtons = document.querySelectorAll(SELECTORS.showMore);
    if (expandButtons.length > 0) {
      expandButtons.forEach(function (btn) {
        if (typeof btn.click === 'function') btn.click();
      });
      setTimeout(readAndReturn, 2500);
    } else {
      readAndReturn();
    }
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

  function getSaveServerUrl(cb) {
    chrome.storage.local.get(['dexSaveServerPort'], function (r) {
      const port = r.dexSaveServerPort || '8765';
      cb('http://127.0.0.1:' + port + '/dex-save');
    });
  }

  function buildExportPayload(captures, digestName) {
    const filterResults = {};
    const jobs = {};
    for (const [jobId, data] of Object.entries(captures)) {
      if (data.closed) {
        filterResults[jobId] = { remove: true };
      } else if (data.work_type === 'hybrid' || data.work_type === 'on-site') {
        filterResults[jobId] = { remove: true };
      } else {
        const typeDisplay = (data.work_type === 'remote' ? 'Remote' : data.work_type === 'unknown' ? 'Unknown' : data.work_type);
        filterResults[jobId] = { remove: false, newLine: null, title: data.job_title, company: data.company, workType: typeDisplay };
        jobs[jobId] = { job_title: data.job_title, company: data.company, work_type: typeDisplay, job_description: data.job_description || '' };
      }
    }
    return {
      digestName: digestName || document.querySelector('meta[property="dex:digest"]')?.getAttribute('content') || '',
      exportedAt: new Date().toISOString(),
      filter: { results: filterResults },
      jobs
    };
  }

  function exportAll() {
    chrome.storage.local.get(['dexJobCaptures'], function (result) {
      const captures = result.dexJobCaptures || {};
      const payload = buildExportPayload(captures, '');
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dex-linkedin-export-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  const DELAY_BEFORE_NEXT_MS = 10000; // Minimum 10 seconds between page transitions

  function goToNextOrFinish() {
    chrome.storage.local.get(['dexCaptureQueue'], function (result) {
      const q = result.dexCaptureQueue;
      if (!q || !q.urls || q.urls.length === 0) {
        showBanner();
        return;
      }
      var nextIndex = (q.index || 0) + 1;
      if (nextIndex >= q.urls.length) {
        const digestName = q.digestName || '';
        chrome.storage.local.get(['dexJobCaptures', 'dexOpenLinksAutoExport'], function (res) {
          chrome.storage.local.remove('dexCaptureQueue', function () {});
          chrome.storage.local.remove('dexOpenLinksAutoExport', function () {});
          if (res.dexOpenLinksAutoExport && res.dexJobCaptures && Object.keys(res.dexJobCaptures).length > 0) {
            const payload = buildExportPayload(res.dexJobCaptures, digestName);
            const filename = 'dex-linkedin-export-' + new Date().toISOString().slice(0, 10) + '.json';
            getSaveServerUrl(function (saveUrl) {
              fetch(saveUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Filename': filename },
              body: JSON.stringify(payload, null, 2)
            }).then(function (r) {
              if (r.ok) console.log('[Dex] Auto-saved export to', filename);
            }).catch(function () {}).finally(function () {
              showBanner();
            });
            });
          } else {
            showBanner();
          }
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
        updateProgressIndicator();
        setTimeout(function () {
          window.location.href = href;
        }, DELAY_BEFORE_NEXT_MS);
      });
    });
  }

  const DELAY_BEFORE_CAPTURE_MS = 10000; // Minimum 10 seconds before capturing page data

  function showProgressIndicator() {
    if (document.getElementById('dex-capture-progress')) {
      updateProgressIndicator();
      return;
    }
    const indicator = document.createElement('div');
    indicator.id = 'dex-capture-progress';
    indicator.innerHTML = '<span>Dex: capturing...</span>';
    indicator.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9999;background:#0a66c2;color:#fff;padding:8px 12px;border-radius:6px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.2);';
    document.body.appendChild(indicator);
    updateProgressIndicator();
  }

  function updateProgressIndicator() {
    const indicator = document.getElementById('dex-capture-progress');
    if (!indicator) return;
    chrome.storage.local.get(['dexCaptureQueue', 'dexJobCaptures'], function (result) {
      const queue = result.dexCaptureQueue;
      const captures = result.dexJobCaptures || {};
      if (queue && queue.urls) {
        const current = queue.index || 0;
        const total = queue.urls.length;
        const captured = Object.keys(captures).length;
        indicator.innerHTML = `<span>Dex: ${current + 1}/${total} (${captured} captured)</span>`;
      } else {
        indicator.innerHTML = '<span>Dex: capturing...</span>';
      }
    });
  }

  function removeProgressIndicator() {
    const el = document.getElementById('dex-capture-progress');
    if (el) el.remove();
  }

  function runCapture() {
    // Check if we're in capture mode (queue exists)
    chrome.storage.local.get(['dexCaptureQueue'], function (result) {
      const q = result.dexCaptureQueue;
      const hasQueue = q && q.urls && q.urls.length > 0;
      
      if (!hasQueue) {
        // Not in capture mode, exit silently
        return;
      }

      // Show progress indicator
      showProgressIndicator();
      
      // Update progress indicator every 2 seconds
      const progressInterval = setInterval(function() {
        chrome.storage.local.get(['dexCaptureQueue'], function (result) {
          const q = result.dexCaptureQueue;
          if (!q || !q.urls || q.urls.length === 0) {
            clearInterval(progressInterval);
            return;
          }
          updateProgressIndicator();
        });
      }, 2000);

      // Wait for page to fully load, then get job ID
      const checkJobId = function() {
        const jobId = getJobIdFromUrl();
        if (!jobId) {
          // Job ID not found yet, wait a bit more
          setTimeout(checkJobId, 1000);
          return;
        }

        // Job ID found, wait for capture delay
        setTimeout(function () {
          captureCurrentPage(function (data) {
            if (!data) {
              removeProgressIndicator();
              goToNextOrFinish();
              return;
            }
            chrome.storage.local.get(['dexJobCaptures', 'dexCaptureQueue', 'dexOpenLinksAutoExport'], function (result) {
            const captures = result.dexJobCaptures || {};
            captures[jobId] = data;
            const updates = { dexJobCaptures: captures };
            const q = result.dexCaptureQueue;
            if (q && q.urls && q.urls.length > 0) {
              var currentIndex = q.index || 0;
              updates.dexCaptureQueue = { urls: q.urls, index: currentIndex, digestName: q.digestName };
            }
            chrome.storage.local.set(updates, function () {
              updateProgressIndicator();
              if (result.dexOpenLinksAutoExport) {
                const workTypeDisplay = (data.work_type === 'remote' ? 'Remote' : data.work_type === 'unknown' ? 'Unknown' : (data.work_type || 'Unknown'));
                getSaveServerUrl(function (saveUrl) {
                  const jobUrl = saveUrl.replace('/dex-save', '/dex-save-job');
                  const payload = {
                    id: jobId,
                    url: window.location.href,
                    job_title: data.job_title || '—',
                    company: data.company || '—',
                    work_type: workTypeDisplay,
                    job_description: data.job_description || ''
                  };
                  console.log('[Dex] POSTing job', jobId, payload.job_title, '—', payload.company);
                  fetch(jobUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  }).then(function (r) {
                    if (r.ok) console.log('[Dex] save-job ok', jobId); else console.warn('[Dex] save-job status', r.status, jobId);
                  }).catch(function (e) {
                    console.warn('[Dex] save-job failed', jobId, e);
                  });
                });
              }
              if (q && q.urls && q.urls.length > 0) {
                goToNextOrFinish();
              } else {
                removeProgressIndicator();
                showBanner();
              }
            });
          });
          });
        }, DELAY_BEFORE_CAPTURE_MS);
      };

      // Start checking for job ID
      checkJobId();
    });
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runCapture);
  } else {
    runCapture();
  }

  // Also listen for SPA navigation (LinkedIn uses client-side routing)
  var target = document.body || document.documentElement;
  if (target) {
    var lastUrl = location.href;
    new MutationObserver(function() {
      var url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(runCapture, 500);
      }
    }).observe(target, { subtree: true, childList: true });
  }
})();
