'use strict';

/**
 * Единые лимиты времени для job-search (мс). Переопределение: env или .env.
 *
 * RESUME_PIPELINE_WAIT_MS — «человеческие» шаги: Cowork, apply в Teal (poll + spawn + global step 10).
 * Не означает, что задача должна занять столько — это потолок, после которого процесс убивается.
 */

const MIN = 60 * 1000;

function envMs(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Ожидание feedback / полный apply одного резюме (шаги 9–10, spawn, global step 10). Default 25 min. */
const RESUME_PIPELINE_WAIT_MS = envMs('RESUME_PIPELINE_WAIT_MS', 25 * MIN);

/** Alias для Cowork poll + spawn step 9 (то же значение). */
const COWORK_FEEDBACK_TIMEOUT_MS = envMs(
  'COWORK_FEEDBACK_TIMEOUT_MS',
  RESUME_PIPELINE_WAIT_MS
);

/** Spawn step 10 из full-flow — то же, без +2 min. */
const STEP10_SPAWN_TIMEOUT_MS = envMs('STEP10_SPAWN_TIMEOUT_MS', RESUME_PIPELINE_WAIT_MS);

/** Глобальный потолок одного запуска teal-apply-resume-feedback (ручной npm). */
const STEP10_GLOBAL_TIMEOUT_MS = envMs('STEP10_GLOBAL_TIMEOUT_MS', RESUME_PIPELINE_WAIT_MS);

/** CLI fallback после Cowork UI — не «быстрее», тот же потолок что и UI-путь. */
const COWORK_CLI_TIMEOUT_MS = envMs('COWORK_CLI_TIMEOUT_MS', RESUME_PIPELINE_WAIT_MS);

/** Нет новой строки в stdout → считаем зависание (watchdog). Default 90 s (fast kill + retry). */
const JOB_SEARCH_STALL_MS = envMs('JOB_SEARCH_STALL_MS', 90 * 1000);

/** In-process stage без лога (skills UI). Default 3 min. */
const TEAL_STAGE_STALL_MS = envMs('TEAL_STAGE_STALL_MS', 3 * MIN);

/** Одна вакансия: extension capture (шаг 1 single-job). */
const SINGLE_JOB_CAPTURE_TIMEOUT_MS = envMs('SINGLE_JOB_CAPTURE_TIMEOUT_MS', 2 * MIN);

const SINGLE_JOB_POLL_MS = envMs('SINGLE_JOB_POLL_MS', 3000);

module.exports = {
  MIN,
  RESUME_PIPELINE_WAIT_MS,
  COWORK_FEEDBACK_TIMEOUT_MS,
  STEP10_SPAWN_TIMEOUT_MS,
  STEP10_GLOBAL_TIMEOUT_MS,
  COWORK_CLI_TIMEOUT_MS,
  JOB_SEARCH_STALL_MS,
  TEAL_STAGE_STALL_MS,
  SINGLE_JOB_CAPTURE_TIMEOUT_MS,
  SINGLE_JOB_POLL_MS
};
