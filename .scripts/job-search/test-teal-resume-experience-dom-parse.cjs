#!/usr/bin/env node
'use strict';
const assert = require('assert');
const {
  readCompanyDisplayName,
  readCompanyDescription,
  readPositionTitle,
  readPositionDates,
  readPositionIncluded,
  getPositionHeaderCheckbox,
  trimGluedCompanyLine,
  DATE_LINE_RE
} = require('./teal-resume-experience-dom-parse.cjs');

function mockPosition(innerText) {
  return {
    querySelector(sel) {
      if (sel === '[aria-label="Position"]') {
        return { innerText: '', textContent: '', children: [], querySelectorAll: () => [] };
      }
      if (sel === '[aria-label="Start Date / End Date"]') {
        return { innerText: '', textContent: '', querySelectorAll: () => [] };
      }
      if (sel === '[data-testid="Achievement"]') {
        const lines = innerText.split('\n');
        const bulletLine = lines.find((l) => l.startsWith('Delivered'));
        if (!bulletLine) return null;
        return { innerText: bulletLine, textContent: bulletLine };
      }
      return null;
    },
    querySelectorAll(sel) {
      if (sel.includes('Achievement')) return [];
      if (sel.includes('contenteditable')) return [];
      if (sel.includes('role="checkbox"')) return [];
      return [];
    },
    innerText,
    textContent: innerText
  };
}

function mockCompanyWithSeparateDescription() {
  return {
    querySelector(sel) {
      if (sel === '[aria-label="Company Name"]') {
        return {
          innerText: 'Roman & Mariia Consultoria LDA',
          textContent: 'Roman & Mariia Consultoria LDA',
          querySelector: (s) =>
            s.includes('contenteditable')
              ? { innerText: 'Roman & Mariia Consultoria LDA', textContent: 'Roman & Mariia Consultoria LDA' }
              : null
        };
      }
      if (sel === '[aria-label="Company Description"]') {
        return {
          innerText: 'Operates as Freelance as AI automation contractor.',
          textContent: 'Operates as Freelance as AI automation contractor.',
          querySelector: (s) =>
            s.includes('contenteditable')
              ? {
                  innerText: 'Operates as Freelance as AI automation contractor.',
                  textContent: 'Operates as Freelance as AI automation contractor.'
                }
              : { getAttribute: () => 'true', getAttribute: () => 'true' },
          parentElement: {
            querySelector: () => ({ getAttribute: () => 'true' })
          }
        };
      }
      if (sel === 'h3') {
        return {
          innerText: 'Roman & Mariia Consultoria LDAOperates as Freelance',
          querySelector: () => null,
          childNodes: []
        };
      }
      return null;
    },
    querySelectorAll: () => []
  };
}

const romanHeader = `AI Product Manager / AI Automation Consultant
Contractor
01/2026 - Present
Delivered end-to-end AI prototypes using LangChain`;

const pos = mockPosition(romanHeader);
assert.strictEqual(readPositionTitle(pos), 'AI Product Manager / AI Automation Consultant');
assert.strictEqual(readPositionDates(pos), '01/2026 - Present');
assert.ok(DATE_LINE_RE.test('01/2026 - Present'));

const co = mockCompanyWithSeparateDescription();
assert.strictEqual(readCompanyDisplayName(co), 'Roman & Mariia Consultoria LDA');
const desc = readCompanyDescription(co);
assert.ok(desc.text.includes('Operates as Freelance'));
assert.notStrictEqual(readCompanyDisplayName(co), desc.text);

assert.strictEqual(
  trimGluedCompanyLine(
    'Roman & Mariia Consultoria LDAOperates as Freelance as AI automation contractor.'
  ),
  'Roman & Mariia Consultoria LDA'
);

const checkbox = { getAttribute: (a) => (a === 'aria-checked' ? 'true' : '') };
const posWithCb = mockPosition('Lead PM\n01/2020 - 01/2022\nDid things');
const origQ = posWithCb.querySelector.bind(posWithCb);
posWithCb.querySelector = (sel) => {
  if (sel === '[aria-label="Position"]') {
    return {
      closest: () => ({ querySelectorAll: () => [checkbox] }),
      parentElement: { querySelectorAll: () => [checkbox] }
    };
  }
  return origQ(sel);
};
posWithCb.querySelectorAll = (sel) => (sel.includes('checkbox') ? [checkbox] : []);
assert.strictEqual(readPositionIncluded(posWithCb), true);
assert.ok(getPositionHeaderCheckbox(posWithCb));

console.log('test-teal-resume-experience-dom-parse: OK');
