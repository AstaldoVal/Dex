'use strict';

/**
 * Read Professional Summary from Teal **right-hand resume preview** (export view),
 * not from the left Content Editor (#blurbs). That panel is what recruiters see in PDF.
 *
 * Live Teal (2026-05-29): preview HTML lives in iframe `preview-iframe` (`about:srcdoc`);
 * outer `#resume-preview` is an empty shell. No `data-testid` on the right panel.
 * Some templates label the section **Objective:** instead of **Professional Summary**.
 */

const PS_PREVIEW_END_LABELS = ['Work Experience', 'Experience', 'Skills', 'Education', 'Projects'];

/** @type {string[]} Keep in sync with teal-ui-map.md PS12 section */
const PS_PREVIEW_START_LABELS = ['Professional Summary', 'Objective:', 'Objective'];

const PS_PREVIEW_IFRAME_SELECTORS = [
  '#preview-iframe',
  '#resume-preview iframe',
  'iframe.resume-preview-iframe'
];

/** @type {string[]} Keep in sync with teal-ui-map.md — outer shell + legacy */
const PS_PREVIEW_SELECTOR_ROOTS = [
  '#preview-iframe',
  '#resume-preview',
  '[data-testid="resume-preview"]',
  '[data-testid="resume-preview-container"]',
  '[class*="ResumePreview"]',
  '[class*="resume-preview"]',
  '[class*="ResumeDocument"]'
];

function sliceBetweenSectionLabels(raw, startLabel, endLabels = PS_PREVIEW_END_LABELS) {
  const text = String(raw || '');
  const lower = text.toLowerCase();
  const startIdx = lower.indexOf(startLabel.toLowerCase());
  if (startIdx < 0) return '';

  let tail = text.slice(startIdx + startLabel.length);
  for (const end of endLabels) {
    const endIdx = tail.toLowerCase().indexOf(end.toLowerCase());
    if (endIdx >= 0) {
      tail = tail.slice(0, endIdx);
      break;
    }
  }
  return tail.replace(/\s+/g, ' ').trim();
}

function sliceBetweenAnyStart(raw, startLabels = PS_PREVIEW_START_LABELS, endLabels = PS_PREVIEW_END_LABELS) {
  for (const label of startLabels) {
    const body = sliceBetweenSectionLabels(raw, label, endLabels);
    if (body.length >= 40) return { body, label };
  }
  return { body: '', label: null };
}

/**
 * @param {import('playwright').Page} page
 * @returns {Promise<{ frame: import('playwright').Frame, via: string }>}
 */
async function resolvePreviewFrame(page) {
  const named = page.frame({ name: 'preview-iframe' });
  if (named) return { frame: named, via: 'frame-name:preview-iframe' };

  for (const sel of PS_PREVIEW_IFRAME_SELECTORS) {
    const el = await page.$(sel);
    if (!el) continue;
    const frame = await el.contentFrame();
    if (frame) return { frame, via: `iframe:${sel}` };
  }

  return { frame: page.mainFrame(), via: 'main' };
}

/**
 * @returns {Promise<{ text: string, source: string, debug?: object }>}
 */
async function extractProfessionalSummaryRightPreviewText(page) {
  const { frame, via } = await resolvePreviewFrame(page);
  const isIframePreview = via !== 'main';

  const result = await frame.evaluate(
    ({ isIframePreview, startLabels, endLabels, selectorRoots }) => {
      function cleanSummaryBody(body) {
        return String(body || '')
          .replace(/\bAdd a Professional Summary\b/gi, '')
          .replace(/\bDelete summary\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      function sliceBetween(raw, startLabel) {
        const text = String(raw || '');
        const lower = text.toLowerCase();
        const startIdx = lower.indexOf(startLabel.toLowerCase());
        if (startIdx < 0) return '';
        let tail = text.slice(startIdx + startLabel.length);
        for (const end of endLabels) {
          const endIdx = tail.toLowerCase().indexOf(end.toLowerCase());
          if (endIdx >= 0) {
            tail = tail.slice(0, endIdx);
            break;
          }
        }
        return cleanSummaryBody(tail);
      }

      function sliceAny(raw) {
        for (const label of startLabels) {
          const body = sliceBetween(raw, label);
          if (body.length >= 40) return { body, label };
        }
        return { body: '', label: null };
      }

      function isSummaryHeading(t) {
        const s = String(t || '').trim();
        return (
          /^professional summary$/i.test(s) ||
          /^objective:?$/i.test(s) ||
          (s.length <= 28 && /professional summary|objective/i.test(s))
        );
      }

      if (isIframePreview) {
        const fullRaw = document.body.innerText || document.body.textContent || '';
        let prefix = fullRaw;
        const lowerFull = fullRaw.toLowerCase();
        let cut = fullRaw.length;
        for (const end of endLabels) {
          const idx = lowerFull.indexOf(end.toLowerCase());
          if (idx >= 0) cut = Math.min(cut, idx);
        }
        prefix = fullRaw.slice(0, cut);

        const { body: prefixSlice, label: prefixLabel } = sliceAny(prefix);
        if (prefixSlice.length >= 40) {
          return {
            text: prefixSlice,
            source: `iframe-prefix-slice:${prefixLabel}`,
            debug: { mode: 'iframe' }
          };
        }

        function stripContactHeader(raw) {
          let t = String(raw || '').replace(/\s+/g, ' ').trim();
          const anchors = [/linkedin\.com\/in\/[\w-]+/i, /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i];
          let cutAt = 0;
          for (const re of anchors) {
            const m = t.match(re);
            if (m && m.index != null) cutAt = Math.max(cutAt, m.index + m[0].length);
          }
          if (cutAt > 0) t = t.slice(cutAt).trim();
          return cleanSummaryBody(t);
        }

        const headerless = stripContactHeader(prefix);
        if (headerless.length >= 40) {
          return { text: headerless, source: 'iframe-prefix-after-contact', debug: { mode: 'iframe' } };
        }

        const iframeRoots = [document.body, document.querySelector('main')].filter(Boolean);
        for (const root of iframeRoots) {
          const raw = root.innerText || root.textContent || '';
          const { body, label } = sliceAny(raw);
          if (body.length >= 40) {
            return { text: body, source: `iframe-slice:${label}`, debug: { mode: 'iframe' } };
          }
        }

        const headingCandidates = Array.from(
          document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div, span, strong')
        ).filter((el) => {
          if (!isSummaryHeading(el.textContent)) return false;
          const idx = (fullRaw || '').indexOf((el.textContent || '').trim());
          return idx >= 0 && idx < cut;
        });

        for (const heading of headingCandidates) {
          let container = heading.parentElement;
          for (let depth = 0; depth < 6 && container; depth++) {
            const { body, label } = sliceAny(container.innerText || container.textContent || '');
            if (body.length >= 40) {
              return { text: body, source: 'iframe-heading-container', debug: { depth, label } };
            }
            container = container.parentElement;
          }

          const parts = [];
          let sib = heading.nextElementSibling;
          for (let i = 0; i < 12 && sib; i++) {
            const t = (sib.innerText || sib.textContent || '').trim();
            if (endLabels.some((e) => new RegExp(`^${e}$`, 'i').test(t))) break;
            if (t.length >= 20) parts.push(t);
            sib = sib.nextElementSibling;
          }
          const joined = cleanSummaryBody(parts.join(' '));
          if (joined.length >= 40) {
            return { text: joined, source: 'iframe-heading-siblings' };
          }
        }

        return { text: '', source: 'not_found', debug: { mode: 'iframe' } };
      }

      const addBtn = document.querySelector('[aria-label="Add a Professional Summary"]');
      const blurbs = document.querySelector('#blurbs');

      let leftBoundary = Math.floor(window.innerWidth * 0.42);
      if (blurbs) {
        leftBoundary = blurbs.getBoundingClientRect().right;
      } else if (addBtn) {
        const editorMain = addBtn.closest('main') || addBtn.closest('[class*="editor"]');
        if (editorMain) leftBoundary = editorMain.getBoundingClientRect().right;
      }

      function isRightPreviewNode(el) {
        if (!el || el.nodeType !== 1) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 8) return false;
        const centerX = r.left + r.width / 2;
        if (centerX < leftBoundary + 16) return false;
        if (blurbs && blurbs.contains(el)) return false;
        if (
          el.closest(
            '#blurbs, #work-experience, #target-titles, #skills, #projects, #certifications, #interests, [contenteditable="true"], button[aria-label="Delete summary"]'
          )
        ) {
          return false;
        }
        return true;
      }

      for (const sel of selectorRoots) {
        const root = document.querySelector(sel);
        if (!root || !isRightPreviewNode(root)) continue;
        const { body, label } = sliceAny(root.innerText || root.textContent || '');
        if (body.length >= 40) {
          return { text: body, source: `selector:${sel}:${label}`, debug: { leftBoundary } };
        }
      }

      const headingCandidates = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div, span, strong')
      ).filter((el) => {
        if (!isRightPreviewNode(el)) return false;
        return isSummaryHeading(el.textContent);
      });

      for (const heading of headingCandidates) {
        let container = heading.parentElement;
        for (let depth = 0; depth < 6 && container; depth++) {
          if (!isRightPreviewNode(container)) break;
          const { body, label } = sliceAny(container.innerText || container.textContent || '');
          if (body.length >= 40) {
            return { text: body, source: 'heading-container', debug: { depth, label } };
          }
          container = container.parentElement;
        }

        const parts = [];
        let sib = heading.nextElementSibling;
        for (let i = 0; i < 12 && sib; i++) {
          if (!isRightPreviewNode(sib)) break;
          const t = (sib.innerText || sib.textContent || '').trim();
          if (endLabels.some((e) => new RegExp(`^${e}$`, 'i').test(t))) break;
          if (t.length >= 20) parts.push(t);
          sib = sib.nextElementSibling;
        }
        const joined = cleanSummaryBody(parts.join(' '));
        if (joined.length >= 40) {
          return { text: joined, source: 'heading-siblings' };
        }
      }

      const blocks = Array.from(document.querySelectorAll('section, article, div')).filter((el) => {
        if (!isRightPreviewNode(el)) return false;
        const t = (el.innerText || el.textContent || '').trim();
        if (t.length < 80 || t.length > 12000) return false;
        if (!/professional summary|objective/i.test(t)) return false;
        if (el.querySelector('[contenteditable="true"], button[aria-label*="Delete"]')) return false;
        return true;
      });

      blocks.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.width * ra.height - rb.width * rb.height;
      });

      for (const block of blocks) {
        const { body, label } = sliceAny(block.innerText || block.textContent || '');
        if (body.length >= 40) {
          return { text: body, source: 'right-block-scan', debug: { label } };
        }
      }

      return { text: '', source: 'not_found', debug: { leftBoundary, mode: 'main' } };
    },
    {
      isIframePreview,
      startLabels: PS_PREVIEW_START_LABELS,
      endLabels: PS_PREVIEW_END_LABELS,
      selectorRoots: PS_PREVIEW_SELECTOR_ROOTS
    }
  );

  return {
    ...result,
    debug: { ...(result.debug || {}), previewFrame: via }
  };
}

module.exports = {
  PS_PREVIEW_END_LABELS,
  PS_PREVIEW_START_LABELS,
  PS_PREVIEW_IFRAME_SELECTORS,
  PS_PREVIEW_SELECTOR_ROOTS,
  sliceBetweenSectionLabels,
  sliceBetweenAnyStart,
  resolvePreviewFrame,
  extractProfessionalSummaryRightPreviewText
};
