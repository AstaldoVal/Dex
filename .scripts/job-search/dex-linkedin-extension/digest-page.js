/**
 * Runs on the digest links page (localhost or file). Injects "Start auto-capture"
 * and on click saves the queue to storage and navigates to the first job URL.
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

  const btn = document.createElement('button');
  btn.id = 'dex-start-btn';
  btn.type = 'button';
  btn.textContent = 'Start auto-capture (' + urls.length + ' jobs)';
  btn.addEventListener('click', function () {
    btn.disabled = true;
    btn.textContent = 'Starting…';
    chrome.storage.local.set(
      {
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
