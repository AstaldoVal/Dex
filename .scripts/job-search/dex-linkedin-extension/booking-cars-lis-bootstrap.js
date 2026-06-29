/**
 * Bootstrap: if Booking opened on Stays (www.booking.com) with dex-booking-lis-scan=1,
 * redirect immediately to cars.booking.com LIS search URL.
 */
(function () {
  'use strict';

  function hasLisScanParam() {
    try {
      var sp = new URLSearchParams(window.location.search || '');
      var hp = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
      return sp.get('dex-booking-lis-scan') === '1' || hp.get('dex-booking-lis-scan') === '1';
    } catch (e) {
      return false;
    }
  }

  function isCarsHost() {
    try {
      return String(window.location.hostname || '').toLowerCase() === 'cars.booking.com';
    } catch (e) {
      return false;
    }
  }

  function localTodayISO() {
    var now = new Date();
    return (
      now.getFullYear() +
      '-' +
      String(now.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(now.getDate()).padStart(2, '0')
    );
  }

  function addDays(iso, n) {
    var m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    var dt = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0, 0);
    dt.setDate(dt.getDate() + n);
    return (
      dt.getFullYear() +
      '-' +
      String(dt.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(dt.getDate()).padStart(2, '0')
    );
  }

  function buildFirstLisUrl() {
    var pickup = localTodayISO();
    var dropoff = addDays(pickup, 1);
    function parts(iso) {
      var mm = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return { y: mm[1], mo: String(parseInt(mm[2], 10)), d: String(parseInt(mm[3], 10)) };
    }
    var pu = parts(pickup);
    var dO = parts(dropoff);
    var loc = encodeURIComponent('Lisbon Humberto Delgado Airport');
    return (
      'https://cars.booking.com/search-results?' +
      'locationIata=LIS&dropLocationIata=LIS&locationName=' +
      loc +
      '&dropLocationName=' +
      loc +
      '&puYear=' +
      pu.y +
      '&puMonth=' +
      pu.mo +
      '&puDay=' +
      pu.d +
      '&puHour=20&puMinute=0&doYear=' +
      dO.y +
      '&doMonth=' +
      dO.mo +
      '&doDay=' +
      dO.d +
      '&doHour=20&doMinute=0&driversAge=30&preflang=en&dex-booking-lis-scan=1'
    );
  }

  if (!hasLisScanParam() || isCarsHost()) return;
  try {
    window.location.replace(buildFirstLisUrl());
  } catch (e) {}
})();
