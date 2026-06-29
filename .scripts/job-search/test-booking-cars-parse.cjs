#!/usr/bin/env node
'use strict';

function moneyRegex() {
  return /(?:€|£|\$)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\b(?:EUR|USD|GBP|AUD|CAD|CHF|SEK|NOK|DKK|PLN)\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/gi;
}

function normalizeMoney(n) {
  if (typeof n !== 'string') return NaN;
  var t = n.trim().replace(/\s+/g, '');
  var hasComma = t.indexOf(',') !== -1;
  var hasDot = t.indexOf('.') !== -1;
  if (hasComma && hasDot) {
    var lastComma = t.lastIndexOf(',');
    var lastDot = t.lastIndexOf('.');
    var decimalSepIndex = Math.max(lastComma, lastDot);
    var decimalSep = decimalSepIndex === lastComma ? ',' : '.';
    var thousandsSep = decimalSep === ',' ? '.' : ',';
    t = t.split(thousandsSep).join('');
    t = t.replace(decimalSep, '.');
  } else if (hasComma && !hasDot) {
    if (/,\d{1,2}$/.test(t)) t = t.replace(',', '.');
    else t = t.split(',').join('');
  }
  return parseFloat(t);
}

function extractMoneyFromText(text) {
  text = String(text || '');
  var re = moneyRegex();
  var m = null;
  var out = [];
  while ((m = re.exec(text)) !== null) {
    var raw = m[0];
    var cur = null;
    if (raw.indexOf('€') !== -1) cur = 'EUR';
    else if (raw.indexOf('£') !== -1) cur = 'GBP';
    else if (raw.indexOf('$') !== -1) cur = 'USD';
    else {
      var codeM = raw.match(/\b(EUR|USD|GBP|AUD|CAD|CHF|SEK|NOK|DKK|PLN)\b/i);
      cur = codeM ? codeM[1].toUpperCase() : null;
    }
    var numM = raw.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/);
    var numRaw = numM ? numM[1] : null;
    var val = normalizeMoney(numRaw || '');
    if (!isNaN(val)) out.push({ raw: raw, currency: cur, value: val });
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

var samples = [
  { text: 'Volkswagen Up! or similar\n€5\nper day', expect: [{ value: 5, currency: 'EUR' }] },
  { text: 'Fiat 500\n€ 12.50\nView deal', expect: [{ value: 12.5, currency: 'EUR' }] },
  { text: 'Total €123.45', expect: [{ value: 123.45, currency: 'EUR' }] },
  { text: 'EUR 1,234.56 total', expect: [{ value: 1234.56, currency: 'EUR' }] },
  { text: 'from £89', expect: [{ value: 89, currency: 'GBP' }] }
];

for (var i = 0; i < samples.length; i++) {
  var s = samples[i];
  var got = extractMoneyFromText(s.text);
  assert(got.length === s.expect.length, s.text + ' — count ' + got.length + ' vs ' + s.expect.length);
  for (var j = 0; j < s.expect.length; j++) {
    assert(got[j].value === s.expect[j].value, s.text + ' — value ' + got[j].value + ' vs ' + s.expect[j].value);
    assert(got[j].currency === s.expect[j].currency, s.text + ' — currency');
  }
}

console.log('OK: booking-cars money parse (' + samples.length + ' cases)');

function parseAvailableCountFromPage(text) {
  var m = String(text || '').match(/(\d{1,4})\s+cars\s+available/i);
  return m ? parseInt(m[1], 10) : null;
}

function isNonVehicleChrome(text) {
  text = String(text || '');
  var lower = text.toLowerCase();
  if (/pick-up location|pick-up date|drop-off date|driver age|sort by|filter by|modify search/i.test(lower)) return true;
  if ((lower.match(/\b00:\d{2}\b/g) || []).length >= 6) return true;
  if (text.length > 1200 && lower.indexOf('view deal') === -1 && lower.indexOf('see deal') === -1) return true;
  return false;
}

function pickBestPositive(text) {
  var got = extractMoneyFromText(text).filter(function (m) { return m.value > 0; });
  return got.length ? got[0].value : null;
}

assert(parseAvailableCountFromPage('360 cars available at LIS') === 360, 'available count');
assert(isNonVehicleChrome('Pick-up location\nPick-up date\nMon 29 Jun\nTime\n20:00\n00:00\n00:30'), 'filter chrome');
assert(!isNonVehicleChrome('Volkswagen Up!\n€5\nper day\nView deal'), 'real card');
assert(pickBestPositive('Filter\n€ 0\nAlamo') == null, 'ignore zero price');
assert(pickBestPositive('Fiat 500\n€5\nView deal') === 5, 'positive price');

console.log('OK: booking-cars chrome heuristics (5 cases)');
