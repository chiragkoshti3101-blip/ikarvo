/* eslint-disable @next/next/no-img-element -- Meta CDN thumbnails and local object URLs */
'use client';
import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import { ErrorNote, useWs } from '../ws';
import { api } from '@/lib/client/api';
import { postFile } from '@/lib/client/upload';
import { useBrand, briefFor } from './useBrand';
import { useMetaAccount } from '../meta/MetaConnect';
import { idbGet, idbKeys } from '../ad/assets';
import type { SavedRender } from '../ad/Editor';

type Interest = { id: string; name: string; audience_size_lower_bound?: number; audience_size_upper_bound?: number; path?: string[] };
type Geo = { key: string; name: string; type: string; country_code?: string; country_name?: string; region?: string };
type Demo = { id: string; name: string; type: string; audience_size_lower_bound?: number; audience_size_upper_bound?: number };
type Resolved<T> = { query: string; match: T | null; on?: boolean };
type Targeting = { plan: { summary: string; rationale: string[]; lookalikeSeed: string }; ageMin: number; ageMax: number; genders: number[]; interests: Resolved<Interest>[]; locations: Resolved<Geo>[]; demographics: Resolved<Demo>[] };
type Est = { ready: boolean; mauLower: number | null; mauUpper: number | null; dau: number | null };
type Aud = { id: string; name: string; subtype: string; approximate_count_lower_bound?: number; approximate_count_upper_bound?: number; operation_status?: { description: string } };
type Vid = { id: string; title: string; length: number | null; picture: string | null; status: string };
type Ins = { spend: number; reach: number; impressions: number; frequency: number; clicks: number; ctr: number; cpc: number | null; results: number; resultType: string; cpa: number | null; date?: string; adName?: string };
type Camp = { id: string; name: string; objective: string; status: string; effective: string; created: string; start: string | null; end: string | null; dailyBudget: number | null; lifetimeBudget: number | null; goal: string; insights: Ins | null };
type Rec = { title: string; why: string; action: string; impact: string; kind: string };
type Local = SavedRender & { blob: Blob; url: string };

const n = (x: number | null | undefined, d = 0) => x == null ? '–' : x.toLocaleString('en-US', { maximumFractionDigits: d });
const big = (x?: number | null) => x == null ? '–' : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${Math.round(x / 1e3)}K` : String(x);
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const OBJ = [['OUTCOME_TRAFFIC', 'Traffic'], ['OUTCOME_AWARENESS', 'Awareness'], ['OUTCOME_ENGAGEMENT', 'Video views']] as const;
const GOAL: Record<string, string> = { OUTCOME_TRAFFIC: 'LANDING_PAGE_VIEWS', OUTCOME_AWARENESS: 'REACH', OUTCOME_ENGAGEMENT: 'THRUPLAY' };
const CTA = ['LEARN_MORE', 'SIGN_UP', 'GET_STARTED', 'DOWNLOAD', 'SHOP_NOW', 'SUBSCRIBE'];

export default function MetaAds() {
  const { toast, go, store } = useWs(); const { brand } = useBrand(); const { account: a, error: accErr } = useMetaAccount();
  const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState('');
  const [product, setProduct] = useState(''); const [markets, setMarkets] = useState('');
  const [tg, setTg] = useState<Targeting | null>(null); const [est, setEst] = useState<Est | null>(null);
  const [auds, setAuds] = useState<Aud[]>([]); const [useAud, setUseAud] = useState<string[]>([]); const [lal, setLal] = useState({ seed: '', country: 'US', ratio: 1 });
  const [q, setQ] = useState(''); const [qKind, setQKind] = useState('interest'); const [found, setFound] = useState<(Interest & Geo & Demo)[]>([]);
  const [vids, setVids] = useState<Vid[]>([]); const [renders, setRenders] = useState<Local[]>([]); const [video, setVideo] = useState('');
  const d0 = new Date(Date.now() + 864e5); d0.setHours(9, 0, 0, 0);
  const [f, setF] = useState({ name: '', objective: 'OUTCOME_TRAFFIC', link: '', message: '', headline: '', cta: 'LEARN_MORE', daily: 20, start: local(d0), end: local(new Date(d0.getTime() + 7 * 864e5)) });
  const [camps, setCamps] = useState<Camp[] | null>(null); const [sel, setSel] = useState<string>(''); const [preset, setPreset] = useState('last_7d');
  const [ins, setIns] = useState<{ total: Ins | null; daily: Ins[]; ads: Ins[] } | null>(null); const [recs, setRecs] = useState<{ source: string; recommendations: Rec[] } | null>(null); const [targetCpa, setTargetCpa] = useState('');
  const [launch, setLaunch] = useState<Camp | null>(null); const [ack, setAck] = useState(false);
  const ready = !!a?.connected && !!a.selected?.adAccountId; const cur = a?.selected?.currency ?? 'USD';

  useEffect(() => { if (!product && brand) { setProduct(briefFor(brand).slice(0, 2400)); setF(x => ({ ...x, link: x.link || (brand.url?.startsWith('http') ? brand.url : brand.url ? `https://${brand.url}` : ''), name: x.name || `${brand.docs?.product.name ?? 'Launch'} · Meta`, message: x.message || brand.docs?.product.oneLiner || '' })); } }, [brand]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async <T,>(k: string, fn: () => Promise<T>) => { setBusy(k); setErr(null); try { return await fn(); } catch (e) { setErr(e); return undefined; } finally { setBusy(''); } };
  const loadCamps = () => api<{ campaigns: Camp[] }>('/api/meta/campaigns').then(d => { setCamps(d.campaigns); setSel(s => s || d.campaigns[0]?.id || ''); }).catch(setErr);
  const loadVids = () => api<{ videos: Vid[] }>('/api/meta/videos').then(d => setVids(d.videos)).catch(setErr);
  useEffect(() => { if (!ready) return; loadCamps(); loadVids(); api<{ audiences: Aud[] }>('/api/meta/audiences').then(d => setAuds(d.audiences)).catch(setErr);
    (async () => { const out: Local[] = []; for (const k of await idbKeys('render:').catch(() => [] as string[])) { const v = await idbGet<{ blob: Blob; meta: SavedRender }>(k); if (v && v.meta.format !== 'png') out.push({ ...v.meta, blob: v.blob, url: URL.createObjectURL(v.blob) }); } setRenders(out.sort((x, y) => y.at.localeCompare(x.at))); })();
  }, [ready]);
  useEffect(() => { if (!sel || !ready) return; setIns(null); setRecs(null); api<{ total: Ins | null; daily: Ins[]; ads: Ins[] }>(`/api/meta/insights?id=${sel}&preset=${preset}`).then(setIns).catch(setErr); }, [sel, preset, ready]);

  const spec = useMemo(() => {
    if (!tg) return null; const L = tg.locations.filter(l => l.on !== false && l.match).map(l => l.match!);
    const geo: Record<string, unknown> = {}; const c = L.filter(l => l.type === 'country').map(l => l.key); const ci = L.filter(l => l.type === 'city').map(l => ({ key: l.key })); const r = L.filter(l => l.type === 'region').map(l => ({ key: l.key }));
    if (c.length) geo.countries = c; if (ci.length) geo.cities = ci; if (r.length) geo.regions = r; if (!c.length && !ci.length && !r.length) return null;
    const ints = tg.interests.filter(i => i.on !== false && i.match).map(i => ({ id: i.match!.id, name: i.match!.name }));
    const demos = tg.demographics.filter(d => d.on !== false && d.match).reduce<Record<string, { id: string; name: string }[]>>((m, d) => ({ ...m, [d.match!.type]: [...(m[d.match!.type] ?? []), { id: d.match!.id, name: d.match!.name }] }), {});
    return { geo_locations: geo, age_min: tg.ageMin, age_max: tg.ageMax, ...(tg.genders.length ? { genders: tg.genders } : {}), publisher_platforms: ['facebook', 'instagram'],
      flexible_spec: [...(ints.length ? [{ interests: ints }] : []), ...(Object.keys(demos).length ? [demos] : [])], ...(useAud.length ? { custom_audiences: useAud.map(id => ({ id })) } : {}) };
  }, [tg, useAud]);
  const estimate = (s = spec) => s && run('est', () => api<Est>('/api/meta/estimate', { targeting: s, optimizationGoal: GOAL[f.objective] }).then(setEst));
  const build = () => run('ai', async () => { const t = await api<Targeting>('/api/meta/targeting', { product, markets }); setTg(t); setEst(null); toast('Targeting resolved against Meta'); });
  useEffect(() => { if (spec) { const id = setTimeout(() => estimate(spec), 500); return () => clearTimeout(id); } }, [spec, f.objective]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (k: 'interests' | 'locations' | 'demographics', i: number) => setTg(t => t && ({ ...t, [k]: t[k].map((x, j) => j === i ? { ...x, on: x.on === false } : x) }));
  const search = () => run('search', async () => setFound((await api<{ results: (Interest & Geo & Demo)[] }>(`/api/meta/search?kind=${qKind}&q=${encodeURIComponent(q)}`)).results.slice(0, 8)));
  const add = (x: Interest & Geo & Demo) => setTg(t => { const base: Targeting = t ?? { plan: { summary: '', rationale: [], lookalikeSeed: '' }, ageMin: 18, ageMax: 65, genders: [], interests: [], locations: [], demographics: [] };
    const k = qKind === 'location' ? 'locations' : qKind === 'interest' ? 'interests' : 'demographics'; return { ...base, [k]: [...base[k], { query: x.name, match: qKind === 'interest' ? { ...x, type: undefined } : x }] } as Targeting; });
  const makeLal = () => run('lal', async () => { const r = await api<{ id: string; note: string }>('/api/meta/audiences', { kind: 'lookalike', originId: lal.seed, country: lal.country, ratio: lal.ratio / 100 }); toast(r.note); const d = await api<{ audiences: Aud[] }>('/api/meta/audiences'); setAuds(d.audiences); setUseAud(u => [...u, r.id]); });
  const upload = (r: Local) => run(`up:${r.id}`, async () => { const d = await postFile<{ id: string }>('/api/meta/videos', new File([r.blob], r.name, { type: r.blob.type }), { name: r.project }, { cloud: store.mode === 'cloud' });
    toast(`Uploaded to ${a?.selected?.adAccountName}`); setVideo(d.id); await loadVids(); });
  const create = () => run('create', async () => { if (!spec) throw new Error('Build or add targeting with at least one location first.');
    const r = await api<{ campaignId: string }>('/api/meta/campaigns', { name: f.name, objective: f.objective, optimizationGoal: GOAL[f.objective], targeting: spec, dailyBudget: f.daily, startTime: new Date(f.start).toISOString(), endTime: f.end ? new Date(f.end).toISOString() : undefined, videoId: video, link: f.link, message: f.message, headline: f.headline, cta: f.cta });
    toast('Campaign, ad set and ad created PAUSED'); await loadCamps(); setSel(r.campaignId); document.getElementById('meta-camps')?.scrollIntoView({ behavior: 'smooth' }); });
  const setStatus = (c: Camp, action: 'launch' | 'resume' | 'pause') => run(`st:${c.id}`, async () => { await api(`/api/meta/campaigns/${c.id}`, { action, ...(action === 'pause' ? {} : { confirm: 'LAUNCH' }) }); toast(action === 'pause' ? `${c.name} paused` : `${c.name} is live`); setLaunch(null); setAck(false); await loadCamps(); });
  const recommend = () => run('rec', async () => setRecs(await api('/api/meta/recommend', { campaignId: sel, targetCpa: Number(targetCpa) || undefined })));

  if (!a) return accErr ? <ErrorNote error={accErr} /> : <p className="muted"><span className="spin" /> Checking your Meta connection…</p>;
  if (!ready) return <div className="meta-gate panel"><span className="meta-glyph lg" aria-hidden>∞</span><div><span className="kicker">AI CMO · Paid social</span><h2 className="h2">Run Meta ads from here</h2>
    <p className="muted">Audience targeting resolved against Meta&apos;s own targeting search, reach estimates, Ad Studio videos as creatives, and campaigns that are always created paused until you confirm launch.</p>
    {!a.configured ? <p className="small">Missing on the server: {a.missing.map(k => <code key={k} className="envk">{k}</code>)}</p> : <p className="small">{a.connected ? 'Connected. Pick an ad account and Page to continue.' : 'Connect your Meta business account to continue.'}</p>}
    <button className="btn primary" onClick={() => go('integrations')}><Icon name="plug" />{a.configured ? 'Open Integrations → Meta Ads' : 'See setup in Integrations'}</button></div></div>;

  const c = camps?.find(x => x.id === sel); const t = ins?.total; const maxSpend = Math.max(1, ...(ins?.daily ?? []).map(d => d.spend));
  const days = f.end ? Math.max(1, Math.ceil((new Date(f.end).getTime() - new Date(f.start).getTime()) / 864e5)) : null;
  return <div className="meta">
    <div className="meta-bar"><div><span className="kicker">AI CMO · Meta Ads</span><b>{a.selected?.adAccountName}</b><span className="small muted">{a.selected?.adAccountId} · {cur} · runs as {a.selected?.pageName ?? 'no Page selected'}</span></div>
      <span className="meta-safe"><Icon name="lock" size={12} />Everything is created paused. Spend starts only after you confirm Launch.</span></div>
    <ErrorNote error={err} onClose={() => setErr(null)} />
    <div className="meta-flow">
      <section className="panel meta-step"><header><span className="meta-n">1</span><h3>Audience</h3>{est && <span className="meta-reach"><b>{big(est.mauLower)}–{big(est.mauUpper)}</b> monthly reach{est.dau ? ` · ~${big(est.dau)}/day` : ''}{!est.ready && ' · still estimating'}</span>}</header>
        <label className="label">What you&apos;re promoting<textarea className="input" rows={4} value={product} onChange={e => setProduct(e.target.value)} placeholder="Product, who it's for, what it costs, the URL…" /></label>
        <div className="row" style={{ marginTop: 10 }}><input className="input sm" style={{ flex: 1 }} value={markets} onChange={e => setMarkets(e.target.value)} placeholder="Markets (optional): US, UK, Toronto" />
          <button className="btn primary sm" disabled={!!busy || product.length < 20} onClick={build}>{busy === 'ai' ? <span className="spin" /> : <Icon name="spark" />}Build targeting</button></div>
        {tg && <div className="meta-tg">
          {tg.plan.summary && <p className="meta-why">{tg.plan.summary}</p>}
          <div className="meta-grp"><span>Locations</span><div>{tg.locations.map((l, i) => <button key={i} className={`tchip ${l.match ? (l.on === false ? 'off' : '') : 'miss'}`} disabled={!l.match} onClick={() => toggle('locations', i)} title={l.match ? `${l.match.type} · key ${l.match.key}` : 'Meta returned no match; not used'}>{l.match ? l.match.name : l.query}{l.match && <em>{l.match.type}</em>}</button>)}</div></div>
          <div className="meta-grp"><span>Interests</span><div>{tg.interests.map((x, i) => <button key={i} className={`tchip ${x.match ? (x.on === false ? 'off' : '') : 'miss'}`} disabled={!x.match} onClick={() => toggle('interests', i)} title={x.match ? `id ${x.match.id}${x.match.path ? ` · ${x.match.path.join(' › ')}` : ''}` : `"${x.query}" not found at Meta; dropped`}>{x.match?.name ?? x.query}{x.match && <em>{big(x.match.audience_size_lower_bound)}–{big(x.match.audience_size_upper_bound)}</em>}</button>)}</div></div>
          {!!tg.demographics.length && <div className="meta-grp"><span>Demographics</span><div>{tg.demographics.map((x, i) => <button key={i} className={`tchip ${x.match ? (x.on === false ? 'off' : '') : 'miss'}`} disabled={!x.match} onClick={() => toggle('demographics', i)}>{x.match?.name ?? x.query}{x.match && <em>{x.match.type.replace(/_/g, ' ')}</em>}</button>)}</div></div>}
          <div className="meta-grp"><span>Age &amp; gender</span><div className="row"><input className="input sm num" aria-label="Minimum age" type="number" min={18} max={65} value={tg.ageMin} onChange={e => setTg({ ...tg, ageMin: +e.target.value })} />–<input className="input sm num" aria-label="Maximum age" type="number" min={18} max={65} value={tg.ageMax} onChange={e => setTg({ ...tg, ageMax: +e.target.value })} />
            <div className="seg">{[['All', []], ['Men', [1]], ['Women', [2]]].map(([l, g]) => <button key={l as string} className={JSON.stringify(tg.genders) === JSON.stringify(g) ? 'on' : ''} onClick={() => setTg({ ...tg, genders: g as number[] })}>{l as string}</button>)}</div></div></div>
          {!!tg.plan.rationale.length && <ul className="meta-rat">{tg.plan.rationale.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          <p className="small muted">Gray dashed chips are suggestions Meta could not resolve; they are not sent. Sizes are Meta&apos;s own audience_size bounds.</p>
        </div>}
        <div className="meta-add"><div className="seg">{[['interest', 'Interest'], ['location', 'Location'], ['demographic', 'Demographic'], ['behavior', 'Behavior']].map(([k, l]) => <button key={k} className={qKind === k ? 'on' : ''} onClick={() => setQKind(k)}>{l}</button>)}</div>
          <div className="row"><input className="input sm" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="Search Meta targeting…" /><button className="btn sm" disabled={!!busy} onClick={search}>Search</button></div>
          {!!found.length && <div className="meta-found">{found.map(x => <button key={x.id ?? x.key} onClick={() => { add(x); setFound([]); setQ(''); }}><b>{x.name}</b><span>{x.type ?? ''}{x.country_name ? ` · ${x.country_name}` : ''}{x.audience_size_upper_bound ? ` · ${big(x.audience_size_lower_bound)}–${big(x.audience_size_upper_bound)}` : ''}</span><Icon name="plus" size={13} /></button>)}</div>}</div>
        <details className="meta-auds" open={!!auds.length}><summary>Custom &amp; lookalike audiences <span className="chip">{auds.length}</span></summary>
          {auds.map(x => <label key={x.id} className="meta-aud"><input type="checkbox" checked={useAud.includes(x.id)} onChange={e => setUseAud(u => e.target.checked ? [...u, x.id] : u.filter(i => i !== x.id))} /><span><b>{x.name}</b><em>{x.subtype.toLowerCase()} · {x.approximate_count_lower_bound ? `${big(x.approximate_count_lower_bound)}–${big(x.approximate_count_upper_bound)}` : x.operation_status?.description ?? 'size pending'}</em></span></label>)}
          {!auds.length && <p className="small muted">No custom audiences on this ad account yet. Create a customer list or website audience in Ads Manager, then seed a lookalike here.</p>}
          {auds.some(x => x.subtype !== 'LOOKALIKE') && <div className="row meta-lal"><select className="input sm" aria-label="Lookalike seed audience" value={lal.seed} onChange={e => setLal({ ...lal, seed: e.target.value })}><option value="">Seed audience…</option>{auds.filter(x => x.subtype !== 'LOOKALIKE').map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <input className="input sm num" aria-label="Lookalike country code" value={lal.country} maxLength={2} onChange={e => setLal({ ...lal, country: e.target.value.toUpperCase() })} /><select className="input sm" aria-label="Lookalike size" value={lal.ratio} onChange={e => setLal({ ...lal, ratio: +e.target.value })}>{[1, 2, 3, 5, 10].map(r => <option key={r} value={r}>{r}%</option>)}</select>
            <button className="btn sm" disabled={!lal.seed || !!busy} onClick={makeLal}>Create lookalike</button></div>}</details>
      </section>

      <section className="panel meta-step"><header><span className="meta-n">2</span><h3>Creative</h3><span className="small muted">From Ad Studio</span></header>
        {!!renders.length && <><span className="label">Rendered in this browser</span><div className="meta-renders">{renders.slice(0, 6).map(r => { const up = vids.find(v => v.title === r.project); return <div key={r.id} className="meta-render"><video src={r.url} muted playsInline preload="metadata" /><div><b>{r.project}</b><span className="small muted">{r.width}×{r.height} · {r.duration.toFixed(0)}s · {(r.size / 1e6).toFixed(1)} MB</span></div>
          {up ? <span className="chip good">in account</span> : <button className="btn sm" disabled={!!busy} onClick={() => upload(r)}>{busy === `up:${r.id}` ? <span className="spin" /> : <Icon name="upload" size={13} />}Upload</button>}</div>; })}</div></>}
        {!renders.length && <p className="small muted">No Ad Studio renders in this browser. <button className="plain" onClick={() => go('ads')}>Make a UGC or motion-graphics video →</button></p>}
        <span className="label">Ad account video library</span>
        <div className="meta-vids">{vids.map(v => <button key={v.id} className={`meta-vid ${video === v.id ? 'on' : ''}`} onClick={() => setVideo(v.id)}>{v.picture ? <img src={v.picture} alt="" /> : <span className="ph"><Icon name="film" /></span>}<b>{v.title}</b><em>{v.length ? `${Math.round(v.length)}s · ` : ''}{v.status}</em>{video === v.id && <i><Icon name="check" size={12} /></i>}</button>)}
          {!vids.length && <p className="small muted">Nothing uploaded to this ad account yet.</p>}</div>
        <label className="label">Primary text<textarea className="input" rows={3} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} maxLength={2000} /></label>
        <div className="two"><label className="label">Headline<input className="input" value={f.headline} onChange={e => setF({ ...f, headline: e.target.value })} maxLength={255} /></label>
          <label className="label">Button<select className="input" value={f.cta} onChange={e => setF({ ...f, cta: e.target.value })}>{CTA.map(x => <option key={x} value={x}>{x.replace(/_/g, ' ').toLowerCase()}</option>)}</select></label></div>
        <label className="label">Landing page<input className="input" value={f.link} onChange={e => setF({ ...f, link: e.target.value })} placeholder="https://" /></label>
      </section>

      <section className="panel meta-step"><header><span className="meta-n">3</span><h3>Budget &amp; schedule</h3></header>
        <label className="label">Campaign name<input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <span className="label">Objective</span><div className="seg wide">{OBJ.map(([k, l]) => <button key={k} className={f.objective === k ? 'on' : ''} onClick={() => setF({ ...f, objective: k })}>{l}</button>)}</div>
        <p className="small muted">Optimizes for {GOAL[f.objective].replace(/_/g, ' ').toLowerCase()}.</p>
        <label className="label">Daily budget ({cur})<input className="input" type="number" min={1} value={f.daily} onChange={e => setF({ ...f, daily: +e.target.value })} /></label>
        <div className="meta-when"><label className="label">Start<input className="input" type="datetime-local" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></label><label className="label">End<input className="input" type="datetime-local" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label></div>
        <div className="meta-sum"><div><span>Max spend</span><b>{days ? `${cur} ${n(f.daily * days)}` : 'Ongoing'}</b><em>{days ? `${days} days × ${n(f.daily)}` : `${n(f.daily)}/day until paused`}</em></div><div><span>Reach</span><b>{est ? `${big(est.mauLower)}–${big(est.mauUpper)}` : '–'}</b><em>{busy === 'est' ? 'estimating…' : 'delivery_estimate'}</em></div></div>
        <button className="btn primary wide" disabled={!!busy || !spec || !video || !f.link || !f.message} onClick={create}>{busy === 'create' ? <span className="spin" /> : <Icon name="plus" />}Create paused campaign</button>
        <p className="small muted center">{!spec ? 'Needs targeting with a location' : !video ? 'Pick a video from the ad account' : 'Creates campaign → ad set → creative → ad, all PAUSED.'}</p>
      </section>
    </div>

    <section className="panel meta-camps" id="meta-camps"><header className="row between"><div><h3>Campaigns</h3><span className="small muted">Last 7 days, live from the Marketing API</span></div><button className="btn ghost sm" onClick={loadCamps}><Icon name="refresh" size={13} />Refresh</button></header>
      {!camps ? <p className="muted"><span className="spin" /> Loading…</p> : !camps.length ? <p className="small muted">No campaigns on this ad account yet.</p> :
        <div className="table"><div className="tr th meta-row"><span>Campaign</span><span>Status</span><span>Budget</span><span>Spend</span><span>Reach</span><span>CTR</span><span>CPA</span><span /></div>
          {camps.map(x => <div key={x.id} className={`tr meta-row ${sel === x.id ? 'sel' : ''}`} onClick={() => setSel(x.id)}><span><b>{x.name}</b><em>{x.objective.replace('OUTCOME_', '').toLowerCase()}{x.start ? ` · ${new Date(x.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${x.end ? `–${new Date(x.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}` : ''}</em></span>
            <span><i className={`st ${x.effective === 'ACTIVE' ? 'on' : x.effective.includes('PAUSED') ? 'pz' : 'rv'}`}>{x.effective.replace(/_/g, ' ').toLowerCase()}</i></span>
            <span>{x.dailyBudget ? `${n(x.dailyBudget)}/day` : x.lifetimeBudget ? `${n(x.lifetimeBudget)} total` : '–'}</span><span>{x.insights ? n(x.insights.spend, 2) : '–'}</span><span>{x.insights ? big(x.insights.reach) : '–'}</span><span>{x.insights ? `${x.insights.ctr.toFixed(2)}%` : '–'}</span><span>{x.insights?.cpa ? n(x.insights.cpa, 2) : '–'}</span>
            <span onClick={e => e.stopPropagation()}>{x.status === 'ACTIVE' ? <button className="btn ghost sm" disabled={!!busy} onClick={() => setStatus(x, 'pause')}>Pause</button> : <button className="btn sm launch" disabled={!!busy} onClick={() => { setAck(false); setLaunch(x); }}>{x.insights ? 'Resume…' : 'Launch…'}</button>}</span></div>)}</div>}
      {c && <div className="meta-detail"><div className="row between"><h4>{c.name}</h4><div className="seg">{[['today', 'Today'], ['last_7d', '7 days'], ['last_30d', '30 days'], ['maximum', 'Lifetime']].map(([k, l]) => <button key={k} className={preset === k ? 'on' : ''} onClick={() => setPreset(k)}>{l}</button>)}</div></div>
        {!ins ? <p className="muted"><span className="spin" /> Pulling insights…</p> : !t ? <p className="small muted">No delivery in this period{c.effective !== 'ACTIVE' ? ' (the campaign is not active)' : ''}.</p> : <>
          <div className="kpis"><div><span>Spend</span><b>{n(t.spend, 2)}</b></div><div><span>Reach</span><b>{big(t.reach)}</b></div><div><span>Impressions</span><b>{big(t.impressions)}</b></div><div><span>CTR</span><b>{t.ctr.toFixed(2)}%</b></div><div><span>CPA · {t.resultType.replace(/_/g, ' ')}</span><b>{t.cpa ? n(t.cpa, 2) : '–'}</b></div><div><span>Frequency</span><b>{t.frequency.toFixed(1)}</b></div></div>
          {ins.daily.length > 1 && <div className="meta-spark" aria-label="Daily spend">{ins.daily.map(d => <div key={d.date} title={`${d.date}: ${n(d.spend, 2)} ${cur}`}><i style={{ height: `${Math.max(3, d.spend / maxSpend * 100)}%` }} /><span>{d.date?.slice(8)}</span></div>)}</div>}
          {!!ins.ads.length && <div className="table small"><div className="tr th meta-adrow"><span>Ad</span><span>Spend</span><span>CTR</span><span>Results</span><span>CPA</span></div>{ins.ads.map(d => <div key={d.adName} className="tr meta-adrow"><span>{d.adName}</span><span>{n(d.spend, 2)}</span><span>{d.ctr.toFixed(2)}%</span><span>{n(d.results)}</span><span>{d.cpa ? n(d.cpa, 2) : '–'}</span></div>)}</div>}</>}
        <div className="meta-recs"><div className="row"><b>Optimize with the AI CMO</b><input className="input sm num" style={{ width: 120 }} value={targetCpa} onChange={e => setTargetCpa(e.target.value)} placeholder={`Target CPA ${cur}`} /><button className="btn sm" disabled={!!busy} onClick={recommend}>{busy === 'rec' ? <span className="spin" /> : <Icon name="spark" size={13} />}Recommend</button></div>
          {recs && <><ol>{recs.recommendations.map((r, i) => <li key={i} className={`rec ${r.impact}`}><span className="chip">{r.kind}</span><div><b>{r.title}</b><p className="small">{r.why}</p><p className="small"><strong>Do:</strong> {r.action}</p></div><em>{r.impact}</em></li>)}</ol>
            <p className="small muted">{recs.source === 'ai' ? 'Written by the AI CMO from the insights above.' : 'Rule-based from the insights above.'} Advice only; nothing is changed at Meta until you act.</p></>}</div>
      </div>}
    </section>

    {launch && <div className="modal-bg" role="dialog" aria-modal onClick={() => setLaunch(null)}><div className="modal meta-launch" onClick={e => e.stopPropagation()}>
      <span className="kicker">Confirm spend</span><h2 className="h2">{launch.insights ? 'Resume' : 'Launch'} “{launch.name}”?</h2>
      <p className="muted">This sets the campaign{launch.insights ? '' : ', its ad sets and ads'} to <b>ACTIVE</b> at Meta. Real money is charged to the ad account’s payment method.</p>
      <dl><dt>Ad account</dt><dd>{a.selected?.adAccountName}</dd><dt>Budget</dt><dd>{launch.dailyBudget ? `${cur} ${n(launch.dailyBudget)} per day` : launch.lifetimeBudget ? `${cur} ${n(launch.lifetimeBudget)} lifetime` : '–'}</dd>
        <dt>Schedule</dt><dd>{launch.start ? new Date(launch.start).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Now'} → {launch.end ? new Date(launch.end).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'until paused'}</dd>
        {launch.dailyBudget && launch.start && launch.end && <><dt>Max spend</dt><dd>{cur} {n(launch.dailyBudget * Math.ceil((new Date(launch.end).getTime() - new Date(launch.start).getTime()) / 864e5))}</dd></>}</dl>
      <label className="meta-ack"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />I understand this starts spending real money. Meta reviews new ads first.</label>
      <div className="row between"><button className="btn ghost" onClick={() => setLaunch(null)}>Keep paused</button><button className="btn primary launch" disabled={!ack || !!busy} onClick={() => setStatus(launch, launch.insights ? 'resume' : 'launch')}>{busy ? <span className="spin" /> : <Icon name="bolt" />}{launch.insights ? 'Resume' : 'Launch'} &amp; start spending</button></div>
    </div></div>}
  </div>;
}
