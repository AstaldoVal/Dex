#!/usr/bin/env node
/**
 * Add Job Digest jobs to Teal. Two modes:
 *
 * 1) --app (recommended): Log into Teal web app once (--setup), then script adds jobs
 *    via the "Add a New Job" form (paste URL or job description). No extension needed.
 *
 * 2) Extension: Use Chrome with Teal extension; script opens each LinkedIn job page
 *    and clicks the extension "Save" button. Requires --setup to install extension.
 *
 * Usage:
 *   node add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --limit=2 --app
 *   node add-digest-jobs-to-teal-playwright.cjs 2026-02-07 --app --setup   # one-time: log into Teal
 *
 * Options:
 *   --app         Use Teal web app (add job manually in app). One-time --setup to log in.
 *   --setup       First-time: open browser to log into Teal (--app) or install extension + LinkedIn.
 *   --limit=N     Add only first N jobs (default: all).
 *   --debug       Save screenshot/HTML (extension: first job page; app: Teal add-job form).
 *
 * Requires: Playwright. For extension mode: Chrome, profile .playwright-linkedin.
 * For --app: by default uses your system Chrome profile (Default or Profile 1 on macOS/Windows/Linux).
 * Close Chrome, run the script — it will use your Teal session. Override with TEAL_CHROME_PROFILE if needed.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const dotenv = require('dotenv');
const envPath = path.join(VAULT, '.env');
dotenv.config({ path: envPath });
if (!process.env.TEAL_EMAIL || !process.env.TEAL_PASSWORD) {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
}
const { DIGESTS_DIR, DATA_DIR, JOBS_DIR, TEAL_DIR, PROFILE_EXTENSION, PROFILE_APP, ensureDirs } = require('./job-search-paths.cjs');
const { deriveTitleFromDescription } = require('./job-search-utils.cjs');

function getDefaultChromeProfileDir() {
  const home = os.homedir();
  const platform = os.platform();
  let candidates = [];
  if (platform === 'darwin') {
    candidates = [
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default'),
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 1')
    ];
  } else if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    candidates = [
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default'),
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Profile 1')
    ];
  } else {
    candidates = [
      path.join(home, '.config', 'google-chrome', 'Default'),
      path.join(home, '.config', 'google-chrome', 'Profile 1')
    ];
  }
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function resolveChromeProfileDir() {
  const env = process.env.TEAL_CHROME_PROFILE;
  if (env) {
    const expanded = env.replace(/^~/, os.homedir());
    const resolved = path.resolve(expanded);
    if (fs.existsSync(resolved)) return resolved;
  }
  return getDefaultChromeProfileDir();
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.includes('linkedin.com') && u.pathname.includes('/jobs/view/')) {
      const id = u.pathname.match(/\/view\/(\d+)/);
      return id ? `https://www.linkedin.com/comm/jobs/view/${id[1]}` : url;
    }
  } catch (_) {}
  return url;
}

function getUrlsFromJson(jsonPath) {
  if (!fs.existsSync(jsonPath)) return [];
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const list = Array.isArray(data) ? data : [];
  const seen = new Set();
  return list
    .map((j) => (j.url || j.rawUrl || '').trim())
    .filter((url) => {
      const n = normalizeUrl(url);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return n.includes('linkedin.com') && /\/view\/\d+/.test(n);
    })
    .map(normalizeUrl);
}

const JOB_LINE_RE = /^- \[[ x\-]\] \[[^\]]*\]\((https?:[^)]+)\)/;

function getUrlsFromDigest(mdPath) {
  if (!fs.existsSync(mdPath)) return [];
  const text = fs.readFileSync(mdPath, 'utf8');
  const lines = text.split('\n');
  const seen = new Set();
  const urls = [];
  for (const line of lines) {
    const m = line.match(JOB_LINE_RE);
    if (!m) continue;
    const raw = m[1].trim();
    const n = raw.includes('linkedin.com') ? normalizeUrl(raw) : raw;
    if (n && !seen.has(n)) {
      seen.add(n);
      urls.push(n);
    }
  }
  return urls;
}

function getJobIdFromUrl(url) {
  const m = (url || '').match(/\/jobs\/view\/(\d+)/);
  return m ? m[1] : null;
}

function escapeRegex(s) {
  return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Get jobs with full data (url, job_title, company, job_description) for --app mode. Order by digest URLs. Falls back to jobs/<id>.json when description missing in aggregate. */
function getJobsWithData(digestPath, jsonPath, limit) {
  const urls = getUrlsFromJson(jsonPath).length ? getUrlsFromJson(jsonPath) : getUrlsFromDigest(digestPath);
  if (urls.length === 0) return [];
  let list = [];
  const byUrl = new Map();
  if (jsonPath && fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    (Array.isArray(data) ? data : []).forEach((j) => {
      const u = normalizeUrl(j.url || j.rawUrl || '');
      if (u) byUrl.set(u, j);
    });
  }
  list = urls.map((url) => {
    const j = byUrl.get(url) || {};
    let job_description = j.job_description || '';
    let job_title = j.job_title || j.title || '';
    let company = (j.company && j.company.trim()) || '—';
    let work_type = j.work_type || '';
    if (!job_description || job_description.length < 100) {
      const jobId = getJobIdFromUrl(url);
      if (jobId) {
        const jobPath = path.join(JOBS_DIR, jobId + '.json');
        if (fs.existsSync(jobPath)) {
          try {
            const single = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
            if (single.job_description && single.job_description.length >= 100) {
              job_description = single.job_description;
              if (single.job_title) job_title = single.job_title;
              if (single.company && single.company.trim()) company = single.company.trim();
              if (single.work_type) work_type = single.work_type;
            }
          } catch (_) {}
        }
      }
    }
    const emptyOrViewJob = !job_title || job_title.trim() === '' || /^View job$/i.test(job_title.trim());
    if (emptyOrViewJob && job_description && job_description.length >= 50) {
      const derived = deriveTitleFromDescription(job_description);
      if (derived) job_title = derived;
    }
    if (!job_title || job_title.trim() === '') job_title = '—';
    return { url, job_title, company, job_description, work_type };
  });
  return limit > 0 ? list.slice(0, limit) : list;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const useApp = process.argv.includes('--app');
  const setup = process.argv.includes('--setup');
  const debug = process.argv.includes('--debug');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;
  ensureDirs();

  const input = args[0] || 'linkedin-jobs-' + new Date().toISOString().slice(0, 10) + '.md';
  let digestPath = path.isAbsolute(input) ? input : path.join(DIGESTS_DIR, input);
  if (!fs.existsSync(digestPath) && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    digestPath = path.join(DIGESTS_DIR, `linkedin-jobs-${input}.md`);
  }
  const dateMatch = path.basename(digestPath).match(/(\d{4}-\d{2}-\d{2})/);
  const jsonPath = dateMatch ? path.join(DATA_DIR, `job-descriptions-${dateMatch[1]}.json`) : null;

  const jobs = useApp ? getJobsWithData(digestPath, jsonPath, limit) : [];
  let urls = useApp ? jobs.map((j) => j.url) : (jsonPath ? getUrlsFromJson(jsonPath) : getUrlsFromDigest(digestPath));
  if (urls.length === 0 && !useApp) {
    urls = getUrlsFromDigest(digestPath);
    if (limit > 0) urls = urls.slice(0, limit);
  }
  if (urls.length === 0 && jobs.length === 0) {
    console.error('No job URLs found in digest.');
    process.exit(1);
  }
  if (!useApp && limit > 0) urls = urls.slice(0, limit);

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  const TEAL_SIGN_IN_URL = 'https://app.tealhq.com/sign-in?r=%2Fjob-tracker';
  const chromeProfileDir = useApp ? resolveChromeProfileDir() : null;
  const profileDir = useApp
    ? (chromeProfileDir || fs.mkdtempSync(path.join(os.tmpdir(), 'teal-playwright-')))
    : PROFILE_EXTENSION;
  const useSystemChrome = useApp && !!chromeProfileDir;

  if (useSystemChrome) {
    console.log('Используется профиль Chrome:', profileDir);
    console.log('(Если Chrome уже открыт — закройте его перед запуском, иначе возможны вылеты.)');
  } else if (useApp) {
    console.log('Профиль Chrome не найден — временный профиль. Войдите в Teal в открывшемся окне.');
  }

  const launchOptions = {
    headless: false,
    timeout: 90000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run']
  };
  if (useSystemChrome || !useApp) {
    launchOptions.channel = 'chrome';
  }

  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(profileDir, launchOptions);
  } catch (e) {
    if (!useApp && e.message && e.message.includes('channel')) {
      console.error('Chrome не найден. Используйте --app для добавления вакансий через веб-приложение Teal.');
      process.exit(1);
    }
    throw e;
  }
  if (useApp && !useSystemChrome) {
    context.on('close', () => { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {} });
  }

  await sleep(2000);
  let page = context.pages()[0];
  if (!page || page.isClosed()) page = await context.newPage();

  if (useApp) {
    if (setup) {
      console.log('Setup: opening Teal Sign In. Log in; script will exit when it detects the dashboard (or after 10 min).');
      await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);
      const deadline = Date.now() + 10 * 60 * 1000;
      while (Date.now() < deadline) {
        await sleep(2000);
        try {
          for (const p of context.pages()) {
            const url = p.url();
            if (url.includes('app.tealhq.com') && !url.includes('sign-up') && !url.includes('sign-in') && !url.includes('login') && !url.includes('accounts.google.com')) {
              console.log('Detected Teal dashboard. Setup done.');
              await context.close();
              return;
            }
          }
        } catch (e) {
          if (!e.message || !e.message.includes('Target closed')) throw e;
          break;
        }
      }
      console.log('Timeout. If you logged in, run the script without --setup.');
      try { await context.close(); } catch (_) {}
      return;
    }
    await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(5000);
    const currentUrl = page.url();
    const isRedirectToAuth = currentUrl.includes('sign-up') || currentUrl.includes('login') || currentUrl.includes('accounts.google.com');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const looksLikeLogin = /sign in|sign up|log in|create account/i.test(bodyText.slice(0, 2000)) && !/add job|job tracker|bookmarked/i.test(bodyText.slice(0, 3000));
    if (isRedirectToAuth || looksLikeLogin) {
      const tealEmail = process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim();
      const tealPassword = process.env.TEAL_PASSWORD;
      if (tealEmail && tealPassword) {
        console.log('Вход по TEAL_EMAIL/TEAL_PASSWORD из .env …');
        await page.goto(TEAL_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(2000);
        const emailLink = page.locator('a:has-text("Email"), button:has-text("Email"), [data-testid*="email"], a:has-text("Continue with email")').first();
        if ((await emailLink.count()) > 0) {
          try {
            await emailLink.click();
            await sleep(1500);
          } catch (_) {}
        }
        const emailInput = page.locator('input[type="email"], input[name*="email" i], input[placeholder*="email" i]').first();
        const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
        if ((await emailInput.count()) > 0 && (await passwordInput.count()) > 0) {
          await emailInput.fill(tealEmail);
          await sleep(300);
          await passwordInput.fill(tealPassword);
          await sleep(300);
          const submitBtn = page.locator('button[type="submit"]').first();
          const signInBtn = page.getByRole('button', { name: /sign\s*in|log\s*in/i });
          const altBtn = page.locator('button:has-text("Sign in"), button:has-text("Sign In"), button:has-text("Log in")').first();
          if ((await submitBtn.count()) > 0) await submitBtn.click();
          else if ((await signInBtn.count()) > 0) await signInBtn.first().click();
          else if ((await altBtn.count()) > 0) await altBtn.click();
          else await page.locator('form').first().evaluate((f) => f.submit());
          await sleep(5000);
          const afterUrl = page.url();
          const afterAuth = afterUrl.includes('app.tealhq.com') && !afterUrl.includes('sign-up') && !afterUrl.includes('sign-in') && !afterUrl.includes('/login') && !afterUrl.includes('accounts.google.com');
          if (afterAuth) {
            console.log('Вход выполнен.');
            await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await sleep(2000);
          } else {
            if (debug) {
              await page.screenshot({ path: path.join(TEAL_DIR, 'teal-login-check.png') });
              fs.writeFileSync(path.join(TEAL_DIR, 'teal-login-check.html'), await page.content(), 'utf8');
            }
            await context.close();
            console.error('Вход не прошёл или редирект. Проверьте TEAL_EMAIL/TEAL_PASSWORD в .env или запустите с --debug.');
            process.exit(1);
          }
        } else {
          await context.close();
          console.error('Форма входа по email не найдена (возможно, только Google). Задайте TEAL_EMAIL/TEAL_PASSWORD в .env для входа по email или закройте Chrome и запустите с вашим профилем.');
          process.exit(1);
        }
      } else {
        await context.close();
        const envFile = path.join(VAULT, '.env');
        console.error('Креды не найдены. Проверьте:');
        console.error('  Файл .env: ' + envFile);
        console.error('  TEAL_EMAIL задан: ' + (!!(process.env.TEAL_EMAIL && process.env.TEAL_EMAIL.trim())) + ', TEAL_PASSWORD задан: ' + !!process.env.TEAL_PASSWORD);
        console.error('Добавьте в .env строки (без кавычек, без пробелов вокруг =):');
        console.error('  TEAL_EMAIL=ваш@email.com');
        console.error('  TEAL_PASSWORD=пароль');
        process.exit(1);
      }
    }
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      console.log(`[${i + 1}/${jobs.length}] ${(job.job_title || job.url).slice(0, 50)} …`);
      try {
        if (!(job.job_description || '').trim() || (job.job_description || '').trim().length < 50) {
          console.log('  → Skip: no description or too short (required).');
          continue;
        }
        const addNewJobBtn = page.locator('button:has-text("Add a new job"), button:has-text("Add a New Job"), a:has-text("Add a new job")').first();
        if ((await addNewJobBtn.count()) > 0 && (await addNewJobBtn.isVisible())) await addNewJobBtn.click();
        else {
          const fallback = page.locator('button, a').filter({ hasText: /add a new job/i }).first();
          if ((await fallback.count()) > 0) await fallback.click();
        }
        await sleep(3000);
        const dialog = page.locator('.ant-modal.job-tracker-job-modal, [role="dialog"].ant-modal, [role="dialog"], [data-state="open"], .modal').first();
        const form = (await dialog.count()) > 0 && (await dialog.isVisible()) ? dialog : page;

        async function fillField(selectors, value) {
          if (!value || typeof value !== 'string') return;
          const trimmed = value.trim().slice(0, 5000);
          for (const sel of selectors) {
            const el = form.locator(sel).first();
            if ((await el.count()) > 0 && (await el.isVisible())) {
              await el.fill(trimmed);
              await sleep(200);
              return;
            }
          }
        }

        await fillField(['input[type="url"]', 'input[placeholder*="url" i]', 'input[placeholder*="link" i]', 'input[name*="url" i]'], job.url);
        await fillField(['input[placeholder*="job title" i]', 'input[placeholder*="position" i]', 'input[name*="title" i]', 'input[name*="position" i]', 'input[aria-label*="title" i]'], job.job_title);
        const companyValue = (job.company || '').trim() || '—';
        await fillField(['input[placeholder*="company" i]', 'input[name*="company" i]', 'input[aria-label*="company" i]', 'input[placeholder*="Company" i]'], companyValue);
        await fillField(['input[placeholder*="location" i]', 'input[placeholder*="type" i]', 'input[name*="location" i]', 'input[name*="work" i]', 'select[name*="location" i]', 'select[name*="type" i]'], job.work_type);

        const descSelectors = [
          '.ProseMirror', '.tiptap.ProseMirror', 'div.ProseMirror', '[class*="ProseMirror"][class*="cursor-text"]',
          'textarea[placeholder*="description" i]', 'textarea[name*="description" i]', 'textarea[aria-label*="description" i]',
          'textarea', '[contenteditable="true"]', 'div[role="textbox"]',
          '[data-placeholder*="description" i]', '[data-placeholder*="paste" i]'
        ];
        let descTextarea = null;
        const descText = (job.job_description || '').trim().slice(0, 15000);
        for (const sel of descSelectors) {
          const textarea = form.locator(sel).first();
          if ((await textarea.count()) > 0 && (await textarea.isVisible()) && descText.length > 0) {
            await textarea.click();
            await sleep(200);
            await textarea.fill(descText);
            await sleep(300);
            let valueNow = await textarea.inputValue().catch(() => '') || await textarea.textContent().catch(() => '') || '';
            if ((valueNow || '').trim().length < 50 && /ProseMirror|tiptap|contenteditable/i.test(sel)) {
              await page.evaluate((text) => navigator.clipboard.writeText(text), descText);
              await textarea.click();
              await sleep(100);
              await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
              await sleep(500);
              valueNow = await textarea.textContent().catch(() => '') || '';
            }
            if ((valueNow || '').trim().length >= 50) {
              descTextarea = textarea;
              break;
            }
          }
        }
        const descValueNow = descTextarea
          ? (await descTextarea.inputValue().catch(() => '') || await descTextarea.textContent().catch(() => '') || '').trim()
          : '';
        if (!descTextarea || (descValueNow || '').length < 50) {
          const debugPath = path.join(TEAL_DIR, 'teal-form-no-description.html');
          fs.writeFileSync(debugPath, await page.content(), 'utf8');
          if (debug) await page.screenshot({ path: path.join(TEAL_DIR, 'teal-form-no-description.png') });
          console.log('  → Skip: description not filled or empty in form (required). Debug: ' + debugPath);
          await page.keyboard.press('Escape');
          await sleep(500);
          continue;
        }
        const submitInDialog = (await dialog.count()) > 0
          ? dialog.locator('button').filter({ hasNotText: 'Save this Search' }).filter({ hasText: /Add|Save|Submit/i }).first()
          : page.locator('button').filter({ hasNotText: 'Save this Search' }).filter({ hasText: /^Add$|^Save$|^Submit$/i }).first();
        if ((await submitInDialog.count()) > 0 && (await submitInDialog.isEnabled())) await submitInDialog.click();
        else {
          const anySubmit = page.locator('button[type="submit"]').filter({ hasNotText: 'Save this Search' }).first();
          if ((await anySubmit.count()) > 0 && (await anySubmit.isEnabled())) await anySubmit.click();
        }
        await sleep(2500);
        const bodyAfter = await page.locator('body').innerText().catch(() => '');
        const toastDuplicate = page.getByText(/already saved a job post with this URL|you've already saved|duplicate|this job is already in your tracker/i);
        const alreadySaved =
          /already saved a job post with this URL|duplicate|this job is already|you've already saved/i.test(bodyAfter) ||
          ((await toastDuplicate.count()) > 0 && (await toastDuplicate.first().isVisible().catch(() => false)));
        if (alreadySaved) {
          await page.keyboard.press('Escape');
          await sleep(500);
          await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'networkidle', timeout: 20000 });
          await page.waitForSelector('button:has-text("Add a new job"), button:has-text("Add a New Job")', { state: 'visible', timeout: 10000 }).catch(() => {});
          await sleep(2000);
          const descText = (job.job_description || '').trim().slice(0, 15000);
          const jobTitle = (job.job_title || '').trim();
          const company = ((job.company || '').trim() && (job.company || '').trim() !== '—') ? (job.company || '').trim() : '—';
          const workType = (job.work_type || '').trim();
          const needFill = descText.length >= 50 || jobTitle || company || workType;
          if (needFill) {
            const titleMatch = jobTitle.slice(0, 40);
            const titleRegex = titleMatch.length > 1 ? new RegExp(escapeRegex(titleMatch.slice(0, 25)), 'i') : null;
            const filterByPlaceholder = page.getByPlaceholder('Filter Jobs');
            const filterInput = (await filterByPlaceholder.count()) > 0 ? filterByPlaceholder : page.locator('.ant-input-affix-wrapper.filter-input input, .filter-input input').first();
            if (titleMatch.length > 0) {
              if ((await filterInput.count()) > 0 && (await filterInput.isVisible().catch(() => false))) {
                console.log('  → Фильтр: ввожу «' + titleMatch + '»');
                await filterInput.focus();
                await sleep(200);
                await filterInput.evaluate((el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
                await sleep(200);
                await filterInput.fill(titleMatch);
                await sleep(2500);
              } else {
                console.log('  → Поле Filter Jobs не найдено.');
              }
            }
            let toClick = null;
            if (titleRegex) {
              const linkInTable = page.locator('table tbody tr td a').filter({ hasText: titleRegex }).first();
              if ((await linkInTable.count()) > 0 && (await linkInTable.isVisible().catch(() => false))) toClick = linkInTable;
              if (!toClick) {
                const linkAny = page.locator('a').filter({ hasText: titleRegex }).first();
                if ((await linkAny.count()) > 0 && (await linkAny.isVisible().catch(() => false))) toClick = linkAny;
              }
              if (!toClick) {
                const row = page.locator('[role="row"], tbody tr').filter({ hasText: titleRegex }).first();
                if ((await row.count()) > 0 && (await row.isVisible().catch(() => false))) {
                  const linkInRow = row.locator('a').filter({ hasText: titleRegex }).first();
                  if ((await linkInRow.count()) > 0 && (await linkInRow.isVisible().catch(() => false))) toClick = linkInRow;
                }
              }
            }
            if (toClick) {
              console.log('  → Открываю страницу вакансии: «' + titleMatch + '»');
              const urlBefore = page.url();
              await toClick.click();
              await Promise.race([
                page.waitForURL((u) => u.pathname !== new URL(urlBefore).pathname || u.hash !== new URL(urlBefore).hash, { timeout: 8000 }),
                sleep(4000)
              ]).catch(() => {});
              await sleep(2000);
              const editBtn = page.getByRole('button', { name: /edit/i }).first();
              if ((await editBtn.count()) > 0 && (await editBtn.isVisible().catch(() => false))) {
                await editBtn.click();
                await sleep(2000);
              }
              const editForm = page.locator('.ant-modal.job-tracker-job-modal, [role="dialog"].ant-modal, [role="dialog"]').first();
              const formScope = (await editForm.count()) > 0 && (await editForm.isVisible()) ? editForm : page;
              const titleInput = formScope.locator('input[placeholder*="job title" i], input[placeholder*="position" i], input[name*="title" i]').first();
              const companyInput = formScope.locator('input[placeholder*="company" i], input[name*="company" i]').first();
              const descEl = formScope.locator('.ProseMirror, .tiptap.ProseMirror').first();
              const workTypeInput = formScope.locator('input[placeholder*="location" i], input[placeholder*="type" i], input[name*="work" i], select[name*="type" i], select[name*="location" i]').first();
              const needTitle = jobTitle && (!(await titleInput.count()) || !(await titleInput.inputValue().catch(() => '')) || (await titleInput.inputValue().catch(() => '')).trim().length < 2);
              const needCompany = (!(await companyInput.count()) || !(await companyInput.inputValue().catch(() => '')) || (await companyInput.inputValue().catch(() => '')).trim().length < 2);
              const currentDesc = (await descEl.count()) > 0 ? (await descEl.textContent().catch(() => '') || '').trim() : '';
              const needDesc = descText.length >= 50 && currentDesc.length < 50;
              const needWorkType = workType && (!(await workTypeInput.count()) || !(await workTypeInput.inputValue().catch(() => '')) || (await workTypeInput.inputValue().catch(() => '')).trim().length < 2);
              if (needTitle || needCompany || needDesc || needWorkType) {
                console.log('  → Дозаполняю: ' + [needTitle && 'название', needCompany && 'компания', needDesc && 'описание', needWorkType && 'тип занятости'].filter(Boolean).join(', '));
                if (needTitle && (await titleInput.count()) > 0 && (await titleInput.isVisible().catch(() => false))) {
                  await titleInput.fill(jobTitle.slice(0, 500));
                  await sleep(200);
                }
                if (needCompany && (await companyInput.count()) > 0 && (await companyInput.isVisible().catch(() => false))) {
                  await companyInput.fill((company || '—').slice(0, 500));
                  await sleep(200);
                }
                if (needDesc && (await descEl.count()) > 0 && (await descEl.isVisible())) {
                  await descEl.click();
                  await sleep(200);
                  await page.evaluate((text) => navigator.clipboard.writeText(text), descText);
                  await descEl.click();
                  await sleep(100);
                  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v');
                  await sleep(500);
                }
                if (needWorkType && (await workTypeInput.count()) > 0 && (await workTypeInput.isVisible().catch(() => false))) {
                  await workTypeInput.fill(workType.slice(0, 200));
                  await sleep(200);
                }
                const saveBtn = formScope.locator('button').filter({ hasText: /Save|Update|Submit/i }).first();
                if ((await saveBtn.count()) > 0 && (await saveBtn.isEnabled())) await saveBtn.click();
                await sleep(2000);
              } else {
                console.log('  → Все поля уже заполнены.');
              }
              await page.keyboard.press('Escape');
              await sleep(500);
            } else {
              console.log('  → В списке не найдена вакансия с названием «' + titleMatch + '». Пропуск.');
            }
          } else {
            console.log('  → Дубликат (дозаполнение не требуется).');
          }
        }
        await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(2000);
        if (debug && i === 0) {
          await page.screenshot({ path: path.join(TEAL_DIR, 'teal-app-debug.png') });
          fs.writeFileSync(path.join(TEAL_DIR, 'teal-app-debug.html'), await page.content(), 'utf8');
          console.log('  → Debug: saved teal-app-debug.png and teal-app-debug.html');
        }
      } catch (e) {
        console.log('  → Error:', e.message);
        try {
          await page.goto('https://app.tealhq.com/job-tracker', { waitUntil: 'domcontentloaded', timeout: 10000 });
          await sleep(1500);
        } catch (_) {}
      }
    }
    await context.close();
    console.log('Done.');
    return;
  }

  if (setup) {
    console.log('Setup: install Teal in this profile (LinkedIn already used by job-search).');
    console.log('1. Install Teal: https://chromewebstore.google.com/detail/teal-job-search-companion/opafjjlpbiaicbbgifbejoochmmeikep');
    console.log('2. Log into Teal at app.tealhq.com if prompted.');
    await page.goto('https://app.tealhq.com/login', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => page.goto('https://app.tealhq.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 15000 }));
    await sleep(3000);
    console.log('When done, close this browser. Next run (without --setup) will add jobs automatically.');
    return;
  }

  await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  if (page.url().includes('/login') || page.url().includes('/authwall')) {
    await context.close();
    console.error('Not logged into LinkedIn. Run with --setup or use --app to add via Teal web app.');
    process.exit(1);
  }
  await sleep(1500);

  const tealSelectors = [
    'button:has-text("Save")',
    'button:has-text("Bookmark")',
    'button:has-text("Add to Teal")',
    'a:has-text("Save to Teal")',
    '[data-teal-save]',
    '[data-testid*="teal"]',
    '[aria-label*="Save"]',
    '[aria-label*="Bookmark"]',
    'button[class*="teal"]',
    'a[href*="teal"]'
  ];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const jobId = url.match(/\/view\/(\d+)/)?.[1] || '?';
    console.log(`[${i + 1}/${urls.length}] Job ${jobId} …`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      if (page.url().includes('/login') || page.url().includes('/authwall')) {
        console.log('  → LinkedIn session expired, skip.');
        continue;
      }
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(3000);

      if (debug && i === 0) {
        await page.screenshot({ path: path.join(TEAL_DIR, 'teal-debug-screenshot.png') });
        fs.writeFileSync(path.join(TEAL_DIR, 'teal-debug-page.html'), await page.content(), 'utf8');
        console.log('  → Debug: saved teal-debug-screenshot.png and teal-debug-page.html');
      }

      let clicked = false;
      for (const sel of tealSelectors) {
        try {
          const btn = page.locator(sel).first();
          if ((await btn.count()) > 0 && (await btn.isVisible())) {
            await btn.click();
            clicked = true;
            console.log('  → Clicked Teal save.');
            break;
          }
        } catch (_) {}
      }
      if (!clicked) {
        const allButtons = await page.locator('button, a[role="button"]').all();
        for (const b of allButtons) {
          const text = (await b.textContent()) || '';
          const label = (await b.getAttribute('aria-label')) || '';
          if (/save|bookmark|add to teal/i.test(text + label)) {
            await b.click();
            clicked = true;
            console.log('  → Clicked by text/aria.');
            break;
          }
        }
      }
      if (!clicked) console.log('  → Teal button not found (extension may not be in this profile).');
      await sleep(2000);
    } catch (e) {
      console.log('  → Error:', e.message);
    }
  }

  await context.close();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
