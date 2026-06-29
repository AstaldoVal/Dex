/**
 * Load CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from env or Credentials file.
 * Does not print secret values.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key] && val) process.env[key] = val;
  }
}

function loadCloudflareEnv() {
  parseEnvFile(path.join(root, '.env'));
  parseEnvFile(path.join(root, 'Credentials/applicator-staging/cloudflare-genufit.env'));
}

/** Set CLOUDFLARE_ACCOUNT_ID from API when token is present but account id is not. */
function ensureCloudflareAccountId() {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!process.env.CLOUDFLARE_API_TOKEN) return null;

  const zoneName = process.env.GENUFIT_CLOUDFLARE_ZONE || 'genufit.app';

  function cfGet(url) {
    return execSync(`curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "${url}"`, {
      encoding: 'utf8',
      env: process.env,
    });
  }

  // Zone-scoped tokens often cannot list accounts but can read zone → account.id
  try {
    const zoneRaw = cfGet(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}`
    );
    const zonePayload = JSON.parse(zoneRaw);
    const zone = zonePayload.result && zonePayload.result[0];
    if (zone && zone.account && zone.account.id) {
      process.env.CLOUDFLARE_ACCOUNT_ID = zone.account.id;
      console.log('→ Cloudflare account from zone', zoneName + ':', zone.account.id);
      return zone.account.id;
    }
  } catch (_zoneErr) {
    // fall through
  }

  let raw;
  try {
    raw = cfGet('https://api.cloudflare.com/client/v4/accounts');
  } catch (err) {
    console.error(
      'Could not resolve Cloudflare account id. Add CLOUDFLARE_ACCOUNT_ID to GitHub Secrets ' +
        '(Cloudflare dashboard → any zone → Overview → Account ID in the sidebar).'
    );
    throw err;
  }

  const payload = JSON.parse(raw);
  if (!payload.success || !Array.isArray(payload.result) || payload.result.length === 0) {
    throw new Error(
      'Cloudflare token cannot list accounts. Add CLOUDFLARE_ACCOUNT_ID to GitHub Secrets ' +
        '(same value as in Credentials/applicator-staging/cloudflare-genufit.env).'
    );
  }

  const accounts = payload.result;
  const preferred =
    accounts.find((a) => /genufit/i.test(a.name || '')) ||
    (accounts.length === 1 ? accounts[0] : null);

  if (!preferred) {
    const names = accounts.map((a) => `${a.name} (${a.id})`).join(', ');
    throw new Error(
      `Multiple Cloudflare accounts; set CLOUDFLARE_ACCOUNT_ID in secrets. Available: ${names}`
    );
  }

  process.env.CLOUDFLARE_ACCOUNT_ID = preferred.id;
  console.log('→ Cloudflare account:', preferred.name, preferred.id);
  return preferred.id;
}

module.exports = { loadCloudflareEnv, ensureCloudflareAccountId };
