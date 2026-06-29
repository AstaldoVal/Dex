#!/usr/bin/env node
/**
 * Millennium BCP: log in → go to Movimentos / Histórico → filter transactions to Vodafone, Simas, Lisboagas, Ibelectra → download comprovativo PDFs.
 *
 * Run from repo root:
 *   node .scripts/bank/millennium-bcp-download-transactions.cjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run] [--debug] [--keep-open]
 *
 * Auth: Código de Utilizador → 3 positions of Código Multicanal (7 digits) → SMS code.
 * Credentials: MILLENNIUM_BCP_USER, MILLENNIUM_BCP_MULTICANAL in .env; optional MILLENNIUM_SMS_CODE_FILE.
 * SMS code: script automatically calls Mac Messages MCP (uvx mac-messages-mcp), gets recent messages, extracts 4–8 digit code and writes to file (default <vault>/.millennium_sms_code); then polls file up to 90s. No manual agent step. Requires Full Disk Access for the process that runs uvx.
 * IMPORTANT: Never run in background. Browser must be visible (SMS step if script not set).
 *
 * Reference: .claude/reference/millennium-bcp-bank-transactions.md
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '..', '..');
require('dotenv').config({ path: path.join(VAULT, '.env') });

const LOGIN_URL = 'https://ind.millenniumbcp.pt/_layouts/15/BCP.SDC.FEP.Foundation.Presentation/LoginCMD.aspx?d=1';
const BASE_OUT = path.join(VAULT, '00-Inbox', 'Invoices', 'Bank_Millennium_BCP');
const TRANSACTIONS_OUT = path.join(BASE_OUT, 'transactions');

// Keywords to match transactions paid TO these providers (case-insensitive)
const BENEFICIARY_KEYWORDS = [
  'vodafone',
  'simas', 'ucloud',
  'lisboagas', 'lisboagás', 'galp',
  'ibelectra'
];

function matchesProvider(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = String(text).toLowerCase();
  for (const kw of BENEFICIARY_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

function safeFilename(dateStr, beneficiary, index) {
  const safe = (beneficiary || 'payment').replace(/[^a-z0-9_-]/gi, '_');
  return `${dateStr}_${safe}_${index}.pdf`;
}

async function ensureOutDir() {
  if (!fs.existsSync(BASE_OUT)) fs.mkdirSync(BASE_OUT, { recursive: true });
  if (!fs.existsSync(TRANSACTIONS_OUT)) fs.mkdirSync(TRANSACTIONS_OUT, { recursive: true });
}

/**
 * Parse a single position (1–7) from a short text (e.g. label for one input).
 * Handles: "6.º", "6º", "posição 6", "6.º algarismo", "algarismo 6", "dígito 6".
 */
function parseOnePosition(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  const ordinalMatch = t.match(/(\d)\s*\.?\s*[ºª°]?\s*(?:algarismo|d[ií]gito)?/i) || t.match(/(\d)\s*[ºª°]/);
  if (ordinalMatch) {
    const num = parseInt(ordinalMatch[1], 10);
    if (num >= 1 && num <= 7) return num;
  }
  const altMatch = t.match(/(?:posi[cç][aã]o|algarismo|d[ií]gito)\s*[:\s]*(\d)/i) || t.match(/\b(\d)\b/);
  if (altMatch) {
    const num = parseInt(altMatch[1], 10);
    if (num >= 1 && num <= 7) return num;
  }
  return null;
}

/**
 * Parse requested positions from multicanal step text.
 * Bank may phrase as: "6.º, 5.º e 2.º algarismo", "Introduza o 1.º, 4.º e 7.º dígito".
 * Returns up to 3 position numbers (1–7) in the order they appear in the instruction.
 * Prefer the instruction sentence (contains algarismo/dígito/multicanal) so we don't mix in other numbers from the page.
 */
function parseMulticanalPositions(pageText) {
  if (!pageText || typeof pageText !== 'string') return [];
  // Prefer segment that contains the multicanal instruction
  const instructionRe = /(?:Introduza|Introduzir|Indique|Digite|Inserir|Código multicanal|multicanal|algarismo|d[ií]gito)[^.]*?[\d\sºª\.\,e]+(?:algarismo|d[ií]gito)?/gi;
  let segment = pageText;
  const instructionMatch = instructionRe.exec(pageText);
  if (instructionMatch) {
    segment = instructionMatch[0];
  }
  const positions = [];
  // Portuguese ordinals in order of appearance: 6.º, 5.º, 2.º
  const ordinalRe = /(\d)\s*\.?\s*[ºª°]?/g;
  let m;
  while ((m = ordinalRe.exec(segment)) !== null && positions.length < 3) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 7) positions.push(num);
  }
  if (positions.length >= 3) return positions.slice(0, 3);
  // Fallback: "posição 6, 5 e 2" in order
  const altRe = /(?:posi[cç][aã]o\s*)?(\d)(?:\s*[,\s]|\s*e\s*)/gi;
  while ((m = altRe.exec(segment)) !== null && positions.length < 3) {
    const num = parseInt(m[1], 10);
    if (num >= 1 && num <= 7) positions.push(num);
  }
  if (positions.length >= 3) return positions.slice(0, 3);
  // Last resort: any 1–7 in instruction segment, preserve order
  const anyRe = /\b([1-7])\b/g;
  while ((m = anyRe.exec(segment)) !== null && positions.length < 3) {
    positions.push(parseInt(m[1], 10));
  }
  return positions.slice(0, 3);
}

/** Path where script or agent writes SMS code (from Mac Messages MCP). */
const SMS_CODE_FILE = process.env.MILLENNIUM_SMS_CODE_FILE || path.join(VAULT, '.millennium_sms_code');

// Runtime diagnostics for SMS step (per flow)
let lastSmsCode = null;
let smsInputAppearedAt = null;
let smsCodeAutoInserted = false;

// MCP stdio framing для mac-messages-mcp: одна JSON-строка на сообщение (без Content-Length).
function writeMcpMessage(stream, obj) {
  const json = JSON.stringify(obj);
  stream.write(json + '\n', 'utf8');
}

function readMcpMessage(stream) {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        stream.removeListener('data', onData);
        stream.removeListener('error', onError);
        if (!line) {
          return reject(new Error('Empty JSON-RPC line from MCP'));
        }
        try {
          resolve(JSON.parse(line));
        } catch (e) {
          reject(e);
        }
      }
    };
    const onError = (err) => { stream.removeListener('data', onData); reject(err); };
    stream.on('data', onData);
    stream.on('error', onError);
  });
}

/**
 * Spawn Mac Messages MCP (uvx mac-messages-mcp), call tool_get_recent_messages,
 * parse last 1h messages for 4–8 digit code, write to file. No user/agent step.
 * Returns true if code was written to file, false otherwise.
 */
function fetchSmsCodeViaMcp(filePath, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let proc;
    const timeout = setTimeout(() => {
      if (proc) proc.kill('SIGKILL');
      resolve(false);
    }, timeoutMs);

    proc = spawn('uvx', [
      '--from',
      'mac-messages-mcp @ git+https://github.com/carterlasalle/mac_messages_mcp.git@dc0452a47e7178bcb579db04b4470b2361d39d91',
      'mac-messages-mcp',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    const stdout = proc.stdout;
    const stdin = proc.stdin;
    const debug = process.argv.includes('--debug');
    proc.stderr.on('data', (chunk) => {
      if (debug) {
        console.error('mac-messages-mcp stderr:', chunk.toString('utf8').trim());
      }
    });

    (async () => {
      try {
        writeMcpMessage(stdin, {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'millennium-script', version: '1.0' },
          },
        });
        const initResp = await readMcpMessage(stdout);
        if (initResp.error || !initResp.result) {
          clearTimeout(timeout);
          proc.kill('SIGKILL');
          return resolve(false);
        }
        writeMcpMessage(stdin, { jsonrpc: '2.0', method: 'notifications/initialized' });
        writeMcpMessage(stdin, {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'tool_get_recent_messages', arguments: { hours: 1 } },
        });
        const callResp = await readMcpMessage(stdout);
        clearTimeout(timeout);
        proc.kill('SIGKILL');
        if (callResp.error || !callResp.result) {
          if (debug) {
            console.error('mac-messages-mcp call error/result:', JSON.stringify(callResp).slice(0, 800));
          }
          return resolve(false);
        }
        const content = callResp.result.content;
        if (!Array.isArray(content)) return resolve(false);
        if (debug) {
          try {
            console.log('MCP tool_get_recent_messages raw content:', JSON.stringify(content).slice(0, 800));
          } catch (_) {}
        }
        let text = content.map((c) => (c && c.type === 'text' ? c.text : '')).join('\n');
        // Детектор OTP:
        // 1) в приоритете самый свежий код Millennium: первая строка с "codigo de autorizacao"
        // 2) при отсутствии такого паттерна — общий поиск 4–8-значных кодов.
        let code = null;
        const lines = text.split('\n');
        for (const line of lines) {
          const m = line.match(/codigo\s+de\s+autorizacao[:\s]*([0-9]{4,8})/i);
          if (m) {
            code = m[1].replace(/\D/g, '');
            break; // берём самый свежий (первая строка в выдаче MCP)
          }
        }
        if (!code) {
          const candidates = [];
          const pushCandidate = (raw) => {
            const digits = raw.replace(/\D/g, '');
            if (digits.length >= 4 && digits.length <= 8) candidates.push(digits);
          };
          let m;
          const reCompact = /(\d{4,8})/g;
          while ((m = reCompact.exec(text)) !== null) pushCandidate(m[1]);
          const reSpaced = /(\d(?:\s*\d){3,7})/g;
          while ((m = reSpaced.exec(text)) !== null) pushCandidate(m[1]);
          code = candidates.length ? candidates[0] : null; // самая свежая кандидатура
          if (debug) {
            console.log('MCP OTP candidates (fallback):', candidates);
          }
        }
        if (debug) {
          console.log('MCP chosen OTP:', code || '(none)');
        }
        if (code) {
          fs.writeFileSync(filePath, code, 'utf8');
          return resolve(true);
        }
        resolve(false);
      } catch (_) {
        clearTimeout(timeout);
        if (proc) proc.kill('SIGKILL');
        resolve(false);
      }
    })();
  });
}

/** Poll file for SMS code (written by fetchSmsCodeViaMcp or agent). Returns code string or null. Deletes file on success. */
async function getSmsCodeFromFile(filePath, pollMs = 90000, intervalMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < pollMs) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        const digits = raw.replace(/\D/g, '');
        const code = digits.length >= 4 && digits.length <= 8 ? digits : null;
        if (code) {
          try { fs.unlinkSync(filePath); } catch (_) {}
          return code;
        }
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

async function waitForEnter(msg, timeoutMs = 5 * 60 * 1000) {
  console.log(msg);
  await new Promise((resolve) => {
    const onEnter = () => { process.stdin.removeListener('data', onEnter); clearTimeout(t); resolve(); };
    const t = setTimeout(() => { process.stdin.removeListener('data', onEnter); resolve(); }, timeoutMs);
    process.stdin.setRawMode?.(false);
    process.stdin.once('data', onEnter);
  });
}

/** Return true if page/frame shows bank login error (invalid credentials) */
async function hasLoginError(pageOrFrame) {
  try {
    const body = await pageOrFrame.locator('body').innerText().catch(() => '');
    return /Dados de acesso inválidos|dados introduzidos estão corretos|acesso inválidos|Verifique que os dados/i.test(body);
  } catch (_) {
    return false;
  }
}

/** If bank showed login error, log and exit so script stops and can be fixed/restarted */
async function assertNoLoginError(pageOrFrame, browser) {
  if (await hasLoginError(pageOrFrame)) {
    console.error('');
    console.error('Login failed: bank reported "Dados de acesso inválidos".');
    console.error('Check MILLENNIUM_BCP_USER, MILLENNIUM_BCP_MULTICANAL and SMS code. Then restart the script.');
    console.error('');
    await browser.close().catch(() => {});
    process.exit(1);
  }
}

async function main() {
  const user = (process.env.MILLENNIUM_BCP_USER || '').trim();
  const multicanal = (process.env.MILLENNIUM_BCP_MULTICANAL || '').replace(/\D/g, '');
  if (!user) {
    console.error('Missing MILLENNIUM_BCP_USER in .env');
    process.exit(1);
  }
  if (multicanal.length !== 7) {
    console.error('MILLENNIUM_BCP_MULTICANAL must be exactly 7 digits in .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const fromDate = fromIdx >= 0 && args[fromIdx + 1] ? args[fromIdx + 1] : null;
  const toDate = toIdx >= 0 && args[toIdx + 1] ? args[toIdx + 1] : null;
  const dryRun = args.includes('--dry-run');
  const debug = args.includes('--debug');
  const keepOpen = args.includes('--keep-open');

  await ensureOutDir();
  console.log('Output dir:', TRANSACTIONS_OUT);
  if (dryRun) console.log('(dry-run: no downloads)');

  const { chromium } = require('playwright');
  const useSystemProfile = process.env.MILLENNIUM_USE_SYSTEM_PROFILE === 'true';
  let browser;
  let page;
  if (useSystemProfile) {
    const userDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    console.log('Launching Chrome with system profile at', userDataDir);
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      acceptDownloads: true,
    });
    page = await browser.newPage();
    await page.bringToFront().catch(() => {});
  } else {
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ acceptDownloads: true });
    page = await context.newPage();
  }

  try {
    console.log('Opening Millennium login page:', LOGIN_URL);
    let navOk = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        navOk = true;
        break;
      } catch (err) {
        console.warn('Navigation attempt', attempt, 'failed:', err.message);
        if (attempt === 2) {
          console.error('Could not open Millennium page. Close other Chrome windows using this profile and retry.');
          await browser.close().catch(() => {});
          process.exit(1);
        }
        await page.waitForTimeout(2000);
      }
    }
    if (!navOk) {
      await browser.close().catch(() => {});
      process.exit(1);
    }
    await page.bringToFront().catch(() => {});
    await page.waitForTimeout(4000);

    // Dismiss cookie banner if present so it doesn't steal focus during typing (often appears shortly after load)
    const cookieBtn = page.locator(
      'button:has-text("Aceitar"), button:has-text("Accept"), button:has-text("Concordo"), button:has-text("Allow all"), ' +
      'a:has-text("Aceitar"), a:has-text("Accept"), [aria-label*="cookie"], [id*="cookie"] button, [class*="cookie"] button, [class*="cookie"] a'
    ).first();
    if (await cookieBtn.isVisible().catch(() => false)) {
      await cookieBtn.click().catch(() => {});
      await page.waitForTimeout(800);
    }

    // —— Step 1: Código de Utilizador ——
    // Wait for login form (bank may render after JS or use iframe)
    let formPage = page;
    const frames = page.frames();
    for (const frame of frames) {
      const inFrame = frame.locator('input[type="text"], input:not([type="submit"]):not([type="hidden"]):not([type="password"])').first();
      if (await inFrame.count() > 0) {
        try {
          await inFrame.waitFor({ state: 'visible', timeout: 2000 });
          formPage = frame;
          break;
        } catch (_) {}
      }
    }
    const userInputCandidates = [
      formPage.getByLabel(/Código de Utilizador|Utilizador|User code/i),
      formPage.locator('input[type="text"], input:not([type])').first(),
      formPage.locator('input[name*="user"], input[id*="User"], input[id*="user"], input[name*="Codigo"], input[name*="Utilizador"], input[placeholder*="Utilizador"], input[placeholder*="Código"]').first(),
      formPage.locator('input:not([type="submit"]):not([type="hidden"]):not([type="password"]):not([type="image"])').first(),
    ];
    let userInput = null;
    for (const loc of userInputCandidates) {
      try {
        await loc.waitFor({ state: 'visible', timeout: 6000 });
        if (await loc.count() > 0 && await loc.isVisible().catch(() => false)) {
          userInput = loc;
          break;
        }
      } catch (_) {}
    }
    const submitBtn = formPage.locator('a#btnPositions, input[type="submit"], button[type="submit"], a:has-text("Continuar"), input[value*="Continuar"], button:has-text("Continuar")').first();
    if (userInput && (await userInput.count() > 0)) {
      await userInput.click();
      await page.waitForTimeout(300);
      await userInput.clear();
      await page.waitForTimeout(200);
      // Type character by character so bank JS validation runs (keydown/input/keyup)
      await userInput.pressSequentially(user, { delay: 80 });
      await page.waitForTimeout(500);
      const currentValue = await userInput.inputValue().catch(() => '');
      if (currentValue !== user && (await cookieBtn.isVisible().catch(() => false))) {
        await cookieBtn.click().catch(() => {});
        await page.waitForTimeout(500);
        await userInput.click();
        await userInput.clear();
        await userInput.pressSequentially(user, { delay: 80 });
        await page.waitForTimeout(500);
      }
      // Dispatch input/change in case bank listens only to these
      await userInput.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(500);
      // Bank enables Continuar when field is valid
      await formPage.waitForFunction(
        () => !document.querySelector('a#btnPositions')?.hasAttribute('disabled'),
        { timeout: 10000 }
      ).catch(() => {});
      await submitBtn.click({ force: true });
      await page.waitForTimeout(4000);
      await assertNoLoginError(formPage, browser);
      await assertNoLoginError(page, browser);
    } else {
      await waitForEnter('User input not found. Enter Código de Utilizador in the browser, then press Enter here.');
      await page.waitForTimeout(1000);
    }

    // —— Step 2: Código Multicanal (3 positions) ——
    // Wait for multicanal step: page shows "algarismo", "multicanal", "dígito" or 3 single-char inputs
    try {
      await formPage.waitForFunction(
        () => {
          const body = document.body?.innerText || '';
          const hasText = /algarismo|multicanal|d[ií]gito|posi[cç][aã]o/i.test(body);
          const threeInputs = document.querySelectorAll('input[maxlength="1"], input[type="text"][inputmode="numeric"], input[type="password"][maxlength="1"]').length >= 3;
          return hasText || threeInputs;
        },
        { timeout: 12000 }
      );
    } catch (_) {}
    await page.waitForTimeout(1000);

    // Locate the 3 digit inputs: by name/id (position, digit, multicanal) or first 3 single-char inputs in main content
    const inputsByRole = formPage.locator('input[name*="position"], input[id*="position"], input[name*="digit"], input[name*="algarismo"], input[name*="multicanal"], input[id*="Digit"], input[id*="Algarismo"]');
    let inputs = null;
    const nByRole = await inputsByRole.count();
    if (nByRole >= 3) {
      inputs = inputsByRole;
    } else {
      inputs = formPage.locator('input[maxlength="1"], input[type="text"][inputmode="numeric"], input[type="password"][maxlength="1"]');
    }
    const n = await inputs.count();
    if (n < 3) {
      await waitForEnter('Multicanal step: 3 digit inputs not found. Enter the 3 requested digits manually in the browser, then press Enter here.');
    } else {
      // Prefer positions from each input's label/context so we match the order the bank shows (e.g. 6, 5, 2)
      let positions = [];
      for (let i = 0; i < 3; i++) {
        const inputLoc = inputs.nth(i);
        const contextText = await inputLoc.evaluate((el) => {
          const label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
          if (label && label.innerText) return label.innerText;
          const aria = el.getAttribute('aria-label');
          if (aria) return aria;
          const parent = el.closest('div, td, li, label');
          if (parent && parent.innerText && parent.innerText.length < 200) return parent.innerText;
          const prev = el.previousElementSibling;
          if (prev && prev.innerText) return prev.innerText;
          return '';
        }).catch(() => '');
        const pos = parseOnePosition(contextText);
        if (pos !== null) positions.push(pos);
      }
      if (positions.length !== 3) {
        const bodyText = await formPage.locator('body').innerText().catch(() => '');
        positions = parseMulticanalPositions(bodyText);
      }
      if (positions.length === 3) {
        const digitsToInsert = positions.map((p) => multicanal[p - 1]);
        console.log('Multicanal — positions requested by bank (parsed):', positions.join(', '));
        console.log('Multicanal — digits determined and inserted:', digitsToInsert.join(', '), '(position → digit:', positions.map((p, i) => `${p}→${digitsToInsert[i]}`).join(', ') + ')');
        for (let i = 0; i < 3; i++) {
          const pos = positions[i];
          const digit = multicanal[pos - 1];
          await inputs.nth(i).click();
          await inputs.nth(i).pressSequentially(digit, { delay: 50 });
          await inputs.nth(i).evaluate((el) => {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
          await page.waitForTimeout(150);
        }
        await page.waitForTimeout(1500);
        const smsAlready = await formPage.locator('input[maxlength="6"], input[maxlength="8"], input[name*="sms"], input[name*="code"]').first().isVisible().catch(() => false);
        if (!smsAlready) {
          const contBtn = formPage.locator('a:has-text("Continuar"), button:has-text("Continuar")').filter({ hasNot: formPage.locator('[id*="Resend"], [name*="Resend"], [value*="Reenviar"]') }).first();
          await contBtn.click({ force: true, timeout: 5000 }).catch(() => {});
        }
        await page.waitForTimeout(5000);
        await assertNoLoginError(formPage, browser);
        await assertNoLoginError(page, browser);
      } else {
        console.log('Multicanal — could not parse 3 positions from page (got', positions.length, 'positions). Manual entry required.');
        await waitForEnter('Could not parse 3 multicanal positions from page. Enter the 3 requested digits manually in the browser, then press Enter here.');
      }
    }

    // —— Step 3: SMS code (one field or one digit per field) ——
    try {
      await formPage.waitForSelector(
        'input[maxlength="1"], input[maxlength="6"], input[maxlength="8"], input[name*="sms"], input[name*="code"], input[id*="SMS"], input[id*="Code"]',
        { state: 'visible', timeout: 15000 }
      );
    } catch (_) {}
    await page.waitForTimeout(1500);
    smsInputAppearedAt = Date.now();

    const smsSingleInput = formPage.locator('input[maxlength="6"], input[maxlength="8"], input[name*="sms"], input[name*="code"], input[placeholder*="código"]').first();
    // SMS step: 6 or 8 single-char inputs; may be mixed with 3 multicanal inputs still in DOM → skip first 3
    const allSingleChar = formPage.locator('input[maxlength="1"]');
    const nAll = await allSingleChar.count();
    const nSmsDigits = nAll >= 9 ? (nAll - 3) : (nAll >= 6 ? nAll : 0);

    let smsCode = null;
    // Источник кода только один: приложение Messages через Mac Messages MCP (файл — внутренний буфер).
    console.log('Fetching SMS code from Messages (MCP)...');
    await fetchSmsCodeViaMcp(SMS_CODE_FILE, 15000);
    // Общее ограничение — не дольше 60 секунд с момента появления инпута
    const smsDeadline = smsInputAppearedAt ? smsInputAppearedAt + 60_000 : Date.now() + 60_000;
    const remaining = Math.max(0, smsDeadline - Date.now());
    smsCode = await getSmsCodeFromFile(SMS_CODE_FILE, remaining, 3000);
    if (smsCode) {
      lastSmsCode = smsCode;
      console.log('SMS code detected from Messages (MCP):', smsCode);
    } else {
      console.error('Failed to obtain SMS code from Messages via MCP within 60s after inputs appeared.');
      console.error('Likely causes:');
      console.error('- SMS from Millennium BCP has not arrived yet;');
      console.error('- Mac Messages MCP (uvx mac-messages-mcp) is not available or failed;');
      console.error('- No Full Disk Access to the Messages database;');
      console.error('- SMS format changed so OTP detector cannot find a 4–8 digit code.');
      console.error('Flow marked as failed — exiting so orchestrator can fix cause and restart.');
      await browser.close().catch(() => {});
      process.exit(1);
    }

    if (smsCode && nSmsDigits >= 6) {
      const digits = smsCode.slice(0, nSmsDigits).split('');
      const numToFill = Math.min(digits.length, nSmsDigits);
      for (let i = 0; i < numToFill; i++) {
        const input = nAll >= 9 ? allSingleChar.nth(3 + i) : allSingleChar.nth(i);
        await input.click();
        await page.waitForTimeout(80);
        await input.pressSequentially(digits[i], { delay: 80 });
        await input.evaluate((el) => {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForTimeout(i === numToFill - 1 ? 400 : 120);
      }
      smsCodeAutoInserted = true;
      const smsSubmit = formPage.locator('a:has-text("Continuar"), button:has-text("Continuar"), input[value*="Continuar"]').filter({ hasNot: formPage.locator('[id*="Resend"], [name*="Resend"], [value*="Reenviar"]') }).first();
      await page.waitForTimeout(300);
      await smsSubmit.click({ force: true, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(4000);
      await assertNoLoginError(formPage, browser);
      await assertNoLoginError(page, browser);
    } else if (smsCode && (await smsSingleInput.count()) > 0) {
      await smsSingleInput.click();
      await smsSingleInput.clear();
      await smsSingleInput.pressSequentially(smsCode, { delay: 60 });
      await smsSingleInput.evaluate((el) => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.waitForTimeout(300);
      smsCodeAutoInserted = true;
      const smsSubmit = formPage.locator('a:has-text("Continuar"), button:has-text("Continuar")').filter({ hasNot: formPage.locator('[id*="Resend"]') }).first();
      await smsSubmit.click({ force: true, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(4000);
      await assertNoLoginError(formPage, browser);
      await assertNoLoginError(page, browser);
    }

    // Правило: если за минуту после появления инпута мы не вставили код автоматически — считаем, что авто-процесс сфейлился
    if (smsInputAppearedAt && !smsCodeAutoInserted && Date.now() - smsInputAppearedAt > 60_000) {
      console.error('Auto SMS insertion failed within 60s after inputs appeared. Likely causes:');
      console.error('- Mac Messages MCP (uvx mac-messages-mcp) недоступен, нет uv или пакета;');
      console.error('- у процесса нет Full Disk Access к приложению \"Сообщения\";');
      console.error('- в последних сообщениях за 1 час нет 4–8-значного кода от банка.');
      console.error('Flow marked as failed — exiting so orchestrator can fix cause and restart.');
      await browser.close().catch(() => {});
      process.exit(1);
    }

    await assertNoLoginError(formPage, browser);
    await assertNoLoginError(page, browser);

    // Try to open Movimentos / Histórico (link may be in menu — use force if not visible)
    const movimentosLink = page.locator('a:has-text("Movimentos"), a:has-text("Histórico de operações"), a:has-text("Histórico"), a:has-text("Contas"), a[href*="Movimentos"], a[href*="movimentos"], a[href*="Historico"], a[href*="M.aspx"]').first();
    if (await movimentosLink.count() > 0) {
      await movimentosLink.click({ force: true, timeout: 15000 });
      await page.waitForTimeout(4000);
    } else {
      console.log('Movimentos link not found. Please navigate to "Movimentos" or "Histórico de movimentos" in the browser, then press Enter.');
      await new Promise((resolve) => {
        const onEnter = () => { process.stdin.removeListener('data', onEnter); clearTimeout(t); resolve(); };
        const t = setTimeout(() => { process.stdin.removeListener('data', onEnter); resolve(); }, 5 * 60 * 1000);
        process.stdin.setRawMode?.(false);
        process.stdin.once('data', onEnter);
      });
      try {
        if (!page.isClosed()) await page.waitForTimeout(2000);
      } catch (_) { /* page/context closed */ }
      if (page.isClosed()) {
        console.error('Browser or page was closed. Next time navigate to Movimentos without closing the window, then press Enter.');
        await browser?.close?.().catch(() => {});
        process.exit(1);
      }
    }

    if (debug) {
      const html = await page.content();
      const debugPath = path.join(TRANSACTIONS_OUT, `millennium-bcp-movimentos-debug-${Date.now()}.html`);
      fs.writeFileSync(debugPath, html, 'utf8');
      console.log('Debug: saved page HTML to', debugPath);
    }

    // Find transaction rows: tables or list items that contain movement text
    const rows = page.locator('table tbody tr, .movement-row, [data-type="transaction"], .transaction-row, tr[class*="movement"], .list-row');
    const rowCount = await rows.count();
    console.log('Transaction rows found (candidate count):', rowCount);

    let downloaded = 0;
    for (let i = 0; i < Math.min(rowCount, 200); i++) {
      const row = rows.nth(i);
      const text = await row.textContent().catch(() => '');
      const provider = matchesProvider(text);
      if (!provider) continue;

      // Within this row, look for comprovativo / PDF link
      const pdfLink = row.locator('a[href*=".pdf"], a:has-text("Comprovativo"), a:has-text("comprovativo"), a:has-text("PDF"), a:has-text("Ver comprovativo"), button:has-text("Comprovativo")').first();
      if (await pdfLink.count() === 0) continue;

      const dateMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/) || text.match(/(\d{2})\/(\d{2})\/(\d{4})/) || text.match(/(\d{2})-(\d{2})-(\d{4})/);
      const dateStr = dateMatch
        ? (dateMatch[3] && dateMatch[3].length === 4 ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`)
        : new Date().toISOString().slice(0, 10);
      const filename = safeFilename(dateStr, provider, downloaded + 1);
      const filepath = path.join(TRANSACTIONS_OUT, filename);

      if (dryRun) {
        console.log('Would download:', filename, '(', provider, ')');
        downloaded++;
        continue;
      }

      try {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
          pdfLink.click()
        ]);
        if (download) {
          await download.saveAs(filepath);
          console.log('Saved:', filename);
          downloaded++;
        }
      } catch (err) {
        console.warn('Download failed for row', i, err.message);
      }
      await page.waitForTimeout(800);
    }

    if (lastSmsCode) {
      console.log('Flow summary: SMS code detected from Messages =', lastSmsCode);
      console.log('Flow summary: SMS auto-inserted into Millennium form =', smsCodeAutoInserted ? 'yes' : 'no');
    } else {
      console.log('Flow summary: no SMS code detected from Messages via MCP.');
    }

    if (downloaded === 0 && rowCount === 0) {
      console.log('No matching transactions or rows found. If the page structure changed, run with --debug and check the saved HTML for selectors.');
    } else {
      console.log('Done. Comprovativos saved:', downloaded);
    }

    if (keepOpen) {
      console.log('Browser kept open (--keep-open). Press Enter to close and exit.');
      await waitForEnter('', 24 * 60 * 60 * 1000);
    }
    await browser.close();
  } catch (err) {
    console.error(err);
    if (browser) await browser.close().catch(() => {});
    process.exit(1);
  }
}

main().then(() => process.exit(0));
