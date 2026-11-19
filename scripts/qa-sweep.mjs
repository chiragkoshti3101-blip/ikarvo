// Authenticated API sweep against a running deployment.
// Usage: SUPABASE_URL=... SUPABASE_KEY=... EMAIL=... PASSWORD=... node scripts/qa-sweep.mjs [baseUrl]
const BASE = process.argv[2] || 'https://ikarvo.vercel.app';
const { SUPABASE_URL, SUPABASE_KEY, EMAIL, PASSWORD } = process.env;

const routes = [
  '/api/account/delete', '/api/ad/adcopy', '/api/ad/avatar/test-id', '/api/ad/avatar', '/api/ad/captions',
  '/api/ad/higgsfield', '/api/ad/music', '/api/ad/proxy', '/api/ad/publish', '/api/ad/publish/status', '/api/ad/tts',
  '/api/billing/checkout', '/api/billing/portal', '/api/billing/webhook', '/api/cmo/chat', '/api/cmo/competitors',
  '/api/cmo/docs', '/api/creative', '/api/credits', '/api/cron/digest', '/api/cron/publish', '/api/extract',
  '/api/generate', '/api/github/callback', '/api/github/connect', '/api/github/disconnect', '/api/github/push',
  '/api/google/callback', '/api/google/connect', '/api/google/disconnect', '/api/google/report',
  '/api/growth/article', '/api/growth/audit', '/api/growth/backlinks', '/api/growth/brief', '/api/growth/community',
  '/api/growth/competitors', '/api/growth/crawl', '/api/growth/design', '/api/growth/headlines', '/api/growth/hn',
  '/api/growth/influencers', '/api/growth/launch', '/api/growth/outreach', '/api/growth/pagespeed',
  '/api/growth/reply', '/api/growth/report', '/api/growth/seo-pr', '/api/growth/sequence', '/api/growth/ugc',
  '/api/growth/visibility', '/api/growth/voice', '/api/integrations', '/api/marketing', '/api/mcp',
  '/api/media/test-id', '/api/media', '/api/media/upload-url', '/api/meta/account', '/api/meta/audiences',
  '/api/meta/callback', '/api/meta/campaigns/test-id', '/api/meta/campaigns', '/api/meta/connect',
  '/api/meta/disconnect', '/api/meta/estimate', '/api/meta/insights', '/api/meta/recommend', '/api/meta/search',
  '/api/meta/targeting', '/api/meta/videos', '/api/notify/status', '/api/notify/test', '/api/plans',
  '/api/publish/cms/test-id', '/api/publish/github', '/api/publish/social/test-id', '/api/publish/status',
  '/api/skills', '/api/status', '/api/team/invite', '/api/team', '/api/vercel/callback', '/api/vercel/connect',
  '/api/vercel/deploy', '/api/vercel/disconnect',
];

async function signIn() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`sign-in failed: ${r.status} ${await r.text()}`);
  const s = await r.json();
  const session = {
    access_token: s.access_token, token_type: 'bearer', expires_in: s.expires_in,
    expires_at: Math.floor(Date.now() / 1000) + s.expires_in,
    refresh_token: s.refresh_token, user: s.user,
  };
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
  return { name: `sb-${ref}-auth-token`, value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url') };
}

const cookie = await signIn();
const results = [];
for (const p of routes) {
  for (const method of ['GET', 'POST']) {
    const t0 = Date.now();
    try {
      const r = await fetch(BASE + p, {
        method, redirect: 'manual',
        headers: { cookie: `${cookie.name}=${cookie.value}`, 'content-type': 'application/json', origin: BASE },
        body: method === 'POST' ? '{}' : undefined,
        signal: AbortSignal.timeout(30000),
      });
      const text = (await r.text()).replace(/\s+/g, ' ').slice(0, 200);
      results.push({ route: p, method, status: r.status, ms: Date.now() - t0, body: text });
    } catch (e) {
      results.push({ route: p, method, status: 'ERR', ms: Date.now() - t0, body: String(e).slice(0, 160) });
    }
  }
}

const bad = results.filter(r => r.status === 500 || r.status === 'ERR' || (typeof r.status === 'number' && r.status >= 501 && r.status !== 503));
const ok = results.filter(r => r.status === 200);
console.log(`checked ${results.length} route/method pairs`);
console.log(`200 OK: ${ok.length}, 5xx/err: ${bad.length}`);
if (bad.length) { console.log('\n--- PROBLEMS ---'); for (const b of bad) console.log(`${b.route} ${b.method} -> ${b.status} :: ${b.body}`); }
console.log('\n--- 200s ---'); for (const o of ok) console.log(`${o.route} ${o.method} (${o.ms}ms) :: ${o.body.slice(0, 120)}`);
console.log('\n--- 503s (unconfigured, expected) ---');
for (const r of results.filter(r => r.status === 503)) console.log(`${r.route} ${r.method} :: ${r.body.slice(0, 110)}`);
