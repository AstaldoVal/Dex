#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { google } from 'googleapis';
import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as url from 'url';
import open from 'open';
import destroyer from 'server-destroy';

const REFRESH_ENV_KEY = 'GOOGLE_SLIDES_REFRESH_TOKEN';

function formatEnvLine(key: string, value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${key}: multiline values not supported`);
  }
  if (/[\s#'"]/.test(value) || value === '') {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${key}="${escaped}"`;
  }
  return `${key}=${value}`;
}

/** Upsert one key in Dex .env (same rules as scripts/lib/dex-env.mjs). */
function upsertDexEnvKey(envPath: string, key: string, value: string): void {
  let text = readFileSync(envPath, 'utf8');
  const line = formatEnvLine(key, value);
  const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*$`, 'm');
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    if (text.length > 0 && !text.endsWith('\n')) {
      text += '\n';
    }
    text += `${line}\n`;
  }
  writeFileSync(envPath, text, 'utf8');
}

function dexRepoRootFromScript(): string {
  return path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../../..');
}

function trySyncCursorMcp(repoRoot: string): void {
  const script = path.join(repoRoot, '.scripts/cursor-sync-mcp.py');
  if (!existsSync(script)) {
    console.warn('cursor-sync-mcp.py not found, skip MCP sync.');
    return;
  }
  try {
    execSync(`python3 "${script}"`, { cwd: repoRoot, stdio: 'inherit' });
  } catch {
    console.warn('cursor-sync-mcp.py failed — run from Dex root: python3 .scripts/cursor-sync-mcp.py');
  }
}

/** Dex repo root: .../google-slides-mcp/build → four levels up. */
function loadEnvFromDexRoot(): void {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '../../../..');
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}

loadEnvFromDexRoot();

// Dex .env uses GOOGLE_SLIDES_*; MCP README uses GOOGLE_CLIENT_* — accept both.
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_SLIDES_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_SLIDES_CLIENT_SECRET;

/** First port to try; if busy, tries +1 up to PORT_RANGE_END (inclusive). */
const PORT_START = Number.parseInt(process.env.GOOGLE_OAUTH_PORT ?? '3000', 10);
const PORT_RANGE_END = Number.parseInt(process.env.GOOGLE_OAUTH_PORT_END ?? '3100', 10);

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing OAuth client credentials. Set in Dex repo root .env:\n' +
      '  GOOGLE_SLIDES_CLIENT_ID and GOOGLE_SLIDES_CLIENT_SECRET\n' +
      'or export GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then run: npm run get-token'
  );
  process.exit(1);
}

// Set authentication scopes
const scopes = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

function findFreePort(start: number, end: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (p: number) => {
      if (p > end) {
        reject(new Error(`No free TCP port between ${start} and ${end}. Free a port or set GOOGLE_OAUTH_PORT / GOOGLE_OAUTH_PORT_END.`));
        return;
      }
      const probe = net.createServer();
      probe.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          tryPort(p + 1);
        } else {
          reject(err);
        }
      });
      probe.listen(p, () => {
        probe.close(() => resolve(p));
      });
    };
    tryPort(start);
  });
}

async function main() {
  const port = await findFreePort(PORT_START, PORT_RANGE_END);
  const redirectUri = `http://localhost:${port}/oauth2callback`;

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);

  // Generate authentication URL
  const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent' // Required to force refresh token acquisition
  });

  console.log(`\nLocal callback: ${redirectUri}`);
  if (port !== 3000) {
    console.log(
      'If Google shows "redirect_uri_mismatch", add exactly the "Local callback" URI above to your OAuth Web client (Authorized redirect URIs), then run again.\n'
    );
  }
  console.log('Authorization URL (open manually if the browser does not open):');
  console.log(authorizeUrl);
  console.log('');

  // Start local server
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        throw new Error('No URL in request');
      }

      // Get code from callback URL
      const queryParams = url.parse(req.url, true).query;
      const code = queryParams.code;

      if (code) {
        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code as string);

        // Return response
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Authentication Successful</title>
          </head>
          <body>
            <h1>Authentication Successful!</h1>
            <p>Please close this window and return to the terminal.</p>
          </body>
          </html>
        `);

        console.log('\n=== Refresh Token ===');
        console.log(tokens.refresh_token ?? '(none — see Google account / prompt=consent)');
        console.log('========================\n');

        const repoRoot = dexRepoRootFromScript();
        const envPath = path.join(repoRoot, '.env');
        if (tokens.refresh_token) {
          if (existsSync(envPath)) {
            upsertDexEnvKey(envPath, REFRESH_ENV_KEY, tokens.refresh_token);
            console.log(`Wrote ${REFRESH_ENV_KEY} to ${envPath}`);
            trySyncCursorMcp(repoRoot);
          } else {
            console.error(`No ${envPath} — create it and add:`);
            console.error(`${REFRESH_ENV_KEY}=<paste token above>`);
          }
        } else {
          console.warn(
            'No refresh_token in response. Revoke app access in Google Account → Security, then run get-token again with prompt=consent.'
          );
        }

        // Stop the server
        server.destroy();
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Error</title>
          </head>
          <body>
            <h1>Authentication code not found</h1>
          </body>
          </html>
        `);
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Error</title>
        </head>
        <body>
          <h1>An error occurred</h1>
          <p>${e}</p>
        </body>
        </html>
      `);
      console.error('Error:', e);
    }
  }).listen(port, () => {
    console.log(`Listening on http://localhost:${port} (waiting for OAuth redirect)...\n`);
    console.log('Opening authentication URL in browser...');
    open(authorizeUrl, { wait: false });
  });

  destroyer(server);
}

main().catch(console.error);
