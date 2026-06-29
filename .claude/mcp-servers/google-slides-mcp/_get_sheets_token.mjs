import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as http from 'http';
import * as url from 'url';
import open from 'open';
import destroyer from 'server-destroy';

const ROOT = '/Users/admin.roman.matsukatov/Development/DEX';
const ENV = ROOT + '/.env';
function v(k) {
  const t = readFileSync(ENV, 'utf8');
  const m = t.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}
function upsert(key, value) {
  let t = readFileSync(ENV, 'utf8');
  const line = key + '=' + value;
  const re = new RegExp('^' + key + '=.*$', 'm');
  if (re.test(t)) t = t.replace(re, line);
  else { if (t.length && !t.endsWith('\n')) t += '\n'; t += line + '\n'; }
  writeFileSync(ENV, t, 'utf8');
}

const CLIENT_ID = v('GOOGLE_SLIDES_CLIENT_ID');
const CLIENT_SECRET = v('GOOGLE_SLIDES_CLIENT_SECRET');
const scopes = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];
const port = 3000;
const redirectUri = `http://localhost:${port}/oauth2callback`;
const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
const authUrl = oauth2.generateAuthUrl({ access_type: 'offline', scope: scopes, prompt: 'consent' });
console.log('Authorization URL (open manually if needed):\n' + authUrl + '\n');

const server = http.createServer(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    if (!q.code) { res.writeHead(400); res.end('no code'); return; }
    const { tokens } = await oauth2.getToken(q.code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>OK. Можно закрыть вкладку и вернуться в Cursor.</h1>');
    if (tokens.refresh_token) {
      upsert('GOOGLE_SHEETS_REFRESH_TOKEN', tokens.refresh_token);
      console.log('=== Refresh Token (saved to .env as GOOGLE_SHEETS_REFRESH_TOKEN) ===');
      console.log('SHEETS_TOKEN_OK');
    } else {
      console.log('NO_REFRESH_TOKEN');
    }
    server.destroy();
  } catch (e) {
    res.writeHead(500); res.end(String(e));
    console.error('ERR', e?.message || e);
    server.destroy();
  }
}).listen(port, () => {
  console.log(`Listening on ${redirectUri} ...`);
  open(authUrl, { wait: false });
});
destroyer(server);
