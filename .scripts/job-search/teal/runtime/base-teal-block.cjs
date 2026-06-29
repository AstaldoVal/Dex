'use strict';

const { dismissOverlays, waitStable, selectorVersion } = require('./page-prelude.cjs');

/**
 * @typedef {object} TealBlockCapabilities
 * @property {boolean} find
 * @property {boolean} ensureVisible
 * @property {boolean} expand
 * @property {boolean} extract
 * @property {boolean} apply
 * @property {boolean} verify
 * @property {boolean} [reorderCategory]
 * @property {boolean} [reorderChip]
 * @property {boolean} [domFallback]
 */

/**
 * Base class for Teal resume blocks. Subclasses implement block-specific selectors.
 */
class BaseTealBlock {
  /**
   * @param {object} def — entry from teal-block-registry.yaml (parsed)
   */
  constructor(def) {
    this.id = def.id;
    this.surface = def.surface;
    this.anchors = def.anchors || [];
    this.verifySurface = def.verifySurface || ['page'];
    this.removeMode = def.removeMode || null;
    this.legacyModule = def.legacyModule || null;
    this._migration = def.migration || 'planned';
  }

  /** @returns {TealBlockCapabilities} */
  capabilities() {
    return {
      find: false,
      ensureVisible: false,
      expand: false,
      extract: false,
      apply: false,
      verify: false
    };
  }

  selectorVersion() {
    return selectorVersion(this.anchors);
  }

  async prelude(page, opts = {}) {
    await dismissOverlays(page);
    if (opts.waitAfter) await waitStable(page, opts.waitAfter);
  }

  /** Override: block present on page */
  async find(page) {
    return false;
  }

  async ensureVisible(page) {
    return this.find(page);
  }

  async expand(page) {
    return true;
  }

  async extract(page) {
    return { blockId: this.id, empty: true };
  }

  async apply(page, _intent) {
    return { ok: false, reason: 'not implemented' };
  }

  async verify(page, _expected) {
    return { ok: false, failures: ['verify not implemented'] };
  }

  async verifyPdf(_pdfPath, _expected) {
    if (!this.verifySurface.includes('pdf')) {
      return { ok: true, skipped: true };
    }
    return { ok: false, failures: ['verifyPdf not implemented'] };
  }
}

module.exports = { BaseTealBlock };
