/**
 * Runs on the digest links page (localhost or file). Injects "Start auto-capture"
 * and on click saves the queue to storage and navigates to the first job URL.
 * If URL has dex-auto-capture=1, starts capture automatically and sets flag for auto-export to save server.
 */
(function () {
  const el = document.getElementById('dex-job-urls');
  if (!el || !el.textContent) return;

  let payload;
  try {
    payload = JSON.parse(el.textContent.trim());
  } catch (e) {
    return;
  }
  const urls = payload.urls || [];
  const digestName = payload.digestName || '';
  if (urls.length === 0) return;

  const container = document.getElementById('dex-capture-controls');
  if (!container) return;

  function startCapture() {
    const queue = {
      urls: urls.map(function (u) {
        return typeof u === 'string' ? { url: u, title: '' } : { url: u.url, title: u.title || '' };
      }),
      index: 0,
      digestName: digestName
    };
    const savePort = window.location.port || '8765';
    chrome.storage.local.set(
      { dexCaptureQueue: queue, dexOpenLinksAutoExport: true, dexSaveServerPort: savePort },
      function () {
        var first = urls[0];
        window.location.href = (first && first.url) ? first.url : first;
      }
    );
  }

  const autoStart = (window.location.search || '').indexOf('dex-auto-capture=1') !== -1 ||
    (window.location.hash || '').indexOf('dex-auto-capture=1') !== -1 ||
    sessionStorage.getItem('dexAutoCaptureRequested') === '1';

  if (autoStart) {
    container.innerHTML = '<span style="color:#0a66c2;">Dex: auto-starting capture in 2s…</span>';
    setTimeout(startCapture, 2000);
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'dex-start-btn';
  btn.type = 'button';
  btn.textContent = 'Start auto-capture (' + urls.length + ' jobs)';
  btn.addEventListener('click', function () {
    btn.disabled = true;
    btn.textContent = 'Starting…';
    const savePort = window.location.port || '8765';
    chrome.storage.local.set(
      {
        dexSaveServerPort: savePort,
        dexOpenLinksAutoExport: true,
        dexCaptureQueue: {
          urls: urls.map(function (u) {
            return typeof u === 'string' ? { url: u, title: '' } : { url: u.url, title: u.title || '' };
          }),
          index: 0,
          digestName: digestName
        }
      },
      function () {
        var first = urls[0];
        window.location.href = (first && first.url) ? first.url : first;
      }
    );
  });
  container.appendChild(btn);
})();
