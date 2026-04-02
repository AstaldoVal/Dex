#!/usr/bin/env node
/**
 * MCP Health Check
 * Spawns each stdio MCP server from ~/.cursor/mcp.json, sends initialize,
 * and reports which servers fail (crash/timeout). Skips URL-based (remote) servers.
 * Output: JSON to stdout { ok: bool, results: [{ name, ok, error? }] }
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MCP_CONFIG_PATH = process.env.MCP_CONFIG_PATH || path.join(process.env.HOME || '', '.cursor/mcp.json');
const TIMEOUT_MS = 8000;

function loadConfig() {
  const raw = fs.readFileSync(MCP_CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeMcpMessage(stdin, msg) {
  const str = JSON.stringify(msg) + '\n';
  stdin.write(str);
}

function readMcpMessage(stream) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      if (lines.length >= 1 && lines[0].trim()) {
        stream.removeListener('data', onData);
        stream.removeListener('error', onError);
        try {
          resolve(JSON.parse(lines[0]));
        } catch (e) {
          reject(new Error('Invalid JSON: ' + lines[0].slice(0, 200)));
        }
      }
    };
    const onError = reject;
    stream.on('data', onData);
    stream.on('error', onError);
  });
}

async function testServer(name, config) {
  if (config.disabled) return { name, ok: true, skipped: 'disabled' };
  if (config.url && !config.command) return { name, ok: true, skipped: 'remote' };

  const cmd = config.command;
  const args = config.args || [];
  const env = { ...process.env, ...(config.env || {}) };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (proc) proc.kill('SIGKILL');
      resolve({ name, ok: false, error: 'Timeout' });
    }, TIMEOUT_MS);

    let proc;
    let stderr = '';

    try {
      proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env,
      });
    } catch (e) {
      clearTimeout(timeout);
      return resolve({ name, ok: false, error: 'Spawn failed: ' + e.message });
    }

    proc.stderr?.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', (e) => {
      clearTimeout(timeout);
      resolve({ name, ok: false, error: 'Process error: ' + e.message });
    });
    proc.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        const excerpt = stderr.slice(-500).replace(/\n/g, ' ').slice(0, 200);
        resolve({ name, ok: false, error: `Exit ${code}: ${excerpt || signal || 'unknown'}` });
      }
    });

    const stdin = proc.stdin;
    const stdout = proc.stdout;

    if (!stdin || !stdout) {
      clearTimeout(timeout);
      proc.kill('SIGKILL');
      return resolve({ name, ok: false, error: 'Missing stdio' });
    }

    writeMcpMessage(stdin, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'mcp-health-check', version: '1.0' },
      },
    });

    readMcpMessage(stdout)
      .then((msg) => {
        clearTimeout(timeout);
        proc.kill('SIGKILL');
        if (msg.error) {
          resolve({ name, ok: false, error: msg.error.message || JSON.stringify(msg.error) });
        } else if (msg.result) {
          resolve({ name, ok: true });
        } else {
          resolve({ name, ok: false, error: 'No result in init response' });
        }
      })
      .catch((e) => {
        clearTimeout(timeout);
        proc.kill('SIGKILL');
        resolve({ name, ok: false, error: e.message || 'Init failed' });
      });
  });
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: 'Config load failed: ' + e.message }));
    process.exit(1);
  }

  const servers = config.mcpServers || {};
  const names = Object.keys(servers).filter((n) => !servers[n].disabled);

  const results = [];
  for (const name of names) {
    const r = await testServer(name, servers[name]);
    results.push(r);
  }

  const failed = results.filter((r) => r.ok === false);
  const output = { ok: failed.length === 0, results };
  console.log(JSON.stringify(output));
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
