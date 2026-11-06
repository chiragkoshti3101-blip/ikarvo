import { isIP } from 'node:net';

/** Blocks loopback, private, link-local and metadata ranges (SSRF guard). */
export function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    if (l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80')) return true;
    if (l.startsWith('::ffff:')) return privateIp(l.slice(7));
    return false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function normalizeHttpsUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (/^(stdio|command|file):/i.test(trimmed)) throw new Error('Only remote https MCP URLs are supported.');
  const u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (u.protocol !== 'https:') throw new Error('MCP server URL must use https.');
  if (u.username || u.password) throw new Error('Credentials in the URL are not allowed. Use the bearer token field.');
  return u;
}
