#!/usr/bin/env python3
"""Serve interactive Brain Protocol checklist on localhost for Slidepad."""
from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from brain_checklist_lib import (  # noqa: E402
    build_today_items,
    load_brain_cfg,
    repo_root,
    set_item_done,
    slidepad_cfg,
    write_slidepad_urls,
)

ROOT = repo_root()


def _html_page() -> str:
    return """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Brain · сегодня</title>
<style>
  :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; }
  body { margin: 0; padding: 12px 14px 24px; max-width: 420px; background: #0f1115; color: #e8eaed; }
  h1 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #9aa0a6; margin-bottom: 14px; }
  .progress { height: 4px; background: #2d3139; border-radius: 2px; margin-bottom: 16px; overflow: hidden; }
  .progress > i { display: block; height: 100%; background: #34a853; width: 0%; transition: width .2s; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-bottom: 1px solid #2d3139; }
  li.done .title { color: #9aa0a6; text-decoration: line-through; }
  input[type=checkbox] { width: 20px; height: 20px; margin-top: 2px; accent-color: #34a853; flex-shrink: 0; cursor: pointer; }
  .time { font-size: 12px; color: #8ab4f8; min-width: 44px; font-variant-numeric: tabular-nums; }
  .title { font-size: 14px; line-height: 1.35; }
  .err { color: #f28b82; font-size: 12px; }
</style>
</head>
<body>
  <h1>Brain Protocol</h1>
  <div class="meta" id="meta">Загрузка…</div>
  <div class="progress"><i id="bar"></i></div>
  <ul id="list"></ul>
  <p class="err" id="err" hidden></p>
<script>
async function load() {
  try {
    const r = await fetch('/api/today');
    const d = await r.json();
    document.getElementById('meta').textContent =
      d.date + ' · ' + d.done + '/' + d.total + ' · Europe/Lisbon';
    document.getElementById('bar').style.width =
      (d.total ? (100 * d.done / d.total) : 0) + '%';
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    for (const it of d.items) {
      const li = document.createElement('li');
      if (it.done) li.className = 'done';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!it.done;
      cb.addEventListener('change', () => toggle(it.id, cb.checked, li));
      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = it.start || '';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = it.title;
      li.append(cb, time, title);
      ul.appendChild(li);
    }
    document.getElementById('err').hidden = true;
  } catch (e) {
    const el = document.getElementById('err');
    el.textContent = String(e);
    el.hidden = false;
  }
}
async function toggle(id, done, li) {
  try {
    await fetch('/api/toggle', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id, done})
    });
    li.classList.toggle('done', done);
    await load();
  } catch (e) {
    document.getElementById('err').textContent = String(e);
    document.getElementById('err').hidden = false;
  }
}
load();
setInterval(load, 60000);
</script>
</body>
</html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        return

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path in ("/", "/index.html"):
            body = _html_page().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/today":
            self._json(200, build_today_items(ROOT))
            return
        self.send_error(404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/toggle":
            data = self._read_json()
            eid = str(data.get("id") or "")
            done = bool(data.get("done"))
            if not eid:
                self._json(400, {"error": "missing id"})
                return
            self._json(200, set_item_done(ROOT, eid, done))
            return
        self.send_error(404)


def main() -> int:
    write_slidepad_urls(ROOT)
    cfg = slidepad_cfg(load_brain_cfg(ROOT))
    port = int(cfg.get("checklist_port") or 18765)
    host = str(cfg.get("checklist_host") or "127.0.0.1")
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"Brain checklist: http://{host}:{port}/")
    print(f"Slidepad URL file: System/state/brain-slidepad-checklist-url.txt")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
