/**
 * Единый модуль для работы со структурой резюме на странице Teal (resume preview):
 * — какие компании и позиции, какие буллеты в каждой позиции, какие чекбоксы включены/выключены.
 *
 * Использование:
 * - Скрипт открыл страницу resume preview → вызвать extractResumeExperienceFromPage(page)
 *   и получить актуальное состояние (опыт + буллеты + included).
 * - Нужно последнее сохранённое состояние без открытия страницы → loadResumeExperience(TEAL_DIR).
 * - После извлечения с страницы сохранить в файл → saveResumeExperience(TEAL_DIR, data, resumeId).
 *
 * Файл: 00-Inbox/Job_Search/teal/teal-resume-experience.json
 */

const fs = require('fs');
const path = require('path');

const EXPERIENCE_FILE = 'teal-resume-experience.json';

/**
 * Извлечь опыт и буллеты с состоянием чекбокса (включён/выключен) со страницы resume-preview.
 * @param {import('playwright').Page} page — страница уже открыта на resume preview
 * @returns {Promise<{ resumeId?: string, companies: Array<{ name: string, positions: Array<{ title: string, dates: string, bullets: Array<{ text: string, included: boolean|null }> }> }>, extractedAt: string }>}
 */
async function extractResumeExperienceFromPage(page) {
  const resumeIdFromUrl = (page.url().match(/\/resumes\/([a-f0-9-]{36})/i) || [])[1] || null;
  const result = await page.evaluate(() => {
    const out = { companies: [], extractedAt: new Date().toISOString() };
    const companyNodes = document.querySelectorAll('[data-testid="company"]');
    companyNodes.forEach((companyEl) => {
      const company = { name: '', positions: [] };
      const h3 = companyEl.querySelector('h3');
      if (h3) company.name = (h3.textContent || '').trim();
      const positionNodes = companyEl.querySelectorAll('[data-testid="Position"]');
      positionNodes.forEach((posEl) => {
        const position = { title: '', dates: '', bullets: [] };
        const posLabel = posEl.querySelector('[aria-label="Position"]');
        if (posLabel) position.title = (posLabel.textContent || '').trim();
        const dateEl = posEl.querySelector('[aria-label="Start Date / End Date"]');
        if (dateEl) position.dates = (dateEl.textContent || '').trim();
        const achievementNodes = posEl.querySelectorAll('[data-testid="Achievement"]');
        achievementNodes.forEach((achEl) => {
          const checkbox = achEl.querySelector('[role="checkbox"]');
          const checked = checkbox ? (checkbox.getAttribute('aria-checked') === 'true') : null;
          let text = '';
          const content = achEl.querySelector('[contenteditable="true"], [data-slate-editor], .achievement-content, [aria-label="Edit bullet"]');
          if (content) text = (content.textContent || '').trim();
          if (!text) {
            const all = achEl.textContent || '';
            const lines = all.split('\n').map((s) => s.trim()).filter(Boolean);
            if (lines.length > 0) text = lines[lines.length - 1];
          }
          position.bullets.push({ text: text.slice(0, 500), included: checked });
        });
        const checkboxes = posEl.querySelectorAll('[role="checkbox"]');
        if (position.bullets.length === 0 && checkboxes.length > 0) {
          checkboxes.forEach((cb) => {
            const row = cb.closest('li') || cb.parentElement;
            const raw = row ? (row.textContent || '').trim() : '';
            const text = raw.replace(/^\s*/, '').slice(0, 500);
            position.bullets.push({ text, included: cb.getAttribute('aria-checked') === 'true' });
          });
        }
        company.positions.push(position);
      });
      if (company.name || company.positions.length > 0) out.companies.push(company);
    });
    return out;
  });
  if (resumeIdFromUrl) result.resumeId = resumeIdFromUrl;
  return result;
}

/**
 * Сохранить структуру опыта в teal-resume-experience.json.
 * @param {string} tealDir — путь к 00-Inbox/Job_Search/teal
 * @param {object} data — объект из extractResumeExperienceFromPage (можно добавить resumeId)
 * @param {string} [resumeId] — если передан, допишется в data.resumeId
 */
function saveResumeExperience(tealDir, data, resumeId) {
  const obj = { ...data };
  if (resumeId) obj.resumeId = resumeId;
  const filePath = path.join(tealDir, EXPERIENCE_FILE);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  return filePath;
}

/**
 * Загрузить последнее сохранённое состояние из teal-resume-experience.json.
 * @param {string} tealDir — путь к 00-Inbox/Job_Search/teal
 * @param {{ resumeId?: string }} [options] — если resumeId указан, вернёт null при несовпадении с файлом
 * @returns {object|null} — { companies, resumeId?, extractedAt } или null
 */
function loadResumeExperience(tealDir, options = {}) {
  const filePath = path.join(tealDir, EXPERIENCE_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (options.resumeId && data.resumeId && data.resumeId !== options.resumeId) return null;
    return data;
  } catch (_) {
    return null;
  }
}

module.exports = {
  extractResumeExperienceFromPage,
  saveResumeExperience,
  loadResumeExperience,
  EXPERIENCE_FILE
};
