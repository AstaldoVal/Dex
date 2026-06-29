#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  resolveTealRoleLocation,
  resolveTealEmploymentType
} = require('./teal-applicator-work-experience-map.cjs');

const consultoriaMd = {
  location: { value: '', included: true },
  remote: { value: 'Remote', included: true },
  contractor: { value: 'Contractor', included: true }
};

assert.deepStrictEqual(resolveTealRoleLocation(consultoriaMd), {
  location: 'Remote',
  locationIncluded: true
});

assert.deepStrictEqual(resolveTealEmploymentType(consultoriaMd), {
  employmentType: 'Contractor',
  employmentTypeIncluded: true
});

assert.deepStrictEqual(
  resolveTealRoleLocation({
    location: { value: 'Lisbon, Portugal', included: true },
    remote: { value: 'Remote', included: true }
  }),
  { location: 'Lisbon, Portugal', locationIncluded: true }
);

// Empty metadata objects (collapsed position in editor) must NOT force Remote/Contractor.
const emptyMd = {
  location: { value: '', included: true },
  dates: { value: '12/2024 - 12/2025', included: true },
  remote: { value: '', included: null },
  contractor: { value: '', included: null }
};

assert.deepStrictEqual(resolveTealRoleLocation(emptyMd), {
  location: '',
  locationIncluded: true
});

assert.deepStrictEqual(resolveTealEmploymentType(emptyMd), {
  employmentType: '',
  employmentTypeIncluded: false
});

// Employment type field (e.g. Full-time) wins over contractor row.
assert.deepStrictEqual(
  resolveTealEmploymentType({
    employmentType: { value: 'Full-time', included: null },
    contractor: { value: 'Contractor', included: true }
  }),
  { employmentType: 'Full-time', employmentTypeIncluded: true }
);

console.log('OK: teal-applicator-work-experience-map');
