#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  bulletsAreNearDuplicate,
  dedupeNearDuplicateEnabledBullets
} = require('./work-experience-bullet-dedupe.cjs');

const gloriumA =
  'Increased team efficiency by 50% within 6 months through implementation of SCRUM principles and process optimizations.';
const gloriumB =
  'Increased team efficiency by 50% within 6 months by rolling out SCRUM principles and standardizing ceremonies, intake, and release cadence across multiple parallel projects.';

assert(bulletsAreNearDuplicate(gloriumA, gloriumB), 'Glorium SCRUM bullets should be near-duplicates');

const alphaA =
  'Managed product lifecycle and roadmap for an AI-powered SaaS solution, launching and scaling new product from scratch, overseeing the implementation of API integrations, user prompt management, and AI-driven automation tools.';
const alphaB =
  'Managed product lifecycle and roadmap for an AI-powered SaaS solution, launching and scaling a new product from scratch, overseeing API integrations, user prompt management, and AI-driven automation tools.';

assert(bulletsAreNearDuplicate(alphaA, alphaB), 'AlphaPrompt lifecycle bullets should be near-duplicates');

const inxyA =
  'Set up the product operating system (discovery, customer development, growth experimentation, weekly review), cutting churn and shortening time from insight to shipped change.';
const inxyB =
  'Set up the product operating system (discovery, customer development, growth experimentation, weekly review), cutting churn and shortening the loop from insight to shipped change.';

assert(bulletsAreNearDuplicate(inxyA, inxyB), 'INXY product OS bullets should be near-duplicates');

const extract = {
  companies: [
    {
      name: 'Glorium Technologies',
      positions: [
        {
          title: 'Senior Product Manager/Product Owner',
          included: true,
          bullets: [
            { text: gloriumA, included: true },
            { text: gloriumB, included: true }
          ]
        }
      ]
    }
  ]
};

const disabled = dedupeNearDuplicateEnabledBullets(extract);
assert.strictEqual(disabled, 1, 'should disable one Glorium duplicate');
const on = extract.companies[0].positions[0].bullets.filter((b) => b.included === true);
assert.strictEqual(on.length, 1, 'one Glorium bullet should remain ON');

console.log('test-work-experience-bullet-dedupe: ok');
