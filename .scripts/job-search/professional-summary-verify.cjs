'use strict';

/**
 * PS12 — Verify Teal right preview / PDF Professional Summary matches feedback.json replace text.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MIN_LEN_RATIO = 0.72;
const MIN_SENTENCE_COVERAGE = 0.75;
const MIN_OPENING_ANCHOR_CHARS = 32;

function normalizeSummaryForCompare(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2014\u2013]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSummarySentences(text) {
  return String(text || '')
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 18);
}

function sentenceWordsPresent(sentenceNorm, actualNorm) {
  const words = sentenceNorm.split(' ').filter((w) => w.length > 3);
  if (!words.length) return true;
  const found = words.filter((w) => actualNorm.includes(w)).length;
  return found / words.length;
}

/**
 * @returns {{ pass: boolean, reason: string|null, coverage: number, lenRatio: number, missingSentences: string[], detail: string|null }}
 */
function compareSummaryTexts(expected, actual) {
  const expN = normalizeSummaryForCompare(expected);
  const actN = normalizeSummaryForCompare(actual);

  const base = {
    coverage: 0,
    lenRatio: actN.length && expN.length ? actN.length / expN.length : 0,
    missingSentences: [],
    detail: null
  };

  if (!expN) {
    return { ...base, pass: false, reason: 'empty_expected' };
  }
  if (!actN) {
    return { ...base, pass: false, reason: 'empty_actual' };
  }

  const lenRatio = actN.length / expN.length;
  base.lenRatio = lenRatio;

  if (lenRatio < MIN_LEN_RATIO) {
    return {
      ...base,
      pass: false,
      reason: 'truncated',
      detail: `preview/PDF ${actN.length} chars vs feedback ${expN.length} (${Math.round(lenRatio * 100)}%)`
    };
  }

  const openAnchor = expN.slice(0, Math.min(60, expN.length));
  const openNeed = Math.min(MIN_OPENING_ANCHOR_CHARS, openAnchor.length);
  if (openNeed >= 20 && !actN.includes(openAnchor.slice(0, openNeed))) {
    const first = splitSummarySentences(expected)[0];
    const firstN = normalizeSummaryForCompare(first);
    const firstNeed = Math.min(40, firstN.length);
    if (!firstN || (firstNeed >= 20 && !actN.includes(firstN.slice(0, firstNeed)))) {
      return {
        ...base,
        pass: false,
        reason: 'wrong_text',
        detail: 'opening of right preview / PDF text does not match feedback.json (likely stale paste or wrong block)'
      };
    }
  }

  const sentences = splitSummarySentences(expected);
  if (!sentences.length) {
    const chunk = expN.slice(0, Math.min(120, expN.length));
    const pass = actN.includes(chunk.slice(0, Math.min(80, chunk.length)));
    return {
      ...base,
      pass,
      coverage: pass ? 1 : 0,
      reason: pass ? null : 'content_mismatch',
      detail: pass ? null : 'no sentence anchors matched'
    };
  }

  let hit = 0;
  const missing = [];
  for (const s of sentences) {
    const sn = normalizeSummaryForCompare(s);
    if (sn.length < 15) continue;
    const ratio = sentenceWordsPresent(sn, actN);
    if (ratio >= MIN_SENTENCE_COVERAGE) hit++;
    else missing.push(s.slice(0, 100));
  }

  const coverage = hit / sentences.length;
  base.coverage = coverage;
  base.missingSentences = missing.slice(0, 4);

  if (coverage < MIN_SENTENCE_COVERAGE) {
    return {
      ...base,
      pass: false,
      reason: 'content_mismatch',
      detail: `only ${Math.round(coverage * 100)}% of feedback sentences found in Teal/PDF`
    };
  }

  return { ...base, pass: true, reason: null };
}

function resolvePdftotextBin() {
  for (const bin of ['pdftotext', '/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext']) {
    try {
      execSync(`"${bin}" -v`, { stdio: 'ignore' });
      return bin;
    } catch (_) {}
  }
  return null;
}

function extractPdfText(pdfPath) {
  const bin = resolvePdftotextBin();
  if (!bin || !pdfPath || !fs.existsSync(pdfPath)) return null;
  try {
    return execSync(`"${bin}" "${pdfPath}" -`, {
      encoding: 'utf8',
      maxBuffer: 15 * 1024 * 1024
    });
  } catch (_) {
    return null;
  }
}

function normalizePdfText(text) {
  return String(text || '')
    .replace(/\u00ad/g, '')
    .replace(/\u200b/g, '')
    .replace(/\u00a0/g, ' ');
}

/** Extract Professional Summary body from Teal-exported PDF text. */
function extractProfessionalSummaryFromPdfText(pdfText) {
  const text = normalizePdfText(pdfText);
  if (!text.trim()) return '';

  const patterns = [
    /Professional Summary\s*\n+([\s\S]*?)(?:\n\s*Work Experience|\n\s*Experience\s*\n|\n\s*Skills\s*\n|\n\s*Education\s*\n|$)/i,
    /PROFESSIONAL SUMMARY\s*\n+([\s\S]*?)(?:\n\s*WORK EXPERIENCE|\n\s*EXPERIENCE\s*\n|\n\s*SKILLS\s*\n|$)/i
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && m[1].trim().length >= 40) {
      return m[1].trim();
    }
  }

  const idx = text.search(/Professional Summary/i);
  if (idx >= 0) {
    const tail = text.slice(idx + 'Professional Summary'.length);
    const end = tail.search(/\n\s*(Work Experience|Experience|Skills|Education)\b/i);
    const block = (end >= 0 ? tail.slice(0, end) : tail).trim();
    if (block.length >= 40) return block;
  }

  return '';
}

function verifyProfessionalSummaryAgainstExpected(expectedText, actualText, label = 'preview') {
  const result = compareSummaryTexts(expectedText, actualText);
  return {
    ...result,
    label,
    expected_chars: String(expectedText || '').length,
    actual_chars: String(actualText || '').length
  };
}

function recordProfessionalSummaryVerifyMeta(feedback, previewVerify, pdfVerify) {
  if (!feedback) return;
  if (!feedback.meta) feedback.meta = {};
  feedback.meta.professional_summary_verify = {
    recorded_at: new Date().toISOString(),
    preview: previewVerify || null,
    pdf: pdfVerify || null,
    pass:
      (!previewVerify || previewVerify.pass !== false) &&
      (!pdfVerify || pdfVerify.pass !== false)
  };
}

function validateProfessionalSummaryVerifyMeta(feedback) {
  const row = feedback && feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return [];

  const v = feedback.meta && feedback.meta.professional_summary_verify;
  if (!v) return [];

  const failures = [];
  if (v.preview && v.preview.pass === false) {
    failures.push(
      `Professional Summary preview mismatch (PS12): ${v.preview.reason || 'mismatch'} — ${v.preview.detail || ''}`
    );
  }
  if (v.pdf && v.pdf.pass === false) {
    failures.push(
      `Professional Summary PDF mismatch (PS12): ${v.pdf.reason || 'mismatch'} — ${v.pdf.detail || ''}`
    );
  }
  return failures;
}

const PS12_CHAT_MARKER_START = '=== STEP10_PS12_CHAT_REPORT_START ===';
const PS12_CHAT_MARKER_END = '=== STEP10_PS12_CHAT_REPORT_END ===';

function snippetOneLine(text, max = 140) {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '(пусто)';
  return s.length <= max ? s : s.slice(0, max) + '…';
}

/**
 * Human-readable block for chat when PS12 / summary paste verify fails.
 */
function buildProfessionalSummaryVerifyChatReport(feedback, failures = []) {
  if (!feedback) return '';

  const row = feedback.apply && feedback.apply.professional_summary;
  if (!row || row.action !== 'replace') return '';

  const meta = feedback.meta || {};
  const v = meta.professional_summary_verify || {};
  const heal = meta.professional_summary_heal || {};
  const preview = v.preview || heal.verify || null;
  const pdf = v.pdf || null;
  const expected = String(row.text || '').trim();

  const ps12Related =
    (preview && preview.pass === false) ||
    (pdf && pdf.pass === false) ||
    (failures || []).some((f) =>
      /PS12|Professional Summary preview|Professional Summary PDF|summary_wrong|summary_multiple|summary_truncated|summary_content_mismatch/i.test(
        String(f || '')
      )
    ) ||
    heal.ok === false;

  if (!ps12Related) return '';

  const company = meta.company || '—';
  const jobTitle = meta.job_title || '—';
  const lines = [];

  lines.push('Professional Summary — текст в **превью справа** или PDF не совпал с feedback.json');
  lines.push(`Вакансия: ${jobTitle} — ${company}`);
  lines.push('');

  if (heal.ok === false) {
    lines.push(`Paste / preview heal: не прошло (${heal.reason || 'unknown'}).`);
    if (heal.preview_chars != null) {
      lines.push(`Символов на preview после paste: ${heal.preview_chars}.`);
    }
    lines.push('');
  }

  if (preview && preview.pass === false) {
    lines.push('Превью справа (Content Editor, панель резюме):');
    lines.push(`- Статус: не совпало (${preview.reason || 'mismatch'})`);
    if (preview.detail) lines.push(`- ${preview.detail}`);
    lines.push(
      `- В feedback.json: ${preview.expected_chars != null ? preview.expected_chars : expected.length} символов`
    );
    lines.push(`- В превью справа: ${preview.actual_chars != null ? preview.actual_chars : '?'} символов`);
    if (preview.coverage != null) {
      lines.push(`- Совпадение по предложениям: ${Math.round(preview.coverage * 100)}%`);
    }
    lines.push(`- Начало текста из feedback: «${snippetOneLine(expected)}»`);
    lines.push('');
  } else if (
    (failures || []).some((f) => /preview verify missing|preview mismatch/i.test(String(f || '')))
  ) {
    lines.push('Превью справа: проверка не записана или не прошла (см. step-10-eval.json).');
    lines.push('');
  }

  if (pdf && pdf.pass === false) {
    lines.push('PDF (после export):');
    lines.push(`- Статус: секция Professional Summary не совпала (${pdf.reason || 'mismatch'})`);
    if (pdf.detail) lines.push(`- ${pdf.detail}`);
    lines.push(`- В feedback.json: ${pdf.expected_chars != null ? pdf.expected_chars : expected.length} символов`);
    lines.push(`- В PDF: ${pdf.actual_chars != null ? pdf.actual_chars : '?'} символов`);
    lines.push('');
  }

  lines.push('Что делать:');
  lines.push('1. Открыть Teal Content Editor и прочитать Professional Summary в **превью справа** (не только левый редактор).');
  lines.push('2. Сравнить с apply.professional_summary.text в feedback.json в папке package.');
  lines.push('3. Если в превью справа старый текст (casino вместо AI и т.п.) — retry apply или перезапустить step 10.');
  if (meta.package_dir) {
    lines.push(`Папка package: ${meta.package_dir}`);
  }

  return lines.join('\n');
}

function writeProfessionalSummaryVerifyChatReport(packageDir, feedback, failures = []) {
  const body = buildProfessionalSummaryVerifyChatReport(feedback, failures);
  if (!body) return { written: false, body: '' };

  const outPath = path.join(packageDir, 'step-10-summary-verify-chat.md');
  fs.writeFileSync(outPath, body + '\n', 'utf8');

  process.stdout.write(PS12_CHAT_MARKER_START + '\n');
  process.stdout.write(body + '\n');
  process.stdout.write(PS12_CHAT_MARKER_END + '\n');

  return { written: true, body, path: outPath, relPath: 'step-10-summary-verify-chat.md' };
}

function verifyProfessionalSummaryPdf(expectedText, pdfPath) {
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return {
      pass: false,
      reason: 'pdf_missing',
      label: 'pdf',
      detail: pdfPath || 'no path'
    };
  }
  const raw = extractPdfText(pdfPath);
  if (!raw) {
    return {
      pass: false,
      reason: 'pdf_extract_failed',
      label: 'pdf',
      detail: 'pdftotext unavailable or failed'
    };
  }
  const summary = extractProfessionalSummaryFromPdfText(raw);
  if (!summary || summary.length < 40) {
    return {
      pass: false,
      reason: 'pdf_summary_section_missing',
      label: 'pdf',
      detail: 'could not locate Professional Summary section in PDF'
    };
  }
  return verifyProfessionalSummaryAgainstExpected(expectedText, summary, 'pdf');
}

module.exports = {
  MIN_LEN_RATIO,
  MIN_SENTENCE_COVERAGE,
  normalizeSummaryForCompare,
  compareSummaryTexts,
  extractPdfText,
  extractProfessionalSummaryFromPdfText,
  verifyProfessionalSummaryAgainstExpected,
  verifyProfessionalSummaryPdf,
  recordProfessionalSummaryVerifyMeta,
  validateProfessionalSummaryVerifyMeta,
  buildProfessionalSummaryVerifyChatReport,
  writeProfessionalSummaryVerifyChatReport,
  PS12_CHAT_MARKER_START,
  PS12_CHAT_MARKER_END
};
