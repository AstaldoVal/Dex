#!/usr/bin/env node
/**
 * Dex LinkedIn Extension — Native Messaging Host
 *
 * Chrome launches this script when the extension calls chrome.runtime.sendNativeMessage().
 * Protocol: messages are framed with a 4-byte little-endian length prefix on both stdin and stdout.
 *
 * Accepts:  { action: "saveJson", filename: "...", data: "..." }
 * Returns:  { ok: true, path: "/abs/path/to/file" } or { ok: false, error: "..." }
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Target directory: 00-Inbox/Job_Search/data/ relative to this script
const VAULT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(VAULT, '00-Inbox', 'Job_Search', 'data');

// Ensure target directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Native Messaging I/O ──────────────────────────────────────────────────────

function readMessage(callback) {
  let headerBuf = Buffer.alloc(0);

  function onReadable() {
    // Read 4-byte header
    if (headerBuf.length < 4) {
      const chunk = process.stdin.read(4 - headerBuf.length);
      if (!chunk) return;
      headerBuf = Buffer.concat([headerBuf, chunk]);
      if (headerBuf.length < 4) return;
    }

    const msgLen = headerBuf.readUInt32LE(0);
    if (msgLen === 0) {
      callback(null);
      return;
    }

    const body = process.stdin.read(msgLen);
    if (!body) return; // wait for more data

    process.stdin.removeListener('readable', onReadable);

    try {
      callback(JSON.parse(body.toString('utf8')));
    } catch (e) {
      callback(null);
    }
  }

  process.stdin.on('readable', onReadable);
}

function sendMessage(obj) {
  const json = JSON.stringify(obj);
  const buf = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  process.stdout.write(header);
  process.stdout.write(buf);
}

// ── Handle message ────────────────────────────────────────────────────────────

readMessage(function (msg) {
  if (!msg) {
    sendMessage({ ok: false, error: 'No message received' });
    process.exit(0);
  }

  if (msg.action === 'saveJson') {
    try {
      // Sanitize filename
      const safe = (msg.filename || 'export.json').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(DATA_DIR, safe);

      fs.writeFileSync(filePath, msg.data, 'utf8');

      sendMessage({ ok: true, path: filePath });
    } catch (e) {
      sendMessage({ ok: false, error: e.message });
    }
  } else {
    sendMessage({ ok: false, error: 'Unknown action: ' + msg.action });
  }

  process.exit(0);
});
