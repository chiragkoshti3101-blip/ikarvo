'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Icon from './Icon';
import { useWs, ErrorNote } from './ws';
import { api } from '@/lib/client/api';
import MetaConnect from './meta/MetaConnect';
import McpIntegrations from './McpIntegrations';

type F = { ok: boolean; label: string; missing: string[]; note?: string };
type M = { label: string; missing: string[] };
type S = { preview: boolean; features: Record<string, F>; warn: Record<string, string>;
  connections: { github: { configured: boolean; connected: boolean; login: string | null }; vercel: { configured: boolean; connected: boolean; source: string | null }; google: { configured: boolean; connected: boolean; youtube: boolean; error?: string } };
  publishers: { social: Record<string, M & { ok: boolean }>; cms: Record<string, M & { ok: boolean }> }; notify: Record<string, M>; video: Record<string, M>; avatar: Record<string, M>; tts: Record<string, M>; pagespeed: { keyed: boolean } };
type Row = { name: string; what: string; missing: string[]; connected?: boolean | null; state?: string; warn?: string; action?: ReactNode };

function Status({ r }: { r: Row }) {
  const ok = !r.missing.length; const label = !ok ? 'Not configured' : r.connected === false ? 'Not connected' : r.connected ? (r.state ?? 'Connected') : (r.state ?? 'Ready');
  return <span className={`pill ${!ok ? 'off' : r.connected === false ? 'warn' : r.warn ? 'warn' : 'on'}`}>{label}</span>;
}
function Section({ title, sub, rows }: { title: string; sub?: string; rows: Row[] }) {
  return <section className="int-sec"><div className="int-head"><h2 className="h2">{title}</h2>{sub && <p className="small muted">{sub}</p>}<span className="small muted">{rows.filter(r => !r.missing.length).length}/{rows.length} ready</span></div>
    <div className="int-rows">{rows.map(r => <div key={r.name} className="int-row"><div><b>{r.name}</b><p className="small muted">{r.what}</p>
      {!!r.missing.length && <div className="envs">{r.missing.map(k => <code key={k}>{k}</code>)}</div>}{r.warn && <p className="small warn-text">⚠ {r.warn}</p>}</div>
      <Status r={r} /><div className="int-act">{r.action}</div></div>)}</div></section>;
}

export default function Integrations() {
  const { toast } = useWs(); const [s, setS] = useState<S | null>(null); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState('');
  const load = () => fetch('/api/integrations', { cache: 'no-store' }).then(r => r.json()).then(setS).catch(setError);
  useEffect(() => { load(); const q = new URLSearchParams(location.search);
    if (q.get('connected')) toast(`${q.get('connected')} connected`); if (q.get('error')) toast(`Connection failed (${q.get('error')})`, 'err'); }, [toast]);
  const disconnect = async (p: string) => { setBusy(p); try { const r = await api<{ revoked?: boolean }>(`/api/${p}/disconnect`, {}); toast(`${p} disconnected${r.revoked ? ' and access revoked' : ''}`); load(); } catch (e) { setError(e); } finally { setBusy(''); } };
  const test = async (c: string) => { setBusy(c); try { await api('/api/notify/test', { channel: c }); toast(`Test message sent to ${c}`); } catch (e) { setError(e); } finally { setBusy(''); } };
  if (!s) return <div className="page"><header className="page-head"><div><span className="kicker">Connections</span><h1>Integrations</h1></div></header>{error ? <ErrorNote error={error} /> : <div className="int-skel" aria-busy="true" aria-label="Checking every integration">{[0, 1, 2, 3, 4].map(i => <span key={i} className="sk" style={{ height: 64, borderRadius: 12 }} />)}<p className="small muted"><span className="spin" /> Checking every integration…</p></div>}</div>;
  const f = s.features; const c = s.connections; const m = (x?: { missing: string[] }) => x?.missing ?? [];
  const btn = (href: string, label: string) => <a className="btn sm" href={href}>{label}</a>;
  const off = (p: string) => <button className="btn ghost sm" disabled={busy === p} onClick={() => disconnect(p)}>Disconnect</button>;
  const all = [...Object.values(f).filter(x => typeof x === 'object')];
  const ready = all.filter(x => x.ok).length;
  return <div className="page integ-page">
    <header className="page-head"><div><span className="kicker">Connections</span><h1>Integrations</h1><p>Live status from the server: nothing reads as connected unless a real key or token is in place. Missing keys are listed exactly; set them in <code>.env.local</code> and restart.</p></div>
      <div className="row"><span className="chip">{ready}/{all.length} core services ready</span><button className="btn sm" onClick={() => { setS(null); load(); }}><Icon name="refresh" />Re-check</button></div></header>
    <ErrorNote error={error} onClose={() => setError(null)} />
    <Section title="Build & deploy" rows={[
      { name: 'GitHub', what: 'OAuth app (scope: repo). Pushes apps, commits articles, opens SEO fix PRs. Disconnect revokes the grant.', missing: f.github.missing, connected: f.github.ok ? c.github.connected : null, state: c.github.login ? `@${c.github.login}` : undefined,
        action: f.github.ok ? (c.github.connected ? off('github') : btn('/api/github/connect', 'Connect')) : null },
      { name: 'Vercel', what: 'Integration OAuth or a server VERCEL_TOKEN. Creates deployments via REST v13.', missing: f.vercel.missing, connected: f.vercel.ok ? c.vercel.connected : null, state: c.vercel.source === 'env' ? 'Server token' : undefined, warn: f.vercel.note,
        action: f.vercel.ok ? (c.vercel.connected ? (c.vercel.source === 'oauth' ? off('vercel') : null) : btn('/api/vercel/connect', 'Connect')) : null },
    ]} />
    <Section title="Platform" rows={[
      { name: 'Supabase', what: 'Auth + Postgres with row-level security, credits ledger RPCs.', missing: f.supabase.missing, state: s.preview ? 'Preview mode (browser storage)' : undefined },
      { name: 'AI provider', what: 'Any OpenAI-compatible endpoint.', missing: f.ai.missing, state: f.ai.ok ? f.ai.note : undefined },
      { name: 'Stripe', what: 'Subscription checkout, portal and a signed webhook that sets the plan (and credit allowance).', missing: f.stripe.missing, warn: f.stripe.ok ? f.stripe.note : undefined, action: <a className="btn ghost sm" href="/app?view=billing">Billing</a> },
      { name: 'Background jobs (cron)', what: 'Auto-publisher every 10 min and a daily digest, protected by CRON_SECRET.', missing: f.scheduler.missing },
    ]} />
    <Section title="Analytics & research" rows={[
      { name: 'Google Search Console + GA4', what: 'Read-only OAuth (webmasters.readonly, analytics.readonly). Refresh token is sealed in an httpOnly cookie and refreshed per request; revoked on disconnect.', missing: f.google.missing, connected: f.google.ok ? c.google.connected : null, warn: c.google.error,
        action: f.google.ok ? (c.google.connected ? <>{off('google')}<a className="btn ghost sm" href="/app?view=marketing&tab=analytics">Open</a></> : btn('/api/google/connect?back=integrations', 'Connect')) : null },
      { name: 'YouTube upload', what: 'Adds youtube.upload to the same Google grant (incremental consent). Unaudited apps upload as private.', missing: f.google.missing, connected: f.google.ok ? c.google.youtube : null,
        action: f.google.ok && !c.google.youtube ? btn('/api/google/connect?youtube=1&back=integrations', c.google.connected ? 'Add YouTube' : 'Connect') : null },
      { name: 'PageSpeed Insights', what: 'Lighthouse scores. Works without a key at low volume; a key avoids shared-quota 429s.', missing: [], state: s.pagespeed.keyed ? 'Own key' : 'Shared quota' },
      { name: 'Search-grounded answers', what: 'Perplexity Sonar or OpenRouter :online for AI-visibility checks.', missing: f.grounded.missing, state: f.grounded.ok ? f.grounded.note : undefined },
      { name: 'Web search', what: 'Brave or Serper, for competitors and backlinks.', missing: f.search.missing },
      { name: 'YouTube Data API', what: 'Creator search with subscriber counts.', missing: f.youtube.missing },
      { name: 'X recent search', what: 'Creator search on X (app bearer token).', missing: f.xsearch.missing },
      { name: 'Reddit', what: 'OAuth app-only search (optional; anonymous search is often blocked).', missing: f.reddit.missing },
    ]} />
    <MetaConnect />
    <Section title="Ad production" sub="Used by Ad Studio → UGC ads" rows={[
      ...Object.entries(s.avatar).map(([k, a]) => ({ name: a.label, what: k === 'heygen' ? 'Lip-synced avatar video, API v3 (/v3/videos).' : k === 'synthesia' ? 'Lip-synced presenter video, API v2. Test mode (watermarked, free) unless SYNTHESIA_TEST=0.' : 'Lip-synced creator video (/api/lipsyncs/).', missing: m(a) })),
      ...Object.entries(s.tts).map(([k, a]) => ({ name: a.label, what: k === 'elevenlabs' ? 'Voiceover with word timings → exact captions.' : 'Voiceover (gpt-4o-mini-tts). Captions are estimated from the script.', missing: m(a) })),
      { name: 'Replicate / fal footage', what: 'AI b-roll images and clips (no lip-sync).', missing: f.media.missing, state: f.media.ok ? f.media.note : undefined },
    ]} />
    <Section title="Ad delivery" sub="Uploads the exported file itself; no public URL needed" rows={Object.entries(s.video).map(([k, a]) => ({ name: a.label, what: k === 'meta_page' ? 'Graph API /{page}/videos, unpublished by default.' : k === 'meta_ads' ? 'Graph API /act_{id}/advideos → use in Ads Manager.' : k === 'tiktok' ? 'Content Posting API inbox upload (video.upload scope). Tokens auto-refresh with a refresh token.' : 'Resumable upload (videos.insert).',
      missing: m(a), connected: k === 'youtube' && !m(a).length ? c.google.youtube : null, warn: k === 'tiktok' ? s.warn.tiktok : undefined }))} />
    <Section title="Social publishing" sub="Posts go out only when you publish or approve them for the scheduler" rows={Object.entries(s.publishers.social).map(([k, p]) => ({ name: p.label, what: k === 'x' ? 'POST /2/tweets (OAuth 1.0a keys or OAuth 2.0 token).' : k === 'linkedin' ? 'Posts API (LinkedIn-Version 202610).' : k === 'tiktok' ? 'Direct post from a verified URL (unaudited apps: SELF_ONLY).' : k === 'instagram' ? 'Content publishing (image container → publish).' : k === 'threads' ? 'Threads API container → publish.' : k === 'bluesky' ? 'AT Protocol app password.' : 'Graph API page feed.', missing: p.missing, warn: s.warn[k] ?? (k === 'linkedin' ? s.warn.linkedinVersion : undefined) }))} />
    <Section title="Article publishing (CMS)" sub="Always created as drafts" rows={Object.entries(s.publishers.cms).map(([k, p]) => ({ name: p.label, what: 'Draft created through the official API.', missing: p.missing, warn: s.warn[k] }))} />
    <McpIntegrations />
    <Section title="Notifications" rows={Object.entries(s.notify).map(([k, n]) => ({ name: n.label, what: k === 'telegram' ? 'Bot API sendMessage to your chat: daily digest + test.' : 'Cloud API text message (24h customer-service window applies; use a template outside it).', missing: n.missing,
      action: !n.missing.length ? <button className="btn ghost sm" disabled={busy === k} onClick={() => test(k)}>Send test</button> : null }))} />
    <p className="small muted"><Icon name="lock" size={12} /> Tokens are sealed with AES-256-GCM in httpOnly cookies or kept in server env. OAuth callbacks: <code>/api/github/callback</code>, <code>/api/vercel/callback</code>, <code>/api/google/callback</code>, <code>/api/meta/callback</code>. Meta Ads uses <code>meta_connections</code>; MCP uses <code>mcp_connections</code> + <code>integration_activity</code> (Supabase) or sealed preview cookies — run migration <code>20261106120000_mcp_integrations.sql</code>.</p>
  </div>;
}
