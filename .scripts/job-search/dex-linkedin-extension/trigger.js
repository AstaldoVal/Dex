(function () {
  'use strict';
  var params = new URLSearchParams(window.location.search);
  var url = params.get('url') || params.get('redirect');
  var runId = (params.get('runId') || params.get('dexRunId') || '').trim();
  if (url) {
    chrome.storage.local.set({ dexAutoCaptureRequested: '1', dexInterestRunId: runId }, function () {
      window.location.href = url;
    });
  } else {
    document.body.innerHTML = '<p>Missing <code>url</code> parameter.</p>';
  }
})();
