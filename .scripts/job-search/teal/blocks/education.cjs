'use strict';

const { defineBlock } = require('./factory.cjs');

function create(def) {
  return defineBlock(
    def,
    { find: true, extract: true },
    {
      async find(page) {
        if ((await page.locator('#education').count()) > 0) return true;
        return (await page.getByRole('heading', { name: /education/i }).count()) > 0;
      },
      async extract(page) {
        const items = await page.evaluate(() => {
          const root = document.querySelector('#education');
          if (!root) return [];
          return [...root.querySelectorAll('[data-testid="Education"], .education-item, li')].map((el) =>
            (el.textContent || '').trim().slice(0, 200)
          );
        });
        return { blockId: def.id, items };
      },
      async apply(_page, _ctx) {
        return { ok: true, skipped: true, reason: 'education apply via ui-learn when needed' };
      }
    }
  );
}

module.exports = { create };
