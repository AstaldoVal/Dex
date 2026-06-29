'use strict';

const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(def, { find: true }, {
    async find(page) {
      return (
        (await page.locator('#job-search-input, #job-search-listbox').first().count()) > 0
      );
    }
  });
}

module.exports = { create };
