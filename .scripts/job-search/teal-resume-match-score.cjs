#!/usr/bin/env node
/**
 * For each Teal resume (from LinkedIn export): open Job Matcher, enter job title,
 * select job from dropdown, wait for match score. If score < 80%, open Content Editor
 * and add a new Professional Summary (Add → type → Save) so you can edit it.
 *
 * Usage:
 *   node teal-resume-match-score.cjs [path-to-export.json] [--exclude Company1,Company2] [--from N] [--limit M]
 *   npm run job-search:teal-match-score -- [path]   # default: same list as resume batch (96). Use --filter for PM-only dedup list (40).
 *   npm run job-search:teal-match-score -- [path] [--from 1] [--limit 5]
 *   npm run job-search:teal-match-score -- --test   (only export from 2026-02-10, limit 1)
 *   npm run job-search:teal-match-score -- [path] --company Cloudbeds --wait-for-click
 *   # Test Applied export on one resume by link (no digest; opens resume, exports resume PDF + cover letter):
 *   npm run job-search:teal-match-score -- --resume-url "https://app.tealhq.com/resume-builder/resumes/<uuid>/preview" [--company "Company Name"] [--job-title "Product Manager"] [--job-description-file path/to/jd.txt]
 *   Same UUID works with Teal short URL: .../resume-builder/<uuid>/preview (no "resumes/" segment).
 *     With --job-title and --company: renames resume to "Title — Company" before Job Matcher (fixes wrong names like "Single System — —").
 *     With --job-description-file the script auto-generates the cover letter (OpenAI + python-docx) into Applied/<Company>/<Vacancy>/.
 *
 * Browser: tries CDP (your Chrome with --remote-debugging-port=9222) first; if that fails,
 *   falls back to launching Chrome with your profile (launchPersistentContext) so it works without manual setup.
 * Progress: stdout + 00-Inbox/Job_Search/teal/match-score.log
 * On summary generation failure: full traceback and payload are appended to teal/summary-errors.log;
 *   then one retry without skills_report (fallback). Use the log to debug and fix issues.
 *
 * Browser console may show CSP "script-src 'none'" (report-only) and chrome-extension://invalid/
 * — these come from Teal or extensions, not from this script; safe to ignore.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const { spawn, spawnSync } = require('child_process');
const { TEAL_DIR, TEAL_FLOW_DIR, ensureDirs, VAULT: VAULT_PATH, JOB_SEARCH_ROOT, LINKEDIN_DIGESTS_DIR, DATA_DIR, JOBS_DIR, APPLIED_BASE, COVER_LETTERS_DIR, TEAL_CHROME_PROFILE_ALT, TEAL_CHROME_PROFILE_MATCHSCORE, TEAL_CHROME_PROFILE_BATCH, TEAL_CHROME_PROFILE_FALLBACK } = require('./job-search-paths.cjs');
// Default profile for match-score so it can run in parallel with resume-for-job and batch
if (!process.env.TEAL_CHROME_PROFILE) process.env.TEAL_CHROME_PROFILE = TEAL_CHROME_PROFILE_MATCHSCORE;
const {
  getTealProfileCandidates,
  getTealProfileCandidatesForSession,
  removeStaleSingletonLock,
  launchPersistentContextGuarded
} = require('./teal-chrome-profile.cjs');
const { loadTealEnv, doTealLogin } = require('./teal-login-helper.cjs');
const { updateFlowProgress } = require('./teal-flow-state.cjs');
const { isRemoteFromExcludedCountry, isVideoGamingRole, isAutomotiveRole, isHardwareRole, isTelecomRole, requiresSapExperience, requiresHighTravel, requiresRelocation, requiresResidenceInExcludedCountry, isBelowMinSalary, fetchJobPageTitleAndCompany, deriveTitleFromDescription, looksLikeJobTitle } = require('./job-search-utils.cjs');
const { extractResumeExperienceFromPage } = require('./teal-resume-experience.cjs');
const {
  STEP8_MIN_MATCH_SCORE,
  STEP8_MIN_JD_LENGTH,
  STEP8_MAX_SUMMARY_ITERATIONS,
  hasQualifyingJobDescription,
  shouldRunStep8SummaryLoop,
  shouldLogLowScoreWithoutJd,
  shouldContinueStep8SummaryLoop,
  buildStep8SummaryExitReason,
  shouldWarnScoreStillLowAfterLoop,
  writeStep8EvidenceFile
} = require('./professional-summary-step8-policy.cjs');
const CORE_MCP = path.join(VAULT_PATH, 'core', 'mcp');
let scriptErrors;
try {
  scriptErrors = require('../script-errors/script-errors.cjs');
} catch (_) {
  scriptErrors = null;
}
try {
  require('dotenv').config({ path: path.join(VAULT_PATH, '.env') });
} catch (_) {}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Reload with retries: transient network drops (ERR_INTERNET_DISCONNECTED) or slow Teal
 * should not kill a long match-score run.
 */
async function safeReloadPage(page, logProgress, label) {
  const maxAttempts = 4;
  let lastErr = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
      return;
    } catch (e) {
      lastErr = e;
      const msg = (e && e.message) ? String(e.message) : String(e);
      const transient =
        /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION|TIMED_OUT|Timeout/i.test(msg);
      if (logProgress) {
        logProgress(
          '[Teal match-score] reload failed' +
            (label ? ' (' + label + ')' : '') +
            ' attempt ' +
            (i + 1) +
            '/' +
            maxAttempts +
            ': ' +
            msg.slice(0, 120)
        );
      }
      if (!transient || i === maxAttempts - 1) break;
      await sleep(2000 * (i + 1));
    }
  }
  throw lastErr || new Error('safeReloadPage: reload failed');
}

/** Wait until port is connectable. Returns true when connected. */
function waitForPort(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryConnect = () => {
      const sock = net.createConnection(port, host, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(tryConnect, 600);
      });
    };
    tryConnect();
  });
}

/** Start Chrome with remote debugging (macOS). If Chrome is already running, args are ignored — user must quit first. */
function startChromeWithDebugPort() {
  if (os.platform() !== 'darwin') return;
  try {
    spawn('open', ['-a', 'Google Chrome', '--args', '--remote-debugging-port=9222'], { stdio: 'ignore', detached: true });
  } catch (_) {}
}

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const DEFAULT_EXPORT = path.join(VAULT, '00-Inbox/Job_Search/data/dex-linkedin-search-senior-product-manager-2026-02-10.json');
/** Default source: digest MD (we work from digest, not raw JSON). */
const DEFAULT_DIGEST = path.join(LINKEDIN_DIGESTS_DIR || path.join(VAULT, '00-Inbox/Job_Search/digests/linkedin'), 'search-senior-product-manager-2026-02-10.md');
const PROGRESS_LOG = path.join(TEAL_DIR, 'match-score.log');
/** Full stderr/traceback from failed summary generation (append). Used to debug and self-correct. */
const SUMMARY_ERROR_LOG = path.join(TEAL_DIR, 'summary-errors.log');

const MIN_SCORE = STEP8_MIN_MATCH_SCORE;
const SCORE_WAIT_MS = 60000; // 60s — Teal Job Matcher can be slow to compute score
const BETWEEN_RESUMES_MS = 2000;
const MIN_JOB_DESCRIPTION_LENGTH = STEP8_MIN_JD_LENGTH;
/** Safety cap: with current_summary passed to generator we expect 3–4 iterations; cap at 5. */
const MAX_SUMMARY_ITERATIONS = STEP8_MAX_SUMMARY_ITERATIONS;
/** Stop early if score is unchanged this many times in a row (avoids timeout; test completes successfully). */
const MAX_UNCHANGED_SCORE_ITERATIONS = 3;
/** Max refresh attempts when score is loading (job selected but Teal slow). On timeout we always refresh and retry. */
const MAX_SCORE_WAIT_REFRESHES = 3;

/**
 * Detect Job Matcher UI state: no job selected (empty state) vs job selected and score loading vs score visible.
 * So we can re-select when needed and refresh when Teal is just slow.
 */
async function detectJobMatcherState(page) {
  const result = await page.evaluate(() => {
    const bodyText = (document.body.innerText || document.body.textContent || '').toLowerCase();
    const scoreMatch = bodyText.match(/\b(\d{1,3})%\s*(?:\n|$|hard|soft|other)/im);
    if (scoreMatch) {
      const n = parseInt(scoreMatch[1], 10);
      if (n >= 0 && n <= 100) return { state: 'score_visible', score: n };
    }

    const loader = document.querySelector('svg.lucide-loader');
    if (loader && loader.offsetParent !== null) return { state: 'job_selected_loading' };

    const noJobPatterns = [
      'select a job',
      'select job',
      'search for a job',
      'search for jobs',
      'choose a job',
      'to see your match',
      'add a job to get started',
      'link a job'
    ];
    if (noJobPatterns.some((p) => bodyText.includes(p))) return { state: 'no_job_selected' };

    const rightCol = document.querySelector('#right-col') || document.querySelector('[data-testid="job-matcher-content"]');
    const rightColText = rightCol ? (rightCol.innerText || rightCol.textContent || '').toLowerCase() : '';
    if (rightCol && rightColText.length < 80 && !rightColText.includes('%')) return { state: 'no_job_selected' };

    return { state: 'unknown' };
  }).catch(() => ({ state: 'unknown' }));
  return result;
}

/** Wait for Teal match score to appear on Job Matcher. Returns score (0-100) or null. */
async function waitForMatchScore(page, logProgress) {
  for (let w = 0; w < SCORE_WAIT_MS / 500; w++) {
    await sleep(500);
    const loaderVisible = await page.locator('svg.lucide-loader').first().isVisible().catch(() => false);
    if (loaderVisible) continue;
    const scoreDivs = await page.locator('div.font-bold, div.text-lg').all();
    for (const div of scoreDivs) {
      const text = (await div.textContent().catch(() => '') || '').trim();
      const match = text.match(/^(\d+)%$/);
      if (match) return parseInt(match[1], 10);
    }
  }
  return null;
}

/**
 * Wait for score with retries: distinguish "no job selected" (re-select) from "job selected, score loading" (refresh and wait again).
 * After reload, call this so we don't give up on first timeout when Teal is just slow.
 */
async function waitForMatchScoreSmart(page, logProgress, job, selectJobFn) {
  for (let attempt = 0; attempt <= MAX_SCORE_WAIT_REFRESHES; attempt++) {
    const detected = await detectJobMatcherState(page);
    if (detected.state === 'score_visible' && typeof detected.score === 'number') {
      return detected.score;
    }
    if (detected.state === 'no_job_selected') {
      logProgress('[Teal match-score] Job Matcher: no job selected, re-selecting…');
      await selectJobFn(page, job, logProgress);
      await sleep(2000);
    } else if (detected.state === 'job_selected_loading' || detected.state === 'unknown') {
      if (attempt > 0) {
        logProgress('[Teal match-score] Job Matcher: job selected but score not shown yet (Teal slow), refreshing page (attempt ' + (attempt + 1) + '/' + (MAX_SCORE_WAIT_REFRESHES + 1) + ')…');
        await safeReloadPage(page, logProgress, 'job_selected_loading');
        await sleep(3000);
        await selectJobFn(page, job, logProgress);
        await sleep(2000);
      }
    }

    const score = await waitForMatchScore(page, logProgress);
    if (score !== null) return score;

    if (attempt < MAX_SCORE_WAIT_REFRESHES) {
      logProgress('[Teal match-score] Score not loaded in 60s — ' + (detected.state === 'no_job_selected' ? 'job was not selected' : 'Teal may be slow') + ', refreshing and retrying…');
      await safeReloadPage(page, logProgress, 'score_wait_smart');
      await sleep(3000);
    }
  }
  return null;
}

/** Wait for score; if not loaded within SCORE_WAIT_MS, refresh page and retry (up to 2 refreshes = 3 attempts). Never leave the page hanging on timeout — always refresh and retry. Returns score (0-100) or null. */
async function waitForMatchScoreWithReload(page, logProgress) {
  for (let attempt = 0; attempt <= MAX_SCORE_WAIT_REFRESHES; attempt++) {
    const score = await waitForMatchScore(page, logProgress);
    if (score !== null) return score;
    if (attempt < MAX_SCORE_WAIT_REFRESHES) {
      logProgress('[Teal match-score] Score not loaded in ' + (SCORE_WAIT_MS / 1000) + 's; refreshing page and retrying (attempt ' + (attempt + 2) + '/' + (MAX_SCORE_WAIT_REFRESHES + 1) + ')…');
      await safeReloadPage(page, logProgress, 'score_wait_reload');
      await sleep(3000);
    }
  }
  return null;
}

/** Extract red (missing), yellow (partial), green (matched) skills from Job Matcher right sidebar only (#right-col). Teal uses bg-[#F7D4D4], bg-[#FCEECF], bg-[#DBF0EA]. */
async function extractSkillsFromJobMatcher(page, logProgress) {
  const raw = await page.evaluate(() => {
    const out = { red: [], yellow: [], green: [] };
    const push = (arr, text) => {
      const t = (text || '').trim();
      if (t.length > 1 && t.length < 120 && !arr.includes(t)) arr.push(t);
    };
    // Teal right sidebar: red #F7D4D4/#8A230F, yellow #FCEECF/#986801, green #DBF0EA/#24423F
    const hasRed = (el) => {
      const c = el.className && typeof el.className === 'string' ? el.className : '';
      return /#F7D4D4|#8A230F|red|danger|error|missing|rose|destructive/i.test(c) || el.getAttribute?.('data-state') === 'missing' || el.getAttribute?.('data-status') === 'missing';
    };
    const hasYellow = (el) => {
      const c = el.className && typeof el.className === 'string' ? el.className : '';
      return /#FCEECF|#986801|yellow|amber|warning|partial|orange/i.test(c) || el.getAttribute?.('data-state') === 'partial' || el.getAttribute?.('data-status') === 'partial';
    };
    const hasGreen = (el) => {
      const c = el.className && typeof el.className === 'string' ? el.className : '';
      return /#DBF0EA|#24423F|green|success|matched|emerald/i.test(c) || el.getAttribute?.('data-state') === 'matched' || el.getAttribute?.('data-status') === 'matched';
    };
    const walk = (el, depth) => {
      if (depth > 8) return;
      const text = (el.innerText || el.textContent || '').trim();
      if (text.length > 1 && text.length < 120) {
        let cur = el;
        while (cur && cur !== document.body) {
          if (hasRed(cur)) { push(out.red, text); return; }
          if (hasYellow(cur)) { push(out.yellow, text); return; }
          if (hasGreen(cur)) { push(out.green, text); return; }
          cur = cur.parentElement;
        }
      }
      for (const child of el.children || []) walk(child, depth + 1);
    };
    // Only the right sidebar: score + Hard/Soft/Other skills (so summary can target red/yellow and reinforce green)
    const root = document.querySelector('#right-col') || document.querySelector('.profile-sidebar-container.right-col') || document.querySelector('[data-testid="job-matcher-content"]') || document.body;
    walk(root, 0);
    return out;
  }).catch(() => ({ red: [], yellow: [], green: [] }));
  if ((raw.red?.length || 0) + (raw.yellow?.length || 0) + (raw.green?.length || 0) > 0) {
    logProgress('  Job Matcher skills (right-col): red=' + (raw.red?.length || 0) + ' yellow=' + (raw.yellow?.length || 0) + ' green=' + (raw.green?.length || 0));
  }
  return raw;
}

/** Take one or more screenshots of Job Matcher right sidebar (#right-col). If the sidebar is scrollable, scrolls it and takes multiple screenshots so all skills are captured. Returns array of file paths (empty on failure). */
async function takeSkillsScreenshot(page, job, logProgress) {
  const url = page.url();
  if (!/\/matching(\/?\?|$)/i.test(url)) {
    const matchingUrl = url.replace(/\/preview\/?(\?.*)?$/i, '/matching');
    if (matchingUrl !== url) {
      logProgress('  Ensuring /matching before screenshot: ' + matchingUrl);
      await page.goto(matchingUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await sleep(2000);
    }
  }
  if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
  const slug = (job.company || job.title || 'job').replace(/\W+/g, '_').slice(0, 40);
  const timestamp = Date.now();
  const filepaths = [];
  try {
    const rightCol = page.locator('#right-col').first();
    if (await rightCol.count() === 0 || !(await rightCol.isVisible().catch(() => false))) {
      const filepath = path.join(TEAL_DIR, `teal-skills-${timestamp}-${slug}.png`);
      await page.screenshot({ path: filepath, fullPage: true });
      logProgress('  Screenshot (full page, #right-col not found): ' + filepath);
      return [filepath];
    }
    const { scrollHeight, clientHeight } = await rightCol.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    }));
    const needScroll = scrollHeight > clientHeight + 30;
    if (!needScroll) {
      const filepath = path.join(TEAL_DIR, `teal-skills-${timestamp}-${slug}.png`);
      await rightCol.screenshot({ path: filepath });
      logProgress('  Screenshot (right-col, single): ' + filepath);
      return [filepath];
    }
    logProgress('  Right-col scrollable (h=' + scrollHeight + '): taking multiple screenshots after scroll.');
    const step = Math.max(200, Math.floor(clientHeight * 0.85));
    let scrollTop = 0;
    let index = 0;
    while (scrollTop < scrollHeight) {
      await rightCol.evaluate((el, st) => { el.scrollTop = st; }, scrollTop);
      await sleep(250);
      const filepath = path.join(TEAL_DIR, `teal-skills-${timestamp}-${slug}-${index + 1}.png`);
      await rightCol.screenshot({ path: filepath });
      filepaths.push(filepath);
      scrollTop += step;
      index++;
    }
    logProgress('  Screenshots (right-col, ' + filepaths.length + ' parts): ' + filepaths.map((p) => path.basename(p)).join(', '));
    return filepaths;
  } catch (e) {
    logProgress('  Screenshot failed: ' + (e.message || String(e)).slice(0, 60));
    return [];
  }
}

const VISION_SKILLS_PROMPT = `This image is the RIGHT SIDEBAR of Teal Job Matcher: a match score (percentage) and skill/keyword tags in three colors.
- RED tags = skills missing from the resume (list each label text).
- YELLOW/AMBER tags = partial or needs improvement (list each label text).
- GREEN tags = matched (list each label text).

Sections may be titled "Hard Skills", "Soft Skills", "Other". Extract every tag label you see, grouped by color.

Return ONLY valid JSON, no markdown or explanation: {"red":["label1","label2"],"yellow":["label1"],"green":["label1","label2"]}. Use empty arrays [] for a color if none.`;

function parseVisionSkillsJson(raw) {
  if (!raw || !raw.trim()) return null;
  let jsonStr = raw.replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
  const brace = jsonStr.indexOf('{');
  if (brace >= 0) {
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > brace) jsonStr = jsonStr.slice(brace, lastBrace + 1);
  }
  const parsed = JSON.parse(jsonStr);
  const red = Array.isArray(parsed.red) ? parsed.red.filter((s) => typeof s === 'string' && s.trim()) : [];
  const yellow = Array.isArray(parsed.yellow) ? parsed.yellow.filter((s) => typeof s === 'string' && s.trim()) : [];
  const green = Array.isArray(parsed.green) ? parsed.green.filter((s) => typeof s === 'string' && s.trim()) : [];
  return { red, yellow, green };
}

function mergeSkillsDedupe(acc, next) {
  const norm = (s) => (s || '').trim().toLowerCase();
  const add = (arr, list) => {
    for (const label of list) {
      const n = norm(label);
      if (!n) continue;
      if (arr.some((x) => norm(x) === n)) continue;
      arr.push(label.trim());
    }
  };
  add(acc.red, next.red || []);
  add(acc.yellow, next.yellow || []);
  add(acc.green, next.green || []);
  return acc;
}

/** Extract red/yellow/green skills from one right-col screenshot via OpenAI Vision. */
async function extractSkillsFromOneScreenshotViaVision(screenshotPath, logProgress, requestId = null) {
  if (!screenshotPath || !fs.existsSync(screenshotPath)) return null;
  if (!process.env.OPENAI_API_KEY) {
    logProgress('  Vision: OPENAI_API_KEY not set, skipping');
    return null;
  }
  const base64 = fs.readFileSync(screenshotPath, { encoding: 'base64' });
  try {
    const OpenAI = require('openai');
    const { logOpenAICall, evalVisionSkills } = require('../lib/openai-usage-logger.cjs');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: VISION_SKILLS_PROMPT },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,' + base64 } }
          ]
        }
      ]
    });
    const usage = completion.usage;
    const raw = (completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content) || '';
    const result = parseVisionSkillsJson(raw);
    if (!result) return null;
    if (usage) {
      const { score, notes } = evalVisionSkills(result);
      logOpenAICall({
        operation: 'vision_skills',
        model: 'gpt-4o',
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        max_tokens_limit: 1024,
        request_id: requestId || undefined,
        iteration: 1,
        eval_score: score,
        eval_notes: notes
      });
    }
    return result;
  } catch (e) {
    const vmsg = e.message || String(e);
    if (/429|quota|rate limit|exceeded your current/i.test(vmsg)) {
      logProgress('  Vision: OpenAI quota/rate limit — skip Vision this round (use DOM skills only)');
    } else {
      logProgress('  Vision extraction failed: ' + vmsg.slice(0, 100));
    }
    try {
      if (scriptErrors && scriptErrors.logWarning) {
        scriptErrors.logWarning({
          source: 'job-search:teal-match-score',
          message: 'Vision extraction failed',
          context: { message: String(e && (e.message || e)).slice(0, 500) }
        });
      }
    } catch (_) {}
    return null;
  }
}

/** Extract red/yellow/green skills from one or more right-col screenshots. If multiple paths (scrollable sidebar), merges and dedupes skills. */
async function extractSkillsFromScreenshotViaVision(screenshotPathOrPaths, logProgress, requestId = null) {
  const paths = Array.isArray(screenshotPathOrPaths) ? screenshotPathOrPaths : (screenshotPathOrPaths ? [screenshotPathOrPaths] : []);
  if (paths.length === 0) {
    logProgress('  Vision: no screenshot path(s)');
    return null;
  }
  const merged = { red: [], yellow: [], green: [] };
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    if (!p || !fs.existsSync(p)) continue;
    const one = await extractSkillsFromOneScreenshotViaVision(p, logProgress, requestId ? requestId + '_part' + (i + 1) : null);
    if (one) mergeSkillsDedupe(merged, one);
  }
  if (merged.red.length || merged.yellow.length || merged.green.length) {
    logProgress('  Vision skills from screenshot(s): red=' + merged.red.length + ' yellow=' + merged.yellow.length + ' green=' + merged.green.length);
    return merged;
  }
  logProgress('  Vision: no skills extracted from screenshot(s)');
  return null;
}

/** Append a failure to summary-errors.log for debugging and self-correction. */
function appendSummaryError(payloadSummary, stderr, stdout) {
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    const block = [
      '--- ' + new Date().toISOString() + ' ---',
      'Payload: ' + payloadSummary,
      '-- stderr --',
      (stderr || '(none)').trim(),
      stdout ? '-- stdout --\n' + (stdout || '').trim() : '',
      ''
    ].filter(Boolean).join('\n') + '\n';
    fs.appendFileSync(SUMMARY_ERROR_LOG, block, 'utf8');
    logProgress('  Error log: ' + SUMMARY_ERROR_LOG);
  } catch (_) {}
  try {
    if (scriptErrors && scriptErrors.logError) {
      scriptErrors.logError({
        source: 'job-search:teal-match-score',
        message: 'Summary generation failed',
        error: { name: 'SummaryGenerationError', message: String(stderr || '').slice(0, 5000) },
        context: { payloadSummary: String(payloadSummary || '').slice(0, 1500) }
      });
    }
  } catch (_) {}
}

/**
 * Strip company name from title. Target Title in Teal must be job title only, never "Title — Company".
 * Removes trailing " — Company", " | Company", " at Company" when company is provided.
 */
function stripCompanyFromTitle(title, company) {
  if (!(title || '').trim()) return title || '';
  const t = (title || '').trim();
  const c = (company || '').trim();
  if (!c || c === '—') return t;
  const sep = [' — ', ' | ', ' at '];
  for (const s of sep) {
    if (t.endsWith(s + c)) return t.slice(0, t.length - (s + c).length).trim();
    const cNorm = c.replace(/\s+/g, ' ').trim();
    if (cNorm && t.endsWith(s + cNorm)) return t.slice(0, t.length - (s + cNorm).length).trim();
  }
  return t;
}

/**
 * Normalize job title for Teal Target Title: keep role + domain/context, strip noise.
 * Target Title must never contain company name (use stripCompanyFromTitle first).
 * Examples:
 *   "Product Owner (Telecomunicaciones) (100% Remoto)" -> "Product Owner (Telecomunicaciones)"
 *   "Product Manager (all genders) - Booking" -> "Product Manager - Booking"
 *   "Product Manager with a knack for Design (Figma)" -> "Product Manager (Figma)"
 */
function normalizeJobTitleForTeal(rawTitle) {
  if (!rawTitle || typeof rawTitle !== 'string') return 'Product Manager';
  let s = rawTitle.trim();
  if (!s) return 'Product Manager';
  // Remove trailing parentheticals that are work arrangement / EEO fluff (keep role-relevant ones like (Website), (AI))
  const noiseSuffixes = [
    /\s*\(\s*100%\s*Remoto\s*\)\s*$/i,
    /\s*\(\s*100%\s*Remote\s*\)\s*$/i,
    /\s*\(\s*Remote\s*\)\s*$/i,
    /\s*\(\s*Hybrid\s*\)\s*$/i,
    /\s*\(\s*on-site\s*\)\s*$/i,
    /\s*\(\s*all\s*genders\s*\)\s*$/i,
    /\s*\(\s*m\/f\/d(\/x)?\s*\)\s*$/i,
    /\s*-\s*100%\s*Remote\s*$/i,
    /\s*-\s*Remote\s*$/i,
    /\s*-\s*Hybrid\s*$/i
  ];
  for (const re of noiseSuffixes) {
    s = s.replace(re, '').trim();
  }
  // Remove filler phrases like "with a knack for Design" (keep the parenthetical if it's a domain/tool, e.g. (Figma))
  s = s.replace(/\s+with\s+a\s+knack\s+for\s+[^(]+/gi, '').trim();
  // Remove trailing " - (noise)" e.g. " - (Remote)"
  s = s.replace(/\s+-\s*\([^)]*\)\s*$/g, '').trim();
  return s || 'Product Manager';
}

/**
 * Get existing target titles and which are currently selected (checked).
 * Returns { titles: string[], selectedTitles: string[] }. Selected = shown in resume; unselected = in list but not active.
 */
async function getExistingTargetTitlesFromPage(page) {
  const result = await page.evaluate(() => {
    const block = document.querySelector('#target-titles');
    if (!block) return { titles: [], selectedTitles: [] };
    const skip = new Set(['target title', 'add a target title', 'save', 'e.g.', 'marketing manager', '']);
    const titles = [];
    const selectedTitles = [];
    const addBtn = block.querySelector('button[aria-label="Add a Target Title"]');
    const nodes = block.querySelectorAll('button, li, [role="listitem"], [role="option"], [data-target-title], [class*="target-title"]');
    nodes.forEach((n) => {
      if (n === addBtn) return;
      const t = (n.innerText || n.textContent || '').trim();
      if (t.length < 2 || t.length > 200 || skip.has(t.toLowerCase())) return;
      const container = n.closest('[aria-selected], [data-state], [role="option"], button, li, [role="listitem"]') || n;
      let el = container;
      let isSelected = false;
      for (let i = 0; i < 4 && el; i++) {
        if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('data-state') === 'selected') {
          isSelected = true;
          break;
        }
        el = el.parentElement;
      }
      titles.push(t);
      if (isSelected) selectedTitles.push(t);
    });
    return { titles: [...new Set(titles)], selectedTitles: [...new Set(selectedTitles)] };
  }).catch(() => ({ titles: [], selectedTitles: [] }));
  return result;
}

/**
 * On resume /preview: expand Target Title section if collapsed. If the normalized title already exists
 * in the list, select it (click); otherwise click Add a Target Title, fill input, Save.
 */
async function addTargetTitleToResume(page, normalizedTitle, logProgress) {
  const title = (normalizedTitle || '').trim();
  logProgress('  Target Title: step started (title="' + title.slice(0, 50) + (title.length > 50 ? '…' : '') + '")');
  if (!title) {
    logProgress('  Target Title: skipped — job title is empty.');
    return;
  }
  try {
    // Ensure we're on preview (left column has Target Title)
    const url = page.url();
    if (!/\/preview(\/?\?|$)/i.test(url)) {
      const previewUrl = url.replace(/\/matching\/?(\?.*)?$/i, '/preview');
      if (previewUrl !== url) {
        logProgress('  Target Title: navigating to /preview (current: ' + url.split('/').slice(-1)[0] + ')');
        await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(2000);
      }
    }
    logProgress('  Target Title: looking for #target-titles on page');
    const targetTitlesBlock = page.locator('#target-titles').first();
    if ((await targetTitlesBlock.count()) > 0) {
      const state = await targetTitlesBlock.getAttribute('data-state').catch(() => null);
      if (state === 'closed') {
        const trigger = targetTitlesBlock.locator('button[aria-expanded="false"]').first();
        if ((await trigger.count()) > 0 && (await trigger.isVisible().catch(() => false))) {
          await trigger.scrollIntoViewIfNeeded().catch(() => {});
          await sleep(200);
          await trigger.click();
          await sleep(600);
        }
      }
    } else {
      logProgress('  Target Title: #target-titles not found; trying heading "Target Title" to expand');
      const heading = page.locator('h3, [role="heading"]').filter({ hasText: /Target Title/i }).first();
      if ((await heading.count()) > 0 && (await heading.isVisible().catch(() => false))) {
        const parent = heading.locator('xpath=ancestor::*[@data-state="closed"][1]').first();
        if ((await parent.count()) > 0) {
          const trigger = parent.locator('button[aria-expanded="false"]').first();
          if ((await trigger.count()) > 0) {
            await trigger.scrollIntoViewIfNeeded().catch(() => {});
            await sleep(200);
            await trigger.click();
            await sleep(600);
          }
        }
      } else {
        logProgress('  Target Title: #target-titles and heading not found; will try getExistingTargetTitlesFromPage and Add button.');
      }
    }
    const { titles: existingTitles, selectedTitles } = await getExistingTargetTitlesFromPage(page);
    const titleLower = title.toLowerCase();
    const exists = existingTitles.some((t) => (t || '').trim().toLowerCase() === titleLower);
    const alreadySelected = selectedTitles.some((t) => (t || '').trim().toLowerCase() === titleLower);
    if (exists) {
      if (alreadySelected) {
        logProgress('  Target Title: already selected: ' + title);
        return;
      }
      const clickable = targetTitlesBlock.getByText(title, { exact: true }).first();
      if ((await clickable.count()) > 0 && (await clickable.isVisible().catch(() => false))) {
        await clickable.scrollIntoViewIfNeeded().catch(() => {});
        await sleep(200);
        await clickable.click();
        logProgress('  Target Title: selected (single click): ' + title);
        await sleep(600);
        return;
      }
    }
    const addBtn = page.locator('button[aria-label="Add a Target Title"]').first();
    if ((await addBtn.count()) === 0 || !(await addBtn.isVisible().catch(() => false))) {
      logProgress('  Target Title: Add button not found — cannot add new target title.');
      return;
    }
    logProgress('  Target Title: adding new title via Add button');
    await addBtn.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(300);
    await addBtn.click();
    await sleep(1500);
    const input = page.locator('input[placeholder*="e.g."], input[placeholder*="Marketing Manager"], input[name="name"]').first();
    if ((await input.count()) === 0 || !(await input.isVisible().catch(() => false))) {
      logProgress('  Target Title: input not found after Add');
      return;
    }
    await input.fill(title);
    await sleep(400);
    const saveBtn = page.locator('button[aria-label="Save"][type="submit"]').or(page.locator('button[type="submit"]').filter({ hasText: /^Save$/ })).first();
    if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible().catch(() => false))) {
      await saveBtn.click();
      logProgress('  Target Title set and saved: ' + title);
      await sleep(1500);
    } else {
      logProgress('  Target Title: Save button not found');
    }
  } catch (e) {
    logProgress('  Target Title error: ' + (e.message || String(e)));
  }
}

/**
 * Read current resume name/title from Teal resume detail page (same selectors as setResumeTitleInTeal).
 * Returns trimmed string or '' if not found.
 */
async function getCurrentResumeNameFromPage(page) {
  const nameSelectors = [
    'input[aria-label="Resume Title"]',
    'input[aria-label*="Resume" i][aria-label*="Title" i]',
    'input[placeholder*="resume name" i]',
    'input[placeholder*="Resume name" i]',
    'header input',
    'input[type="text"]'
  ];
  for (const sel of nameSelectors) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        const value = await el.inputValue().catch(() => '');
        if (value != null && String(value).trim()) return String(value).trim();
      }
    } catch (_) {}
  }
  return '';
}

/**
 * Set resume name/title in Teal UI (same as teal-resume-for-job). Used when we opened a resume with wrong name and need to rename to real title — company.
 */
async function setResumeTitleInTeal(page, resumeName, logProgress) {
  if (!(resumeName || '').trim()) return false;
  const name = (resumeName || '').trim().slice(0, 120);
  const nameSelectors = [
    'input[aria-label="Resume Title"]',
    'input[aria-label*="Resume" i][aria-label*="Title" i]',
    'input[placeholder*="resume name" i]',
    'input[placeholder*="Resume name" i]',
    'header input',
    'input[type="text"]'
  ];
  for (const sel of nameSelectors) {
    try {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0 && (await el.isVisible())) {
        await el.click();
        await sleep(300);
        await el.evaluate((node) => {
          node.focus();
          if (node.setSelectionRange) node.setSelectionRange(0, (node.value || '').length);
        });
        await page.keyboard.press('Backspace');
        await sleep(100);
        await el.fill(name);
        await sleep(300);
        await el.evaluate((node) => {
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof node.blur === 'function') node.blur();
        });
        await sleep(500);
        const box = await el.boundingBox();
        if (box) await page.mouse.click(box.x + box.width + 30, box.y + box.height / 2);
        else await page.keyboard.press('Tab');
        await sleep(1500);
        logProgress('  Resume renamed in Teal to: ' + name.slice(0, 60) + (name.length > 60 ? '...' : ''));
        return true;
      }
    } catch (_) {}
  }
  return false;
}

/** Run Python summary script; returns { ok, summary, stderr, stdout } without throwing. */
function runSummaryScript(scriptPath, inputPath, outputPath) {
  const result = spawnSync('python3', [scriptPath], {
    cwd: VAULT_PATH,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, PYTHONPATH: CORE_MCP },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  return {
    ok: result.status === 0,
    stderr: (result.stderr || '').trim(),
    stdout: (result.stdout || '').trim(),
    status: result.status
  };
}

/** Normalize summary for paste: paragraphs = blocks separated by blank line. Join with \n\n\n (3 newlines) so Teal shows one visible gap; \n\n often collapses to no visible spacing. */
function normalizeSummaryForTealEditor(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  const paragraphs = trimmed.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= 1) return trimmed;
  return paragraphs.join('\n\n\n');
}

/** Paste summary paragraph-by-paragraph and press Enter after each (except last). Teal/ProseMirror ignores pasted \\n\\n; real block separation needs Enter in the editor. */
async function pasteSummaryByParagraphs(page, editorLocator, summaryText, logProgress) {
  const paragraphs = String(summaryText || '').trim().split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return;
  await editorLocator.click();
  await sleep(300);
  await page.keyboard.press('Meta+a');
  await sleep(100);
  await page.keyboard.press('Backspace');
  await sleep(200);
  for (let i = 0; i < paragraphs.length; i++) {
    await page.evaluate((text) => navigator.clipboard.writeText(text), paragraphs[i]);
    await sleep(80);
    await page.keyboard.press('Meta+v');
    await sleep(200);
    if (i < paragraphs.length - 1) {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await sleep(150);
    }
  }
  logProgress('  Content Editor: pasted summary by paragraphs (double Enter = one blank line between blocks), ready to save.');
}

/** Generate resume summary for job (job description + CV alignment). Optional skillsReport, focusGap, currentSummary. summaryRound 1..5 = match-score round. previousEvalNotes = avoid these in prompt (or pass null to read from log). */
function generateSummaryForJob(jobDescription, jobTitle, company, skillsReport, focusGap, currentSummary, summaryRound, previousEvalNotes) {
  if (!jobDescription || String(jobDescription).trim().length < MIN_JOB_DESCRIPTION_LENGTH) return null;
  const inputPath = path.join(JOB_SEARCH_ROOT, '.summary-input.json');
  const outputPath = path.join(JOB_SEARCH_ROOT, '.summary-output.json');
  const scriptPath = path.join(JOB_SEARCH_ROOT, '.summary-run.py');
  const payload = {
    job_description: String(jobDescription).trim(),
    job_title: String(jobTitle || '').trim(),
    company: String(company || '').trim()
  };
  const hasSkillsReport = !!(skillsReport && (skillsReport.red?.length || skillsReport.yellow?.length || skillsReport.green?.length));
  if (hasSkillsReport) {
    payload.skills_report = { red: skillsReport.red || [], yellow: skillsReport.yellow || [], green: skillsReport.green || [] };
    payload.focus_gap = !!focusGap;
  }
  if (currentSummary != null && String(currentSummary).trim()) payload.current_summary = String(currentSummary).trim();
  if (summaryRound != null && summaryRound >= 1) payload.summary_round = summaryRound;
  if (previousEvalNotes != null && String(previousEvalNotes).trim()) payload.previous_eval_notes = String(previousEvalNotes).trim();

  const script = [
    'import sys', 'import json', 'import asyncio', 'import traceback', 'from datetime import datetime',
    'sys.path.insert(0, ' + JSON.stringify(CORE_MCP) + ')',
    'ERROR_LOG = ' + JSON.stringify(SUMMARY_ERROR_LOG),
    '',
    'async def main():',
    '    try:',
    '        from job_digest_server import generate_job_summary',
    '        with open(' + JSON.stringify(inputPath) + ", 'r', encoding='utf-8') as f:",
    '            data = json.load(f)',
    "        result = await generate_job_summary(",
    "            job_description=data['job_description'],",
    "            job_title=data.get('job_title', ''),",
    "            company=data.get('company', '')",
    ", skills_report=data.get('skills_report')",
    ", focus_gap=data.get('focus_gap', False)",
    ", current_summary=data.get('current_summary')",
    ", summary_round=data.get('summary_round')",
    ", previous_eval_notes=data.get('previous_eval_notes')",
    '        )',
    '        with open(' + JSON.stringify(outputPath) + ", 'w', encoding='utf-8') as f:",
    '            json.dump(result, f, ensure_ascii=False, indent=0)',
    '    except Exception as e:',
    '        tb = traceback.format_exc()',
    '        try:',
    '            with open(ERROR_LOG, "a", encoding="utf-8") as f:',
    '                f.write("\\n--- Python " + datetime.now().isoformat() + " ---\\n")',
    '                f.write(tb)',
    '        except Exception: pass',
    '        print(tb, file=sys.stderr)',
    '        sys.exit(1)',
    '',
    'asyncio.run(main())'
  ].join('\n');
  fs.writeFileSync(scriptPath, script, 'utf8');

  function attempt(useSkills) {
    const p = { job_description: payload.job_description, job_title: payload.job_title, company: payload.company };
    if (useSkills && hasSkillsReport) {
      p.skills_report = payload.skills_report;
      p.focus_gap = payload.focus_gap;
    }
    if (payload.current_summary) p.current_summary = payload.current_summary;
    if (payload.summary_round != null) p.summary_round = payload.summary_round;
    if (payload.previous_eval_notes) p.previous_eval_notes = payload.previous_eval_notes;
    fs.writeFileSync(inputPath, JSON.stringify(p), 'utf8');
    return runSummaryScript(scriptPath, inputPath, outputPath);
  }

  let run = attempt(true);
  if (!run.ok && hasSkillsReport) {
    logProgress('  Summary failed with skills_report; logging and retrying without (fallback).');
    appendSummaryError(
      'job_title=' + (payload.job_title || '') + ' company=' + (payload.company || '') + ' skills_report=yes jd_len=' + (payload.job_description && payload.job_description.length),
      run.stderr,
      run.stdout
    );
    run = attempt(false);
    if (run.ok) logProgress('  Summary generated with fallback (no skills_report).');
  } else if (!run.ok) {
    appendSummaryError(
      'job_title=' + (payload.job_title || '') + ' company=' + (payload.company || '') + ' skills_report=no jd_len=' + (payload.job_description && payload.job_description.length),
      run.stderr,
      run.stdout
    );
    logProgress('  generateSummaryForJob error: ' + (run.stderr || 'exit ' + run.status).slice(0, 200));
  }

    try {
    if (run.ok && fs.existsSync(outputPath)) {
      const out = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (out && out.error) {
        logProgress('  Summary API error: ' + (out.error || '').slice(0, 300));
      }
      if (out && out.openai_usage) {
        const u = out.openai_usage;
        logProgress('  Summary from OpenAI: prompt_tokens=' + (u.prompt_tokens || 0) + ' completion_tokens=' + (u.completion_tokens || 0) + ' total=' + (u.total_tokens || 0));
      }
      if (out && out.summary) {
        logProgress('  Summary length: ' + String(out.summary).length + ' chars');
      }
      return (out && out.summary) ? String(out.summary).trim() : null;
    }
  } catch (_) {}
  try { fs.unlinkSync(inputPath); } catch (_) {}
  try { fs.unlinkSync(outputPath); } catch (_) {}
  try { fs.unlinkSync(scriptPath); } catch (_) {}
  return null;
}

function logProgress(message, toStdout = true) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    fs.appendFileSync(PROGRESS_LOG, line, 'utf8');
  } catch (_) {}
  if (toStdout) process.stdout.write(line);
}

/** Log to browser DevTools console (so user sees debug there). No-op if page not available. */
async function logToBrowserConsole(page, message) {
  if (!page) return;
  try {
    await page.evaluate((msg) => {
      // eslint-disable-next-line no-console
      console.log('%c[Dex teal-match-score]', 'color: #0a7; font-weight: bold', msg);
    }, message);
  } catch (_) {}
}

/** Safe folder name from company name (no path separators or reserved chars). */
function sanitizeCompanyForPath(company) {
  if (!company || typeof company !== 'string') return 'Unknown_Company';
  return company
    .trim()
    .replace(/[\s/\\:*?"<>|]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'Unknown_Company';
}

/** Safe folder name from vacancy title (no path separators or reserved chars). */
function sanitizeVacancyForPath(title) {
  if (!title || typeof title !== 'string') return 'Unknown Role';
  return title
    .trim()
    .replace(/[\u2014\u2013\u2212]/g, '-') // normalize unicode dashes
    // Keep spaces for readability; replace only path separators + reserved characters
    .replace(/[\/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120) || 'Unknown Role';
}

/** Match the python naming scheme from cover-letter-generate.py (company_safe/role_safe). */
function coverToken(s, fallback) {
  if (!s || typeof s !== 'string') return fallback;
  const cleaned = s.replace(/[^\w\s]/g, '').trim().replace(/\s+/g, '_');
  return cleaned ? cleaned.slice(0, 40) : fallback;
}

/** Prefer exact file name match generated by cover-letter-generate.py. */
function findCoverLetterDocx(files, company, role) {
  const companySafe = coverToken(company, 'Company').toLowerCase();
  const roleSafe = coverToken(role, 'Role').toLowerCase();
  const expected = `cover_letter_${companySafe}_${roleSafe}.docx`;
  const exact = files.find((f) => f.toLowerCase() === expected);
  if (exact) return exact;

  // Fallback: looser "contains" match (in case of historic naming differences)
  const normalized = (str) => str.toLowerCase().replace(/[^a-z0-9_]/g, '');
  const companyNeedle = normalized(companySafe);
  const roleNeedle = normalized(roleSafe);
  return files.find((f) => {
    if (!f.toLowerCase().endsWith('.docx')) return false;
    const base = normalized(f.replace(/\.docx$/i, ''));
    return base.includes(companyNeedle) && base.includes(roleNeedle);
  });
}

/**
 * Extract current Teal resume from the page (preview/editor) and return as markdown.
 * Uses experience structure + Professional Summary so the cover letter has the same context as the exported PDF.
 * @param {import('playwright').Page} page — must be on resume preview (/preview)
 * @returns {Promise<string>} markdown string or empty if extraction fails
 */
async function extractTealResumeAsMarkdown(page) {
  let summary = '';
  try {
    const summaryBlock = await page.evaluate(() => {
      const addBtn = document.querySelector('button[aria-label="Add a Professional Summary"]');
      if (!addBtn) return '';
      const section = addBtn.closest('section') || addBtn.closest('[data-state]') || addBtn.parentElement?.closest('div');
      if (!section) return '';
      const raw = (section.innerText || section.textContent || '').trim();
      const workIdx = raw.indexOf('Work Experience');
      const block = workIdx >= 0 ? raw.slice(0, workIdx) : raw;
      return block
        .replace(/\bAdd a Professional Summary\b/gi, '')
        .replace(/\bDelete summary\b/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    });
    summary = summaryBlock || '';
  } catch (_) {}
  let experience;
  try {
    experience = await extractResumeExperienceFromPage(page);
  } catch (_) {
    experience = { companies: [] };
  }
  const lines = ['# Resume (from Teal)', '', '## Professional Summary', '', summary, '', '## Work Experience', ''];
  for (const co of experience.companies || []) {
    lines.push('### ' + (co.name || 'Company'), '');
    for (const pos of co.positions || []) {
      lines.push('**' + (pos.title || '') + '** | ' + (pos.dates || ''), '');
      for (const b of pos.bullets || []) {
        if (b.included !== false && b.text) lines.push('- ' + b.text);
      }
      lines.push('');
    }
  }
  const md = lines.join('\n').trim();
  return md.length >= 300 ? md : '';
}

const CV_FILENAME = 'Roman Matsukatov - CV.pdf';
const COVER_LETTER_FILENAME = 'Roman Matsukatov - Cover Letter.docx';

/**
 * Ensure /preview, click Export PDF (resume as PDF), save to Applied/<Company>/<Vacancy>/,
 * copy or generate cover letter. Called after the summary loop (which aims for 80%+); if score is still below 80% after 5 iterations, we still save (user may re-check when applying).
 */
async function exportPdfAndSaveToApplied(page, context, job, finalScore, logProgress) {
  const company = (job.company || '').trim() || 'Unknown_Company';
  logProgress('  [Applied] Company: ' + company);

  const companyDirName = sanitizeCompanyForPath(company);
  const companyDir = path.resolve(APPLIED_BASE, companyDirName);
  const titleOnly = stripCompanyFromTitle(job.title || '', company);
  const jobTitle = (titleOnly || job.title || '').trim() || 'Unknown_Role';
  const vacancyDirName = sanitizeVacancyForPath(jobTitle);
  const vacancyDir = path.resolve(companyDir, vacancyDirName);

  logProgress('  [Applied] Step 1/5: Creating folder ' + vacancyDir);
  if (!fs.existsSync(APPLIED_BASE)) fs.mkdirSync(APPLIED_BASE, { recursive: true });
  fs.mkdirSync(companyDir, { recursive: true });
  fs.mkdirSync(vacancyDir, { recursive: true });

  const currentUrl = page.url();
  const previewUrl = currentUrl.replace(/\/matching\/?(\?.*)?$/i, '/preview');
  if (!currentUrl.includes('/preview')) {
    logProgress('  [Applied] Step 2/5: Switching to /preview for Export PDF.');
    await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(3000);
  } else {
    logProgress('  [Applied] Step 2/5: Already on /preview.');
  }

  let pdfSaved = false;
  try {
    const pdfFull = path.resolve(vacancyDir, CV_FILENAME);
    if (fs.existsSync(pdfFull)) {
      pdfSaved = true;
      logProgress('  [Applied] Step 3/5: PDF already exists, skipping export: ' + pdfFull);
    } else {
      logProgress('  [Applied] Step 3/5: Export PDF — click Export PDF button.');
    const exportPdfBtn = page.locator('button').filter({ hasText: /Export PDF/i }).first();
    if ((await exportPdfBtn.count()) === 0 || !(await exportPdfBtn.isVisible().catch(() => false))) {
      logProgress('  [Applied] Step 3/5: Export PDF button not found.');
    } else {
      await exportPdfBtn.click();
      await sleep(600);
      logProgress('  [Applied] Step 3/5: Click Resume in menu.');
      const menuItem = page.locator('[role="menuitem"]').filter({ hasText: /^Resume$/i }).first();
      if ((await menuItem.count()) > 0 && (await menuItem.isVisible().catch(() => false))) {
        await menuItem.click();
        await sleep(800);
      }
      logProgress('  [Applied] Step 3/5: Click Export submit, wait for download.');
      const exportSubmitBtn = page.locator('button[type="submit"]').filter({ hasText: /^Export$/i }).first();
      if ((await exportSubmitBtn.count()) > 0 && (await exportSubmitBtn.isVisible().catch(() => false))) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 20000 }),
          exportSubmitBtn.click()
        ]).catch((e) => {
          logProgress('  [Applied] Step 3/5: Download failed: ' + (e.message || String(e)).slice(0, 100));
          return [null];
        });
        if (download) {
          await download.saveAs(pdfFull);
          pdfSaved = true;
          logProgress('  [Applied] Step 3/5: PDF saved to ' + pdfFull);
        }
      } else {
        logProgress('  [Applied] Step 3/5: Export submit button not found after Resume.');
      }
    }
    }
  } catch (e) {
    logProgress('  [Applied] Step 3/5: Error: ' + (e.message || String(e)).slice(0, 120));
  }

  const role = (jobTitle || 'Product Manager').trim() || 'Product Manager';
  logProgress('  [Applied] Step 4/5: Looking for cover letter for "' + company + '" + "' + role + '" in ' + COVER_LETTERS_DIR);
  const coverFull = path.resolve(vacancyDir, COVER_LETTER_FILENAME);
  let coverDone = false;

  if (fs.existsSync(coverFull)) {
    coverDone = true;
    logProgress('  [Applied] Step 4/5: Cover letter already exists, skipping copy/generate: ' + coverFull);
  }
  if (fs.existsSync(COVER_LETTERS_DIR)) {
    const files = fs.readdirSync(COVER_LETTERS_DIR);
    const docx = coverDone ? null : findCoverLetterDocx(files, company, role);
    if (!coverDone && docx) {
      try {
        if (!fs.existsSync(coverFull)) {
          fs.copyFileSync(path.join(COVER_LETTERS_DIR, docx), coverFull);
        }
        logProgress('  [Applied] Step 4/5: Cover letter copied to ' + coverFull);
        coverDone = true;
      } catch (e2) {
        logProgress('  [Applied] Step 4/5: Copy failed: ' + (e2.message || '').slice(0, 80));
      }
    }
  }
  if (!coverDone) {
    const jobDesc = (job.job_description || job.description || '').trim();
    let tealMd = '';
    try {
      tealMd = await extractTealResumeAsMarkdown(page);
    } catch (e) {
      logProgress('  [Applied] Step 4/5: Teal resume extraction failed: ' + (e.message || '').slice(0, 60));
    }
    if (tealMd.length >= 300) {
      logProgress('  [Applied] Step 4/5: Generating cover letter from Teal resume (OpenAI + python-docx)…');
      const scriptPath = path.join(__dirname, 'cover-letter-generate.py');
      if (fs.existsSync(scriptPath)) {
        const resumeTempPath = path.join(TEAL_DIR, 'teal-resume-for-cover-letter.md');
        fs.writeFileSync(resumeTempPath, tealMd, 'utf8');
        const python = process.platform === 'win32' ? 'python' : 'python3';
        const result = spawnSync(
          python,
          [
            scriptPath,
            '--company', company,
            '--role', role,
            '--vault', VAULT_PATH,
            '--output-cover-dir', COVER_LETTERS_DIR,
            '--output-applied-dir', vacancyDir,
            '--resume-file', resumeTempPath
          ],
          { input: jobDesc.length >= MIN_JOB_DESCRIPTION_LENGTH ? jobDesc : '', encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }
        );
        if (result.status === 0) {
          coverDone = true;
          logProgress('  [Applied] Step 4/5: Cover letter generated and saved to ' + coverFull);
        } else {
          const err = (result.stderr || result.error || '').toString().slice(0, 200);
          logProgress('  [Applied] Step 4/5: Generator failed: ' + err);
        }
      } else {
        logProgress('  [Applied] Step 4/5: cover-letter-generate.py not found at ' + scriptPath);
      }
    }
    if (!coverDone) {
      logProgress('  [Applied] Step 4/5: No cover letter for company "' + company.slice(0, 40) + '".');
      logProgress('  [Applied] Step 4/5: Could not extract resume from page; create via /cover-letter and save to cover_letters, then re-run.');
    }
  }

  logProgress('  [Applied] Step 5/5: Applied package complete. Folder: ' + vacancyDir);
  await logToBrowserConsole(page, '[Dex teal-match-score] Applied package saved: ' + companyDirName + '/' + vacancyDirName);
  logProgress('  [Applied] Open folder: open "' + vacancyDir + '"');
  return {
    pdfPath: pdfSaved ? path.relative(VAULT_PATH, path.join(vacancyDir, CV_FILENAME)) : null,
    coverLetterPath: coverDone ? path.relative(VAULT_PATH, coverFull) : null
  };
}

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

/** True if error means the profile is already in use (Chrome open with that profile). */
function isProfileBusyError(e) {
  const msg = (e && (e.message || e.toString())) || '';
  return /ProcessSingleton|profile.*in use|already in use|lock|Singleton/i.test(msg);
}

/** Launch Chrome with given profile dir; returns { context, page } or null. Teal: always visible browser. */
async function launchChromeWithProfile(playwright, profileDir) {
  if (!profileDir) return null;
  try {
    const context = await launchPersistentContextGuarded(playwright.chromium, profileDir, {
      channel: os.platform() === 'darwin' ? 'chrome' : undefined,
      headless: false,
      args: ['--no-first-run'],
      timeout: 30000
    });
    const page = context.pages()[0] || await context.newPage();
    return { context, page };
  } catch (_) {
    return null;
  }
}

/** Teal uses both /resume-builder/resumes/<uuid>/... and /resume-builder/<uuid>/preview */
const RESUME_ID_RE = /(?:resume-builder\/resumes\/|resume-builder\/)([0-9a-f-]{36})(?:\/|$|\?)/i;

function parseArgs() {
  const argv = process.argv.slice(2);
  let exportPath = DEFAULT_DIGEST; // default: digest MD (we work from digest, not JSON)
  let exclude = ['kraken', 'toptal', 'revolut'];
  let fromIndex = 0;
  let limit = 0;
  let companyFilter = '';
  let waitForClick = false;
  let testMode = false; // only allow export from 2026-02-10
  let filterJobs = false; // default: same list as resume batch (96). --filter = PM-only, dedup, non-EN excluded (40)
  let cdpUrl = process.env.TEAL_CDP_URL || 'http://localhost:9222';
  let resumeUrl = '';
  let resumeId = '';
  let resumeCompany = ''; // for Applied folder when using --resume-url
  let resumeJobTitle = ''; // for renaming resume when using --resume-url (e.g. "Product Manager")
  let jobDescriptionFile = ''; // for cover letter generation in resume-url mode
  let allowNonProduct = false; // for single-vacancy flow: do not skip non-product titles
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--filter') {
      filterJobs = true;
      continue;
    }
    if (argv[i] === '--wait-for-click') {
      waitForClick = true;
      continue;
    }
    if (argv[i] === '--test') {
      testMode = true;
      if (limit === 0) limit = 1;
      continue;
    }
    if (argv[i] === '--allow-non-product') {
      allowNonProduct = true;
      continue;
    }
    if (argv[i] === '--resume-url' && argv[i + 1]) {
      resumeUrl = argv[i + 1].trim();
      const match = resumeUrl.match(RESUME_ID_RE);
      if (match) resumeId = match[1];
      i++;
    } else if (argv[i] === '--resume-id' && argv[i + 1]) {
      resumeId = argv[i + 1].trim();
      i++;
    } else if (argv[i] === '--company' && argv[i + 1]) {
      companyFilter = argv[i + 1].trim();
      i++;
    } else if (argv[i] === '--job-title' && argv[i + 1]) {
      resumeJobTitle = argv[i + 1].trim();
      i++;
    } else if (argv[i] === '--job-description-file' && argv[i + 1]) {
      jobDescriptionFile = argv[i + 1].trim();
      i++;
    } else if (argv[i] === '--exclude' && argv[i + 1]) {
      exclude = argv[i + 1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      i++;
    } else if (argv[i] === '--from' && argv[i + 1]) {
      fromIndex = Math.max(0, parseInt(argv[i + 1], 10) || 0);
      i++;
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[i + 1], 10) || 0);
      i++;
    } else if (argv[i] === '--cdp-url' && argv[i + 1]) {
      cdpUrl = argv[i + 1];
      i++;
    } else if (!argv[i].startsWith('--')) {
      exportPath = path.isAbsolute(argv[i]) ? argv[i] : path.resolve(process.cwd(), argv[i]);
    }
  }
  if (resumeUrl && !resumeId) resumeId = resumeUrl.match(RESUME_ID_RE)?.[1] || '';
  if (resumeId && companyFilter) resumeCompany = companyFilter;
  return { exportPath, exclude, fromIndex, limit, companyFilter, waitForClick, testMode, filterJobs, cdpUrl, resumeId, resumeCompany, resumeJobTitle, jobDescriptionFile, allowNonProduct };
}

/** LinkedIn UI labels that must not be used as job/resume title (from export noise). */
const UI_LABEL_PATTERNS = [
  /people\s+(you|they)\s+can\s+reach\s+out\s+to/i,
  /about\s+(the\s+)?job/i,
  /about\s+this\s+role/i,
  /similar\s+jobs/i,
  /meet\s+the\s+hiring\s+team/i
];
function isUILabel(title) {
  const t = (title || '').trim();
  if (t.length < 3 || t.length > 120) return true;
  return UI_LABEL_PATTERNS.some((re) => re.test(t));
}

/** Exclude non-product roles (marketing, creative, people) — same logic as generate-search-digest. */
const NON_PM_TITLE_PATTERNS = [
  /Creative\s+Marketing\s+Manager/i,
  /Marketing\s+Manager\s*\(\s*People\s*Product\s*\)/i,
  /Brand\s+Marketing\s+Manager/i,
  /Content\s+Marketing\s+Manager/i,
  /Growth\s+Marketing\s+Manager/i,
  /Digital\s+Marketing\s+Manager/i,
  /Performance\s+Marketing\s+Manager/i,
  /(\s|^)Marketing\s+Manager(\s|$|\))/i,
  /Product\s+Marketing\s+Manager/i,
  /Blockchain\s+Manager/i,
  /Product\s+Delivery\s+Lead/i,
  /Innovation\s+Manager/i,
  /Market\s+Launch\s+Owner/i,
  /Growth\s*&\s*Operations\s+Lead/i,
  /\bProduct\s+Category\s+Manager\b/i,   // Category/retail (merchandising), not software PM
  /\bProduct\s+Line\s+Manager\b/i,   // Product line (P&L/hardware), not software PM
  /\b(?:Technical\s+)?Sales\s*(?:&|and|\s*[-–—])\s*Product\s+Manager\b/i,   // Sales-heavy hybrid, not core PM
  /\bProduct\s+Designer\b/i,   // Design role, not PM (e.g. Principal Product Designer — PagerDuty)
  // Adoption/Experience (customer success, not product strategy; e.g. Klar Product Adoption & Experience Manager)
  /Product\s+Adoption\s*&\s*Experience\s+Manager/i,
  /Adoption\s*&\s*Experience\s+Manager/i,
  /Product\s+Adoption\s+Manager/i,
  // UX leadership (design track), not PM
  /\bUX\s+Lead\s*\(\s*Product\s*&\s*Growth\s*\)/i,
  // Only product roles (PM, PO); not business analyst
  /\bBusiness\s+Analyst\b/i,
  /\bSenior\s+Business\s+Analyst\b/i,
  /\bLead\s+Business\s+Analyst\b/i,
  /\bPrincipal\s+Business\s+Analyst\b/i
];

/** BA + PM/PO in one title (e.g. "Business Analyst / Product Manager") — treat like PM for match-score. Pure BA stays excluded. */
function isBaPmHybridTitle(title) {
  const t = (title || '').trim();
  if (!/\bBusiness\s+Analyst\b/i.test(t)) return false;
  return /\bProduct\s+Manager\b/i.test(t) || /\bProduct\s+Owner\b/i.test(t);
}

function isNonProductTitle(title) {
  const t = (title || '').trim();
  if (isBaPmHybridTitle(t)) return false;
  return NON_PM_TITLE_PATTERNS.some((re) => re.test(t));
}

const NON_ENGLISH_TITLE_PATTERNS = [
  /\(\s*w\s*\/\s*m\s*\/\s*d\s*\)/i,
  /\(\s*m\s*\/\s*w\s*\/\s*d\s*\)/i,
  /\/\s*-\s*in\b/i
];
const REQUIRES_NON_ENGLISH = [
  /fluent\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)/i,
  /\bproficient\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)\b/i,
  /\bfluency\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)\b/i,
  /native\s+(German|Spanish|Portuguese|French|Italian|Arabic)\s+(speaker|language)?/i,
  /(German|Spanish|Portuguese|French|Italian|Arabic)\s+(language\s+)?(proficiency|required|essential|fluent)/i,
  /proficiency\s+in\s+(German|Spanish|Portuguese|French|Italian|Arabic)/i,
  /working\s+language\s*[:\s]+\s*(German|Spanish|Portuguese|French|Italian|Arabic)/i,
  /(German|Spanish|Portuguese|French|Italian|Arabic)\s+\((C1|B2|native)\)/i,
  /\bArabic\s+[Ss]peaker\b/i,
  /\bDeutsch\s+auf\s+Muttersprachniveau\b/i,
  /\bMuttersprache\s+Deutsch\b/i,
  /\bDeutsch\s+als\s+Muttersprache\b/i,
  /\bdeutschsprachig\b/i,
  /\bin\s+deutscher\s+Sprache\b/i,
  /\bDeutsch-?\s*und\s+Englischkenntnisse\b/i,
  /\bDeutschkenntnisse\b/i,
  /\bfließend(?:em)?\s+(?:in\s+)?Deutsch\b/i,
  /\bsehr\s+gute\s+Deutsch-?\s*und\s+Englisch\b/i
];
function isNonEnglishJob(job) {
  const title = (job.title || '').trim();
  const desc = (job.description || job.job_description || '').trim();
  if (NON_ENGLISH_TITLE_PATTERNS.some((re) => re.test(title))) return true;
  if (desc.length < 25) return false;  // lowered from 50: catch "Deutsch- und Englischkenntnisse" in shorter snippets
  return REQUIRES_NON_ENGLISH.some((re) => re.test(desc));
}

/** Normalize resume/job title for matching (dashes, spaces). Names are identical per our approach. */
function normalizeTitle(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/\s+/g, ' ')
    .replace(/[\u2014\u2013\u2212\-|]/g, '\u2014') // em/en dash, minus, pipe → one dash
    .trim();
}

/** Normalize for matching only (technical): strip parentheses, dashes, collapse spaces, lowercase. Teal names stay original. */
function normalizeForMatching(s) {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[\u2014\u2013\u2212\-–—\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if two company names are equal or differ by at most one character (e.g. Alea vs Alia). */
function companyNameSimilar(a, b) {
  const x = String(a || '').toLowerCase().replace(/\s+/g, '').trim();
  const y = String(b || '').toLowerCase().replace(/\s+/g, '').trim();
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  if (x.length < 3 || y.length < 3) return false;
  if (Math.abs(x.length - y.length) > 1) return false;
  let diff = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) diff++;
  }
  diff += Math.abs(x.length - y.length);
  return diff <= 1;
}

/** True if row text contains the company or a word similar to it (e.g. row "Alea", job.company "Alia"). */
function rowTextMatchesCompanyRelaxed(rowText, company) {
  const cn = (company || '').toLowerCase().trim();
  if (!cn || cn.length < 3) return false;
  const rowLower = (rowText || '').toLowerCase();
  if (rowLower.includes(cn)) return true;
  const words = rowLower.split(/\s*[—\-·|]\s*|\s+/).filter((w) => w.length >= 3);
  return words.some((w) => companyNameSimilar(w, company));
}

/** True if the string is a placeholder (— or generic fallback). Do not use as Job Matcher search. */
function isPlaceholderJobField(s) {
  const t = (s || '').trim();
  return !t || t === '—' || t === 'Product Manager';
}

/**
 * Build search query (or list of queries) for Job Matcher. Uses only real job title and company from the digest;
 * never uses "Product Manager" so we don't match a random PM job (e.g. Appfire) when the digest has the real role (e.g. Compliance Officer — Alea).
 */
function getJobMatcherSearchQueries(job, resumeTitle) {
  const company = (job.company || '').trim();
  const title = (job.title || '').trim();
  const titlePart = (resumeTitle || '').split(/\s*[—\-|]\s*/)[0].trim();
  const companyEffective = isPlaceholderJobField(company) ? '' : company;
  const titleEffective = isPlaceholderJobField(title) ? '' : title;
  const titlePartEffective = isPlaceholderJobField(titlePart) ? '' : titlePart;
  const resumeEffective = (resumeTitle || '').trim();
  const resumeIsPlaceholder = !resumeEffective || resumeEffective === '—' || /^Product Manager\s*[—·]?\s*$/i.test(resumeEffective);
  const queries = [
    companyEffective,
    titleEffective && companyEffective ? titleEffective + ' ' + companyEffective : (titleEffective || companyEffective),
    titlePartEffective && companyEffective ? titlePartEffective + ' ' + companyEffective : null,
    !resumeIsPlaceholder ? resumeEffective : null
  ].filter((q) => q && q.length >= 2);
  if (queries.length === 0 && job.id) {
    queries.push('Job ' + job.id);
  }
  return queries;
}

/**
 * Build search queries for the Teal resume list ("Search resumes" input). Uses only real title/company;
 * never "Product Manager" so we don't open a wrong resume (e.g. Senior Product Manager — Appfire) when the job is e.g. Compliance Officer — Alea.
 * If job has only placeholders, tries JOBS_DIR/job.id.json for job_title and company.
 * When createdNames[job.id] is set (from step 7), that exact name is used first so we find the resume step 7 actually created.
 */
function getResumeListSearchQueries(job, createdNames) {
  const createdName = job.id && createdNames && createdNames[job.id] ? String(createdNames[job.id]).trim() : '';
  let title = (job.title || '').trim();
  let company = (job.company || '').trim();
  if ((isPlaceholderJobField(title) || isPlaceholderJobField(company)) && job.id && JOBS_DIR && fs.existsSync(JOBS_DIR)) {
    const jobPath = path.join(JOBS_DIR, job.id + '.json');
    if (fs.existsSync(jobPath)) {
      try {
        const payload = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        if (isPlaceholderJobField(title)) title = (payload.job_title || '').trim();
        if (isPlaceholderJobField(company)) company = (payload.company || '').trim();
      } catch (_) {}
    }
  }
  const titleOk = title && !isPlaceholderJobField(title);
  const companyOk = company && !isPlaceholderJobField(company);
  const full = titleOk && companyOk ? title + ' — ' + company : (titleOk ? title : '') || (companyOk ? company : '');
  const fromDigest = [full, companyOk ? company : null, titleOk ? title : null].filter((q) => q && q.length >= 2);
  const createdNameLooksLikeTitle = createdName && (() => {
    const titlePart = createdName.split(/\s*[—\-|]\s*/)[0].trim();
    return titlePart.length >= 2 && (typeof looksLikeJobTitle !== 'function' || looksLikeJobTitle(titlePart));
  })();
  const queries = createdNameLooksLikeTitle ? [createdName, ...fromDigest.filter((q) => q !== createdName)] : fromDigest;
  if (!createdNameLooksLikeTitle && createdName) queries.push(createdName);
  if (queries.length === 0 && job.id) {
    queries.push('Job ' + job.id);
  }
  return queries;
}

/** Re-select job on Job Matcher page (after reload selection is often lost). Same logic as initial selection before the loop. */
async function selectJobOnMatchingPage(page, job, logProgress) {
  let jobSearchInput = page.locator('#job-search-input').or(page.locator('input[aria-label*="Search"][aria-label*="job"]')).first();
  for (let w = 0; w < 20; w++) {
    if ((await jobSearchInput.count()) > 0 && (await jobSearchInput.isVisible().catch(() => false))) break;
    await sleep(400);
    jobSearchInput = page.locator('#job-search-input').or(page.locator('input[aria-label*="Search"][aria-label*="job"]')).first();
  }
  const searchCompany = (job.company || '').trim();
  const resumeTitleForQuery = ((job.title || '').trim() + (searchCompany && searchCompany !== '—' ? ' — ' + searchCompany : '')).trim();
  const reSelectQueries = getJobMatcherSearchQueries(job, resumeTitleForQuery);
  const searchQuery = reSelectQueries[0] || ('Job ' + (job.id || ''));
  if ((await jobSearchInput.count()) > 0 && (await jobSearchInput.isVisible().catch(() => false))) {
    try {
      await jobSearchInput.click({ timeout: 8000 });
      await jobSearchInput.fill(searchQuery, { timeout: 8000 });
    } catch (e) {
      logProgress('  Re-select job: search fill failed — ' + (e.message || '').slice(0, 60));
      return;
    }
    await sleep(1500);
  }
  let listbox = page.locator('#job-search-listbox').or(page.locator('[role="listbox"]')).first();
  let options = listbox.locator('[role="option"]');
  let optionCount = await options.count();
  for (let w = 0; w < 20 && optionCount === 0; w++) {
    await sleep(400);
    listbox = page.locator('#job-search-listbox').or(page.locator('[role="listbox"]')).first();
    options = listbox.locator('[role="option"]');
    optionCount = await options.count();
  }
  if (optionCount > 0) {
    const jobTitle = (job.title || '').trim();
    const jobTitleNorm = normalizeForMatching(jobTitle);
    const companyLower = searchCompany.toLowerCase();
    const companyParts = companyLower ? companyLower.split(/\s+[-\u2014]\s+|\s+/).filter((p) => p.length >= 2) : [];
    const matchesCompanyRelaxed = (optText) => {
      if (!searchCompany) return true;
      const o = (optText || '').toLowerCase();
      if (o.includes(companyLower)) return true;
      return companyParts.some((part) => part.length >= 3 && o.includes(part));
    };
    let optionToClick = null;
    let optionByTitle = null;
    for (let oi = 0; oi < optionCount; oi++) {
      const optText = (await options.nth(oi).textContent().catch(() => '') || '').trim();
      const optNorm = normalizeForMatching(optText);
      const matchesTitle = jobTitleNorm.length >= 4 && (optNorm.includes(jobTitleNorm) || jobTitleNorm.includes(optNorm.slice(0, 40)));
      const matchesCompany = matchesCompanyRelaxed(optText);
      if (matchesTitle && matchesCompany) {
        optionToClick = options.nth(oi);
        break;
      }
      if (matchesTitle && !optionByTitle) optionByTitle = options.nth(oi);
    }
    if (!optionToClick) optionToClick = optionByTitle || options.first();
    if (optionToClick) {
      await optionToClick.click();
      await sleep(2000);
      logProgress('  Re-selected job on Job Matcher after reload.');
    }
  }
}

// Location priority for dedup: PT → UA → ES → UK → PL → NL → DE → … (same as generate-search-digest)
const LOCATION_PRIORITY = [
  { pattern: /portugal/i, rank: 0 },
  { pattern: /ukraine/i, rank: 1 },
  { pattern: /spain/i, rank: 2 },
  { pattern: /united kingdom|england|,\s*uk\b|wales|scotland/i, rank: 3 },
  { pattern: /poland/i, rank: 4 },
  { pattern: /netherlands/i, rank: 5 },
  { pattern: /germany/i, rank: 6 },
  { pattern: /ireland/i, rank: 7 },
  { pattern: /italy|italia/i, rank: 8 },
  { pattern: /france/i, rank: 9 },
  { pattern: /czechia|czech/i, rank: 10 },
  { pattern: /estonia|latvia|lithuania|romania|hungary|austria|belgium|sweden/i, rank: 11 },
  { pattern: /cyprus|moldova|serbia|israel|south africa/i, rank: 12 }
];
const DEFAULT_PRIORITY = 99;

function locationRank(loc) {
  const s = (loc || '').toLowerCase();
  for (const { pattern, rank } of LOCATION_PRIORITY) {
    if (pattern.test(s)) return rank;
  }
  return DEFAULT_PRIORITY;
}

/** Allowed export date for test runs (YYYY-MM-DD). Only exports with exportedAt on this day are accepted. */
const TEST_EXPORT_DATE = '2026-02-10';

/** Map Teal resume ID -> { jobId, company, title } for exact JD lookup. Written by match-score (digest) and teal-resume-for-job (--job-id). */
const RESUME_TO_JOB_MAP_PATH = path.join(TEAL_FLOW_DIR, 'resume-to-job.json');
/** jobId -> exact resume name set in Teal by step 7 (teal-resume-for-job). Used as primary search query so step 8 finds the same resume. */
const CREATED_RESUME_NAMES_PATH = path.join(TEAL_DIR, 'created-resume-names.json');

function loadCreatedResumeNames() {
  try {
    if (fs.existsSync(CREATED_RESUME_NAMES_PATH)) return JSON.parse(fs.readFileSync(CREATED_RESUME_NAMES_PATH, 'utf8'));
  } catch (_) {}
  return {};
}

/** Update created-resume-names.json when we rename a resume in step 8 (e.g. after opening by ID with wrong name). */
function saveCreatedResumeNameForJob(jobId, resumeName) {
  if (!jobId || !resumeName || typeof resumeName !== 'string') return;
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    const map = loadCreatedResumeNames();
    map[String(jobId)] = resumeName.trim();
    fs.writeFileSync(CREATED_RESUME_NAMES_PATH, JSON.stringify(map, null, 2), 'utf8');
  } catch (_) {}
}

/** Temp file for job description when creating resume from match-score (step 8 self-heal). */
const TMP_DESC_MATCHSCORE = path.join(TEAL_DIR, 'tmp-matchscore-desc.txt');

/**
 * Create a Teal resume for this job by spawning teal-resume-for-job (step 7 logic).
 * Used when step 8 doesn't find a resume: create it, then retry list search so flow completes.
 * Returns { ok: true } on success, { ok: false } on failure.
 */
function createResumeForJob(job, logProgress) {
  let effectiveTitle = (job.title && job.title.trim() !== '—' && !isPlaceholderJobField(job.title)) ? job.title.trim() : '';
  const jobPath = job.id && JOBS_DIR ? path.join(JOBS_DIR, job.id + '.json') : '';
  if (!effectiveTitle && jobPath && fs.existsSync(JOBS_DIR)) {
    if (fs.existsSync(jobPath)) {
      try {
        const j = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        effectiveTitle = (j.job_title || '').trim();
      } catch (_) {}
    }
  }
  if (!effectiveTitle) {
    const detail = {
      jobId: job.id,
      jobPath: jobPath || null,
      fileExists: jobPath ? fs.existsSync(jobPath) : false,
      jobTitleFromDigest: (job.title || '').trim(),
      jobTitleInFile: jobPath && fs.existsSync(jobPath) ? (() => { try { return (JSON.parse(fs.readFileSync(jobPath, 'utf8')).job_title || '').trim(); } catch (_) { return null; } })() : null
    };
    const reportPath = path.join(TEAL_DIR, 'missing-title-report.json');
    try {
      ensureDirs();
      fs.writeFileSync(reportPath, JSON.stringify({ message: 'Missing job title — fix required', detail, ts: new Date().toISOString() }, null, 2), 'utf8');
    } catch (_) {}
    throw new Error(
      'Missing job title (bug). Job id: ' + job.id + ', file: ' + (jobPath || 'n/a') + ', fileExists: ' + detail.fileExists +
      ', job_title in file: ' + JSON.stringify(detail.jobTitleInFile) + '. Details written to ' + reportPath + '. Resolve: ensure jobs/<id>.json has job_title (run Step 4 or fix capture).'
    );
  }
  const effectiveCompany = (job.company || '').trim();
  const jobTitleForScript = effectiveCompany ? effectiveTitle + ' — ' + effectiveCompany : effectiveTitle;
  let descText = (job.job_description || '').trim();
  if (!descText && job.id && JOBS_DIR && fs.existsSync(JOBS_DIR)) {
    const jobPath = path.join(JOBS_DIR, job.id + '.json');
    if (fs.existsSync(jobPath)) {
      try {
        const j = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
        descText = (j.job_description || '').trim();
      } catch (_) {}
    }
  }
  const args = ['--job-title', jobTitleForScript, '--job-id', String(job.id)];
  if (descText) {
    try {
      if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
      fs.writeFileSync(TMP_DESC_MATCHSCORE, descText, 'utf8');
      args.push('--job-description-file', TMP_DESC_MATCHSCORE);
    } catch (_) {}
  }
  const scriptPath = path.join(__dirname, 'teal-resume-for-job.cjs');
  logProgress('  Creating resume in Teal: "' + jobTitleForScript.slice(0, 60) + (jobTitleForScript.length > 60 ? '…' : '') + '"');
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: VAULT_PATH,
    stdio: 'inherit',
    env: { ...process.env, TEAL_CHROME_PROFILE: TEAL_CHROME_PROFILE_BATCH }
  });
  const ok = result.status === 0 && !result.signal;
  if (ok) logProgress('  Resume created; reloading list and retrying search.');
  else logProgress('  Create failed (exit ' + (result.status ?? 'signal') + ').');
  return { ok };
}

function loadResumeJobMapping() {
  try {
    if (fs.existsSync(RESUME_TO_JOB_MAP_PATH)) {
      return JSON.parse(fs.readFileSync(RESUME_TO_JOB_MAP_PATH, 'utf8'));
    }
  } catch (_) {}
  return {};
}

/** Return resume ID for this job if we already have it (step 7 or previous run). Then we open by URL, no search by name. */
function getResumeIdForJobId(map, jobId) {
  if (!map || typeof map !== 'object' || !jobId) return null;
  const want = String(jobId);
  for (const [resumeId, entry] of Object.entries(map)) {
    if (entry && entry.jobId === want) return resumeId;
  }
  return null;
}

function saveResumeJobMapping(resumeId, entry) {
  if (!resumeId || !entry || !entry.jobId) return;
  try {
    if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
    const map = loadResumeJobMapping();
    map[resumeId] = { jobId: entry.jobId, company: entry.company || '', title: entry.title || '' };
    fs.writeFileSync(RESUME_TO_JOB_MAP_PATH, JSON.stringify(map, null, 2), 'utf8');
  } catch (_) {}
}

/**
 * Get job description by job ID from digest or export JSON. Returns job_description string or ''.
 */
function getJobDescriptionByJobId(jobId, logProgress) {
  if (!jobId) return '';
  try {
    if (fs.existsSync(DEFAULT_DIGEST)) {
      const { jobs } = loadJobsFromDigestMarkdown(DEFAULT_DIGEST, [], 0, 0, '');
      const found = jobs.find((j) => j.id === String(jobId));
      if (found && (found.job_description || '').trim().length >= MIN_JOB_DESCRIPTION_LENGTH) {
        logProgress('[Teal match-score] Job description by jobId from digest: ' + (found.job_description || '').trim().length + ' chars.');
        return (found.job_description || '').trim();
      }
    }
  } catch (e) {
    logProgress('[Teal match-score] getJobDescriptionByJobId (digest): ' + (e.message || '').slice(0, 50));
  }
  try {
    if (fs.existsSync(DEFAULT_EXPORT)) {
      const data = JSON.parse(fs.readFileSync(DEFAULT_EXPORT, 'utf8'));
      const jobsById = data.jobs || {};
      const payload = jobsById[String(jobId)];
      if (payload && (payload.job_description || '').trim().length >= MIN_JOB_DESCRIPTION_LENGTH) {
        logProgress('[Teal match-score] Job description by jobId from export JSON: ' + (payload.job_description || '').trim().length + ' chars.');
        return (payload.job_description || '').trim();
      }
      const results = data.filter?.results || data.results || {};
      const r = results[String(jobId)];
      if (r) {
        const full = jobsById[String(jobId)] || {};
        const jd = (full.job_description || '').trim();
        if (jd.length >= MIN_JOB_DESCRIPTION_LENGTH) {
          logProgress('[Teal match-score] Job description by jobId from export: ' + jd.length + ' chars.');
          return jd;
        }
      }
    }
  } catch (e) {
    logProgress('[Teal match-score] getJobDescriptionByJobId (export): ' + (e.message || '').slice(0, 50));
  }
  return '';
}

/**
 * Find job description by company (and optionally title) in digest MD or export JSON.
 * Tries DEFAULT_DIGEST first, then DEFAULT_EXPORT. Returns job_description string or ''.
 */
function findJobDescriptionByCompanyAndTitle(company, title, logProgress) {
  const companyNorm = (company || '').toLowerCase().trim();
  const titleNorm = (title || '').toLowerCase().trim();
  if (!companyNorm) return '';
  const matchJob = (j) => {
    const c = (j.company || '').toLowerCase().trim();
    const t = (j.title || '').toLowerCase().trim();
    if (c !== companyNorm && !c.includes(companyNorm) && !companyNorm.includes(c)) return false;
    if (titleNorm && t && t !== titleNorm && !t.includes(titleNorm) && !titleNorm.includes(t)) return false;
    return (j.job_description || '').trim().length >= MIN_JOB_DESCRIPTION_LENGTH;
  };
  try {
    if (fs.existsSync(DEFAULT_DIGEST)) {
      const { jobs } = loadJobsFromDigestMarkdown(DEFAULT_DIGEST, [], 0, 0, '');
      const found = jobs.find(matchJob);
      if (found) {
        logProgress('[Teal match-score] Job description from digest: ' + (found.company || '') + ', ' + (found.job_description || '').trim().length + ' chars.');
        return (found.job_description || '').trim();
      }
    }
  } catch (e) {
    logProgress('[Teal match-score] Digest lookup failed: ' + (e.message || '').slice(0, 50));
  }
  try {
    if (fs.existsSync(DEFAULT_EXPORT)) {
      const { jobs } = loadJobsAll(DEFAULT_EXPORT, [], 0, 0, '');
      const found = jobs.find(matchJob);
      if (found) {
        logProgress('[Teal match-score] Job description from export JSON: ' + (found.company || '') + ', ' + (found.job_description || '').trim().length + ' chars.');
        return (found.job_description || '').trim();
      }
    }
  } catch (e) {
    logProgress('[Teal match-score] Export JSON lookup failed: ' + (e.message || '').slice(0, 50));
  }
  return '';
}

/**
 * Parse link text to title and company. Handles:
 * - "Title — Company (remote)" (em dash)
 * - "Title · Company · Remote" or "— · Company · Remote" (middle dot; Teal list format from filter-digest)
 * Never substitutes "—" with "Product Manager": placeholder is left so loadJobsFromDigestMarkdown can enrich from jobs/<id>.json.
 * Placeholder in digest happens only when: digest was built before title was available (e.g. export had "—"), or jobs/<id>.json does not exist yet. After Step 4, jobs/<id>.json should always have job_title.
 */
function parseDigestLinkText(linkText) {
  const t = (linkText || '').trim();
  const placeholder = '—';
  if (!t) return { title: placeholder, company: '' };
  // Middle-dot format: "Title · Company · Remote" or "— · SoSafe · Remote"
  if (t.includes(' · ')) {
    const parts = t.split(' · ').map((s) => s.trim()).filter(Boolean);
    const title = (parts[0] && parts[0] !== '—' && parts[0] !== '') ? parts[0] : placeholder;
    const company = (parts[1] || '').trim();
    return { title, company };
  }
  // Em-dash format: "Title — Company (remote)" or "Title — Company (Kyiv)" — leave "—" as placeholder; strip any parenthetical at end so Job Matcher search matches what Teal shows (add-digest uses job_title/company from jobs/<id>.json without location).
  const parts = t.split(/\s*—\s*/);
  const rawTitle = (parts[0] || '').trim();
  const title = (rawTitle && rawTitle !== '—') ? rawTitle : placeholder;
  const companyPart = (parts[1] || '').trim();
  const company = companyPart.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { title, company };
}

/**
 * Load jobs from digest markdown (primary source). Format: - [ ] [Title — Company (remote)](url) or [Title · Company · Remote](url), then lines "  > description".
 */
function loadJobsFromDigestMarkdown(mdPath, exclude, fromIndex, limit, companyFilter) {
  if (!fs.existsSync(mdPath)) {
    throw new Error('Digest file not found: ' + mdPath);
  }
  const content = fs.readFileSync(mdPath, 'utf8');
  const lines = content.split(/\n/);
  const digestJobCount = lines.filter((line) => /^-\s*\[\s*[ x\-]\s*\]\s*\[[^\]]+\]\(https:\/\/www\.linkedin\.com\/jobs\/view\/\d+\/?\)/.test(line)).length;
  const isSingleDigestJob = digestJobCount === 1;
  const jobs = [];
  const missingTitleDetails = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^-\s*\[\s*[ x\-]\s*\]\s*\[([^\]]+)\]\((https:\/\/www\.linkedin\.com\/jobs\/view\/(\d+)\/?)\)/);
    if (!m) {
      i++;
      continue;
    }
    const linkLineIndex = i;
    const linkText = m[1].trim();
    const id = m[3];
    const { title: parsedTitle, company: parsedCompany } = parseDigestLinkText(linkText);
    let title = parsedTitle || '—';
    let company = parsedCompany || '';
    // Prefer jobs/<id>.json title/company when file exists and has real data (not placeholder).
    // Do NOT overwrite digest with '—' from a failed LinkedIn fetch (pasted jobs, fake IDs).
    if (id && JOBS_DIR && fs.existsSync(JOBS_DIR)) {
      const jobPath = path.join(JOBS_DIR, id + '.json');
      if (fs.existsSync(jobPath)) {
        try {
          const payload = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
          const fromFileTitle = (payload.job_title || '').trim();
          const fromFileCompany = (payload.company || '').trim();
          if (fromFileTitle && !isPlaceholderJobField(fromFileTitle) && (isPlaceholderJobField(title) || looksLikeJobTitle(fromFileTitle))) title = fromFileTitle;
          if (fromFileCompany && !isPlaceholderJobField(fromFileCompany)) company = fromFileCompany;
        } catch (_) {}
      }
    }
    i++;
    // Skip blank lines between link and "  > " block (digest may have one empty line after the link).
    while (i < lines.length && (lines[i] || '').trim() === '') i++;
    const descLines = [];
    while (i < lines.length && (lines[i].startsWith('  > ') || lines[i].startsWith('  >'))) {
      descLines.push(lines[i].startsWith('  > ') ? lines[i].slice(4) : lines[i].slice(3).trim());
      i++;
    }
    let job_description = descLines.join('\n').trim();
    // Fallback if still empty/short (e.g. malformed digest): data/jobs/<id>.json
    if ((!job_description || job_description.length < MIN_JOB_DESCRIPTION_LENGTH) && id && JOBS_DIR && fs.existsSync(JOBS_DIR)) {
      const jobPath = path.join(JOBS_DIR, id + '.json');
      if (fs.existsSync(jobPath)) {
        try {
          const j = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
          const fromFile = (j.job_description || '').trim();
          if (fromFile.length >= MIN_JOB_DESCRIPTION_LENGTH) job_description = fromFile;
        } catch (_) {}
      }
    }
    if (!isSingleDigestJob) {
      if (exclude.some((c) => (company || '').toLowerCase().includes(c))) continue;
      if (isRemoteFromExcludedCountry(title, '', job_description)) continue;
      if (requiresResidenceInExcludedCountry(title, '', job_description)) continue;
      if (requiresRelocation(title, '', job_description)) continue;
      if (isVideoGamingRole(title, company, job_description)) continue;
      if (isAutomotiveRole(title, company, job_description)) continue;
      if (isHardwareRole(title, company, job_description)) continue;
      if (isTelecomRole(title, company, job_description)) continue;
      if (requiresSapExperience(title, company, job_description)) continue;
      if (requiresHighTravel(title, job_description)) continue;
      if (isBelowMinSalary(job_description)) continue;
    }
    if (companyFilter && !(company || '').toLowerCase().includes(companyFilter.toLowerCase())) continue;
    const titleIsGenericPm = isPlaceholderJobField(title);
    const allowGenericPmTitle = isSingleDigestJob && titleIsGenericPm && company && !isPlaceholderJobField(company);
    let effectiveTitle = (title && title !== '—' && (!titleIsGenericPm || allowGenericPmTitle)) ? title : (title || '—');
    let isMissingTitle = !effectiveTitle || effectiveTitle === '—' || (isPlaceholderJobField(effectiveTitle) && !allowGenericPmTitle);
    // Reject slogan-like titles (e.g. "We believe in smart execution, continuous improvement") from digest or jobs file.
    if (effectiveTitle && typeof looksLikeJobTitle === 'function' && !looksLikeJobTitle(effectiveTitle)) {
      effectiveTitle = '';
      isMissingTitle = true;
    }
    // Fallback: derive title from job description when digest/jobs file have placeholder or slogan (e.g. single-job and fetch failed).
    if (isMissingTitle && job_description && job_description.length >= 20 && typeof deriveTitleFromDescription === 'function') {
      const derived = (deriveTitleFromDescription(job_description) || '').trim();
      if (derived && derived.length >= 3 && derived.length <= 120 && (typeof looksLikeJobTitle !== 'function' || looksLikeJobTitle(derived))) {
        effectiveTitle = derived;
        isMissingTitle = false;
      }
    }
    if (isMissingTitle && (!effectiveTitle || (isSingleDigestJob && isPlaceholderJobField(effectiveTitle)))) {
      effectiveTitle = (title && title !== '—' ? title : 'Product Manager');
      isMissingTitle = false;
    }
    if (isMissingTitle) {
      const jobPath = id && JOBS_DIR ? path.join(JOBS_DIR, id + '.json') : '';
      let fileJobTitle = null;
      if (jobPath && fs.existsSync(jobPath)) {
        try {
          fileJobTitle = (JSON.parse(fs.readFileSync(jobPath, 'utf8')).job_title || '').trim();
        } catch (_) {}
      }
      missingTitleDetails.push({
        digestPath: mdPath,
        digestLineNumber: linkLineIndex + 1,
        digestLine: lines[linkLineIndex],
        linkText,
        jobId: id,
        jobPath: jobPath || null,
        fileExists: jobPath ? fs.existsSync(jobPath) : false,
        jobTitleInFile: fileJobTitle
      });
    }
    if (!isMissingTitle) {
    const resumeTitle = company ? `${effectiveTitle} — ${company}` : effectiveTitle;
    const url = m[2] || ('https://www.linkedin.com/jobs/view/' + id);
    jobs.push({
      id,
      url,
      title: effectiveTitle,
      company: company || '',
      location: '',
      job_description,
      resumeTitle
    });
    }
  }
  if (missingTitleDetails.length > 0) {
    const reportPath = path.join(TEAL_DIR, 'missing-title-report.json');
    try {
      ensureDirs();
      fs.writeFileSync(reportPath, JSON.stringify({ message: 'Missing job title(s) in digest — fix required', jobs: missingTitleDetails, ts: new Date().toISOString() }, null, 2), 'utf8');
    } catch (_) {}
    const first = missingTitleDetails[0];
    throw new Error(
      'Missing job title (bug). ' + missingTitleDetails.length + ' job(s) without title. First: job id ' + first.jobId +
      ', digest: ' + mdPath + ', linkText: ' + JSON.stringify(first.linkText) +
      ', jobs file exists: ' + first.fileExists + ', job_title in file: ' + JSON.stringify(first.jobTitleInFile) +
      '. Full list: ' + reportPath + '. Resolve: ensure digest has real title or jobs/<id>.json have job_title (run Step 4).'
    );
  }
  const total = jobs.length;
  let slice = fromIndex > 0 ? jobs.slice(fromIndex) : jobs;
  if (limit > 0) slice = slice.slice(0, limit);
  return { jobs: slice, total };
}

/** Load jobs same way as teal-resume-batch: no PM/non-English filters, no dedup. Use --all to match batch list. */
function loadJobsAll(exportPath, exclude, fromIndex, limit, companyFilter, onlyExportDate) {
  if (!fs.existsSync(exportPath)) {
    throw new Error('Export file not found: ' + exportPath);
  }
  const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  if (onlyExportDate) {
    const exportedAt = data.exportedAt || '';
    const exportDay = exportedAt.slice(0, 10);
    if (exportDay !== onlyExportDate) {
      throw new Error(
        'Test runs only with vacancies from ' + onlyExportDate + '. This export is from ' + (exportDay || 'unknown date') + '. Use an export from Feb 10 or run without --test.'
      );
    }
  }
  const results = data.filter?.results || data.results || {};
  const jobsById = data.jobs || {};
  const jobs = [];
  for (const [id, r] of Object.entries(results)) {
    if (r.remove) continue;
    const company = (r.company || '').toLowerCase();
    if (exclude.some((c) => company.includes(c))) continue;
    const jobPayload = jobsById[id] || {};
    const rawTitle = (r.title || jobPayload.job_title || jobPayload.title || '').trim();
    if (isRemoteFromExcludedCountry(rawTitle, jobPayload.location || '', jobPayload.job_description || '')) continue;
    if (requiresResidenceInExcludedCountry(rawTitle, jobPayload.location || '', jobPayload.job_description || '')) continue;
    if (requiresRelocation(rawTitle, jobPayload.location || '', jobPayload.job_description || '')) continue;
    if (isVideoGamingRole(rawTitle, r.company || jobPayload.company || '', jobPayload.job_description || '')) continue;
    if (isAutomotiveRole(rawTitle, r.company || jobPayload.company || '', jobPayload.job_description || '')) continue;
    if (isHardwareRole(rawTitle, r.company || jobPayload.company || '', jobPayload.job_description || '')) continue;
    if (isTelecomRole(rawTitle, r.company || jobPayload.company || '', jobPayload.job_description || '')) continue;
    if (requiresSapExperience(rawTitle, r.company || jobPayload.company || '', jobPayload.job_description || '')) continue;
    if (requiresHighTravel(rawTitle, jobPayload.job_description || '')) continue;
    if (isBelowMinSalary(jobPayload.job_description || '')) continue;
    const title = (!rawTitle || isUILabel(rawTitle)) ? 'Product Manager' : rawTitle;
    jobs.push({
      id,
      title,
      company: r.company || jobPayload.company || '',
      location: jobPayload.location || '',
      job_description: jobPayload.job_description || '',
      resumeTitle: (r.company || jobPayload.company) ? `${title} — ${r.company || jobPayload.company}` : title
    });
  }
  if (companyFilter) {
    const cf = companyFilter.toLowerCase();
    jobs = jobs.filter((j) => (j.company || '').toLowerCase().includes(cf));
  }
  const total = jobs.length;
  let slice = fromIndex > 0 ? jobs.slice(fromIndex) : jobs;
  if (limit > 0) slice = slice.slice(0, limit);
  return { jobs: slice, total };
}

function loadJobs(exportPath, exclude, fromIndex, limit, companyFilter, onlyExportDate, allowNonProduct) {
  if (!fs.existsSync(exportPath)) {
    throw new Error('Export file not found: ' + exportPath);
  }
  const data = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  if (onlyExportDate) {
    const exportedAt = data.exportedAt || '';
    const exportDay = exportedAt.slice(0, 10);
    if (exportDay !== onlyExportDate) {
      throw new Error(
        'Test runs only with vacancies from ' + onlyExportDate + '. This export is from ' + (exportDay || 'unknown date') + '. Use an export from Feb 10 or run without --test.'
      );
    }
  }
  const results = data.filter?.results || data.results || {};
  const jobsById = data.jobs || {};
  const raw = [];
  for (const [id, r] of Object.entries(results)) {
    if (r.remove) continue;
    const company = (r.company || '').toLowerCase();
    if (exclude.some((c) => company.includes(c))) continue;
    const jobPayload = jobsById[id] || {};
    const location = jobPayload.location || '';
    const rawTitle = (r.title || '').trim();
    const title = (!rawTitle || isUILabel(rawTitle)) ? 'Product Manager' : rawTitle;
    if (!allowNonProduct && isNonProductTitle(title)) continue;
    if (isNonEnglishJob({ title, description: jobPayload.job_description })) continue;
    if (isHardwareRole(rawTitle, r.company || '', jobPayload.job_description || '')) continue;
    if (isTelecomRole(rawTitle, r.company || '', jobPayload.job_description || '')) continue;
    if (requiresSapExperience(rawTitle, r.company || '', jobPayload.job_description || '')) continue;
    raw.push({
      id,
      title,
      company: r.company || '',
      location,
      job_description: jobPayload.job_description || '',
      resumeTitle: r.company ? `${title} — ${r.company}` : title
    });
  }
  // Deduplicate by (title, company): keep one per role by location priority (PT → UA → ES → …)
  const byKey = new Map();
  for (const j of raw) {
    const key = (j.company + '|' + j.title).toLowerCase();
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(j);
  }
  let jobs = [];
  for (const group of byKey.values()) {
    const best = group.slice().sort((a, b) => locationRank(a.location) - locationRank(b.location))[0];
    jobs.push(best);
  }
  if (companyFilter) {
    const cf = companyFilter.toLowerCase();
    jobs = jobs.filter((j) => (j.company || '').toLowerCase().includes(cf));
  }
  const total = jobs.length;
  let slice = fromIndex > 0 ? jobs.slice(fromIndex) : jobs;
  if (limit > 0) slice = slice.slice(0, limit);
  return { jobs: slice, total };
}

async function main() {
  ensureDirs();
  const { exportPath, exclude, fromIndex, limit, companyFilter, waitForClick, testMode, filterJobs, cdpUrl, resumeId, resumeCompany, resumeJobTitle, jobDescriptionFile, allowNonProduct } = parseArgs();

  // Mode: single resume by URL/ID — only run Applied export (no digest, no match-score loop).
  if (resumeId) {
    logProgress('[Teal match-score] Resume-only mode: ' + resumeId);
    let playwright;
    try {
      playwright = require('playwright');
    } catch (e) {
      console.error('Playwright not installed. Run: npm install playwright');
      process.exit(1);
    }
    logProgress('[Teal match-score] Connecting to browser…');
    let context;
    let page;
    let connected = false;
    try {
      const browser = await playwright.chromium.connectOverCDP(cdpUrl, { timeout: 6000 });
      const contexts = browser.contexts();
      context = contexts[0];
      if (!context) context = await browser.newContext();
      page = await context.newPage();
      connected = true;
      logProgress('[Teal match-score] Connected via CDP.');
    } catch (e) {
      logProgress('[Teal match-score] CDP failed, trying profile launch.');
    }
    if (!connected) {
      const candidatesResume = getTealProfileCandidates();
      for (let i = 0; i < candidatesResume.length && !connected; i++) {
        try {
          const res = await launchChromeWithProfile(playwright, candidatesResume[i]);
          if (res) {
            context = res.context;
            page = res.page;
            connected = true;
            logProgress('[Teal match-score] Launched with profile: ' + candidatesResume[i]);
          }
        } catch (e2) {
          if (!isProfileBusyError(e2)) throw e2;
          logProgress('[Teal match-score] Profile busy, trying next…');
        }
      }
    }
    if (!connected) {
      logProgress('[Teal match-score] Could not connect. Quit Chrome (Cmd+Q), wait, then run again.');
      process.exit(1);
    }
    const resumePreviewUrl = 'https://app.tealhq.com/resume-builder/resumes/' + resumeId + '/preview';
    logProgress('[Teal match-score] Opening resume: ' + resumePreviewUrl);
    await page.goto(resumePreviewUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(4000);

    let currentUrl = page.url();
    if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login') || currentUrl.includes('accounts.google.com')) {
      logProgress('[Teal match-score] Login/signup page detected, running doTealLogin…');
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(resumePreviewUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(4000);
    }

    let company = resumeCompany;
    let resumeTitleFromInput = 'Product Manager';
    const resumeTitleInput = page.locator('input[aria-label="Resume Title"]').first();
    if ((await resumeTitleInput.count()) > 0) {
      const value = (await resumeTitleInput.inputValue().catch(() => '') || '').trim();
      logProgress('[Teal match-score] Resume title (input): ' + (value || '(empty)'));
      const parts = value.split(/[\u2014\u2013\u2212]/);
      if (parts.length >= 2) {
        company = company || parts[parts.length - 1].trim();
        resumeTitleFromInput = (parts[0] || '').trim() || 'Product Manager';
      } else if (parts.length === 1 && parts[0].trim()) {
        resumeTitleFromInput = parts[0].trim();
      }
    }
    if (!company) {
      const invalidCompany = !company || /^(Resume Builder|Teal)$/i.test(company.trim());
      if (invalidCompany) {
        logProgress('[Teal match-score] Company from Resume Title not found or invalid. Trying Job Matcher.');
        const matchingUrl = 'https://app.tealhq.com/resume-builder/resumes/' + resumeId + '/matching';
        await page.goto(matchingUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
        const h2 = page.locator('h2').filter({ hasText: / - (remote|hybrid|on-site|part-time|full-time|contract)/i }).first();
        if ((await h2.count()) > 0) {
          const h2Text = (await h2.textContent().catch(() => '') || '').trim();
          logProgress('[Teal match-score] Job Matcher h2: ' + h2Text);
          company = h2Text.replace(/\s*-\s*(remote|hybrid|on-site|part-time|full-time|contract|in-office|flexible).*$/i, '').trim();
        }
        await page.goto(resumePreviewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(2000);
      }
      if (!company || /^(Resume Builder|Teal)$/i.test(company.trim())) {
        company = 'Unknown_Company';
        logProgress('[Teal match-score] Company could not be determined. Use --company "Company Name" for correct folder and cover letter.');
      }
      logProgress('[Teal match-score] Determined company: ' + company);
    } else {
      logProgress('[Teal match-score] Company (from --company): ' + company);
    }
    // If --job-title provided, rename resume to "Title — Company" before Job Matcher
    if (resumeJobTitle && company) {
      const nameToSet = (resumeJobTitle.trim() + ' — ' + (company || '').trim()).trim();
      if (nameToSet) {
        const resumeEditUrl = 'https://app.tealhq.com/resume-builder/resumes/' + resumeId;
        logProgress('[Teal match-score] Renaming resume to: ' + nameToSet);
        await page.goto(resumeEditUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);
        const renamed = await setResumeTitleInTeal(page, nameToSet, logProgress);
        if (renamed) {
          const saveBtn = page.locator('button[aria-label="Save"]').first();
          if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible().catch(() => false))) {
            await saveBtn.click();
            await sleep(1500);
          }
          resumeTitleFromInput = resumeJobTitle.trim();
        }
      }
    }
    const job = { company, title: resumeTitleFromInput };
    if (jobDescriptionFile) {
      try {
        const jdPath = path.isAbsolute(jobDescriptionFile) ? jobDescriptionFile : path.resolve(process.cwd(), jobDescriptionFile);
        if (fs.existsSync(jdPath)) {
          job.job_description = fs.readFileSync(jdPath, 'utf8').trim();
          logProgress('[Teal match-score] Job description loaded from ' + jobDescriptionFile + ' (' + (job.job_description.length || 0) + ' chars).');
        }
      } catch (e) {
        logProgress('[Teal match-score] Could not read --job-description-file: ' + (e.message || '').slice(0, 80));
      }
    }
    if (!job.job_description || job.job_description.length < MIN_JOB_DESCRIPTION_LENGTH) {
      const map = loadResumeJobMapping();
      const mapping = map[resumeId];
      if (mapping && mapping.jobId) {
        const jdByJobId = getJobDescriptionByJobId(mapping.jobId, logProgress);
        if (jdByJobId) job.job_description = jdByJobId;
      }
      if (!job.job_description || job.job_description.length < MIN_JOB_DESCRIPTION_LENGTH) {
        const jdFromData = findJobDescriptionByCompanyAndTitle(job.company, job.title, logProgress);
        if (jdFromData) job.job_description = jdFromData;
      }
    }
    // Full flow (same as Full Flow Step 8): Job Matcher → score → summary loop if <80% → Target Title → PDF
    const matchingUrl = 'https://app.tealhq.com/resume-builder/resumes/' + resumeId + '/matching';
    logProgress('[Teal match-score] Opening Job Matcher (same as Full Flow Step 8).');
    await page.goto(matchingUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(5000);

    let jobSearchInput = page.locator('#job-search-input').or(page.locator('input[aria-label*="Search"][aria-label*="job"]')).first();
    for (let waitAttempt = 0; waitAttempt < 24; waitAttempt++) {
      if ((await jobSearchInput.count()) > 0 && (await jobSearchInput.isVisible().catch(() => false))) break;
      await sleep(500);
    }
    if ((await jobSearchInput.count()) === 0) {
      const menuBtn = page.locator('button[aria-label="Job matcher menu"]').first();
      if ((await menuBtn.count()) > 0 && (await menuBtn.isVisible().catch(() => false))) {
        await menuBtn.click();
        await sleep(800);
        const switchJobItem = page.locator('[role="menuitem"]').filter({ hasText: /Switch Job/i }).first();
        if ((await switchJobItem.count()) > 0) await switchJobItem.click();
        await sleep(2000);
      }
      for (let w2 = 0; w2 < 10; w2++) {
        if ((await jobSearchInput.count()) > 0 && (await jobSearchInput.isVisible().catch(() => false))) break;
        await sleep(500);
      }
    }

    const searchCompany = (job.company || '').trim();
    const resumeTitleForQuery = ((job.title || '').trim() + (searchCompany && searchCompany !== '—' ? ' — ' + searchCompany : '')).trim();
    const matchScoreQueries = getJobMatcherSearchQueries(job, resumeTitleForQuery);
    const searchQuery = matchScoreQueries[0] || ('Job ' + (job.id || ''));
    logProgress('[Teal match-score] Job Matcher: typing "' + searchQuery.slice(0, 50) + '..."');
    if ((await jobSearchInput.count()) > 0 && (await jobSearchInput.isVisible().catch(() => false))) {
      try {
        await jobSearchInput.click({ timeout: 10000 });
        await jobSearchInput.fill(searchQuery, { timeout: 10000 });
      } catch (e) {
        logProgress('[Teal match-score] Job Matcher search input error: ' + (e.message || '').slice(0, 80));
      }
      await sleep(1500);
    }

    let listbox = page.locator('#job-search-listbox').or(page.locator('[role="listbox"]')).first();
    let options = listbox.locator('[role="option"]');
    let optionCount = await options.count();
    for (let w = 0; w < 24 && optionCount === 0; w++) {
      await sleep(500);
      listbox = page.locator('#job-search-listbox').or(page.locator('[role="listbox"]')).first();
      options = listbox.locator('[role="option"]');
      optionCount = await options.count();
      if (optionCount === 0 && w === 4) {
        try {
          if ((await jobSearchInput.count()) > 0 && (await jobSearchInput.isVisible().catch(() => false))) {
            await jobSearchInput.press('Enter', { timeout: 5000 });
          }
        } catch (_) {}
        await sleep(1500);
      }
    }
    if (optionCount === 0) {
      const anyOpt = page.locator('[role="option"]').first();
      if ((await anyOpt.count()) > 0 && (await anyOpt.isVisible().catch(() => false))) {
        options = page.locator('[role="option"]');
        optionCount = await options.count();
      }
    }

    if (optionCount > 0) {
      const jobTitle = (job.title || '').trim();
      const jobTitleNorm = normalizeForMatching(jobTitle);
      const companyLower = searchCompany.toLowerCase();
      const companyParts = companyLower ? companyLower.split(/\s+[-\u2014]\s+|\s+/).filter((p) => p.length >= 2) : [];
      const matchesCompanyRelaxed = (optText) => {
        if (!searchCompany) return true;
        const o = optText.toLowerCase();
        if (o.includes(companyLower)) return true;
        return companyParts.some((part) => part.length >= 3 && o.includes(part));
      };
      let optionToClick = null;
      let optionByTitle = null;
      for (let oi = 0; oi < optionCount; oi++) {
        const optText = (await options.nth(oi).textContent().catch(() => '') || '').trim();
        const optNorm = normalizeForMatching(optText);
        const matchesTitle = jobTitleNorm.length >= 4 && (optNorm.includes(jobTitleNorm) || jobTitleNorm.includes(optNorm.slice(0, 40)));
        const matchesCompany = matchesCompanyRelaxed(optText);
        if (matchesTitle && matchesCompany) {
          optionToClick = options.nth(oi);
          break;
        }
        if (matchesTitle && !optionByTitle) optionByTitle = options.nth(oi);
      }
      if (!optionToClick) optionToClick = optionByTitle || options.first();
      if (optionToClick) {
        await optionToClick.click();
        await sleep(2000);
      }
    }

    let score = await waitForMatchScoreWithReload(page, logProgress);
    let finalScore = score !== null ? score : 100;
    if (score !== null) logProgress('[Teal match-score] Score: ' + score + '%');
    if (score === null) logProgress('[Teal match-score] Score not shown (timeout after refresh); will still add/update summary if JD is available.');

    const jobDesc = (job.job_description || '').trim();
    const hasJd = hasQualifyingJobDescription(jobDesc);
    if (shouldLogLowScoreWithoutJd({ score, jdText: jobDesc })) {
      logProgress('[Teal match-score] Score is ' + score + '% but job description missing or too short (<' + MIN_JOB_DESCRIPTION_LENGTH + ' chars). Optimization SKIPPED. PDF and cover letter will still be saved to Applied.');
    }
    if (shouldRunStep8SummaryLoop({ score, jdText: jobDesc })) {
      const jobMatcherTab = page.locator('#resume-builder-matching').or(page.locator('button[aria-label="Job Matcher"]')).first();
      const contentEditorTab = page.locator('#resume-builder-preview').or(page.locator('button[aria-label="Content Editor"]')).first();
      const editorLocator = page.locator('div.ProseMirror[contenteditable="true"]').or(page.locator('div[contenteditable="true"].tiptap')).last();
      const saveBtnLocator = page.locator('button[aria-label="Save"]').first();
      let currentScore = score !== null ? score : 0;
      let summaryIteration = 0;
      let lastSummaryText = null;

      /** At least 2 iterations when score < 80% so we don't stop after one (e.g. after reload job selection can be lost and score null). */
      while (
        shouldContinueStep8SummaryLoop({
          currentScore,
          iteration: summaryIteration,
          enforceMinIterations: true
        })
      ) {
        summaryIteration++;
        logProgress('[Teal match-score] Score < 80%: opening Content Editor, adding/updating summary (iteration ' + summaryIteration + ').');
        const previewUrl = 'https://app.tealhq.com/resume-builder/resumes/' + resumeId + '/preview';
        await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(4000);

        const screenshotPaths = await takeSkillsScreenshot(page, job, logProgress);
        const skillsFromDom = await extractSkillsFromJobMatcher(page, logProgress);
        const skillsFromVision = screenshotPaths.length ? await extractSkillsFromScreenshotViaVision(screenshotPaths, logProgress, undefined) : null;
        const skillsReport = skillsFromVision && (skillsFromVision.red?.length || skillsFromVision.yellow?.length || skillsFromVision.green?.length)
          ? skillsFromVision
          : skillsFromDom;

        const summaryTextNext = generateSummaryForJob(jobDesc, job.title, job.company, skillsReport, true, lastSummaryText, summaryIteration + 1, null);
        if (!summaryTextNext) {
          logProgress('[Teal match-score] Summary generation failed; continuing.');
          lastSummaryText = null;
        } else {
          await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await sleep(3000);
          const addBtn = page.locator('button[aria-label="Add a Professional Summary"]').first();
          if ((await addBtn.count()) > 0 && (await addBtn.isVisible().catch(() => false))) {
            await addBtn.scrollIntoViewIfNeeded().catch(() => {});
            await sleep(300);
            await addBtn.click();
            await sleep(2000);
          }
          const editorVisible = (await editorLocator.count()) > 0 && (await editorLocator.isVisible().catch(() => false));
          if (editorVisible) {
            await pasteSummaryByParagraphs(page, editorLocator, summaryTextNext, logProgress);
            if ((await saveBtnLocator.count()) > 0 && (await saveBtnLocator.isVisible().catch(() => false))) {
              await saveBtnLocator.click();
              logProgress('[Teal match-score] Summary saved.');
              await sleep(2000);
            }
            lastSummaryText = summaryTextNext;
          }
        }

        await page.goto(matchingUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(3000);
        if ((await jobMatcherTab.count()) > 0 && (await jobMatcherTab.isVisible().catch(() => false))) {
          await jobMatcherTab.click();
          await sleep(1500);
        }
        await safeReloadPage(page, logProgress, 'after_summary_goto_matcher');
        await sleep(3000);
        const scoreAfter = await waitForMatchScoreSmart(page, logProgress, job, selectJobOnMatchingPage);
        if (scoreAfter !== null) {
          currentScore = scoreAfter;
          finalScore = scoreAfter;
          logProgress('[Teal match-score] Score after summary #' + summaryIteration + ': ' + currentScore + '%');
        }
        if (currentScore >= MIN_SCORE) break;
      }
      const summaryExitReason = buildStep8SummaryExitReason({
        finalScore,
        iteration: summaryIteration,
        maxIterations: MAX_SUMMARY_ITERATIONS
      });
      logProgress('[Teal match-score] Summary loop ended — ' + summaryExitReason + ' | resume ' + resumeId + ' | company ' + (job.company || '') + ' | title ' + (job.title || '') + ' | iterations ' + summaryIteration + '.');

      if (shouldWarnScoreStillLowAfterLoop({ finalScore, iteration: summaryIteration, maxIterations: MAX_SUMMARY_ITERATIONS })) {
        logProgress('[Teal match-score] WARNING: Score still ' + finalScore + '% after up to ' + MAX_SUMMARY_ITERATIONS + ' summary iterations. PDF will be saved; consider manual summary edit or re-run.');
      }
    } else {
      logProgress('[Teal match-score] Summary loop skipped — score already ' + (score !== null ? score + '%' : 'unknown') + ' (target 80%+) | resume ' + resumeId + ' | company ' + (job.company || '') + ' | title ' + (job.title || '') + '.');
    }

    logProgress('[Teal match-score] Adding Target Title (job title only, no company), then exporting PDF to Applied.');
    const titleOnlyResume = stripCompanyFromTitle(job.title || '', job.company || '');
    await addTargetTitleToResume(page, normalizeJobTitleForTeal(titleOnlyResume), logProgress);
    const mainSaveBtn = page.locator('button[aria-label="Save"]').first();
    if ((await mainSaveBtn.count()) > 0 && (await mainSaveBtn.isVisible().catch(() => false))) {
      await mainSaveBtn.click();
      logProgress('  Saved resume (Target Title persisted).');
      await sleep(2000);
    }
    await exportPdfAndSaveToApplied(page, context, job, finalScore, logProgress);
    logProgress('[Teal match-score] Resume-only run completed (same as Full Flow Step 8).');
    return;
  }

  const isDigestMd = exportPath.toLowerCase().endsWith('.md');
  // Default: same list as resume batch (96). --filter = PM-only + dedup + non-EN excluded (40).
  const { jobs, total } = isDigestMd
    ? loadJobsFromDigestMarkdown(exportPath, exclude, fromIndex, limit, companyFilter)
    : (filterJobs
        ? loadJobs(exportPath, exclude, fromIndex, limit, companyFilter, testMode ? TEST_EXPORT_DATE : null, allowNonProduct)
        : loadJobsAll(exportPath, exclude, fromIndex, limit, companyFilter, testMode ? TEST_EXPORT_DATE : null));

  if (jobs.length === 0) {
    try {
      if (!fs.existsSync(TEAL_DIR)) fs.mkdirSync(TEAL_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(TEAL_FLOW_DIR, 'step-8-evidence.json'),
        JSON.stringify({ processed: [], noJobsReason: '0 jobs from digest/export', writtenAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch (_) {}
    logProgress('[Teal match-score] No jobs to process.');
    return;
  }

  let playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.error('Playwright not installed. Run: npm install playwright');
    process.exit(1);
  }

  // Connect: try CDP first; on failure, launch Chrome with user profile so it works without manual setup.
  logProgress('[Teal match-score] Connecting to browser (CDP first, then profile fallback).');
  let context;
  let page;
  let connected = false;
  /** True if we launched Chrome ourselves (launchPersistentContext); then we must close it so the script exits. */
  let launchedByUs = false;
  let launchedProfileDir = null;
  try {
    const browser = await playwright.chromium.connectOverCDP(cdpUrl, { timeout: 6000 });
    const contexts = browser.contexts();
    context = contexts[0];
    if (!context) context = await browser.newContext();
    page = await context.newPage();
    logProgress('[Teal match-score] Connected via CDP, opened a new tab.');
    connected = true;
  } catch (e) {
    logProgress('[Teal match-score] CDP failed: ' + (e.message || String(e)).slice(0, 80) + ' — trying profile launch.');
  }
  if (!connected) {
    const candidates = getTealProfileCandidatesForSession();
    const devtoolsWait = Number(process.env.TEAL_DEVTOOLS_PORT_WAIT_MS) || 0;
    const launchOpts = {
      channel: os.platform() === 'darwin' ? 'chrome' : undefined,
      headless: false,
      args: ['--no-first-run'],
      timeout: devtoolsWait > 0 ? Math.max(30000, devtoolsWait + 5000) : 90000
    };
    for (let i = 0; i < candidates.length && !connected; i++) {
      const profileDir = candidates[i];
      for (let retry = 0; retry <= 1 && !connected; retry++) {
        try {
          if (retry === 1 && removeStaleSingletonLock(profileDir)) {
            logProgress('[Teal match-score] Removed stale lock for profile ' + (i + 1) + ', retrying launch.');
          }
          context = await launchPersistentContextGuarded(playwright.chromium, profileDir, launchOpts);
          page = context.pages()[0] || await context.newPage();
          launchedByUs = true;
          launchedProfileDir = profileDir;
          logProgress('[Teal match-score] Launched Chrome with profile: ' + profileDir);
          if (profileDir === TEAL_CHROME_PROFILE_FALLBACK) {
            logProgress('[Teal match-score] Using fallback profile (others were busy). Log in to Teal once in the opened window if needed.');
          }
          connected = true;
        } catch (e2) {
          const busy = isProfileBusyError(e2);
          if (retry === 0 && busy && removeStaleSingletonLock(profileDir)) {
            logProgress('[Teal match-score] Profile ' + (i + 1) + '/' + candidates.length + ' busy; removed stale lock, retrying.');
            continue;
          }
          logProgress('[Teal match-score] Profile ' + (i + 1) + '/' + candidates.length + ' busy or failed: ' + (e2.message || '').slice(0, 80) + (busy ? '; trying next profile.' : ''));
          if (!busy) throw e2;
          break;
        }
      }
      if (!connected && i < candidates.length - 1) await sleep(2000);
    }
    if (!connected && os.platform() === 'darwin') {
      logProgress('[Teal match-score] Trying to start Chrome with debug port (if Chrome is open, quit it with Cmd+Q first).');
      startChromeWithDebugPort();
      const ready = await waitForPort('127.0.0.1', 9222, 20000);
      if (ready) {
        await sleep(2500);
        try {
          const browser = await playwright.chromium.connectOverCDP(cdpUrl, { timeout: 10000 });
          const contexts = browser.contexts();
          context = contexts[0];
          if (!context) context = await browser.newContext();
          page = await context.newPage();
          logProgress('[Teal match-score] Connected via CDP after starting Chrome.');
          connected = true;
        } catch (_) {}
      }
    }
  }
  if (!connected) {
    logProgress('[Teal match-score] Could not connect or launch after trying all profiles (including fallback).');
    logProgress('[Teal match-score] Check Chrome installation; if a profile lock is stale, remove SingletonLock in the profile dir and retry.');
    process.exit(1);
  }

  if (typeof launchedByUs !== 'undefined' && launchedByUs && page) {
    await page.setViewportSize({ width: 1400, height: 2200 }).catch(() => {});
    logProgress('[Teal match-score] Set viewport 1400x2200 for full skills capture.');
  }

  logProgress('[Teal match-score] ' + (isDigestMd ? 'Digest:' : 'Export:') + ' ' + exportPath);
  logProgress('[Teal match-score] Jobs: ' + jobs.length + ' (total in export: ' + total + ')');

  const listUrl = 'https://app.tealhq.com/resume-builder/resumes';
  let processed = 0;
  let lowScoreCount = 0;
  let browserClosed = false;
  const processedList = [];

  const step8EvidencePath = path.join(TEAL_FLOW_DIR, 'step-8-evidence.json');
  const writeStep8Evidence = (ev) => {
    writeStep8EvidenceFile(TEAL_DIR, ev);
  };

  loadTealEnv(VAULT_PATH);

  try {
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(4000);

    let currentUrl = page.url();
    if (currentUrl.includes('sign-in') || currentUrl.includes('sign-up') || currentUrl.includes('login') || currentUrl.includes('accounts.google.com')) {
      await doTealLogin(page, { tealDir: TEAL_DIR });
      await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(4000);
    }

    // Check logged in (Teal shows resume list or login).
    // New Teal UI can hide the search field behind a magnifier button, so we expose it when needed.
    async function getResumeListSearchInput() {
      let input = page
        .locator('input[aria-label*="Search resume" i]')
        .or(page.locator('input[placeholder*="Search Resume" i]'))
        .or(page.locator('input[placeholder*="Search resume" i]'))
        .first();
      if ((await input.count()) > 0 && (await input.isVisible().catch(() => false))) return input;

      const searchToggle = page
        .locator('button:has(span.sr-only:has-text("Search"))')
        .or(page.locator('button[aria-label*="Search" i]'))
        .or(page.locator('[role="button"][aria-label*="Search" i]'))
        .first();
      if ((await searchToggle.count()) > 0 && (await searchToggle.isVisible().catch(() => false))) {
        await searchToggle.click({ timeout: 5000 }).catch(() => {});
        await sleep(500);
      }

      input = page
        .locator('input[aria-label*="Search resume" i]')
        .or(page.locator('input[placeholder*="Search Resume" i]'))
        .or(page.locator('input[placeholder*="Search resume" i]'))
        .first();
      return input;
    }

    const listSearch = await getResumeListSearchInput();
    const hasSearch = (await listSearch.count()) > 0 && (await listSearch.isVisible().catch(() => false));
    const onList = page.url().includes('resume-builder/resumes') && (hasSearch || (await page.locator('a[href*="/resumes/"]').count()) > 0);
    if (!onList) {
      writeStep8Evidence({ processed: [], noJobsReason: 'not_on_resume_list', digestPath: exportPath ? path.relative(VAULT, exportPath) : null });
      logProgress('[Teal match-score] Not on resume list. Log in to Teal in the opened tab or set TEAL_EMAIL/TEAL_PASSWORD in .env.');
      await sleep(15000);
      return;
    }

    /** Wait for Teal loading overlay to disappear so clicks aren't intercepted. */
    async function waitForOverlayGone() {
      const overlay = page.locator('div[class*="bg-white"][class*="z-10"]').first();
      for (let o = 0; o < 25; o++) {
        if (!(await overlay.isVisible().catch(() => false))) return;
        await sleep(300);
      }
    }

    const createdResumeNames = loadCreatedResumeNames();
    const resumeToJobMap = loadResumeJobMapping();

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      if (!allowNonProduct && isNonProductTitle(job.title)) {
        processedList.push({ jobId: job.id, company: job.company, title: job.title, resumeFound: false, skipReason: 'non_product' });
        logProgress(`(${fromIndex + i + 1}/${total}) SKIP (non-product): ${job.company} | ${job.title}`);
        continue;
      }
      const n = fromIndex + i + 1;
      const resumeTitle = job.resumeTitle;

      logProgress(`(${n}/${total}) ${job.company} | ${job.title}`);

      let finalScore = null;
      let addedSummaryThisJob = false;
      let jobProfessionalSummaryText = null;
      try {
        await waitForOverlayGone();

        let clicked = false;
        let openedViaFallback = false;

        // If we already have resume ID for this job (step 7 or previous run), open by URL — no search by name, so we never open the wrong resume.
        const knownResumeId = getResumeIdForJobId(resumeToJobMap, job.id);
        if (knownResumeId) {
          const resumeUrl = 'https://app.tealhq.com/resume-builder/resumes/' + knownResumeId;
          logProgress('  Opening by known resume ID: ' + knownResumeId.slice(0, 8) + '…');
          await page.goto(resumeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await sleep(3000);
          if (page.url().includes('/resumes/' + knownResumeId)) {
            clicked = true;
            // Always set resume name to current job so the saved resume has the correct title (step 7 may have skipped creating a new resume, so we opened an existing one with an old/generic name).
            const nameToSet = (job.resumeTitle || '').trim() || ((job.title || '').trim() + (job.company && job.company !== '—' ? ' — ' + (job.company || '').trim() : '')).trim();
            if (nameToSet) {
              const renamed = await setResumeTitleInTeal(page, nameToSet, logProgress);
              if (renamed) {
                logProgress('  Resume title set to: ' + nameToSet.slice(0, 60) + (nameToSet.length > 60 ? '…' : ''));
                const saveBtn = page.locator('button[aria-label="Save"]').first();
                if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible().catch(() => false))) {
                  await saveBtn.click();
                  await sleep(1500);
                }
              }
            }
          }
        }

        if (!clicked) {
          // Use list search to find resume. Never type "Product Manager" — use real title/company from job (or jobs/<id>.json) so we open the correct resume (e.g. Compliance Officer — Alea), not a random PM one.
          const titlePart = resumeTitle.split(/\s*[—\-|]\s*/)[0].trim();
          const companyPart = (job.company || '').trim();
          const searchQueries = getResumeListSearchQueries(job, createdResumeNames);
          const searchInput = await getResumeListSearchInput();
          const wantNorm = normalizeTitle(resumeTitle);
          const wantNormMatch = normalizeForMatching(resumeTitle);

        for (const query of searchQueries) {
          if (clicked) break;
          logProgress(`  List search: "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}"`);
          if ((await searchInput.count()) > 0 && (await searchInput.isVisible().catch(() => false))) {
            // Teal often overlays the list while loading and intercepts pointer events.
            // Wait for overlay and fall back to force click so search never blocks the whole run.
            await waitForOverlayGone();
            try {
              await searchInput.click({ timeout: 8000 });
            } catch (e) {
              logProgress('  Search input click intercepted, retrying with force click.');
              await waitForOverlayGone();
              await searchInput.click({ timeout: 8000, force: true });
            }
            await searchInput.fill('');
            await sleep(300);
            await searchInput.fill(query);
            await sleep(1500);
            logProgress(`  List search filled, waiting for results`);
          } else {
            logProgress('  List search input not visible after opening Search toggle; continuing with visible list links.');
          }

          // Prefer: link whose text or surrounding row contains the resume title (main card link, not "Match a job")
          const linkWithTitle = page.locator('a[href*="/resumes/"]').filter({ hasText: resumeTitle }).first();
          if ((await linkWithTitle.count()) > 0) {
            logProgress(`  Match: link has title text -> click`);
            await linkWithTitle.scrollIntoViewIfNeeded().catch(() => {});
            await linkWithTitle.click();
            clicked = true;
            break;
          }
          const linkWithPart = page.locator('a[href*="/resumes/"]').filter({ hasText: titlePart }).first();
          if ((await linkWithPart.count()) > 0) {
            logProgress(`  Match: link has title part "${titlePart}" -> click`);
            await linkWithPart.scrollIntoViewIfNeeded().catch(() => {});
            await linkWithPart.click();
            clicked = true;
            break;
          }
          const links = await page.locator('a[href*="/resumes/"]').all();
          logProgress(`  Links visible: ${links.length}, checking full row text`);
          const seenTexts = [];
          for (const link of links) {
            const rowText = await link.evaluate((el) => {
              const row = el.closest('tr') || el.closest('li') || el.closest('[class*="row"]') || el.closest('div[class]')?.parentElement || el;
              return (row && row.innerText ? row.innerText : el.innerText || '').trim().slice(0, 200) || '';
            }).catch(() => '');
            if (rowText && seenTexts.length < 5) seenTexts.push(rowText.slice(0, 60));
            const rowNorm = normalizeTitle(rowText);
            const rowNormMatch = normalizeForMatching(rowText);
            const matchByTitle = rowNorm.includes(wantNorm) || wantNorm.includes(rowNorm);
            const matchByNormalized = wantNormMatch.length >= 5 && (rowNormMatch.includes(wantNormMatch) || wantNormMatch.includes(rowNormMatch));
            const companyNorm = normalizeForMatching(job.company || '');
            const matchByCompany = (companyNorm.length >= 2 && rowNormMatch.includes(companyNorm)) || rowTextMatchesCompanyRelaxed(rowText, job.company);
            if (matchByTitle || matchByNormalized || matchByCompany) {
              logProgress(`  Match: row contains title/company -> click`);
              await link.scrollIntoViewIfNeeded().catch(() => {});
              await link.click();
              clicked = true;
              break;
            }
          }
          if (!clicked && links.length === 1) {
            const singleRowText = await links[0].evaluate((el) => {
              const row = el.closest('tr') || el.closest('li') || el.closest('[class*="row"]') || el.closest('div[class]')?.parentElement || el;
              return (row && row.innerText ? row.innerText : el.innerText || '').trim().slice(0, 200) || '';
            }).catch(() => '');
            const singleNorm = normalizeTitle(singleRowText);
            const singleNormMatch = normalizeForMatching(singleRowText);
            const singleCompanyNorm = normalizeForMatching(job.company || '');
            const singleMatchByTitle = singleNorm.includes(wantNorm) || wantNorm.includes(singleNorm);
            const singleMatchByNorm = wantNormMatch.length >= 5 && (singleNormMatch.includes(wantNormMatch) || wantNormMatch.includes(singleNormMatch));
            const singleMatchByCompany = (singleCompanyNorm.length >= 2 && singleNormMatch.includes(singleCompanyNorm)) || (job.company && singleNorm.toLowerCase().includes((job.company || '').toLowerCase())) || rowTextMatchesCompanyRelaxed(singleRowText, job.company);
            if (singleMatchByTitle || singleMatchByNorm || singleMatchByCompany) {
              logProgress(`  Single link: matches job -> click`);
              await links[0].scrollIntoViewIfNeeded().catch(() => {});
              await links[0].click();
              clicked = true;
            } else {
              logProgress(`  Single link visible but does not match job (row: "${(singleRowText || '').slice(0, 50)}..."); skip to avoid wrong resume.`);
            }
          }
        }

        // Fallback: when we only had "Job <id>" (no real title/company) and step 7 named the resume from digest placeholder (e.g. "Product Manager"), search by that name so we find the resume.
        if (!clicked && searchQueries.length > 0 && searchQueries.every((q) => q === 'Job ' + job.id) && (job.resumeTitle || '').trim()) {
          const fallbackQuery = job.resumeTitle.trim();
          logProgress(`  Fallback list search: "${fallbackQuery.slice(0, 50)}" (resume may be named from digest placeholder)`);
          if ((await searchInput.count()) > 0) {
            await searchInput.click({ timeout: 8000 });
            await searchInput.fill('');
            await sleep(300);
            await searchInput.fill(fallbackQuery);
            await sleep(1500);
          }
          const linkWithResumeTitle = page.locator('a[href*="/resumes/"]').filter({ hasText: fallbackQuery }).first();
          if ((await linkWithResumeTitle.count()) > 0) {
            await linkWithResumeTitle.scrollIntoViewIfNeeded().catch(() => {});
            await linkWithResumeTitle.click();
            clicked = true;
            openedViaFallback = true;
          }
          if (!clicked) {
            const links = await page.locator('a[href*="/resumes/"]').all();
            if (links.length === 1) {
              const rowText = await links[0].evaluate((el) => {
                const row = el.closest('tr') || el.closest('li') || el.closest('[class*="row"]') || el.closest('div[class]')?.parentElement || el;
                return (row && row.innerText ? row.innerText : el.innerText || '').trim().slice(0, 200) || '';
              }).catch(() => '');
              if (normalizeForMatching(rowText).includes(normalizeForMatching(fallbackQuery))) {
                await links[0].scrollIntoViewIfNeeded().catch(() => {});
                await links[0].click();
                clicked = true;
                openedViaFallback = true;
              }
            }
          }
        }

        if (!clicked) {
          logProgress('  No resume found; creating it now (step 7 inline) so flow can continue.');
          const created = createResumeForJob(job, logProgress);
          if (created.ok) {
            const namesAfter = loadCreatedResumeNames();
            const searchName = (namesAfter[job.id] || '').trim() || ((job.company ? (job.title && job.title.trim() !== '—' ? job.title : 'Product Manager') + ' — ' + job.company : (job.title || 'Product Manager'))).trim();
            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await sleep(3000);
            await waitForOverlayGone();
            if (searchName && (await searchInput.count()) > 0) {
              await searchInput.click({ timeout: 8000 });
              await searchInput.fill('');
              await sleep(300);
              await searchInput.fill(searchName);
              await sleep(2000);
              const linkWithTitle = page.locator('a[href*="/resumes/"]').filter({ hasText: searchName }).first();
              if ((await linkWithTitle.count()) > 0) {
                await linkWithTitle.scrollIntoViewIfNeeded().catch(() => {});
                await linkWithTitle.click();
                clicked = true;
              }
              if (!clicked) {
                const titlePart = searchName.split(/\s*[—\-|]\s*/)[0].trim();
                const linkWithPart = page.locator('a[href*="/resumes/"]').filter({ hasText: titlePart }).first();
                if ((await linkWithPart.count()) > 0) {
                  await linkWithPart.scrollIntoViewIfNeeded().catch(() => {});
                  await linkWithPart.click();
                  clicked = true;
                }
              }
              if (!clicked) {
                const links = await page.locator('a[href*="/resumes/"]').all();
                const wantNorm = normalizeTitle(searchName);
                const wantNormMatch = normalizeForMatching(searchName);
                for (const link of links) {
                  const rowText = await link.evaluate((el) => {
                    const row = el.closest('tr') || el.closest('li') || el.closest('[class*="row"]') || el.closest('div[class]')?.parentElement || el;
                    return (row && row.innerText ? row.innerText : el.innerText || '').trim().slice(0, 200) || '';
                  }).catch(() => '');
                  const rowNorm = normalizeTitle(rowText);
                  const rowNormMatch = normalizeForMatching(rowText);
                  const match = rowNorm.includes(wantNorm) || wantNorm.includes(rowNorm) || (wantNormMatch.length >= 5 && (rowNormMatch.includes(wantNormMatch) || wantNormMatch.includes(rowNormMatch)));
                  if (match) {
                    await link.scrollIntoViewIfNeeded().catch(() => {});
                    await link.click();
                    clicked = true;
                    break;
                  }
                }
              }
            }
          }
          if (!clicked) {
            const expectedName = job.id && createdResumeNames[job.id] ? createdResumeNames[job.id] : '';
            logProgress(`  Skip: no resume found for this job (queries tried: ${searchQueries.map((q) => JSON.stringify(q.slice(0, 40))).join(', ')}).${expectedName ? ' Step 7 saved name: «' + expectedName + '».' : ''} Create failed or resume still not in list.`);
            processedList.push({ jobId: job.id, company: job.company, title: job.title, resumeFound: false, skipReason: 'no_resume_in_list', expectedResumeName: expectedName || undefined });
            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await sleep(BETWEEN_RESUMES_MS);
            continue;
          }
        }
        }

        await sleep(3000);

        if (!page.url().includes('/resumes/')) {
          logProgress('  Skip: did not open resume page');
          await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await sleep(2000);
          continue;
        }
        const openedResumeId = (page.url().match(/\/resumes\/([0-9a-f-]{36})/i) || [])[1];
        if (openedResumeId && job.id) {
          saveResumeJobMapping(openedResumeId, { jobId: job.id, company: job.company, title: job.title });
        }
        // If we opened this resume via fallback (wrong name from digest), fetch real title/company from job page, rename resume in Teal, and use them for Job Matcher.
        if (openedViaFallback && (job.url || (job.id && 'https://www.linkedin.com/jobs/view/' + job.id))) {
          const jobViewUrl = job.url || ('https://www.linkedin.com/jobs/view/' + job.id);
          logProgress('  Resume was created with placeholder name; fetching real title/company from job page to rename.');
          const meta = await fetchJobPageTitleAndCompany(jobViewUrl);
          if (meta && (meta.title || meta.company)) {
            job.title = meta.title || job.title;
            job.company = meta.company || job.company;
            job.resumeTitle = (job.company ? (job.title || '') + ' — ' + job.company : (job.title || '')).trim() || job.resumeTitle;
            const renamed = await setResumeTitleInTeal(page, job.resumeTitle, logProgress);
            if (renamed) logProgress('  Job object updated: ' + (job.company || '') + ' — ' + (job.title || '').slice(0, 40));
          } else {
            logProgress('  Could not fetch job page title; continuing with digest title/company.');
          }
        }
        await logToBrowserConsole(page, 'Opened resume: ' + page.url() + ' — switching to Job Matcher.');

        // Prefer direct navigation to /matching to avoid overlay intercepting tab click (Teal often shows overlay on resume open).
        const resumeIdFromUrl = (page.url().match(/\/resumes\/([0-9a-f-]{36})/i) || [])[1];
        if (resumeIdFromUrl) {
          const matchingUrlDirect = 'https://app.tealhq.com/resume-builder/resumes/' + resumeIdFromUrl + '/matching';
          await page.goto(matchingUrlDirect, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await sleep(3500);
        } else {
          await waitForOverlayGone();
          const jobMatcherTab = page.locator('#resume-builder-matching').or(page.locator('button[aria-label="Job Matcher"]')).first();
          if ((await jobMatcherTab.count()) > 0 && (await jobMatcherTab.isVisible())) {
            await jobMatcherTab.click({ force: true, timeout: 15000 }).catch(() => {});
            await sleep(3500);
          }
        }

        // Wait for Job Matcher panel and search input (panel may load after tab click or navigation)
        const jobSearchInput = page.locator('#job-search-input').or(page.locator('input[aria-label*="Search"][aria-label*="job"]')).first();
        for (let waitAttempt = 0; waitAttempt < 12; waitAttempt++) {
          if ((await jobSearchInput.count()) > 0 && (await jobSearchInput.isVisible())) break;
          await sleep(500);
        }
        if ((await jobSearchInput.count()) === 0) {
          logProgress('  Input not found; try menu → Switch Job');
          const menuBtn = page.locator('button[aria-label="Job matcher menu"]').first();
          if ((await menuBtn.count()) > 0 && (await menuBtn.isVisible())) {
            await menuBtn.click();
            await sleep(800);
            const switchJobItem = page.locator('[role="menuitem"]').filter({ hasText: /Switch Job/i }).first();
            if ((await switchJobItem.count()) > 0) await switchJobItem.click();
            await sleep(2000);
          }
          for (let w2 = 0; w2 < 10; w2++) {
            if ((await jobSearchInput.count()) > 0 && (await jobSearchInput.isVisible())) break;
            await sleep(500);
          }
        }
        if ((await jobSearchInput.count()) === 0) {
          logProgress('  Skip: Job Matcher search input not found');
          await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await sleep(BETWEEN_RESUMES_MS);
          continue;
        }
        await waitForOverlayGone();
        // If a job is already attached, open menu and "Switch Job" so we can search and attach the correct one
        const inputValue = (await jobSearchInput.inputValue().catch(() => '') || '').trim();
        if (inputValue.length > 0) {
          logProgress('  Job already attached; opening menu → Switch Job');
          const menuBtn = page.locator('button[aria-label="Job matcher menu"]').first();
          if ((await menuBtn.count()) > 0 && (await menuBtn.isVisible())) {
            await menuBtn.click();
            await sleep(800);
            const switchJobItem = page.locator('[role="menuitem"]').filter({ hasText: /Switch Job/i }).first();
            if ((await switchJobItem.count()) > 0 && (await switchJobItem.isVisible())) {
              await switchJobItem.click();
              await sleep(2000);
            }
          }
        }
        // Search Job Matcher: try company first, then "title company" / "title at company" if dropdown stays empty (Teal may need more context).
        const company = (job.company || '').trim();
        const jobTitle = (job.title || '').trim();
        const jobTitleNorm = normalizeForMatching(jobTitle);
        const companyLower = company.toLowerCase();
        const companyParts = companyLower ? companyLower.split(/\s+[-\u2014]\s+|\s+/).filter((p) => p.length >= 2) : [];
        const matchesCompanyRelaxed = (optText) => {
          if (!company) return true;
          const o = optText.toLowerCase();
          if (o.includes(companyLower)) return true;
          return companyParts.some((part) => part.length >= 3 && o.includes(part));
        };

        const dropdownWaitMs = 12000;
        const pollMs = 500;
        const resumeTitleForMatcher = resumeTitle || (jobTitle + (company && company !== '—' ? ' — ' + company : '')).trim();
        const jobMatcherQueries = getJobMatcherSearchQueries(job, resumeTitleForMatcher);

        let optionCount = 0;
        let listbox = page.locator('#job-search-listbox').or(page.locator('[role="listbox"]')).first();
        let options = listbox.locator('[role="option"]');
        let lastQuery = '';

        for (const searchQuery of jobMatcherQueries) {
          if (optionCount > 0) break;
          lastQuery = searchQuery;
          logProgress(`  Job Matcher: typing "${searchQuery.slice(0, 50)}..."`);
          await jobSearchInput.click();
          await jobSearchInput.fill('');
          await sleep(300);
          await jobSearchInput.fill(searchQuery);
          await sleep(1500);

          for (let w = 0; w < dropdownWaitMs / pollMs && optionCount === 0; w++) {
            await sleep(pollMs);
            listbox = page.locator('#job-search-listbox').or(page.locator('[role="listbox"]')).first();
            options = listbox.locator('[role="option"]');
            optionCount = await options.count();
            if (optionCount === 0 && w === 4) {
              await jobSearchInput.press('Enter');
              await sleep(1500);
            }
          }
          if (optionCount === 0) {
            const anyOpt = page.locator('[role="option"]').first();
            if ((await anyOpt.count()) > 0 && (await anyOpt.isVisible().catch(() => false))) {
              options = page.locator('[role="option"]');
              optionCount = await options.count();
            }
          }
        }

        logProgress(`  Job Matcher dropdown: ${optionCount} option(s) (waited up to ${dropdownWaitMs / 1000}s, last query: "${lastQuery.slice(0, 40)}...")`);

        if (optionCount > 0) {
          let optionToClick = null;
          let optionByTitle = null;
          let optionByCompany = null;
          for (let oi = 0; oi < optionCount; oi++) {
            const optText = (await options.nth(oi).textContent().catch(() => '') || '').trim();
            const optNorm = normalizeForMatching(optText);
            const matchesTitle = jobTitleNorm.length >= 4 && (optNorm.includes(jobTitleNorm) || jobTitleNorm.includes(optNorm.slice(0, 50)));
            const matchesCompany = matchesCompanyRelaxed(optText);
            if (matchesTitle && matchesCompany) {
              optionToClick = options.nth(oi);
              logProgress(`  Job Matcher: click option matching title+company: "${optText.slice(0, 55)}"`);
              break;
            }
            if (matchesTitle && !optionByTitle) optionByTitle = options.nth(oi);
            if (matchesCompany && !optionByCompany) optionByCompany = options.nth(oi);
          }
          if (!optionToClick) optionToClick = optionByTitle;
          if (!optionToClick) optionToClick = optionByCompany;
          if (!optionToClick && optionCount > 0) {
            const samples = [];
            for (let oi = 0; oi < Math.min(5, optionCount); oi++) {
              const t = (await options.nth(oi).textContent().catch(() => '') || '').trim().slice(0, 60);
              samples.push(t);
            }
            logProgress(`  Job Matcher: no option matching title "${jobTitle.slice(0, 35)}..." / company "${company.slice(0, 25)}". Options: ${samples.join(' | ')}`);
            optionToClick = options.first();
            logProgress(`  Job Matcher: clicking first option as fallback to connect resume to a job`);
          }
          if (optionToClick) {
            await optionToClick.click();
            await sleep(2000);
          } else {
            logProgress(`  Job Matcher: skip — no options to click`);
            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await sleep(BETWEEN_RESUMES_MS);
            continue;
          }
        } else {
          logProgress(`  Job Matcher: dropdown did not appear after queries: ${jobMatcherQueries.map((q) => q.slice(0, 30)).join(', ')}. Ensure jobs were added to Teal Job Tracker (step 1: LinkedIn capture + add to Teal).`);
          await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await sleep(BETWEEN_RESUMES_MS);
          continue;
        }

        // Wait for match score (1 min); if not loaded, refresh page and retry once
        let score = await waitForMatchScoreWithReload(page, logProgress);

        if (score === null) {
          logProgress('  Score: (timeout waiting for score after refresh)');
          await logToBrowserConsole(page, 'Score: timeout (no % shown).');
        } else {
          logProgress(`  Score: ${score}%`);
          finalScore = score;
          await logToBrowserConsole(page, 'Match score: ' + score + '%' + (score < MIN_SCORE ? ' → will open Content Editor and add new Professional Summary.' : ''));
          if (score < MIN_SCORE) {
            lowScoreCount++;
            await logToBrowserConsole(page, 'Score < 80%. Opening Content Editor tab.');
            const contentEditorTab = page.locator('#resume-builder-preview').or(page.locator('button[aria-label="Content Editor"]')).first();
            const tabFound = (await contentEditorTab.count()) > 0 && (await contentEditorTab.isVisible());
            await logToBrowserConsole(page, 'Content Editor tab found: ' + tabFound + (tabFound ? ', switching...' : ' — cannot switch to preview.'));
            if (tabFound) {
              await contentEditorTab.click();
              await sleep(4000);
              await logToBrowserConsole(page, 'Content Editor open. URL: ' + page.url());
            }

            if (waitForClick) {
              // --- Wait for USER click (main frame + all iframes); capture click target and scroll state ---
              const USER_CLICK_TIMEOUT_MS = 90000;
              const getScrollState = () => {
                const out = [];
                document.querySelectorAll('*').forEach((el) => {
                  if (out.length >= 30) return;
                  if (el.scrollHeight > el.clientHeight || (el.scrollTop !== undefined && el.scrollTop !== 0)) {
                    out.push({
                      i: out.length,
                      tag: el.tagName,
                      class: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 100),
                      scrollTop: el.scrollTop,
                      scrollHeight: el.scrollHeight,
                      clientHeight: el.clientHeight
                    });
                  }
                });
                return out;
              };
              const getLeftColState = () => {
                const el = document.querySelector('[class*="left-col"]');
                if (!el) return { found: false };
                return { found: true, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
              };
              const scrollBefore = await page.evaluate(getScrollState).catch(() => []);
              const leftColBefore = await page.evaluate(getLeftColState).catch(() => ({}));
              let userClickResolve;
              const userClickPromise = new Promise((resolve) => { userClickResolve = resolve; });
              const SCROLL_SETTLE_MS = 5000;
              await page.exposeFunction('dexOnUserClick', async (clickInfo) => {
                if (!userClickResolve) return;
                await sleep(SCROLL_SETTLE_MS);
                const scrollAfter = await page.evaluate(getScrollState).catch(() => []);
                const leftColAfter = await page.evaluate(getLeftColState).catch(() => ({}));
                userClickResolve({ click: clickInfo, scrollBefore, scrollAfter, leftColBefore, leftColAfter });
                userClickResolve = null;
              });
              const addClickCapture = (isIframe) => {
                const handler = (e) => {
                  document.removeEventListener('click', handler, true);
                  const t = e.target;
                  if (!t) return;
                  const dataAttrs = {};
                  if (t.getAttribute) {
                    try {
                      for (const a of t.attributes || []) {
                        if (a.name && a.name.startsWith('data-')) dataAttrs[a.name] = a.value || '';
                      }
                    } catch (_) {}
                  }
                  let parentChain = '';
                  try {
                    const chain = [];
                    let cur = t;
                    for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
                      const sel = cur.id ? '#' + cur.id : (cur.className && typeof cur.className === 'string' ? '.' + cur.className.trim().split(/\s+/)[0] : cur.tagName);
                      chain.push((cur.tagName || '').toLowerCase() + (sel && sel !== cur.tagName ? '(' + String(sel).slice(0, 40) + ')' : ''));
                      cur = cur.parentElement;
                    }
                    parentChain = chain.join(' < ');
                  } catch (_) {}
                  const clickInfo = {
                    type: 'click',
                    inIframe: !!isIframe,
                    x: e.clientX,
                    y: e.clientY,
                    tag: (t && t.tagName) || '',
                    role: (t && t.getAttribute && t.getAttribute('role')) || '',
                    id: (t && t.id) || '',
                    className: (t && t.className && typeof t.className === 'string' ? t.className : ''),
                    dataSection: (t && t.getAttribute && t.getAttribute('data-section')) || '',
                    dataAttrs: Object.keys(dataAttrs).length ? dataAttrs : undefined,
                    textPreview: (t && (t.innerText || '').slice(0, 200)) || '',
                    parentChain: parentChain || undefined
                  };
                  const win = window.dexOnUserClick ? window : (window.parent && window.parent.dexOnUserClick ? window.parent : null);
                  if (win && win.dexOnUserClick) win.dexOnUserClick(clickInfo);
                };
                document.addEventListener('click', handler, true);
              };
              await page.evaluate(addClickCapture, false).catch(() => {});
              const frames = page.frames();
              for (const frame of frames) {
                if (frame === page.mainFrame()) continue;
                try {
                  await frame.evaluate(() => {
                    const handler = (e) => {
                      document.removeEventListener('click', handler, true);
                      const t = e.target;
                      if (!t) return;
                      const dataAttrs = {};
                      if (t.getAttribute) {
                        try {
                          for (const a of t.attributes || []) {
                            if (a.name && a.name.startsWith('data-')) dataAttrs[a.name] = a.value || '';
                          }
                        } catch (_) {}
                      }
                      let parentChain = '';
                      try {
                        const chain = [];
                        let cur = t;
                        for (let i = 0; i < 8 && cur && cur !== document.body; i++) {
                          const sel = cur.id ? '#' + cur.id : (cur.className && typeof cur.className === 'string' ? '.' + (cur.className.trim().split(/\s+/)[0] || '') : cur.tagName);
                          chain.push((cur.tagName || '').toLowerCase() + (sel && String(sel) !== (cur.tagName || '') ? '(' + String(sel).slice(0, 40) + ')' : ''));
                          cur = cur.parentElement;
                        }
                        parentChain = chain.join(' < ');
                      } catch (_) {}
                      const clickInfo = {
                        type: 'click',
                        inIframe: true,
                        x: e.clientX,
                        y: e.clientY,
                        tag: (t && t.tagName) || '',
                        role: (t && t.getAttribute && t.getAttribute('role')) || '',
                        id: (t && t.id) || '',
                        className: (t && t.className && typeof t.className === 'string' ? t.className : ''),
                        dataSection: (t && t.getAttribute && t.getAttribute('data-section')) || '',
                        dataAttrs: Object.keys(dataAttrs).length ? dataAttrs : undefined,
                        textPreview: (t && (t.innerText || '').slice(0, 200)) || '',
                        parentChain: parentChain || undefined
                      };
                      const win = window.dexOnUserClick ? window : (window.parent && window.parent.dexOnUserClick ? window.parent : null);
                      if (win && win.dexOnUserClick) win.dexOnUserClick(clickInfo);
                    };
                    document.addEventListener('click', handler, true);
                  });
                } catch (_) {}
              }
              logProgress('  [wait-for-click] Waiting for YOUR click on the page (e.g. Professional Summary in preview). You have 90s.');
              await logToBrowserConsole(page, '>>> CLICK the area that should scroll the left panel (e.g. Summary in preview). You have 90 seconds. <<<');
              const result = await Promise.race([
                userClickPromise,
                sleep(USER_CLICK_TIMEOUT_MS).then(() => ({ timeout: true }))
              ]);
              if (result && result.timeout) {
                logProgress('  [wait-for-click] Timeout — no click captured.');
                await logToBrowserConsole(page, '[Dex] Timeout — no click captured.');
              } else if (result) {
                const before = result.scrollBefore || [];
                const after = result.scrollAfter || [];
                const changed = before.map((b, i) => {
                  const a = after[i];
                  if (!a) return null;
                  const diff = a.scrollTop !== b.scrollTop;
                  return diff ? { i, tag: b.tag, class: b.class, scrollTopBefore: b.scrollTop, scrollTopAfter: a.scrollTop } : null;
                }).filter(Boolean);
                const leftColBefore = result.leftColBefore || {};
                const leftColAfter = result.leftColAfter || {};
                const leftColChange = leftColBefore.found && leftColAfter.found
                  ? { scrollTopBefore: leftColBefore.scrollTop, scrollTopAfter: leftColAfter.scrollTop, changed: leftColAfter.scrollTop !== leftColBefore.scrollTop }
                  : { note: 'left-col not found or missing in one snapshot' };
                const report = {
                  url: page.url(),
                  click: result.click,
                  afterClick: {
                    leftCol: leftColChange,
                    scrollContainersThatChanged: changed
                  },
                  scrollBefore: result.scrollBefore,
                  scrollAfter: result.scrollAfter,
                  leftColBefore: result.leftColBefore,
                  leftColAfter: result.leftColAfter
                };
                const reportStr = JSON.stringify(report, null, 2);
                logProgress('  [wait-for-click] CAPTURED — copy from below or from browser console:');
                logProgress(reportStr);
                await page.evaluate((str) => {
                  console.log('%c[Dex teal-match-score] CAPTURED — copy the JSON below:', 'color: #0a7; font-weight: bold');
                  console.log(str);
                }, reportStr);
              }
            } else {
              // --- Add new Professional Summary (score < 80%): go to /preview, click Add Professional Summary, paste → Save ---
              const jobDesc = (job.job_description || '').trim();
              if (jobDesc.length < MIN_JOB_DESCRIPTION_LENGTH) {
                logProgress('  Skip adding summary: no job description in export (need ' + MIN_JOB_DESCRIPTION_LENGTH + '+ chars).');
                await logToBrowserConsole(page, '[Dex] No job description — run digest with descriptions or inject from export.');
              } else {
                logProgress('  Generating summary from job description + CV…');
                const summaryText = generateSummaryForJob(jobDesc, job.title, job.company, null, false, null, 1, null);
                if (!summaryText) {
                  logProgress('  Skip adding summary: generation failed or empty.');
                } else {
                  // Open /preview so "Add Professional Summary" is on the correct page
                  const curUrl = page.url();
                  const previewUrlFirst = curUrl.replace(/\/matching\/?(\?.*)?$/i, '/preview');
                  if (previewUrlFirst !== curUrl) {
                    logProgress('  Opening Content Editor (/preview) for first summary…');
                    await page.goto(previewUrlFirst, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await sleep(4000);
                  }
                  const addBtn = page.locator('button[aria-label="Add a Professional Summary"]').first();
                  if ((await addBtn.count()) > 0 && (await addBtn.isVisible())) {
                    logProgress('  Content Editor (/preview): clicking Add a Professional Summary');
                    await addBtn.scrollIntoViewIfNeeded().catch(() => {});
                    await sleep(300);
                    await addBtn.click();
                    await sleep(2000);
                    // New summary block is usually the last ProseMirror/tiptap in the Content Editor
                    const editor = page.locator('div.ProseMirror[contenteditable="true"]').or(page.locator('div[contenteditable="true"].tiptap')).last();
                    if ((await editor.count()) > 0 && (await editor.isVisible())) {
                      await pasteSummaryByParagraphs(page, editor, summaryText, logProgress);
                      await sleep(400);
                      const saveBtn = page.locator('button[aria-label="Save"]').first();
                      if ((await saveBtn.count()) > 0 && (await saveBtn.isVisible())) {
                        await saveBtn.click();
                        logProgress('  Content Editor: clicked Save');
                        await logToBrowserConsole(page, '[Dex teal-match-score] New Professional Summary added and saved.');
                        await sleep(2000);
                        addedSummaryThisJob = true;
                        jobProfessionalSummaryText = summaryText;
                      } else {
                        logProgress('  Content Editor: Save button not found');
                      }
                    } else {
                      logProgress('  Content Editor: ProseMirror/tiptap editor not found after Add');
                    }
                  } else {
                    logProgress('  Content Editor: Add a Professional Summary button not found on /preview');
                  }
                }
              }
            }
          }
        }

        // After any summary add: loop until score 80-100% or MAX_SUMMARY_ITERATIONS (Job Matcher → reload → score → if < 80% replace summary and repeat)
        // Aligned with --resume-url: run summary when we have JD and (score unknown/timeout or score < 80%)
        const hasJdDigest = hasQualifyingJobDescription(job.job_description || '');
        if (shouldRunStep8SummaryLoop({ score, jdText: job.job_description || '' })) {
          if (score === null) logProgress('[Teal match-score] Score unknown/timeout for ' + (job.title || '') + ', running summary step once.');
          let summaryIteration = 0;
          let unchangedScoreCount = 0;
          let currentScore = score !== null ? score : 0;
          const jobMatcherTab = page.locator('#resume-builder-matching').or(page.locator('button[aria-label="Job Matcher"]')).first();
          const jobMatcherInput = page.locator('#job-search-input').or(page.locator('input[aria-label*="Search"][aria-label*="job"]')).first();
          const contentEditorTab = page.locator('#resume-builder-preview').or(page.locator('button[aria-label="Content Editor"]')).first();
          const editorLocator = page.locator('div.ProseMirror[contenteditable="true"]').or(page.locator('div[contenteditable="true"].tiptap')).last();
          const saveBtnLocator = page.locator('button[aria-label="Save"]').first();

          const ensureJobMatcherActive = async () => {
            if ((await jobMatcherTab.count()) === 0 || !(await jobMatcherTab.isVisible())) return false;
            await jobMatcherTab.click();
            await sleep(1500);
            for (let i = 0; i < 15; i++) {
              if ((await jobMatcherInput.count()) > 0 && (await jobMatcherInput.isVisible().catch(() => false))) return true;
              await sleep(500);
            }
            return false;
          };

          let lastSummaryText = null;
          let summaryExitReason = '';

          while (
            shouldContinueStep8SummaryLoop({
              currentScore,
              iteration: summaryIteration,
              enforceMinIterations: false
            })
          ) {
            logProgress('  Switching to Job Matcher (iteration ' + (summaryIteration + 1) + ')…');
            await jobMatcherTab.click().catch(() => {});
            await sleep(1000);
            await safeReloadPage(page, logProgress, 'summary_loop_job_matcher');
            await sleep(3000);
            if (!(await ensureJobMatcherActive())) {
              await sleep(2000);
              await jobMatcherTab.click().catch(() => {});
              await sleep(2000);
            }
            await sleep(1500);
            const scoreAfter = await waitForMatchScoreSmart(page, logProgress, job, selectJobOnMatchingPage);
            if (scoreAfter === null) {
              summaryIteration++;
              logProgress('  Score not found after reload (timeout); counting as iteration ' + summaryIteration + ', continuing.');
            } else {
              const prevScore = currentScore;
              currentScore = scoreAfter;
              summaryIteration++;
              logProgress('  Score after summary #' + summaryIteration + ' (reload): ' + currentScore + '%');
              if (currentScore === prevScore && currentScore < MIN_SCORE) {
                unchangedScoreCount++;
                logProgress('  [Rule] Score unchanged — summary must use skills from right-col (red/yellow/green); screenshot and DOM extraction target #right-col.');
              } else {
                unchangedScoreCount = 0;
              }
              await logToBrowserConsole(page, '[Dex teal-match-score] Score after summary: ' + currentScore + '%');
            }
            if (currentScore >= MIN_SCORE) {
              finalScore = currentScore;
              summaryExitReason = 'score reached ' + currentScore + '% (target 80%+)';
              logProgress('  Match score 80-100% reached.');
              await logToBrowserConsole(page, '[Dex teal-match-score] Match score 80-100% reached.');
              break;
            }
            if (unchangedScoreCount >= MAX_UNCHANGED_SCORE_ITERATIONS) {
              summaryExitReason = 'score unchanged ' + MAX_UNCHANGED_SCORE_ITERATIONS + ' times in a row, final ' + currentScore + '%';
              logProgress('  Score unchanged ' + MAX_UNCHANGED_SCORE_ITERATIONS + ' times in a row; stopping iterations (final ' + currentScore + '%).');
              break;
            }
            if (summaryIteration >= MAX_SUMMARY_ITERATIONS) {
              summaryExitReason = 'max iterations (' + MAX_SUMMARY_ITERATIONS + ') reached, final score ' + currentScore + '%';
              logProgress('  Max summary iterations (' + MAX_SUMMARY_ITERATIONS + ') reached; score still ' + currentScore + '%.');
              break;
            }
            const screenshotPaths = await takeSkillsScreenshot(page, job, logProgress);
            const skillsFromDom = await extractSkillsFromJobMatcher(page, logProgress);
            const visionRequestId = [job.company || job.company_name, job.title || job.job_title].filter(Boolean).join('_').slice(0, 120).replace(/\//g, '_') || undefined;
            const skillsFromVision = screenshotPaths.length ? await extractSkillsFromScreenshotViaVision(screenshotPaths, logProgress, visionRequestId) : null;
            const skillsReport = skillsFromVision && (skillsFromVision.red?.length || skillsFromVision.yellow?.length || skillsFromVision.green?.length)
              ? skillsFromVision
              : skillsFromDom;
            const jdLen = (job.job_description || '').trim().length;
            const hasSkills = skillsReport && (skillsReport.red?.length || skillsReport.yellow?.length || skillsReport.green?.length);
            const summaryRound = summaryIteration + 1;
            const summaryRequestId = [job.company || job.company_name, job.title || job.job_title].filter(Boolean).join('_').slice(0, 120).replace(/\//g, '_') || undefined;
            const { getLastEvalNotesForRequest } = require('../lib/openai-usage-logger.cjs');
            const previousEval = summaryRequestId ? getLastEvalNotesForRequest(summaryRequestId, 'job_summary') : null;
            logProgress('  Iteration ' + summaryRound + ': regenerating summary from latest report (JD=' + jdLen + ' chars, focus_gap=yes, skills: red=' + (skillsReport.red?.length || 0) + ' yellow=' + (skillsReport.yellow?.length || 0) + ' green=' + (skillsReport.green?.length || 0) + (lastSummaryText ? ', incremental update' : '') + (previousEval ? ', avoid: ' + previousEval.slice(0, 60) : '') + ')…');
            const summaryTextNext = generateSummaryForJob((job.job_description || '').trim(), job.title, job.company, skillsReport, true, lastSummaryText, summaryRound, previousEval);
            if (!summaryTextNext) {
              logProgress('  Summary generation failed; will retry next iteration after reload.');
              continue;
            }
            // Open Content Editor by URL (reliable; tab click often fails when we're on Job Matcher)
            const currentUrl = page.url();
            const previewUrl = currentUrl.replace(/\/matching\/?(\?.*)?$/i, '/preview');
            if (previewUrl !== currentUrl) {
              logProgress('  Opening Content Editor via URL: ' + previewUrl);
              await page.goto(previewUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await sleep(4000);
            } else {
              const contentEditorVisible = (await contentEditorTab.count()) > 0 && (await contentEditorTab.isVisible().catch(() => false));
              if (!contentEditorVisible) {
                await sleep(2000);
                const retryVisible = (await contentEditorTab.count()) > 0 && (await contentEditorTab.isVisible().catch(() => false));
                if (!retryVisible) {
                  logProgress('  Content Editor tab not found; will retry next iteration.');
                  continue;
                }
              }
              await contentEditorTab.click();
              await sleep(3500);
            }
            // On /preview: click "Add Professional Summary" so the summary block is focused/created, then paste
            const addBtnIter = page.locator('button[aria-label="Add a Professional Summary"]').first();
            if ((await addBtnIter.count()) > 0 && (await addBtnIter.isVisible().catch(() => false))) {
              logProgress('  Content Editor (/preview): clicking Add a Professional Summary');
              await addBtnIter.scrollIntoViewIfNeeded().catch(() => {});
              await sleep(300);
              await addBtnIter.click();
              await sleep(2000);
            }
            const editorVisible = (await editorLocator.count()) > 0 && (await editorLocator.isVisible().catch(() => false));
            if (!editorVisible) {
              await sleep(3000);
              const editorRetry = (await editorLocator.count()) > 0 && (await editorLocator.isVisible().catch(() => false));
              if (!editorRetry) {
                logProgress('  Summary editor not found; will retry next iteration.');
                continue;
              }
            }
            logProgress('  Replacing Professional Summary with new text (paste by paragraphs)…');
            await pasteSummaryByParagraphs(page, editorLocator, summaryTextNext, logProgress);
            if ((await saveBtnLocator.count()) > 0 && (await saveBtnLocator.isVisible())) {
              await saveBtnLocator.click();
              logProgress('  Summary replaced and saved.');
              await sleep(2000);
            } else {
              logProgress('  Save button not found after paste.');
            }
            lastSummaryText = summaryTextNext;
          }
          if (lastSummaryText) jobProfessionalSummaryText = lastSummaryText;
        if (summaryExitReason) {
          logProgress('[Teal match-score] Summary loop ended — ' + summaryExitReason + ' | company ' + (job.company || '') + ' | title ' + (job.title || '') + ' | iterations ' + summaryIteration + '.');
        }
        }
        if (!(hasJdDigest && (score === null || score < MIN_SCORE))) {
          const skipReason = !hasJdDigest ? 'no/short JD' : ('score already ' + score + '% (target 80%+)');
          logProgress('[Teal match-score] Summary loop skipped — ' + skipReason + ' | company ' + (job.company || '') + ' | title ' + (job.title || '') + '.');
        }

        processed++;
        let pdfPath = null;
        let coverLetterPath = null;
        // Set Target Title once, right before export. Title = job title only, never include company.
        const titleOnly = stripCompanyFromTitle(job.title || '', job.company || '');
        const targetTitleToSet = normalizeJobTitleForTeal(titleOnly);
        logProgress('  Step: Setting Target Title to "' + (targetTitleToSet || '').slice(0, 60) + (targetTitleToSet && targetTitleToSet.length > 60 ? '…' : '') + '" (title only, no company) then Save, then export PDF.');
        await addTargetTitleToResume(page, targetTitleToSet, logProgress);
        // Save resume so selected Target Title persists; otherwise PDF exports without it.
        const mainSaveBtn = page.locator('button[aria-label="Save"]').first();
        if ((await mainSaveBtn.count()) > 0 && (await mainSaveBtn.isVisible().catch(() => false))) {
          await mainSaveBtn.click();
          logProgress('  Saved resume (Target Title persisted).');
          await sleep(2000);
        }
        const applied = await exportPdfAndSaveToApplied(page, context, job, finalScore, logProgress);
        if (applied) {
          pdfPath = applied.pdfPath || null;
          coverLetterPath = applied.coverLetterPath || null;
        }
        processedList.push({
          jobId: job.id,
          company: job.company,
          title: job.title,
          resumeFound: true,
          matchScore: finalScore,
          pdfPath,
          coverLetterPath,
          professionalSummaryText: jobProfessionalSummaryText || undefined
        });
        if (process.env.FULL_FLOW_STATE_FILE) {
          try {
            updateFlowProgress(process.env.FULL_FLOW_STATE_FILE, 8, { total: jobs.length, done: processed, nextIndex: i + 1 }, VAULT);
          } catch (_) {}
        }
      } catch (err) {
        const msg = err.message || String(err);
        logProgress('  Error: ' + msg);
        if (/Target page, context or browser has been closed/.test(msg)) {
          logProgress('[Teal match-score] Browser or tab was closed — stopping. Re-run with --from ' + (fromIndex + i + 1) + ' to continue.');
          browserClosed = true;
          break;
        }
      }

      if (browserClosed) break;

      // Back to list only when there is a next resume to process. This runs only after the job is fully done (including all summary iterations); it never interrupts the while loop above.
      if (!browserClosed && processed < jobs.length) {
        await logToBrowserConsole(page, 'Going back to resume list for next job.');
        await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(BETWEEN_RESUMES_MS);
      } else if (!browserClosed) {
        await logToBrowserConsole(page, '[Dex teal-match-score] Staying on current page (no transition to resume list).');
      }
    }

    writeStep8Evidence({
      digestPath: exportPath ? path.relative(VAULT, exportPath) : null,
      jobsFromDigest: total,
      processed: processedList,
      lowScoreCount
    });

    logProgress('[Teal match-score] Done. Processed: ' + processed + ', below ' + MIN_SCORE + '%: ' + lowScoreCount);
    logProgress('[Teal match-score] Log: ' + PROGRESS_LOG);
    logProgress('[Teal match-score] Done. Copy logs from above if needed.');
    await sleep(1500);
  } catch (e) {
    logProgress('[Teal match-score] Fatal: ' + e.message);
    process.exitCode = 1;
  }
  // If we launched Chrome ourselves (profile/fallback), close it so the script exits. CDP: leave tab open.
  if (typeof launchedByUs !== 'undefined' && launchedByUs && context) {
    try {
      await context.close();
    } catch (_) {}
    if (launchedProfileDir) {
      const { killChromeForProfile } = require('./teal-chrome-profile.cjs');
      killChromeForProfile(launchedProfileDir, logProgress);
    }
  }
}

main();
