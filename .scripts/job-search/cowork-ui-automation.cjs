'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SESSION_TITLE_FILENAME = '.cowork-session-title.txt';

/**
 * Same label as Teal resume / Cursor job chats: "Title — Company".
 * @param {string} jobTitle
 * @param {string} company
 */
function buildCoworkSessionTitle(jobTitle, company) {
  const title = String(jobTitle || '').trim() || 'Role';
  const co = String(company || '').trim();
  if (!co || co === '—') return title;
  return `${title} — ${co}`;
}

/** Bring Claude Desktop to the foreground (macOS). */
function focusClaudeApp(log = console.log) {
  if (process.platform !== 'darwin') {
    return { ok: false, skipped: true };
  }
  try {
    execSync(
      "osascript -e 'tell application \"Claude\" to activate' -e 'delay 0.25' -e 'tell application \"System Events\" to tell process \"Claude\" to set frontmost to true'",
      { timeout: 10000 }
    );
    log('[cowork-ui] Claude brought to front');
    return { ok: true };
  } catch (e) {
    log('[cowork-ui] focus failed: ' + (e.message || e));
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * @param {Function} log
 * @param {object} opts
 * @param {number} [opts.delaySec=12] - wait after deep link before UI actions
 * @param {number} [opts.approveLoopSec=24] - seconds to poll Approve/Allow/Grant dialogs
 * @param {boolean} [opts.pasteBeforeSend=true] - Cmd+V from clipboard (set by cowork-launch)
 * @param {string} [opts.sessionTitle] - Cowork sidebar/tab title (Title — Company)
 * @param {string} [opts.promptFile] - path to review-prompt.md (reload clipboard before paste)
 * @param {string} [opts.packageDir] - cowork package dir (writes session title file)
 */
function runCoworkUiAutomation(log = console.log, opts = {}) {
  const delaySec = opts.delaySec ?? 12;
  const approveLoopSec = opts.approveLoopSec ?? Number(process.env.COWORK_APPROVE_LOOP_SEC || 36);
  const pasteBeforeSend = opts.pasteBeforeSend !== false;
  const sessionTitle = (opts.sessionTitle || '').trim();
  const promptFile = opts.promptFile && fs.existsSync(opts.promptFile) ? path.resolve(opts.promptFile) : '';

  if (process.platform !== 'darwin') {
    log('[cowork-ui] skip UI automation on non-macOS');
    return { ok: false, skipped: true };
  }

  let sessionTitleFile = '';
  if (sessionTitle && opts.packageDir) {
    sessionTitleFile = path.join(path.resolve(opts.packageDir), SESSION_TITLE_FILENAME);
    fs.writeFileSync(sessionTitleFile, sessionTitle, 'utf8');
  }

  const scriptPath = path.join(__dirname, 'cowork-ui-automation.applescript');
  const pasteFlag = pasteBeforeSend ? 1 : 0;
  const args = [
    String(delaySec),
    String(approveLoopSec),
    String(pasteFlag),
    sessionTitleFile || '""',
    promptFile || '""'
  ];
  const cmd = `osascript ${JSON.stringify(scriptPath)} ${args.map((a) => JSON.stringify(a)).join(' ')}`;

  try {
    log(
      '[cowork-ui] AppleScript: focus → approvals ~' +
        approveLoopSec +
        's' +
        (sessionTitle ? ' → rename "' + sessionTitle + '"' : '') +
        (pasteBeforeSend ? ' → paste+Send' : '') +
        ' (Accessibility: Terminal/Cursor + Claude.app)'
    );
    execSync(cmd, { stdio: 'inherit', timeout: 120000 });
    log('[cowork-ui] automation finished');
    return { ok: true, sessionTitle: sessionTitle || null };
  } catch (e) {
    const msg = e.message || String(e);
    log('[cowork-ui] automation failed: ' + msg);
    log(
      '[cowork-ui] If Send did not fire: grant Accessibility to Terminal/Cursor in System Settings → Privacy & Security → Accessibility; approve file attachments manually once.'
    );
    return { ok: false, error: msg };
  }
}

/** Validate AppleScript syntax without driving Claude UI. */
function validateAppleScriptSyntax(log = console.log) {
  if (process.platform !== 'darwin') {
    return { ok: false, skipped: true };
  }
  const scriptPath = path.join(__dirname, 'cowork-ui-automation.applescript');
  try {
    execSync(`osacompile -o /dev/null ${JSON.stringify(scriptPath)}`, { encoding: 'utf8', timeout: 10000 });
    log('[cowork-ui] AppleScript syntax OK');
    return { ok: true };
  } catch (e) {
    log('[cowork-ui] AppleScript syntax error: ' + (e.message || e));
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  runCoworkUiAutomation,
  validateAppleScriptSyntax,
  focusClaudeApp,
  buildCoworkSessionTitle,
  SESSION_TITLE_FILENAME
};

if (require.main === module) {
  const mode = process.argv[2] || 'syntax';
  if (mode === 'syntax') {
    const r = validateAppleScriptSyntax(console.log);
    process.exit(r.ok ? 0 : 1);
  }
  console.error('Usage: node cowork-ui-automation.cjs syntax');
  process.exit(1);
}
