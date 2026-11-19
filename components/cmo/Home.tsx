'use client';
import { useCallback, useEffect, useState } from 'react';
import { ACCEPT, readText } from '@/lib/client/extract';
import Icon from '../Icon';
import { useWs, ErrorNote, Pill } from '../ws';
import { api, ApiError, fmtDate } from '@/lib/client/api';
import type { Doc } from '@/lib/client/store';
import { useBrand, briefFor, type Brand } from '../growth/useBrand';
import { AGENTS, useSettings, cachedSettings, type Settings, type AgentKey } from '@/lib/client/settings';
import Onboarding, { type LogLine } from './Onboarding';
import Chat from './Chat';
import Tour from './Tour';
import Rich from './Rich';

export type DocKey = 'product' | 'strategy' | 'competitors' | 'calendar' | 'design' | 'content' | 'voice';
export const DOCS: { key: DocKey; name: string; gen?: 'competitors' | 'calendar' | 'design' | 'content' }[] = [
  { key: 'product', name: 'Product information' }, { key: 'strategy', name: 'Marketing strategy' }, { key: 'competitors', name: 'Competitor analysis', gen: 'competitors' },
  { key: 'calendar', name: 'Content calendar', gen: 'calendar' }, { key: 'design', name: 'Design guide', gen: 'design' }, { key: 'content', name: 'Content strategy', gen: 'content' }, { key: 'voice', name: 'Brand voice' }];
export function docValue(b: Brand | null, k: DocKey): unknown {
  const d = b?.docs; const x = b?.extraDocs as Record<string, unknown> | undefined;
  if (k === 'product') return d ? { ...d.product, ...(b?.audit ? { pageTitle: b.audit.page.title, metaDescription: b.audit.page.description } : {}) } : null;
  if (k === 'strategy') return d ? { positioning: d.positioning, keywords: d.keywords, plan: d.plan } : null;
  if (k === 'voice') return d?.voice ?? null;
  if (k === 'design') return x?.design ? { ...(x.design as object), extractedFromSite: b?.design } : b?.design ? { extractedFromSite: b.design } : null;
  return x?.[k] ?? null;
}
type Feed = { id: string; kind: string; title: string; detail: string; table: string; tab: string; when: string; approve?: () => Promise<void> };

export default function Home() {
  const { store, status, toast, go, act } = useWs(); const { brand, brandId, loading, save } = useBrand(); const { settings, save: saveSettings } = useSettings(store);
  const [adding, setAdding] = useState(false); const [brands, setBrands] = useState<Doc<Brand>[]>([]); const [open, setOpen] = useState<DocKey | 'file' | null>(null); const [fileIdx, setFileIdx] = useState(0);
  const [busy, setBusy] = useState(''); const [error, setError] = useState<unknown>(null); const [logs, setLogs] = useState<Doc<{ lines: LogLine[] }>[]>([]); const [showLog, setShowLog] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({}); const [feed, setFeed] = useState<Feed[]>([]); const [chatOpen, setChatOpen] = useState(true); const [tour, setTour] = useState(false);
  const [editProfile, setEditProfile] = useState(false); const [profile, setProfile] = useState(''); const [company, setCompany] = useState(false); const [newComp, setNewComp] = useState('');
  useEffect(() => { store.list<Brand>('brands').then(setBrands).catch(() => {}); store.list<{ lines: LogLine[] }>('logs').then(setLogs).catch(() => {}); }, [store, brandId]);
  useEffect(() => { if (localStorage.getItem('ikarvo:addSite')) { localStorage.removeItem('ikarvo:addSite'); setAdding(true); } if (localStorage.getItem('ikarvo:tourNow')) { localStorage.removeItem('ikarvo:tourNow'); setTour(true); } }, []);
  useEffect(() => { const t = () => setTour(true); window.addEventListener('ikarvo:tour', t); return () => window.removeEventListener('ikarvo:tour', t); }, []);
  useEffect(() => { if (brand?.docs && !settings.tourDone && settings.onboarded) setTour(true); }, [brand?.docs, settings.tourDone, settings.onboarded]);
  const loadFeed = useCallback(async () => {
    const safe = <T,>(t: Parameters<typeof store.list>[0]) => store.list<T>(t).catch(() => [] as Doc<T>[]);
    type P = { channel: string; text: string; when: string; at?: string; approved?: boolean; publishedUrl?: string };
    const [posts, arts, threads, inf, bl, ugc, vis, comps, crawls, hn] = await Promise.all([safe<P>('posts'), safe<{ published?: unknown[]; metaDescription: string }>('articles'), safe<{ draft?: unknown }>('threads'), safe<{ draft?: unknown }>('influencers'), safe<{ draft?: unknown }>('backlinks'), safe<{ hook: string }>('ugc'), safe('visibility'), safe('competitors'), safe('crawls'), safe('hn')]);
    setCounts({ x: posts.filter(p => p.data.channel === 'X').length, linkedin: posts.filter(p => p.data.channel === 'LinkedIn').length, articles: arts.length, reddit: threads.length, influencer: inf.length, backlinks: bl.length, ugc: ugc.length, geo: vis.length, competitors: comps.length, seo: crawls.length, hn: hn.length });
    const f: Feed[] = [
      ...posts.filter(p => !p.data.approved && !p.data.publishedUrl).map(p => ({ id: p.id, kind: p.data.channel, title: p.data.text.slice(0, 120), detail: `Scheduled ${new Date(p.data.at ?? p.data.when).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, table: 'posts', tab: 'calendar', when: p.updated_at,
        approve: async () => { await store.save('posts', { id: p.id, title: p.title, data: { ...p.data, approved: true, at: p.data.at ?? new Date(p.data.when).toISOString() } }); toast('Approved'); loadFeed(); } })),
      ...arts.filter(a => !a.data.published?.length).map(a => ({ id: a.id, kind: 'Article', title: a.title, detail: a.data.metaDescription, table: 'articles', tab: 'articles', when: a.updated_at })),
      ...threads.filter(t => t.data.draft).map(t => ({ id: t.id, kind: 'Reply', title: t.title, detail: 'Reply drafted; post it yourself from the thread', table: 'threads', tab: 'community', when: t.updated_at })),
      ...[...inf, ...bl].filter(t => t.data.draft).map(t => ({ id: t.id, kind: 'Pitch', title: t.title, detail: 'Outreach draft ready to copy', table: 'outreach', tab: inf.includes(t) ? 'influencers' : 'backlinks', when: t.updated_at })),
      ...ugc.map(u => ({ id: u.id, kind: 'UGC', title: u.title, detail: u.data.hook, table: 'ugc', tab: 'ugc', when: u.updated_at })),
    ].sort((a, b) => b.when.localeCompare(a.when)).slice(0, 12);
    setFeed(f);
  }, [store, toast]);
  useEffect(() => { loadFeed(); }, [loadFeed, brandId]);

  if (loading) return <div className="page"><span className="spin" /></div>;
  if (adding || !brand) return <Onboarding settings={settings} saveSettings={saveSettings} addMode={!!brand} onDone={() => { setAdding(false); window.dispatchEvent(new Event('ikarvo:brand')); }} />;

  const switchTo = (id: string) => { localStorage.setItem('ikarvo:activeBrand', id); window.dispatchEvent(new Event('ikarvo:brand')); };
  const why = (e: unknown) => e instanceof ApiError ? e : e;
  async function genDoc(gen: NonNullable<(typeof DOCS)[number]['gen']>) { if (!brand) return; setBusy(gen); setError(null);
    try { let signals: unknown = gen === 'design' ? brand.design : brand.competitorsFound;
      if (gen === 'design' && !brand.design) { signals = await api('/api/growth/design', { url: brand.url }); }
      const r = await api<{ result: unknown }>('/api/cmo/docs', { doc: gen, brief: briefFor(brand), signals, instructions: settings.company.instructions, language: settings.personal.language });
      await save({ ...brand, ...(gen === 'design' ? { design: signals } : {}), extraDocs: { ...(brand.extraDocs ?? {}), [gen]: { ...(r.result as object), at: new Date().toISOString() } } }); toast('Document ready'); }
    catch (e) { setError(why(e)); } finally { setBusy(''); } }
  async function sync() { if (!brand) return; setBusy('sync'); setError(null);
    try { const a = await api<{ url: string; score: number; checks: NonNullable<Brand['audit']>['checks']; page: NonNullable<Brand['audit']>['page'] }>('/api/growth/audit', { url: brand.url }); let next: Brand = { ...brand, audit: { score: a.score, checks: a.checks, page: a.page, at: new Date().toISOString() } };
      if (status.ai.ok) { const r = await api<{ result: NonNullable<Brand['docs']> }>('/api/growth/brief', { url: brand.url, title: a.page.title, description: a.page.description, pageText: a.page.text, notes: `${brand.notes}\n${settings.company.instructions}` }); next = { ...next, docs: r.result }; }
      await save(next); toast(status.ai.ok ? 'Website re-read and documents refreshed' : 'Website re-read (documents need AI_API_KEY)'); }
    catch (e) { setError(e); } finally { setBusy(''); } }
  async function findComps() { if (!brand?.docs) return; setBusy('comp'); setError(null);
    try { const r = await api<{ competitors: { name: string; domain: string; why: string }[]; verified: boolean }>('/api/cmo/competitors', { name: brand.docs.product.name, category: brand.docs.product.category, domain: brand.url, brief: briefFor(brand) });
      await save({ ...brand, competitorsFound: r.competitors.map(c => ({ ...c, source: r.verified ? 'search' : 'AI suggestion (unverified)' })) }); toast(`${r.competitors.length} competitors found`); }
    catch (e) { setError(e); } finally { setBusy(''); } }
  async function addComp() { if (!brand || !newComp.trim()) return; const v = newComp.trim(); const domain = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    await save({ ...brand, competitorsFound: [...(brand.competitorsFound ?? []), { name: domain.split('.')[0], domain, source: 'added by you' }] }); setNewComp(''); }
  async function upload(files: FileList | null) { if (!brand || !files) return; const added: { name: string; text: string; at: string }[] = []; const skipped: string[] = [];
    if (files.length) toast(`Reading ${files.length} file(s)…`);
    for (const f of Array.from(files)) { try { added.push({ name: f.name, text: await readText(f), at: new Date().toISOString() }); } catch (e) { skipped.push(e instanceof Error ? e.message : f.name); } }
    if (added.length) await save({ ...brand, files: [...(brand.files ?? []), ...added] }); toast(`${added.length} file(s) added to context${skipped.length ? `. Skipped: ${skipped.join('; ')}` : ''}`, skipped.length ? 'err' : 'ok'); }
  const toggle = async (k: AgentKey) => { const s = cachedSettings(); await saveSettings({ ...s, agents: { ...s.agents, [k]: { ...s.agents[k], on: !s.agents[k].on } } as Settings['agents'] }); };
  const agentSetup = (k: AgentKey): string[] => ({ seo: status.github.ok ? [] : ['GitHub (for PRs)'], geo: status.ai.ok ? [] : ['AI_API_KEY'], reddit: status.ai.ok ? [] : ['AI_API_KEY'], x: status.x.ok ? [] : ['X_ACCESS_TOKEN (to publish)'], linkedin: status.linkedin.ok ? [] : ['LINKEDIN_ACCESS_TOKEN (to publish)'],
    articles: status.ai.ok ? [] : ['AI_API_KEY'], ugc: status.ai.ok ? (status.media.ok ? [] : ['REPLICATE_API_TOKEN or FAL_KEY (to render)']) : ['AI_API_KEY'], influencer: status.youtube.ok || status.xsearch.ok ? [] : ['YOUTUBE_API_KEY or X_BEARER_TOKEN'], backlinks: status.search.ok ? [] : ['BRAVE_SEARCH_API_KEY or SERPER_API_KEY'], competitors: [], hn: status.ai.ok ? [] : ['AI_API_KEY'] } as Record<AgentKey, string[]>)[k];
  const d = brand.docs; const ps = brand.pagespeed?.scores; const fileDoc = open === 'file' ? brand.files?.[fileIdx] : null;
  const docsForChat = Object.fromEntries(DOCS.map(x => [x.name, docValue(brand, x.key)]).filter(([, v]) => v));

  return <div className={`cmo ${chatOpen ? '' : 'nochat'}`}>
    <div className="cmo-top">
      <div className="row"><select className="input sm" value={brandId ?? ''} onChange={e => e.target.value === '__add' ? setAdding(true) : switchTo(e.target.value)} aria-label="Website">{brands.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}<option value="__add">+ Add website…</option></select>
        <button className={`btn ghost sm ${showLog ? 'on' : ''}`} onClick={() => setShowLog(!showLog)}><Icon name="build" />Agent log</button></div>
      <div className="scores" data-tour="scores">{ps ? (['performance', 'accessibility', 'bestPractices', 'seo'] as const).map(k => <span key={k} className={`sc ${ps[k] == null ? '' : ps[k]! >= 90 ? 'hi' : ps[k]! >= 50 ? 'mid' : 'lo'}`}><b>{ps[k] ?? '–'}</b>{k === 'bestPractices' ? 'Best practices' : k[0].toUpperCase() + k.slice(1)}</span>)
        : <button className="btn ghost sm" disabled={busy === 'ps'} onClick={async () => { setBusy('ps'); try { const p = await api<{ scores: Record<string, number | null>; at: string }>('/api/growth/pagespeed', { url: brand.url }); await save({ ...brand, pagespeed: p }); } catch (e) { setError(e); } finally { setBusy(''); } }}>{busy === 'ps' ? 'Measuring…' : 'Measure Lighthouse scores'}</button>}
        <button className="btn ghost sm" onClick={() => go('marketing', 'analytics')}>{status.google.ok ? 'Search Console' : 'Connect Google'}</button></div>
      <button className="btn ghost sm" onClick={() => setChatOpen(!chatOpen)}><Icon name="chat" />{chatOpen ? 'Hide chat' : 'Chat'}</button>
    </div>
    {showLog && <div className="agentlog strip">{logs.length ? logs.slice(0, 3).flatMap(l => l.data.lines).slice(-60).map((l, i) => <div key={i} className={`ll ${l.tone}`}><span>{fmtDate(l.at)}</span>{l.text}</div>) : <div className="ll">No runs logged yet.</div>}</div>}
    <ErrorNote error={error} onClose={() => setError(null)} />
    <aside className="ctx" data-tour="context">
      <div className="row between"><h2 className="h2">Context</h2><div className="row"><button className="btn ghost sm icon" title="Edit company profile" onClick={() => { setProfile(d?.product.oneLiner ?? ''); setEditProfile(!editProfile); }}><Icon name="edit" /></button><button className="btn ghost sm icon" title="Company settings" onClick={() => setCompany(true)}><Icon name="settings" /></button></div></div>
      <h3>{d?.product.name ?? brand.audit?.page.title ?? brand.url}</h3>
      <div className="chips"><span className="chip">{settings.company.category || d?.product.category || 'Uncategorized'}</span>{settings.company.x ? <a className="chip" href={`https://x.com/${settings.company.x}`} target="_blank" rel="noreferrer">@{settings.company.x}</a> : <button className="chip btnchip" onClick={() => setCompany(true)}>+ X</button>}{settings.company.linkedin ? <span className="chip">LinkedIn ✓</span> : <button className="chip btnchip" onClick={() => setCompany(true)}>+ LinkedIn</button>}</div>
      {editProfile ? <div><textarea rows={3} value={profile} onChange={e => setProfile(e.target.value)} /><div className="row"><button className="btn sm" onClick={async () => { if (d) await save({ ...brand, docs: { ...d, product: { ...d.product, oneLiner: profile } } }); setEditProfile(false); }}>Save</button><button className="btn ghost sm" onClick={() => setEditProfile(false)}>Cancel</button></div></div>
        : <p className="small muted">{d?.product.oneLiner ?? brand.audit?.page.description ?? 'Write the strategy brief to fill this in.'}</p>}
      <div className="row between"><span className="label">Documents · {DOCS.filter(x => docValue(brand, x.key)).length + (brand.files?.length ?? 0)} of {DOCS.length + (brand.files?.length ?? 0)}</span><label className="btn ghost sm icon" title="Add context files (PDF, DOCX, Markdown, text, CSV, JSON)" aria-label="Add context files"><Icon name="plus" /><input type="file" multiple hidden accept={ACCEPT} onChange={e => { upload(e.target.files); e.target.value = ''; }} /></label></div>
      <div className="doclist">{DOCS.map(x => { const v = docValue(brand, x.key); return <div key={x.key} className={`docrow ${v ? '' : 'empty'}`}><button onClick={() => v ? setOpen(x.key) : null}><Icon name="doc" />{x.name}</button>
        {!v && (x.gen ? <button className="btn ghost sm" disabled={!!busy} onClick={() => genDoc(x.gen!)}>{busy === x.gen ? '…' : 'Generate'}</button> : <button className="btn ghost sm" onClick={() => go('marketing', 'strategy')}>Write</button>)}</div>; })}
        {brand.files?.map((f, i) => <div key={f.name + i} className="docrow"><button onClick={() => { setFileIdx(i); setOpen('file'); }}><Icon name="clip" />{f.name}</button></div>)}</div>
      <div className="row between"><span className="label">Competitors · {brand.competitorsFound?.length ?? 0}</span><div className="row"><button className="btn ghost sm icon" title="Find competitors" disabled={!!busy || !d} onClick={findComps}><Icon name="refresh" /></button></div></div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {brand.competitorsFound?.map(c => <div key={c.domain} className="comp"><img alt="" src={`https://icons.duckduckgo.com/ip3/${c.domain}.ico`} width={14} height={14} /><span><b>{c.name}</b> <span className="small muted">{c.domain}</span></span><button className="btn ghost sm icon" title="Remove" onClick={() => save({ ...brand, competitorsFound: brand.competitorsFound!.filter(x => x.domain !== c.domain) })}>×</button></div>)}
      {!!brand.competitorsFound?.length && <p className="small muted">{brand.competitorsFound[0].source}</p>}
      <div className="row"><input className="input sm" placeholder="competitor.com" value={newComp} onChange={e => setNewComp(e.target.value)} /><button className="btn sm" onClick={addComp}>Add</button></div>
      <button className="btn wide sm" onClick={() => { localStorage.setItem('ikarvo:pulse', (brand.competitorsFound ?? []).map(c => `https://${c.domain}`).join('\n')); go('marketing', 'competitors'); }}>Watch them (Pulse) →</button>
    </aside>
    <main className="room">
      <p className="muted">Welcome{settings.personal.callMe ? `, ${settings.personal.callMe}` : ''}. Everything agents make lands below as a draft. Nothing goes out until you approve it.</p>
      <div className="row between" data-tour="agents"><h2 className="h2">Agents · {AGENTS.filter(a => settings.agents[a.key].on).length} on</h2><button className="btn ghost sm" onClick={() => go('settings', 'agents')}><Icon name="settings" />Content instructions</button></div>
      <div className="agents">{AGENTS.map(a => { const on = settings.agents[a.key].on; const setup = agentSetup(a.key); return <article key={a.key} className={`agent ${on ? '' : 'off'}`}>
        <div className="row between"><b>{a.name}</b><label className="switch" data-tour={a.key === 'x' ? 'toggle' : undefined} title={on ? 'On' : 'Off'}><input type="checkbox" checked={on} onChange={() => toggle(a.key)} /><i /></label></div>
        <p className="small muted">{a.what}</p>
        <div className="row between"><span className="small">{counts[a.key] ?? 0} results · <span className="muted">{a.cost}</span></span>{setup.length ? <span className="pill off" title={setup.join(', ')}><i />Setup</span> : <Pill ok>Ready</Pill>}</div>
        <div className="row"><button className="btn sm" disabled={!on} onClick={() => go('marketing', a.tab)}>Open</button><button className="btn ghost sm icon" title="Agent settings" onClick={() => go('settings', 'agents')}><Icon name="settings" /></button></div>
      </article>; })}</div>
      <div className="row between" data-tour="brief"><h2 className="h2 spaced">Daily brief · waiting for you</h2><button className="btn ghost sm icon" onClick={loadFeed} title="Refresh"><Icon name="refresh" /></button></div>
      {!feed.length ? <div className="blank"><h3>Nothing waiting</h3><p>Turn on an agent and open it. Drafts appear here for approval.</p></div>
        : <div className="table">{feed.map(f => <div key={f.table + f.id} className="tr feed"><span className="chip">{f.kind}</span><span><b>{f.title}</b><br /><span className="small muted">{f.detail}</span></span><span className="row">{f.approve && <button className="btn primary sm" onClick={f.approve}>Approve</button>}<button className="btn ghost sm" onClick={() => go('marketing', f.tab)}>Open</button></span></div>)}</div>}
      {d && <><h2 className="h2 spaced">This week from your plan</h2><div className="table">{d.plan[0]?.actions.map((x, i) => <div key={i} className="tr"><span className="chip">{x.channel}</span><span>{x.task}</span><button className="btn act sm" onClick={() => act({ kind: 'tab', tab: /seo/i.test(x.channel) ? 'crawl' : /reddit|hn|community/i.test(x.channel) ? 'community' : /blog|article/i.test(x.channel) ? 'articles' : 'calendar', from: 'Daily brief' })}>Do it →</button></div>)}</div></>}
    </main>
    {chatOpen && <Chat brand={brand} docs={docsForChat} settings={settings} onClose={() => setChatOpen(false)} />}
    {open && <div className="drawer" role="dialog" onClick={() => setOpen(null)}><div className="drawer-body" onClick={e => e.stopPropagation()}>
      <div className="row between"><h2 className="h2">{open === 'file' ? fileDoc?.name : DOCS.find(x => x.key === open)?.name}</h2><div className="row">{open !== 'file' && DOCS.find(x => x.key === open)?.gen && <button className="btn ghost sm" disabled={!!busy} onClick={() => genDoc(DOCS.find(x => x.key === open)!.gen!)}>{busy ? 'Regenerating…' : 'Regenerate'}</button>}{open === 'file' && <button className="btn ghost sm" onClick={async () => { await save({ ...brand, files: brand.files!.filter((_, i) => i !== fileIdx) }); setOpen(null); }}>Remove</button>}<button className="btn ghost sm icon" aria-label="Close" onClick={() => setOpen(null)}>×</button></div></div>
      {open === 'file' ? <pre className="code small">{fileDoc?.text}</pre> : <Rich value={docValue(brand, open)} />}
    </div></div>}
    {company && <div className="drawer" role="dialog" onClick={() => setCompany(false)}><div className="drawer-body" onClick={e => e.stopPropagation()}><CompanySettings settings={settings} onSave={async s => { await saveSettings(s); setCompany(false); toast('Saved'); }} onSync={sync} syncing={busy === 'sync'} url={brand.url} onGoSettings={() => go('settings', 'websites')} /></div></div>}
    {tour && <Tour onEnd={async () => { setTour(false); await saveSettings({ ...cachedSettings(), tourDone: true }); }} />}
  </div>;
}

function CompanySettings({ settings, onSave, onSync, syncing, url, onGoSettings }: { settings: Settings; onSave: (s: Settings) => void; onSync: () => void; syncing: boolean; url: string; onGoSettings: () => void }) {
  const [c, setC] = useState(settings.company);
  return <><h2 className="h2">Company settings</h2>
    <label className="label">General instructions for every agent · {c.instructions.length}/4000<textarea rows={6} maxLength={4000} value={c.instructions} onChange={e => setC({ ...c, instructions: e.target.value })} placeholder="We never discount. Always mention the free plan. Avoid comparing on price with…" /></label>
    <div className="two"><label className="label">X handle<input className="input" value={c.x} onChange={e => setC({ ...c, x: e.target.value.replace(/^@/, '') })} /></label><label className="label">LinkedIn page<input className="input" value={c.linkedin} onChange={e => setC({ ...c, linkedin: e.target.value })} /></label></div>
    <div className="two"><label className="label">Category<input className="input" value={c.category} onChange={e => setC({ ...c, category: e.target.value })} /></label><label className="label">Key people (names, roles)<input className="input" value={c.people} onChange={e => setC({ ...c, people: e.target.value })} /></label></div>
    <button className="btn primary" onClick={() => onSave({ ...settings, company: c })}>Save</button>
    <div className="divider" /><span className="label">Sync from website</span><p className="small muted">Re-reads {url} and refreshes the product and strategy documents.</p><button className="btn sm" disabled={syncing} onClick={onSync}>{syncing ? 'Syncing…' : 'Sync website'}</button>
    <div className="divider" /><span className="label">Product URL</span><p className="small muted">Change or add websites in Settings.</p><button className="btn ghost sm" onClick={onGoSettings}>Go to settings</button></>;
}
