'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_Q_LEN = 12000;
const CLIPBOARD_Q_MAX = 8000;

/** Always sent in `q` so Cowork never opens with files-only (no task). */
const MINIMAL_Q_TASK =
  'Resume review task: Read the attached CV PDF and job-description.md in this folder. ' +
  'Follow review-prompt.md for full rules. Write feedback.md and feedback.json (meta, apply=automated, deferred_v1=manual-only) ' +
  'to this folder before finishing. feedback.json meta MUST include resume_id, job_title, company, review_round, jd_themes (exact values in review-prompt.md). ' +
  'Use only files inside this project folder — do not attach other paths (no @ file or @ skill mentions). ' +
  'Do not ask what to do — run the JD fit review and produce both output files.';

const Q_TRUNCATED_SUFFIX =
  '\n\n(Full instructions are in review-prompt.md in the attached project folder.)';

function buildCoworkDeepLink({ q, folderPath, filePaths = [] }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q.length > MAX_Q_LEN ? q.slice(0, MAX_Q_LEN) : q);
  if (folderPath) params.append('folder', folderPath);
  for (const f of filePaths) {
    if (f && fs.existsSync(f)) params.append('file', f);
  }
  return `claude://cowork/new?${params.toString()}`;
}

function launchCoworkDeepLink(deepLink, log = console.log) {
  log('[cowork-launch] ' + deepLink.slice(0, 200) + (deepLink.length > 200 ? '…' : ''));
  if (process.platform === 'darwin') {
    execSync(`open ${JSON.stringify(deepLink)}`, { stdio: 'inherit' });
    try {
      const { focusClaudeApp } = require('./cowork-ui-automation.cjs');
      focusClaudeApp(log);
    } catch (_) {}
  } else if (process.platform === 'win32') {
    execSync(`start "" ${JSON.stringify(deepLink)}`, { stdio: 'inherit', shell: true });
  } else {
    execSync(`xdg-open ${JSON.stringify(deepLink)}`, { stdio: 'inherit' });
  }
}

function readPromptFile(packageDir, useRetry) {
  const promptFile = useRetry
    ? path.join(packageDir, 'review-prompt-retry.md')
    : path.join(packageDir, 'review-prompt.md');
  if (!fs.existsSync(promptFile)) return { text: '', promptFile };
  return { text: fs.readFileSync(promptFile, 'utf8'), promptFile };
}

function buildQForPackage(packageDir, useRetry, log = console.log) {
  const { text: fullPrompt, promptFile } = readPromptFile(packageDir, useRetry);
  let q = MINIMAL_Q_TASK;
  let truncated = false;
  let usedFileOnly = false;

  if (fullPrompt.trim()) {
    q = MINIMAL_Q_TASK + '\n\n---\n\n' + fullPrompt;
  } else {
    usedFileOnly = true;
    log('[cowork-launch] WARN: ' + path.basename(promptFile) + ' missing — using minimal q only');
  }

  if (q.length > MAX_Q_LEN) {
    truncated = true;
    q =
      MINIMAL_Q_TASK +
      Q_TRUNCATED_SUFFIX +
      (useRetry && fs.existsSync(path.join(packageDir, 'review-prompt-retry.md'))
        ? '\n\nRetry errors:\n' +
          fs.readFileSync(path.join(packageDir, 'review-prompt-retry.md'), 'utf8').slice(0, 2000)
        : '');
    if (q.length > MAX_Q_LEN) q = q.slice(0, MAX_Q_LEN);
    log('[cowork-launch] q truncated to ' + q.length + ' chars (full prompt stays in review-prompt.md)');
  }

  const clipboardQ =
    q.length > CLIPBOARD_Q_MAX
      ? MINIMAL_Q_TASK + Q_TRUNCATED_SUFFIX
      : q;

  return { q, clipboardQ, truncated, usedFileOnly, promptFile };
}

function setMacClipboard(text, log = console.log) {
  if (process.platform !== 'darwin') return false;
  try {
    spawnSync('pbcopy', { input: text, encoding: 'utf8' });
    log('[cowork-launch] copied ' + text.length + ' chars to clipboard for UI paste fallback');
    return true;
  } catch (e) {
    log('[cowork-launch] WARN: pbcopy failed: ' + (e.message || e));
    return false;
  }
}

/** Cowork session label aligned with Teal resume name: "Title — Company". */
function buildCoworkSessionTitle(jobTitle, company) {
  const title = String(jobTitle || '').trim() || 'Role';
  const co = String(company || '').trim();
  if (!co || co === '—') return title;
  return `${title} — ${co}`;
}

function launchCoworkSession(packageDir, { useRetry = false, log = console.log, jobTitle = '', company = '' } = {}) {
  const absDir = path.resolve(packageDir);
  const pdf = path.join(absDir, 'Roman Matsukatov - CV.pdf');
  const jd = path.join(absDir, 'job-description.md');
  const reviewPrompt = path.join(absDir, useRetry ? 'review-prompt-retry.md' : 'review-prompt.md');
  const { q, clipboardQ, truncated, usedFileOnly } = buildQForPackage(absDir, useRetry, log);
  let sessionTitle = buildCoworkSessionTitle(jobTitle, company);
  const ctxPath = path.join(absDir, 'context.json');
  if ((!jobTitle || !company) && fs.existsSync(ctxPath)) {
    try {
      const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      sessionTitle = buildCoworkSessionTitle(ctx.jobTitle || jobTitle, ctx.company || company);
    } catch (_) {}
  }

  if (!q || !q.trim()) {
    log('[cowork-launch] ERROR: empty q — Cowork will show "uploaded files without a request"');
  } else {
    log('[cowork-launch] q length=' + q.length + (truncated ? ' (truncated)' : ''));
  }

  // Files already live inside packageDir; attaching folder is enough (avoids 3× "Attach" per launch).
  // Set COWORK_DEEP_LINK_ATTACH_FILES=1 to also pass file= for each asset (legacy, more dialogs).
  const attachFiles =
    process.env.COWORK_DEEP_LINK_ATTACH_FILES === '1' ||
    process.env.COWORK_DEEP_LINK_ATTACH_FILES === 'true';
  const files = attachFiles
    ? [pdf, jd, reviewPrompt].filter((f) => fs.existsSync(f))
    : [];
  if (!attachFiles) {
    log('[cowork-launch] folder-only deep link (no per-file file= params — expect ~1 Continue dialog)');
  } else {
    log('[cowork-launch] attaching ' + files.length + ' files via deep link (more Attach dialogs)');
  }
  const clipboardSet = setMacClipboard(clipboardQ, log);
  const link = buildCoworkDeepLink({ q, folderPath: absDir, filePaths: files });
  const qInLink = link.includes('q=');
  if (!qInLink) {
    log('[cowork-launch] ERROR: deep link missing q= param');
  }

  launchCoworkDeepLink(link, log);
  if (sessionTitle) log('[cowork-launch] session title: ' + sessionTitle);
  return {
    link,
    q,
    clipboardQ,
    clipboardSet,
    qInLink,
    truncated,
    usedFileOnly,
    files,
    sessionTitle,
    promptFile: fs.existsSync(reviewPrompt) ? reviewPrompt : path.join(absDir, 'review-prompt.md')
  };
}

module.exports = {
  buildCoworkDeepLink,
  launchCoworkDeepLink,
  launchCoworkSession,
  buildCoworkSessionTitle,
  buildQForPackage,
  setMacClipboard,
  MINIMAL_Q_TASK,
  MAX_Q_LEN
};

if (require.main === module) {
  const pkg = process.argv[2];
  if (!pkg) {
    console.error('Usage: node cowork-launch.cjs <packageDir> [--retry]');
    process.exit(1);
  }
  const useRetry = process.argv.includes('--retry');
  const { q, clipboardQ } = buildQForPackage(path.resolve(pkg), useRetry);
  const link = buildCoworkDeepLink({
    q,
    folderPath: path.resolve(pkg),
    filePaths: []
  });
  console.log('q chars:', q.length);
  console.log('clipboard chars:', clipboardQ.length);
  console.log('has q param:', link.includes('q='));
  console.log('link prefix:', link.slice(0, 240) + '…');
}
