import 'server-only';
import { lookup } from 'node:dns/promises';
import { normalizeHttpsUrl, privateIp } from '@/lib/mcp/url';

export { normalizeHttpsUrl, privateIp } from '@/lib/mcp/url';

async function assertPublicHost(hostname: string) {
  const { address } = await lookup(hostname);
  if (privateIp(address)) throw new Error('That address points to a private or internal network and cannot be used.');
}

export async function safeOutboundFetch(
  url: URL,
  timeoutMs: number,
  redirectsLeft: number,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<Response> {
  await assertPublicHost(url.hostname);
  const res = await fetch(url, {
    redirect: 'manual',
    method: init?.method ?? 'GET',
    body: init?.body,
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'Ikarvo-MCP/1.0 (+https://ikarvo.app)', ...init?.headers },
  });
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && redirectsLeft > 0) {
    const next = new URL(res.headers.get('location')!, url);
    if (next.protocol !== 'https:') throw new Error('Redirect to non-https URL blocked.');
    return safeOutboundFetch(next, timeoutMs, redirectsLeft - 1, init?.method && init.method !== 'GET' ? undefined : init);
  }
  return res;
}

/** Fetch wrapper for MCP SDK: only https, SSRF-checked, redirect-safe. */
export function mcpFetchFactory(timeoutMs = 20_000) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const u = normalizeHttpsUrl(href);
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init.headers as Record<string, string>;
      Object.assign(headers, h);
    }
    const body = typeof init?.body === 'string' ? init.body : init?.body ? await new Response(init.body).text() : undefined;
    return safeOutboundFetch(u, timeoutMs, 3, { method: init?.method, body, headers });
  };
}
