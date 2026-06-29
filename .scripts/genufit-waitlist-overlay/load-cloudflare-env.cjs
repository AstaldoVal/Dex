/**
 * Load CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from env or Credentials file.
 * Does not print secret values.
 */
const fs = require('fs');
const path = require('path');

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

module.exports = { loadCloudflareEnv };
