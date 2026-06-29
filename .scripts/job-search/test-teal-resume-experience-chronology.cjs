#!/usr/bin/env node
'use strict';
const assert = require('assert');
const {
  parseDateRange,
  chronologySortKey,
  buildChronologyReport,
  evaluateChronologyReport
} = require('./teal-resume-experience-chronology.cjs');

const pPresent = parseDateRange('01/2026 - Present');
assert.ok(pPresent && pPresent.isPresent && pPresent.startYm === 202601);

const pEnd = parseDateRange('09/2022 - 07/2024');
assert.ok(pEnd && pEnd.endYm === 202407 && pEnd.startYm === 202209);

const extract = {
  resumeId: 'test',
  companies: [
    {
      name: 'Roman & Mariia Consultoria LDA',
      included: true,
      companyDates: '',
      positions: [
        {
          title: 'AI Product Manager / AI Automation Consultant',
          dates: '01/2026 - Present',
          included: true,
          bullets: []
        }
      ]
    },
    {
      name: 'Glorium Technologies',
      included: true,
      companyDates: '',
      positions: [
        {
          title: 'Senior Product Manager',
          dates: '09/2022 - 07/2024',
          included: true,
          bullets: []
        },
        {
          title: 'Senior Product Manager',
          dates: '09/2022 - 04/2025',
          included: false,
          bullets: []
        }
      ]
    },
    {
      name: 'Route4Me',
      included: false,
      positions: [{ title: 'Lead Product Manager', dates: '01/2018 - 12/2019', included: false, bullets: [] }]
    }
  ]
};

const report = buildChronologyReport(extract, { minParseableDates: 2 });
assert.strictEqual(report.stats.withParseableDates, 4);
assert.ok(report.stats.meetsThreshold);
assert.strictEqual(report.sortedByEndDate[0].company, 'Roman & Mariia Consultoria LDA');
assert.ok(chronologySortKey({ dates: '01/2026 - Present' }) > chronologySortKey({ dates: '09/2022 - 07/2024' }));

const evalOk = evaluateChronologyReport(report);
assert.ok(evalOk.pass);

const evalFail = evaluateChronologyReport(
  buildChronologyReport({ companies: [{ name: 'X', positions: [{ title: 'PM', dates: '', bullets: [] }] }] })
);
assert.ok(!evalFail.pass);

console.log('test-teal-resume-experience-chronology: OK');
