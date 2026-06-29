'use strict';

/** @deprecated Import from resume-feedback-layout.cjs / teal-apply-layout.cjs */
module.exports = {
  ...require('./resume-feedback-layout.cjs'),
  applyDeferredLayoutFromFeedback: require('./teal-apply-layout.cjs').applyLayoutFromFeedback,
  loadDataPmCertAllowlist: () =>
    require('./teal-sync-certifications.cjs').loadDataPmAllowlist(),
  filterStillManualDeferredOther: (other) => other
};
