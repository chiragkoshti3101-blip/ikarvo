'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { useWs, ErrorNote, FromNote, Acts } from './ws';
import { api, download } from '@/lib/client/api';
import type { Doc } from '@/lib/client/store';
import Strategy from './growth/Strategy';
import Community from './growth/Community';
import Visibility from './growth/Visibility';
import Articles from './growth/Articles';
import { useBrand, briefFor } from './growth/useBrand';
import SiteCrawl from './growth/SiteCrawl';
import Outreach from './growth/Outreach';
import Analytics from './growth/Analytics';
import Competitors from './growth/Competitors';
import VoiceLab from './growth/VoiceLab';
import Report from './growth/Report';
import Ugc from './growth/Ugc';
import HackerNews from './growth/HackerNews';
import Tools from './growth/Tools';
import Lifecycle from './growth/Lifecycle';
import LaunchPlan from './growth/LaunchPlan';
import AdPlanner from './growth/AdPlanner';
import MetaAds from './growth/MetaAds';

type Post = { channel: string; when: string; at?: string; text: string; hashtags: string[]; mediaUrl?: string; approved?: boolean; done?: boolean; publishedUrl?: string; lastError?: string; attempts?: number };
const GROUPS = [
  ['Research', [['strategy', 'Strategy & audit'], ['crawl', 'Site crawl & SEO PR'], ['visibility', 'AI visibility'], ['competitors', 'Competitors'], ['community', 'Reddit & HN radar']]],
  ['Create', [['articles', 'Articles'], ['ugc', 'UGC videos'], ['campaign', 'Campaign copy'], ['listing', 'Launch listing'], ['voice', 'Voice & A/B'], ['email', 'Lifecycle emails']]],
  ['Distribute', [['calendar', 'Social calendar'], ['influencers', 'Creators'], ['backlinks', 'Backlinks'], ['hn', 'Show HN'], ['launch', 'Launch plan'], ['meta', 'Meta Ads']]],
  ['Measure', [['analytics', 'Search & analytics'], ['report', 'Weekly report'], ['budget', 'Ad budget planner'], ['tools', 'Free tools']]],
] as const;
type Tab = (typeof GROUPS)[number][1][number][0];
const ALL_TABS = GROUPS.flatMap(g => g[1].map(t => t[0])) as Tab[];
type Campaign = { positioning: string; headline: string; subhead: string; angles: { name: string; message: string }[]; emails: { subject: string; body: string }[]; adCopy: { platform: string; primary: string; headline: string }[] };
type Listing = { name: string; tagline: string; description: string; firstComment: string; topics: string[]; features: string[]; faq: { q: string; a: string }[] };
const CHANNELS = ['X', 'LinkedIn', 'Threads', 'Bluesky', 'Facebook', 'Instagram', 'TikTok'];
const SLUG: Record<string, string> = { X: 'x', LinkedIn: 'linkedin', Threads: 'threads', Bluesky: 'bluesky', Facebook: 'facebook', Instagram: 'instagram', TikTok: 'tiktok' };
const LIMITS: Record<string, number> = { X: 280, Threads: 500, Bluesky: 300, LinkedIn: 3000, Facebook: 5000, Instagram: 2200, TikTok: 2200 };
const MEDIA: Record<string, string> = { Instagram: 'image URL (required)', TikTok: 'public video URL (required)', Facebook: 'image URL (optional)', Threads: 'image URL (optional)' };
type PubStatus = { social: Record<string, { label: string; ok: boolean; missing: string[] }> };

function ics(posts: Doc<Post>[]) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const esc = (s: string) => s.replace(/[\\,;]/g, m => `\\${m}`).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ikarvo//Content Calendar//EN', ...posts.flatMap(p => { const d = new Date(p.data.when); return ['BEGIN:VEVENT', `UID:${p.id}@ikarvo`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(d)}`, `DTEND:${stamp(new Date(d.getTime() + 15 * 60000))}`, `SUMMARY:${esc(`Post to ${p.data.channel}`)}`, `DESCRIPTION:${esc(`${p.data.text}\n\n${p.data.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}`)}`, 'END:VEVENT']; }), 'END:VCALENDAR'].join('\r\n');
}
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function Marketing() {
  const { store, toast, status, email, handoff, take, act, go } = useWs(); const [from, setFrom] = useState(''); const { brand: brandDoc } = useBrand();
  const [tab, setTabState] = useState<Tab>('strategy');
  const setTab = (t: Tab) => { setTabState(t); const u = new URL(window.location.href); u.searchParams.set('tab', t); window.history.replaceState(null, '', u); };
  useEffect(() => { const t = new URLSearchParams(window.location.search).get('tab') as Tab | null; if (t && ALL_TABS.includes(t)) setTabState(t); }, []);
  useEffect(() => { if (!handoff) return; const t = ({ post: 'calendar', campaign: 'campaign', article: 'articles' } as Record<string, Tab>)[handoff.kind] ?? (handoff.kind === 'tab' ? handoff.tab as Tab : null); if (t && ALL_TABS.includes(t)) setTabState(t);
    if (handoff.kind === 'tab') take('tab');
    if (handoff.kind === 'post') { const h = take('post'); if (h) { setFrom(h.from); setDraft(d => ({ ...d, text: h.text, channel: h.channel && CHANNELS.includes(h.channel) ? h.channel : d.channel })); } }
    if (handoff.kind === 'campaign') { const h = take('campaign'); if (h) { setFrom(h.from); setBrief(b => ({ ...b, goal: h.goal.slice(0, 300), product: h.product?.slice(0, 600) ?? b.product, audience: h.audience ?? b.audience })); if (h.autorun && status.ai.ok) autoCampaign.current = true; } }
  }, [handoff, take, status.ai.ok]);
  const autoCampaign = useRef(false);
  useEffect(() => { if (autoCampaign.current && !busy) { autoCampaign.current = false; gen('campaign'); } });
  const [pub, setPub] = useState<PubStatus | null>(null);
  useEffect(() => { fetch('/api/publish/status').then(r => r.json()).then(setPub).catch(() => {}); }, []);
  const [brief, setBrief] = useState({ product: 'Ikarvo, a workspace that turns a prompt into a working web app, then helps you deploy and market it.', audience: 'Solo founders and indie hackers', goal: 'Get 500 sign-ups in launch week', voice: 'Plain-spoken, specific, no hype', days: 14 });
  const [busy, setBusy] = useState(''); const [error, setError] = useState<unknown>(null);
  const [posts, setPosts] = useState<Doc<Post>[]>([]); const [campaign, setCampaign] = useState<Campaign | null>(null); const [listing, setListing] = useState<Listing | null>(null);
  const [draft, setDraft] = useState<Post>({ channel: 'X', when: localInput(new Date(Date.now() + 86400000)), text: '', hashtags: [] });

  useEffect(() => { store.list<Post>('posts').then(setPosts).catch(setError); }, [store]);
  useEffect(() => { const d = brandDoc?.docs; if (d) setBrief(b => ({ ...b, product: `${d.product.name}: ${d.product.oneLiner} ${d.product.whatItDoes}`.slice(0, 600), audience: d.positioning.icp.map(i => i.segment).join('; ').slice(0, 300), voice: d.voice.traits.join(', ') })); }, [brandDoc]);
  async function publish(p: Doc<Post>) {
    const ch = SLUG[p.data.channel]; if (!ch) return;
    setBusy(p.id); setError(null);
    try { const text = `${p.data.text}${p.data.hashtags.length ? `\n\n${p.data.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}` : ''}`; const r = await api<{ url: string }>(`/api/publish/social/${ch}`, { text, mediaUrl: p.data.mediaUrl }); const d = await store.save<Post>('posts', { id: p.id, title: p.title, data: { ...p.data, done: true, publishedUrl: r.url, lastError: undefined } }); setPosts(x => x.map(y => y.id === p.id ? d : y)); toast(`Published to ${p.data.channel}`); }
    catch (e) { setError(e); } finally { setBusy(''); }
  }
  const sorted = [...posts].sort((a, b) => a.data.when.localeCompare(b.data.when));

  async function gen(kind: 'social' | 'campaign' | 'listing') {
    setBusy(kind); setError(null);
    try {
      const r = await api<{ result: { posts?: { channel: string; dayOffset: number; time: string; text: string; hashtags: string[] }[] } & Campaign & Listing }>('/api/marketing', { kind, ...brief, brief: briefFor(brandDoc) });
      if (kind === 'social') {
        const base = new Date(); base.setHours(0, 0, 0, 0); const saved: Doc<Post>[] = [];
        for (const p of r.result.posts ?? []) { const d = new Date(base); d.setDate(d.getDate() + 1 + (Number(p.dayOffset) || 0)); const [hh, mm] = (p.time || '10:00').split(':').map(Number); d.setHours(hh || 10, mm || 0);
          saved.push(await store.save<Post>('posts', { title: `${p.channel} post`, data: { channel: p.channel, when: localInput(d), at: d.toISOString(), text: p.text, hashtags: p.hashtags ?? [], approved: false } })); }
        setPosts(x => [...saved, ...x]); toast(`${saved.length} posts added to your calendar`);
      } else if (kind === 'campaign') { setCampaign(r.result); await store.save('campaigns', { title: r.result.headline || 'Campaign', data: { brief, campaign: r.result } }); }
      else { setListing(r.result); await store.save('listings', { title: r.result.name || 'Listing', data: r.result }); }
    } catch (e) { setError(e); } finally { setBusy(''); }
  }
  async function addPost() { if (!draft.text.trim()) return; try { const d = await store.save<Post>('posts', { title: `${draft.channel} post`, data: { ...draft, at: new Date(draft.when).toISOString(), approved: false } }); setPosts(x => [d, ...x]); setDraft({ ...draft, text: '' }); toast('Post scheduled in your calendar'); } catch (e) { setError(e); } }
  async function toggle(p: Doc<Post>) { const d = await store.save<Post>('posts', { id: p.id, title: p.title, data: { ...p.data, done: !p.data.done } }); setPosts(x => x.map(y => y.id === p.id ? d : y)); }
  async function approve(p: Doc<Post>) { const d = await store.save<Post>('posts', { id: p.id, title: p.title, data: { ...p.data, at: p.data.at ?? new Date(p.data.when).toISOString(), approved: !p.data.approved, attempts: 0, lastError: undefined } }); setPosts(x => x.map(y => y.id === p.id ? d : y)); toast(!d.data.approved ? 'Approval removed' : status.scheduler.ok && email !== 'preview@local' ? 'Approved: the scheduler will publish it at its time' : 'Approved. The scheduler is not running here (needs its keys and a signed-in account), so use Publish now'); }
  async function remove(id: string) { await store.remove('posts', id); setPosts(x => x.filter(y => y.id !== id)); }
  const csv = () => download('content-calendar.csv', ['channel,when,text,hashtags,posted', ...sorted.map(p => [p.data.channel, p.data.when, p.data.text, p.data.hashtags.join(' '), p.data.done ? 'yes' : 'no'].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv');
  const set = (k: keyof typeof brief) => (e: { target: { value: string } }) => setBrief({ ...brief, [k]: k === 'days' ? Number(e.target.value) : e.target.value });
  const listingMd = listing ? `# ${listing.name}\n\n**${listing.tagline}**\n\n${listing.description}\n\n## Features\n${listing.features.map(f => `- ${f}`).join('\n')}\n\n## Maker's comment\n${listing.firstComment}\n\n## FAQ\n${listing.faq.map(f => `**${f.q}**\n${f.a}`).join('\n\n')}\n` : '';

  return <div className="page">
    <header className="page-head"><div><span className="kicker">Growth</span><h1>Marketing</h1><p>Start from your website. Audit it, write a strategy brief, and every channel works from it: community replies, AI-answer tracking, articles, social posts and launch copy.</p></div>
      <button className="btn primary" onClick={() => go('home')}><Icon name="home" />Open AI CMO</button></header>
    <button className="cmo-entry" onClick={() => go('home')}><span className="cmo-entry-ic"><Icon name="chat" /></span><span><b>AI CMO</b><span className="small muted">Your agents, context documents, daily brief and CMO chat in one room. Everything here feeds it.</span></span><span className="cmo-entry-go">Open →</span></button>
    <div className="tabgroups" role="tablist">{GROUPS.map(([g, tabs]) => <div key={g} className="tabgroup"><span>{g}</span><div className="tabs">{tabs.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}</div></div>)}</div>
    {tab === 'strategy' && <Strategy />}{tab === 'community' && <Community />}{tab === 'visibility' && <Visibility />}{tab === 'articles' && <Articles />}
    {tab === 'crawl' && <SiteCrawl />}{tab === 'competitors' && <Competitors />}{tab === 'voice' && <VoiceLab />}{tab === 'influencers' && <Outreach key="i" mode="influencers" />}{tab === 'backlinks' && <Outreach key="b" mode="backlinks" />}{tab === 'analytics' && <Analytics />}{tab === 'report' && <Report />}{tab === 'ugc' && <Ugc />}{tab === 'hn' && <HackerNews />}{tab === 'tools' && <Tools />}{tab === 'email' && <Lifecycle />}{tab === 'launch' && <LaunchPlan />}{tab === 'budget' && <AdPlanner />}{tab === 'meta' && <MetaAds />}
    {['calendar', 'campaign', 'listing'].includes(tab) && <div className="split">
      <section className="panel">
        {from && <FromNote from={from} onClose={() => setFrom('')}>{tab === 'calendar' ? 'Post text prefilled in the composer. Pick a time and schedule it.' : 'Goal and product prefilled from there.'}</FromNote>}
        <h2 className="h2">Brief</h2>
        <label className="label">Product<textarea rows={3} value={brief.product} onChange={set('product')} /></label>
        <label className="label">Audience<input className="input" value={brief.audience} onChange={set('audience')} /></label>
        <label className="label">Goal<input className="input" value={brief.goal} onChange={set('goal')} /></label>
        <div className="two"><label className="label">Voice<input className="input" value={brief.voice} onChange={set('voice')} /></label><label className="label">Days<input className="input" type="number" min={3} max={30} value={brief.days} onChange={set('days')} /></label></div>
        <div className="stack">
          <button className="btn primary wide" disabled={!!busy} onClick={() => gen('social')}>{busy === 'social' ? <><span className="spin" />Planning posts…</> : 'Plan social posts'}</button>
          <div className="two"><button className="btn wide" disabled={!!busy} onClick={() => { setTab('campaign'); gen('campaign'); }}>{busy === 'campaign' ? 'Writing…' : 'Write campaign'}</button><button className="btn wide" disabled={!!busy} onClick={() => { setTab('listing'); gen('listing'); }}>{busy === 'listing' ? 'Writing…' : 'Write listing'}</button></div>
        </div>
        <ErrorNote error={error} onClose={() => setError(null)} />
        {brandDoc?.docs ? <p className="small ok-text">Using your strategy brief for {brandDoc.docs.product.name}.</p> : <p className="small muted">Tip: write a strategy brief first; generators will use its positioning and voice.</p>}
        <p className="small muted">Nothing posts on its own unless you <b>approve</b> it. Approved posts are published at their time by the background scheduler ({status.scheduler.ok ? <span className="ok-text">configured</span> : <>needs {status.scheduler.missing.map(k => <code key={k}>{k} </code>)}</>}), or click Publish now.</p>
        {pub && <div className="chips">{CHANNELS.map(c => <span key={c} className={`chip ${pub.social[SLUG[c]]?.ok ? 'good' : ''}`} title={pub.social[SLUG[c]]?.missing.join(', ')}>{c} {pub.social[SLUG[c]]?.ok ? '✓' : '· not set up'}</span>)}</div>}
      </section>

      <section className="panel">
        {tab === 'calendar' && <>
          <div className="row between"><h2 className="h2">Content calendar <span className="muted">· {posts.length}</span></h2>
            <div className="row"><button className="btn ghost sm" disabled={!posts.length} onClick={() => download('content-calendar.ics', ics(sorted), 'text/calendar')}><Icon name="calendar" />.ics</button><button className="btn ghost sm" disabled={!posts.length} onClick={csv}><Icon name="download" />.csv</button></div></div>
          <div className="composer">
            <div className="row"><select className="input" aria-label="Channel" value={draft.channel} onChange={e => setDraft({ ...draft, channel: e.target.value })}>{CHANNELS.map(c => <option key={c}>{c}</option>)}</select><input className="input" type="datetime-local" aria-label="Publish time" value={draft.when} onChange={e => setDraft({ ...draft, when: e.target.value })} /></div>
            <textarea rows={3} value={draft.text} placeholder="Write a post…" onChange={e => setDraft({ ...draft, text: e.target.value })} />
            {MEDIA[draft.channel] && <input className="input" value={draft.mediaUrl ?? ''} placeholder={`Media: ${MEDIA[draft.channel]}`} onChange={e => setDraft({ ...draft, mediaUrl: e.target.value })} />}
            <div className="row between"><span className={`small ${draft.text.length > LIMITS[draft.channel] ? 'err-text' : 'muted'}`}>{draft.text.length}/{LIMITS[draft.channel]}</span><button className="btn sm" onClick={addPost} disabled={!draft.text.trim()}><Icon name="plus" />Schedule</button></div>
          </div>
          {!posts.length && <div className="blank"><h3>No posts scheduled</h3><p>Write one above, or plan a run of posts from the brief.</p></div>}
          <ol className="timeline">{sorted.map(p => <li key={p.id} className={p.data.done ? 'done' : ''}>
            <div className="when"><b>{new Date(p.data.when).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}</b><span>{new Date(p.data.when).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div className="what"><span className="chip">{p.data.channel}</span><p>{p.data.text}</p><Acts items={[['Make an ad for this', () => act({ kind: 'ad', angle: p.data.text.slice(0, 300), from: `${p.data.channel} post` })]]} />{p.data.mediaUrl && <p className="small muted trunc">media: {p.data.mediaUrl}</p>}{p.data.lastError && <p className="small err-text">Scheduler: {p.data.lastError} (attempt {p.data.attempts ?? 1}/3)</p>}{!!p.data.hashtags.length && <p className="small muted">{p.data.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}</p>}</div>
            <div className="row"><button className="btn ghost sm icon" title="Copy" aria-label="Copy" onClick={() => { navigator.clipboard.writeText(`${p.data.text}\n\n${p.data.hashtags.map(h => `#${h.replace(/^#/, '')}`).join(' ')}`); toast('Copied'); }}><Icon name="copy" /></button>
              {SLUG[p.data.channel] && !p.data.publishedUrl && <button className={`btn sm ${p.data.approved ? 'primary' : 'ghost'}`} title="The scheduler only publishes approved posts" onClick={() => approve(p)}>{p.data.approved ? 'Approved' : 'Approve'}</button>}
              {SLUG[p.data.channel] && !p.data.publishedUrl && <button className="btn sm" disabled={!!busy} onClick={() => publish(p)}>{busy === p.id ? 'Publishing…' : 'Publish now'}</button>}
              {p.data.publishedUrl && <a className="btn ghost sm" href={p.data.publishedUrl} target="_blank" rel="noreferrer">View</a>}
              <button className="btn ghost sm icon" title="Mark posted" aria-label="Mark posted" onClick={() => toggle(p)}><Icon name="check" /></button><button className="btn ghost sm icon" title="Delete" aria-label="Delete" onClick={() => remove(p.id)}><Icon name="trash" /></button></div></li>)}</ol>
        </>}
        {tab === 'campaign' && (campaign ? <div className="doc">
          <span className="label">Positioning</span><p>{campaign.positioning}</p><h2 className="display">{campaign.headline}</h2><p className="muted">{campaign.subhead}</p>
          <div className="nextbar"><span>Act on it</span><Acts items={[
            ['Build this landing page', () => act({ kind: 'build', title: campaign.headline.slice(0, 60), prompt: `A conversion landing page.\nHeadline: ${campaign.headline}\nSubhead: ${campaign.subhead}\nPositioning: ${campaign.positioning}\nSections, one per angle: ${campaign.angles?.map(a => `${a.name}: ${a.message}`).join(' | ')}\nProduct: ${brief.product}\nInclude a clear primary CTA, FAQ and sign-up form.`, from: 'Campaign copy' })],
            ['Make an ad from this', () => act({ kind: 'ad', product: brief.product, audience: brief.audience, angle: `${campaign.headline}: ${campaign.angles?.[0]?.message ?? ''}`, from: 'Campaign copy' })],
            ['Turn angles into posts', async () => { const base = Date.now(); for (const [i, a] of (campaign.angles ?? []).entries()) { const d = new Date(base + (i + 1) * 864e5); d.setHours(10, 0, 0, 0); const s = await store.save<Post>('posts', { title: 'X post', data: { channel: 'X', when: localInput(d), at: d.toISOString(), text: `${a.message}`.slice(0, 280), hashtags: [], approved: false } }); setPosts(x => [s, ...x]); } setTab('calendar'); toast(`${campaign.angles?.length ?? 0} draft posts added (not approved yet)`); }]]} /></div>
          <span className="label">Angles</span>{campaign.angles?.map(a => <p key={a.name}><b>{a.name}.</b> {a.message}</p>)}
          <span className="label">Ad copy</span>{campaign.adCopy?.map((a, i) => <div key={i} className="quote"><span className="chip">{a.platform}</span><b>{a.headline}</b><p>{a.primary}</p></div>)}
          <span className="label">Emails</span>{campaign.emails?.map((m, i) => <div key={i} className="quote"><b>{m.subject}</b><p className="pre">{m.body}</p></div>)}
        </div> : <div className="blank"><h3>No campaign yet</h3><p>Write one from the brief: positioning, headline, angles, ad copy and a launch email sequence.</p></div>)}
        {tab === 'listing' && (listing ? <div className="doc">
          <div className="listing"><div className="mark">{listing.name.slice(0, 1)}</div><div><h2>{listing.name}</h2><p>{listing.tagline}</p><div className="chips">{listing.topics?.map(t => <span key={t} className="chip">{t}</span>)}</div></div></div>
          <p>{listing.description}</p><span className="label">Features</span><ul className="ticks">{listing.features?.map(f => <li key={f}>{f}</li>)}</ul>
          <Acts items={[['Build the launch page', () => act({ kind: 'build', title: listing.name, prompt: `A launch page for ${listing.name}: ${listing.tagline}\n${listing.description}\nFeatures: ${listing.features?.join('; ')}\nFAQ: ${listing.faq?.map(f => f.q).join('; ')}\nInclude a sign-up form and a "Featured on" strip placeholder.`, from: 'Launch listing' })], ['Announce it', () => act({ kind: 'post', text: `${listing.name}: ${listing.tagline}`, from: 'Launch listing' })]]} />
          <span className="label">Maker&apos;s first comment</span><p className="pre">{listing.firstComment}</p>
          <div className="row"><button className="btn sm" onClick={() => { navigator.clipboard.writeText(listingMd); toast('Listing copied as Markdown'); }}><Icon name="copy" />Copy Markdown</button><button className="btn ghost sm" onClick={() => download('launch-listing.md', listingMd, 'text/markdown')}><Icon name="download" />Download</button></div>
        </div> : <div className="blank"><h3>No listing yet</h3><p>Generates name, tagline (≤60 chars), description, features, topics, FAQ and a maker comment for Product Hunt-style directories.</p></div>)}
      </section>
    </div>}
  </div>;
}
