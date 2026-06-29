/**
 * Single source of truth for 00-Inbox/Job_Search paths.
 * Use from scripts: const { DIGESTS_DIR, DATA_DIR, JOBS_DIR } = require('./job-search-paths.cjs');
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const VAULT = process.env.VAULT_PATH || path.resolve(__dirname, '../..');
const JOB_SEARCH_ROOT = path.join(VAULT, '00-Inbox', 'Job_Search');

const DIGESTS_DIR = path.join(JOB_SEARCH_ROOT, 'digests');
const LINKEDIN_DIGESTS_DIR = path.join(DIGESTS_DIR, 'linkedin');
const DATA_DIR = path.join(JOB_SEARCH_ROOT, 'data');
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const COVER_LETTERS_DIR = path.join(JOB_SEARCH_ROOT, 'cover_letters');
const SUMMARIES_DIR = path.join(JOB_SEARCH_ROOT, 'summaries');
const TEAL_DIR = path.join(JOB_SEARCH_ROOT, 'teal');
/** Flow-scoped artifacts (evidence, resume-to-job, cowork-review). Set JOB_SEARCH_TEAL_FLOW_DIR for Full Flow v2. */
const TEAL_FLOW_DIR = process.env.JOB_SEARCH_TEAL_FLOW_DIR
  ? path.resolve(process.env.JOB_SEARCH_TEAL_FLOW_DIR)
  : TEAL_DIR;
const DEBUG_DIR = path.join(JOB_SEARCH_ROOT, 'debug');

const PROFILE_EXTENSION = path.join(JOB_SEARCH_ROOT, '.playwright-linkedin');
const PROFILE_APP = path.join(JOB_SEARCH_ROOT, '.playwright-teal-app');
/** Отдельный профиль Chrome для Teal-автоматизации, если основной занят (Chrome открыт). При первом запуске в нём нужно один раз войти в Teal. */
const TEAL_CHROME_PROFILE_ALT = path.join(TEAL_DIR, '.chrome-profile');

/** Профиль для почасового инкрементального флоу: не пересекается с полным флоу, можно запускать параллельно. */
const TEAL_CHROME_PROFILE_HOURLY = path.join(TEAL_DIR, '.chrome-profile-hourly');

/** Отдельные профили для параллельного запуска (избегают конфликта "profile in use" / "Something went wrong when opening your profile"). */
const TEAL_CHROME_PROFILE_MATCHSCORE = path.join(TEAL_DIR, '.chrome-profile-matchscore');
const TEAL_CHROME_PROFILE_RESUME = path.join(TEAL_DIR, '.chrome-profile-resume');
const TEAL_CHROME_PROFILE_BATCH = path.join(TEAL_DIR, '.chrome-profile-batch');
const TEAL_CHROME_PROFILE_COMPLETE = path.join(TEAL_DIR, '.chrome-profile-complete');

/** Профиль для автозапуска, когда все остальные заняты (Chrome открыт). Скрипты всегда пробуют его последним вместо требования закрыть Chrome. */
const TEAL_CHROME_PROFILE_FALLBACK = path.join(TEAL_DIR, '.chrome-profile-fallback');

/** Файл с последними обработанными job ID по URL (для инкрементального флоу). */
const LAST_PROCESSED_JOB_IDS_FILE = path.join(TEAL_DIR, 'last-processed-job-ids.json');

/** Папка для сохранения готовых пакетов отклика: CV.pdf + Cover Letter.docx (Applied/<Company>/<Vacancy>/). */
const APPLIED_BASE = process.env.APPLIED_BASE || path.join(os.homedir(), 'Documents', 'Applied');

function ensureDirs() {
  [DIGESTS_DIR, LINKEDIN_DIGESTS_DIR, DATA_DIR, JOBS_DIR, COVER_LETTERS_DIR, SUMMARIES_DIR, TEAL_DIR, DEBUG_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

module.exports = {
  VAULT,
  JOB_SEARCH_ROOT,
  DIGESTS_DIR,
  LINKEDIN_DIGESTS_DIR,
  DATA_DIR,
  JOBS_DIR,
  COVER_LETTERS_DIR,
  SUMMARIES_DIR,
  TEAL_DIR,
  TEAL_FLOW_DIR,
  DEBUG_DIR,
  PROFILE_EXTENSION,
  PROFILE_APP,
  TEAL_CHROME_PROFILE_ALT,
  TEAL_CHROME_PROFILE_HOURLY,
  TEAL_CHROME_PROFILE_MATCHSCORE,
  TEAL_CHROME_PROFILE_RESUME,
  TEAL_CHROME_PROFILE_BATCH,
  TEAL_CHROME_PROFILE_COMPLETE,
  TEAL_CHROME_PROFILE_FALLBACK,
  LAST_PROCESSED_JOB_IDS_FILE,
  APPLIED_BASE,
  ensureDirs
};
