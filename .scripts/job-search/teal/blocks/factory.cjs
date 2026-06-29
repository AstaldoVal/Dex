'use strict';

const { BaseTealBlock } = require('../runtime/base-teal-block.cjs');

/**
 * @param {object} def — registry block entry
 * @param {Partial<TealBlockCapabilities>} defaultCaps
 * @param {object} impl — { find, ensureVisible, expand, extract, apply, verify, verifyPdf, capabilities }
 */
function defineBlock(def, defaultCaps, impl = {}) {
  class Block extends BaseTealBlock {
    constructor() {
      super(def);
    }

    capabilities() {
      return {
        find: false,
        ensureVisible: false,
        expand: false,
        extract: false,
        apply: false,
        verify: false,
        ...defaultCaps,
        ...(impl.capabilities ? impl.capabilities() : {})
      };
    }

    async find(page) {
      if (impl.find) return impl.find.call(this, page);
      for (const anchor of this.anchors) {
        if (!anchor) continue;
        if (anchor.startsWith('#')) {
          if ((await page.locator(anchor).first().count()) > 0) return true;
        } else if (anchor.includes('data-testid') || anchor.startsWith('[')) {
          if ((await page.locator(anchor).first().count()) > 0) return true;
        } else if (anchor.startsWith('button')) {
          if ((await page.locator(anchor).first().count()) > 0) return true;
        }
      }
      return false;
    }

    async ensureVisible(page) {
      if (impl.ensureVisible) return impl.ensureVisible.call(this, page);
      for (const anchor of this.anchors) {
        if (anchor && anchor.startsWith('#')) {
          await page.locator(anchor).first().scrollIntoViewIfNeeded().catch(() => {});
        }
      }
      return this.find(page);
    }

    async expand(page) {
      if (impl.expand) return impl.expand.call(this, page);
      return true;
    }

    async extract(page) {
      if (impl.extract) return impl.extract.call(this, page);
      return { blockId: this.id, empty: true };
    }

    async apply(page, ctx) {
      if (impl.apply) return impl.apply.call(this, page, ctx);
      return { ok: false, reason: 'not implemented' };
    }

    async verify(page, expected) {
      if (impl.verify) return impl.verify.call(this, page, expected);
      return { ok: true, skipped: true };
    }

    async verifyPdf(pdfPath, expected) {
      if (impl.verifyPdf) return impl.verifyPdf.call(this, pdfPath, expected);
      if (!this.verifySurface.includes('pdf')) return { ok: true, skipped: true };
      return { ok: true, skipped: true };
    }

    async heal(page, ctx) {
      if (impl.heal) return impl.heal.call(this, page, ctx);
      return { ok: false, reason: 'no heal' };
    }
  }
  return new Block();
}

module.exports = { defineBlock };
