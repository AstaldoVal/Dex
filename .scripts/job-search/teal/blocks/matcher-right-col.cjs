'use strict';

const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(def, { find: true, extract: true }, {
    async find(page) {
      return (await page.locator('#right-col, [data-testid="job-matcher-content"]').first().count()) > 0;
    }
  });
}

module.exports = { create };
