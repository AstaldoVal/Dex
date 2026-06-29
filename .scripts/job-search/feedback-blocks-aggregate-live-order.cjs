'use strict';

/**
 * Canonical gate order for npm run job-search:test-feedback-blocks-gates-live (Live Aggregate).
 * Includes Target Title + Professional Summary + all other preview blocks.
 */
const { ALL_T_GATE_IDS } = require('./target-title-gates.cjs');
const { ALL_PS_GATE_IDS } = require('./professional-summary-ps-gates.cjs');
const { ALL_WE_GATE_IDS } = require('./work-experience-gates.cjs');

/** Same order as test-target-title-gates-live-teal.cjs */
const TARGET_TITLE_AGGREGATE_ORDER = [
  'T1',
  'T3',
  'T5',
  'T6',
  'T7',
  'T8',
  'T9',
  'T11',
  'T13',
  'T14',
  'T99',
  'T2',
  'T4',
  'T10',
  'T12'
];

/** Same order as test-professional-summary-gates-live-teal.cjs */
const PROFESSIONAL_SUMMARY_AGGREGATE_ORDER = [
  'PS12',
  'PS1',
  'PS14',
  'PS2',
  'PS3',
  'PS4',
  'PS5',
  'PS6',
  'PS7',
  'PS8',
  'PS9',
  'PS10',
  'PS11',
  'PS13',
  'PS15',
  'PS99',
  'REGEN-1',
  'REGEN-2',
  'REGEN-3',
  'REGEN-4'
];

const OTHER_BLOCKS_AGGREGATE_ORDER = [
  'CH1',
  'CH2',
  'CH99',
  'WE1',
  'WE2',
  'WE3',
  'WE4',
  'WE10',
  'WE17',
  'WE18',
  'WE19',
  'WE20',
  'WE99',
  'WE11',
  'WE12',
  'WE13',
  'WE14',
  'WE15',
  'WE16',
  'WE9',
  'WB1',
  'WB2',
  'WB3',
  'WB4',
  'WB5',
  'WB6',
  'WB7',
  'WB99',
  'SK1',
  'SK2',
  'SK3',
  'SK4',
  'SK5',
  'SK6',
  'SK7',
  'SK8',
  'SK9',
  'SK10',
  'SK11',
  'SK13',
  'SK14',
  'SK15',
  'LY1',
  'LY2',
  'LY3',
  'LY4',
  'LY5',
  'LY99',
  'BL1',
  'BL4',
  'PR1',
  'PR2',
  'PR3',
  'CT1',
  'CT3',
  'IN1',
  'IN3',
  'SK18',
  'WE5',
  'WE6',
  'WE7',
  'WE8',
  'SK12',
  'SK16',
  'SK17',
  'SK19',
  'SK20',
  'SK99',
  'BL2',
  'BL3',
  'BL99',
  'CT2',
  'CT99',
  'IN2',
  'IN99',
  'ED1',
  'ED2',
  'ED99',
  'MD1',
  'MD2',
  'MD3',
  'MD4',
  'MD5',
  'MD99',
  'PR99'
];

const ALL_FEEDBACK_BLOCKS_LIVE_GATE_ORDER = [
  ...TARGET_TITLE_AGGREGATE_ORDER,
  ...PROFESSIONAL_SUMMARY_AGGREGATE_ORDER,
  ...OTHER_BLOCKS_AGGREGATE_ORDER
];

const WE_AGGREGATE_ORDER = OTHER_BLOCKS_AGGREGATE_ORDER.filter((id) => /^WE\d+/.test(id));

function assertAggregateOrderComplete() {
  const missingT = ALL_T_GATE_IDS.filter((id) => !TARGET_TITLE_AGGREGATE_ORDER.includes(id));
  const missingPs = ALL_PS_GATE_IDS.filter((id) => !PROFESSIONAL_SUMMARY_AGGREGATE_ORDER.includes(id));
  const missingWe = ALL_WE_GATE_IDS.filter((id) => !WE_AGGREGATE_ORDER.includes(id));
  if (missingT.length) {
    throw new Error(`Aggregate live order missing Target Title gates: ${missingT.join(', ')}`);
  }
  if (missingPs.length) {
    throw new Error(`Aggregate live order missing PS gates: ${missingPs.join(', ')}`);
  }
  if (missingWe.length) {
    throw new Error(`Aggregate live order missing Work Experience gates: ${missingWe.join(', ')}`);
  }
}

assertAggregateOrderComplete();

const ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS = [...ALL_FEEDBACK_BLOCKS_LIVE_GATE_ORDER];

module.exports = {
  TARGET_TITLE_AGGREGATE_ORDER,
  PROFESSIONAL_SUMMARY_AGGREGATE_ORDER,
  OTHER_BLOCKS_AGGREGATE_ORDER,
  ALL_FEEDBACK_BLOCKS_LIVE_GATE_ORDER,
  ALL_FEEDBACK_BLOCKS_LIVE_GATE_IDS
};
