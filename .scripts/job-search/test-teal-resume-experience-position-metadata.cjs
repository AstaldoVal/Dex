#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  evaluateCanonicalLocationValue,
  canonicalLocationTarget,
  evaluateExtractMetadataInclusion,
  readPositionMetadataFields
} = require('./teal-resume-experience-position-metadata.cjs');

assert.strictEqual(evaluateCanonicalLocationValue('Lisbon, Portugal').pass, true);
assert.strictEqual(evaluateCanonicalLocationValue('Lisboa, Portugal').pass, false);
assert.strictEqual(evaluateCanonicalLocationValue('Kyiv, Ukraine').pass, true);
assert.strictEqual(evaluateCanonicalLocationValue('Kiev, Ukraine').pass, false);
assert.strictEqual(evaluateCanonicalLocationValue('Remote').pass, true);
assert.strictEqual(canonicalLocationTarget('Lisboa'), 'Lisbon, Portugal');
assert.strictEqual(canonicalLocationTarget('Kiev, Ukraine'), 'Kyiv, Ukraine');
assert.strictEqual(canonicalLocationTarget('Lisbon, Portugal'), null);

const mockPos = {
  querySelector(sel) {
    if (sel === '[aria-label="Location"]') {
      return {
        querySelector: (s) =>
          s.includes('contenteditable')
            ? { innerText: 'Lisbon, Portugal', textContent: 'Lisbon, Portugal' }
            : null,
        innerText: 'Lisbon, Portugal',
        querySelectorAll: () => [
          { getAttribute: (a) => (a === 'aria-checked' ? 'true' : null), id: 'loc-cb' }
        ]
      };
    }
    if (sel === '[aria-label="Start Date / End Date"]') {
      return {
        querySelector: (s) =>
          s.includes('contenteditable')
            ? { innerText: '01/2024 - Present', textContent: '01/2024 - Present' }
            : null,
        innerText: '01/2024 - Present',
        querySelectorAll: () => [
          { getAttribute: (a) => (a === 'aria-checked' ? 'false' : null), id: 'date-cb' }
        ]
      };
    }
    return null;
  },
  querySelectorAll(sel) {
    if (sel === 'label.resume-label') {
      return [
        {
          textContent: 'Remote',
          closest: () => null,
          parentElement: {
            querySelectorAll: () => [
              { getAttribute: (a) => (a === 'aria-checked' ? 'false' : null), id: 'remote-cb' }
            ]
          }
        }
      ];
    }
    return [];
  },
  innerText: 'PM\nRemote\n01/2024 - Present',
  textContent: 'PM\nRemote\n01/2024 - Present'
};

const meta = readPositionMetadataFields(mockPos);
assert.strictEqual(meta.location.value, 'Lisbon, Portugal');
assert.strictEqual(meta.location.included, true);
assert.strictEqual(meta.dates.included, false);
assert.strictEqual(meta.remote.included, false);

console.log('OK: teal-resume-experience-position-metadata');
