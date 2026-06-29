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
const net = require('net');
const { spawn } = require('child_process');

// Target directory: 00-Inbox/Job_Search/data/ relative to this script
const VAULT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(VAULT, '00-Inbox', 'Job_Search', 'data');
const CHAT_REPLY_SERVER_ENTRY = path.join(VAULT, '.scripts', 'chat-reply', 'chat-reply-server.cjs');

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

function isPortOpen(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch (e) {}
      resolve(!!ok);
    }
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function waitPortOpen(host, port, maxMs) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await isPortOpen(host, port, 350);
    if (ok) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 180));
  }
  return false;
}

// ── Handle message ────────────────────────────────────────────────────────────

readMessage(async function (msg) {
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
  } else if (msg.action === 'ensureChatReplyServer') {
    try {
      const host = '127.0.0.1';
      let port = parseInt(msg.port, 10);
      if (!port || port < 1 || port > 65535) port = 8777;
      const alreadyOpen = await isPortOpen(host, port, 350);
      if (alreadyOpen) {
        sendMessage({ ok: true, alreadyRunning: true, port });
        process.exit(0);
        return;
      }
      if (!fs.existsSync(CHAT_REPLY_SERVER_ENTRY)) {
        sendMessage({ ok: false, error: 'chat-reply-server entry not found: ' + CHAT_REPLY_SERVER_ENTRY });
        process.exit(0);
        return;
      }
      const env = Object.assign({}, process.env, {
        CHAT_REPLY_PORT: String(port)
      });
      const child = spawn(process.execPath, [CHAT_REPLY_SERVER_ENTRY], {
        cwd: VAULT,
        detached: true,
        stdio: 'ignore',
        env
      });
      child.unref();
      const up = await waitPortOpen(host, port, 5000);
      if (!up) {
        sendMessage({
          ok: false,
          started: true,
          error: 'chat-reply-server did not open port in time',
          port
        });
        process.exit(0);
        return;
      }
      sendMessage({ ok: true, started: true, port });
    } catch (e) {
      sendMessage({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  } else {
    sendMessage({ ok: false, error: 'Unknown action: ' + msg.action });
  }

  process.exit(0);
});
