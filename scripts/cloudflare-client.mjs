import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const accountId = 'b98c3fe4118854c1a58982da6dae38a4';
export async function cloudflare(route, { method = 'GET', body } = {}) {
  if (!route.startsWith(`/accounts/${accountId}/`)) throw new Error('Cloudflare account mismatch');
  const file = path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml');
  const config = await readFile(file, 'utf8');
  const token = config.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
  if (!token) throw new Error('Run the repository Wrangler login to authorize Cloudflare.');
  const response = await fetch('https://api.cloudflare.com/client/v4' + route, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare ${response.status}: ${JSON.stringify(data.errors)}`);
  return data.result;
}
