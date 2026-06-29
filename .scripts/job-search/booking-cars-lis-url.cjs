'use strict';

const LIS_AIRPORT = {
  iata: 'LIS',
  name: 'Lisbon Humberto Delgado Airport',
};

const LIS_PICKUP_HOUR = 20;
const LIS_DROPOFF_HOUR = 20;

function localTodayISO() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysToISODate(iso, offsetDays) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0, 0);
  dt.setDate(dt.getDate() + offsetDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getLisScanDatePairs() {
  const today = localTodayISO();
  const tomorrow = addDaysToISODate(today, 1);
  const dayAfter = addDaysToISODate(today, 2);
  return [
    { label: 'today-tomorrow', pickupISO: today, dropoffISO: tomorrow },
    { label: 'tomorrow-dayafter', pickupISO: tomorrow, dropoffISO: dayAfter },
  ];
}

function isoToBookingUrlParts(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return {
    year: m[1],
    month: String(parseInt(m[2], 10)),
    day: String(parseInt(m[3], 10)),
  };
}

function buildLisAirportSearchUrl(pair) {
  const pu = isoToBookingUrlParts(pair.pickupISO);
  const dO = isoToBookingUrlParts(pair.dropoffISO);
  if (!pu || !dO) return 'https://cars.booking.com/search-results';
  const locName = encodeURIComponent(LIS_AIRPORT.name);
  const q = [
    `locationIata=${LIS_AIRPORT.iata}`,
    `dropLocationIata=${LIS_AIRPORT.iata}`,
    `locationName=${locName}`,
    `dropLocationName=${locName}`,
    `puYear=${pu.year}`,
    `puMonth=${pu.month}`,
    `puDay=${pu.day}`,
    `puHour=${LIS_PICKUP_HOUR}`,
    'puMinute=0',
    `doYear=${dO.year}`,
    `doMonth=${dO.month}`,
    `doDay=${dO.day}`,
    `doHour=${LIS_DROPOFF_HOUR}`,
    'doMinute=0',
    'driversAge=30',
    'preflang=en',
  ];
  return `https://cars.booking.com/search-results?${q.join('&')}`;
}

/** First LIS scan URL — cars subdomain, not Stays home. */
function buildFirstLisScanOpenUrl() {
  const pairs = getLisScanDatePairs();
  return buildLisAirportSearchUrl(pairs[0]);
}

module.exports = {
  LIS_AIRPORT,
  getLisScanDatePairs,
  buildLisAirportSearchUrl,
  buildFirstLisScanOpenUrl,
};
