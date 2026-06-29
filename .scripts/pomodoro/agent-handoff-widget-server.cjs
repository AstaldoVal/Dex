#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { readBoard, addEntry, markDone } = require('./agent-handoff.cjs');

const PORT = Number(process.env.DEX_AGENT_HANDOFF_PORT) || 8767;
const WIDGET_HTML = path.join(__dirname, 'agent-handoff-widget.html');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  if (pathname === '/' || pathname === '/index.html') {
    if (!fs.existsSync(WIDGET_HTML)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Widget HTML not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(WIDGET_HTML, 'utf8'));
    return;
  }

  if (pathname === '/api/board' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(readBoard()));
    return;
  }

  if (pathname === '/api/add' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const entry = addEntry(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, entry }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  const doneMatch = pathname.match(/^\/api\/done\/([a-f0-9]+)$/);
  if (doneMatch && req.method === 'POST') {
    try {
      markDone(doneMatch[1]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + PORT;
  console.log('Agent handoff widget: ' + url);
  console.log('Держи окно поверх (Pin tab / отдельное окно браузера).');
  if (process.argv.includes('--open')) {
    const { exec } = require('child_process');
    exec('open ' + url, () => {});
  }
});
