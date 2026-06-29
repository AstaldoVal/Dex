#!/usr/bin/env node
'use strict';

/** Kill Chrome processes for all Teal automation user-data-dirs (manual cleanup after stuck live tests). */
const { killAllTealChromeProfiles, cleanupAllTealProfileLocks } = require('./teal-chrome-profile.cjs');

const log = (m) => console.log(m);
killAllTealChromeProfiles(log);
const n = cleanupAllTealProfileLocks(log);
console.log(`Teal Chrome cleanup done (locks removed: ${n})`);
