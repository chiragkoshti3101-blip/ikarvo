'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Icon from './Icon';
import { useWs, ErrorNote, Acts } from './ws';
import { api, download, fmtDate } from '@/lib/client/api';
import type { Doc } from '@/lib/client/store';
import { STARTER_HTML } from '@/lib/client/templates';
import { TIERS, TIER_INFO, isTier, type Tier } from '@/lib/tiers';
import { ACCEPT, readText } from '@/lib/client/extract';
import { previewDoc, mobileDoc, withShim, zip, type AppFile, type Kind } from '@/lib/appfiles';
import BuildIntake from './BuildIntake';
import { INTAKE_DEFAULTS, normalizeIntake, type Intake } from '@/lib/intake';

/** Project types: each one changes the prompt template on the server and the preview here. */
const TYPES: Record<Kind, { label: string; icon: string; hint: string; placeholder: string; chips: { title: string; prompt: string }[] }> = {
  web: { label: 'Web app', icon: 'globe', hint: 'Full-stack Next.js project', placeholder: 'Build me a SaaS app for freelancers to track invoices and get paid…',
    chips: [{ title: 'SaaS dashboard', prompt: 'A SaaS dashboard for a small coffee-bean store: sign-in screen, KPI cards, revenue chart, sortable orders table with a date filter, and an /api/orders route backed by a JSON store.' },
      { title: 'Team task board', prompt: 'A kanban task board for small teams: boards, drag-free move buttons between columns, assignees, due dates, and API routes to create and update tasks.' },
      { title: 'Booking system', prompt: 'A booking app for a one-person yoga studio: weekly schedule, class detail drawer, booking form with validation, an admin list of bookings and API routes for both.' }] },
  mobile: { label: 'Mobile app', icon: 'phone', hint: 'Expo / React Native app', placeholder: 'Build me a mobile app that helps runners plan their weekly training…',
    chips: [{ title: 'Habit tracker', prompt: 'A habit tracker mobile app: today list with tap-to-complete habits, streak counters, a weekly progress screen and an add-habit form, with a bottom tab bar.' },
      { title: 'Expense splitter', prompt: 'A mobile app to split trip expenses with friends: trips list, add expense sheet, balances screen showing who owes whom.' },
      { title: 'Recipe finder', prompt: 'A recipe app: searchable recipe list with categories, recipe detail with ingredients checklist and step-by-step cooking mode, and favourites tab.' }] },
  site: { label: 'Website', icon: 'laptop', hint: 'Static multi-page site', placeholder: 'Build me a marketing website for a boutique architecture studio…',
    chips: [{ title: 'Product launch site', prompt: 'A marketing site for "Ledgerly", bookkeeping for freelancers: home with hero and features, pricing page with monthly/yearly toggle, about page and a contact page with a validated form.' },
      { title: 'Restaurant', prompt: 'A website for a neighbourhood Italian restaurant: home, menu page with sections, about the chef, and a reservations page with a form.' },
      { title: 'Portfolio', prompt: 'A portfolio site for a product designer: home with selected work grid, case-study page, about page and contact page. Editorial typography.' }] },
};
const kindOf = (x: { kind?: Kind; files?: AppFile[] }): Kind => x.kind ?? 'site';
const previewFor = (k: Kind, files: AppFile[]) => k === 'mobile' ? mobileDoc(files) : k === 'web' ? previewDoc(files, files.some(f => f.path === 'preview.html') ? 'preview.html' : 'index.html') : previewDoc(files);
type Speech = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e?: { error?: string }) => void) | null };

/** A version is one generation: the instruction that produced it plus the full output, so any point can be restored. */
type Version = { at: string; prompt: string; html: string; files?: AppFile[]; model?: string; kind?: Kind };
type Project = { prompt: string; html: string; files?: AppFile[]; model?: string; kind?: Kind; repo?: string; deployUrl?: string; versions?: Version[] };
const MAX_VERSIONS = 15;
const nameFrom = (p: string) => { const first = (p.split(/[.:!?\n]/)[0] || '').replace(/^(please\s+)?(build|create|make|design)\s+(me\s+)?/i, '').replace(/^(an?|the)\s+/i, '').trim();
  const words = first.split(/\s+/); let out = ''; for (const w of words) { if ((out + ' ' + w).trim().length > 36) break; out = (out + ' ' + w).trim(); }
  out = out.replace(/["'“”,;:\s]+$/, '').replace(/\s+(with|and|for|of|to|in|a|an|the)$/i, '').replace(/["'“”]/g, ''); return out ? out[0].toUpperCase() + out.slice(1) : 'Untitled'; };
const ago = (iso: string) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : fmtDate(iso); };


function tree(files: AppFile[]) { const g: Record<string, AppFile[]> = {}; for (const f of files) { const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''; (g[d] ??= []).push(f); } return Object.entries(g).sort(([a], [b]) => a.localeCompare(b)); }

export default function BuildStudio() {
  const { store, toast, status, pendingProject, clearPending, handoff, take, act, openProject } = useWs();
  const [from, setFrom] = useState(''); const auto = useRef(false);
  const [id, setId] = useState<string | undefined>(); const [title, setTitle] = useState('');
  const [p, setP] = useState<Project>({ prompt: '', html: '' }); const [draft, setDraft] = useState('');
  const [tab, setTab] = useState<'preview' | 'code'>('preview'); const [device, setDevice] = useState<'desktop' | 'tablet' | 'phone'>('desktop');
  const [pane, setPane] = useState<'chat' | 'preview'>('chat');
  const [busy, setBusy] = useState(''); const [phase, setPhase] = useState(0); const [error, setError] = useState<unknown>(null);
  const [repo, setRepo] = useState(''); const [kind, setKind] = useState<Kind>('web'); const [webOn, setWebOn] = useState(false); const [tier, setTierS] = useState<Tier>('pro'); const [tierOpen, setTierOpen] = useState(false); const tierRef = useRef<HTMLSpanElement>(null);   const [opts, setOpts] = useState(false); const [listening, setListening] = useState(false); const [canTalk, setCanTalk] = useState(false); const [autoDecide, setAutoDecide] = useState(false); const rec = useRef<Speech | null>(null); const optRef = useRef<HTMLSpanElement>(null); const [page, setPage] = useState('index.html'); const [file, setFile] = useState('index.html');
  const [ship, setShip] = useState(false); const [viewing, setViewing] = useState<number | null>(null); const [nonce, setNonce] = useState(0);
  const [recent, setRecent] = useState<Doc<Project>[]>([]);
  const [intake, setIntakeS] = useState<Intake>(INTAKE_DEFAULTS);
  const log = useRef<HTMLDivElement>(null);

  const versions = p.versions ?? []; const live = viewing != null ? versions[viewing] : null;
  const html = live ? live.html : p.html; const files = live ? live.files : p.files;
  const liveKind: Kind = live ? kindOf(live) : kindOf(p);
  const pages = files && liveKind === 'site' ? files.filter(f => f.path.endsWith('.html')).map(f => f.path) : [];
  const srcDoc = files ? (liveKind === 'site' ? previewDoc(files, page) : html) : withShim(html); const shown = files?.find(f => f.path === file) ?? files?.[0];
  const code = files ? shown?.content ?? '' : html; const started = !!p.html || busy === 'generate';

  useEffect(() => { const on = (e: MessageEvent) => { const d = e.data as { ikarvoPage?: string }; if (d?.ikarvoPage && files?.some(f => f.path === d.ikarvoPage)) setPage(d.ikarvoPage); }; window.addEventListener('message', on); return () => window.removeEventListener('message', on); }, [files]);
  useEffect(() => { const w = window as unknown as Record<string, unknown>; setCanTalk(!!(w.SpeechRecognition || w.webkitSpeechRecognition)); }, []);
  const PHASES = TIER_INFO[tier].steps;
  const setTier = (t: Tier) => { setTierS(t); setTierOpen(false); try { localStorage.setItem('ikarvo:tier', t); } catch {} toast(`${TIER_INFO[t].label}: ${TIER_INFO[t].desc}`); };
  useEffect(() => { try { const t = localStorage.getItem('ikarvo:tier'); if (isTier(t)) setTierS(t); } catch {} }, []);
  useEffect(() => { try { const s = localStorage.getItem('ikarvo:intake'); if (s) setIntakeS(normalizeIntake(JSON.parse(s))); } catch {} }, []);
  const setIntake = (i: Intake) => { setIntakeS(i); try { localStorage.setItem('ikarvo:intake', JSON.stringify(i)); } catch {} };
  useEffect(() => { if (!tierOpen) return; const off = (e: Event) => { if (!tierRef.current?.contains(e.target as Node)) setTierOpen(false); }; const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setTierOpen(false); };
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc); return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); }; }, [tierOpen]);
  useEffect(() => { if (!opts) return; const off = (e: Event) => { if (!optRef.current?.contains(e.target as Node)) setOpts(false); }; const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpts(false); };
    document.addEventListener('pointerdown', off); document.addEventListener('keydown', esc); return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); }; }, [opts]);
  useEffect(() => { store.list<Project>('projects').then(setRecent).catch(() => {}); }, [store, id]);
  useEffect(() => { if (!pendingProject) return;
    store.list<Project>('projects').then(all => { const d = all.find(x => x.id === pendingProject); if (d) load(d); clearPending(); });
  }, [pendingProject, store, clearPending]);
  useEffect(() => { if (handoff?.kind !== 'build') return; const h = take('build'); if (!h) return;
    setId(undefined); setTitle(h.title ?? ''); setP({ prompt: '', html: '' }); setDraft(h.prompt.slice(0, 6000)); setFrom(h.from); setError(null); auto.current = !!h.autorun && status.ai.ok; }, [handoff, take, status.ai.ok]);
  useEffect(() => { if (auto.current && draft && !p.html && !busy) { auto.current = false; generate(); } });
  useEffect(() => { if (busy !== 'generate') return; setPhase(0); const t = window.setInterval(() => setPhase(x => Math.min(TIER_INFO[tier].steps.length - 1, x + 1)), TIER_INFO[tier].stepMs); return () => clearInterval(t); }, [busy, tier]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [versions.length, busy]);

  function load(d: Doc<Project>) { const v = d.data.versions ?? (d.data.html ? [{ at: d.updated_at, prompt: d.data.prompt, html: d.data.html, files: d.data.files, model: d.data.model, kind: d.data.kind }] : []);
    setId(d.id); setTitle(d.title); setP({ ...d.data, versions: v }); setRepo(d.data.repo ?? ''); setKind(d.data.files ? kindOf(d.data) : 'web'); setPage('index.html'); setFile('index.html'); setViewing(null); setDraft(''); setError(null); }
  async function persist(next: Project, t = title || nameFrom(next.prompt)) {
    try { const d = await store.save('projects', { id, title: t, data: next }); setId(d.id); setTitle(d.title); } catch (e) { setError(e); }
  }
  async function generate() {
    const ask = (draft.trim() + (autoDecide ? '\n\n[Choose as per you: Ikarvo, make all remaining product, design, architecture and feature decisions autonomously and record them in the build.]' : '')).trim(); if (ask.length < 4) return;
    setBusy('generate'); setError(null); setViewing(null); setPane('preview');
    try {
      let out: Pick<Project, 'html' | 'files' | 'model' | 'kind'>;
      { const same = !!p.files && kindOf(p) === kind;
        const r = await api<{ files: AppFile[]; model: string }>('/api/generate', { prompt: ask, kind, web: webOn, tier, intake, previousFiles: same ? p.files : undefined });
        out = { files: r.files, html: previewFor(kind, r.files), model: r.model, kind }; if (!r.files.some(f => f.path === page)) setPage('index.html'); if (!r.files.some(f => f.path === file)) setFile('index.html'); }
      const v: Version = { at: new Date().toISOString(), prompt: ask, ...out };
      const next: Project = { ...p, ...out, prompt: p.prompt || ask, versions: [...versions, v].slice(-MAX_VERSIONS) };
      setP(next); setDraft(''); setTab('preview'); await persist(next, title || nameFrom(next.prompt)); toast(`Version ${next.versions!.length} built with ${out.model}`);
    } catch (e) { setError(e); setPane('chat'); } finally { setBusy(''); }
  }
  async function restore(i: number) { const v = versions[i]; const next: Project = { ...p, html: v.html, files: v.files, model: v.model, versions: [...versions, { ...v, at: new Date().toISOString(), prompt: `Restored version ${i + 1}` }].slice(-MAX_VERSIONS) };
    setP(next); setViewing(null); setKind(v.files ? kindOf(v) : kind); await persist(next); toast(`Restored version ${i + 1}`); }
  async function useStarter() { const v: Version = { at: new Date().toISOString(), prompt: 'Starter: Fieldnote habit journal (hand-written template, no AI)', html: STARTER_HTML, model: 'template' };
    const next: Project = { prompt: v.prompt, html: STARTER_HTML, versions: [v] }; setId(undefined); setP(next); await persist(next, 'Fieldnote (starter)'); toast('Starter template loaded'); }
  async function push() { setBusy('github'); setError(null);
    try { const r = await api<{ repoUrl: string }>('/api/github/push', { repo: repo || title, ...(p.files ? { files: p.files } : { html: p.html }), message: `Update: ${(versions.at(-1)?.prompt ?? p.prompt).slice(0, 60)}` }); await persist({ ...p, repo: repo || title }); toast('Pushed to GitHub'); window.open(r.repoUrl, '_blank'); }
    catch (e) { setError(e); } finally { setBusy(''); } }
  async function deploy() { setBusy('vercel'); setError(null);
    try { const r = await api<{ url: string }>('/api/vercel/deploy', { name: repo || title, ...(p.files ? { files: p.files } : { html: p.html }) }); const next = { ...p, deployUrl: r.url }; setP(next); await persist(next); toast('Deployment created'); }
    catch (e) { setError(e); } finally { setBusy(''); } }
  const exportIt = () => { const slug = (title || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-'); if (files) download(`${slug}.zip`, zip(files), 'application/zip'); else download(`${slug}.html`, html, 'text/html'); };
  const openTab = () => { const w = window.open('', '_blank'); if (w) { w.document.open(); w.document.write(srcDoc); w.document.close(); } };
  const reset = () => { setId(undefined); setTitle(''); setP({ prompt: '', html: '' }); setDraft(''); setError(null); setPage('index.html'); setFile('index.html'); setViewing(null); setFrom(''); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } };
  const model = status.ai.ok ? (status.ai.note ?? '').replace(/^Model: /, '').split(' via ')[0] : 'AI not configured';

  function talk() {
    if (listening) { rec.current?.stop(); return; }
    const w = window as unknown as Record<string, new () => Speech>; const C = w.SpeechRecognition || w.webkitSpeechRecognition; if (!C) return;
    const r = new C(); r.lang = navigator.language || 'en-US'; r.interimResults = false; r.continuous = false; const base = draft;
    r.onresult = e => { const t = Array.from(e.results).map(x => x[0].transcript).join(' '); setDraft(`${base}${base && !/\s$/.test(base) ? ' ' : ''}${t}`.slice(0, 6000)); };
    r.onend = () => setListening(false);
    r.onerror = (e?: { error?: string }) => { setListening(false); const c = e?.error;
      toast(c === 'not-allowed' || c === 'service-not-allowed' ? 'Microphone or Speech Recognition is blocked. Allow it in your browser settings (iPhone: Settings → Safari → Microphone, and turn on Siri & Dictation).' : c === 'no-speech' ? 'Didn’t hear anything. Tap the mic and speak again.' : c === 'network' ? 'Speech recognition needs a network connection.' : 'Dictation stopped. Try again.', 'err'); };
    rec.current = r; try { r.start(); setListening(true); toast('Listening… tap the mic again to stop'); } catch { setListening(false); toast('Dictation could not start in this browser.', 'err'); }
  }
  async function attach(f?: File) { if (!f) return;
    try { const t = await readText(f); setDraft(d => `${d}${d ? '\n\n' : ''}Context from ${f.name}:\n${t}`.slice(0, 6000)); toast(`${f.name} attached`); } catch (e) { toast(e instanceof Error ? e.message : String(e), 'err'); } }
  const T = TYPES[kind];
  const decideRow = <div className="b-decide"><button className={`b-chip ${autoDecide ? 'on' : ''}`} aria-pressed={autoDecide} title="Ikarvo picks the remaining product, design and architecture decisions" onClick={() => { const v = !autoDecide; setAutoDecide(v); toast(v ? 'Choose as per you: Ikarvo decides the remaining product and design calls' : 'Ikarvo now follows only what you describe'); }}>Choose as per you<Icon name={autoDecide ? 'check' : 'spark'} size={13} /></button><span className="small muted">Let Ikarvo make all remaining decisions.</span></div>;
  const typePicker = <div className="b-types" role="radiogroup" aria-label="Project type">{(Object.keys(TYPES) as Kind[]).map(k => <button key={k} role="radio" aria-checked={kind === k} aria-label={TYPES[k].label} title={`${TYPES[k].label}: ${TYPES[k].hint}`} className={kind === k ? 'on' : ''} disabled={!!busy} onClick={() => setKind(k)}><Icon name={TYPES[k].icon} size={15} />{kind === k && <span>{TYPES[k].label}</span>}</button>)}</div>;

  const composer = (big?: boolean) => <div className={`b-composer ${big ? 'big' : ''}`}>
    <label className="sr-only" htmlFor={big ? 'b-prompt-home' : 'b-prompt'}>{p.html ? 'What should change?' : `Describe the ${T.label.toLowerCase()} to build`}</label>
    <textarea id={big ? 'b-prompt-home' : 'b-prompt'} rows={big ? 4 : 3} value={draft} maxLength={6000} onKeyDown={onKey} onChange={e => setDraft(e.target.value)}
      placeholder={p.html ? 'Ask for a change: “make the pricing cards dark and add an annual toggle”' : T.placeholder} />
    <div className="b-composer-bar">
      <label className="b-ib" title="Attach a brief (PDF, DOCX, text)" aria-label="Attach a file"><Icon name="clip" size={16} /><input type="file" hidden accept={ACCEPT} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; attach(f); }} /></label>
      <span className="b-tierwrap" ref={tierRef}><button className="b-agent" aria-haspopup="listbox" aria-expanded={tierOpen} aria-label={`Power: ${TIER_INFO[tier].label}`} onClick={() => setTierOpen(!tierOpen)}><Icon name={TIER_INFO[tier].icon} size={13} />{TIER_INFO[tier].label}<Icon name="chevron-down" size={12} /></button>
        {tierOpen && <div className="b-tiers" role="listbox" aria-label="Power tier">{TIERS.map(t => { const x = TIER_INFO[t]; return <button key={t} role="option" aria-selected={tier === t} className={tier === t ? 'on' : ''} onClick={() => setTier(t)}>
          <span className="b-tier-ic"><Icon name={x.icon} size={15} /></span><span className="b-tier-tx"><b>{x.label}<i className="b-badge">{x.badge}</i></b><small>{x.desc}</small></span>{tier === t && <Icon name="check" size={14} />}</button>; })}</div>}</span>
      <button className={`b-ib b-toggle ${webOn ? 'on' : ''}`} aria-pressed={webOn} title={webOn ? 'Web photos: on' : 'Web photos: off'} aria-label={`Web photos ${webOn ? 'on' : 'off'}`} onClick={() => { const v = !webOn; setWebOn(v); toast(v ? 'Web on: builds can use real photos from Unsplash' : 'Web off: no external photos'); }}><Icon name="globe" size={15} /><span className="hide-sm">Web</span>{webOn && <i className="b-dot" aria-hidden />}</button>
      <span className="b-optwrap" ref={optRef}><button className="b-ib" aria-label="Build settings" aria-expanded={opts} onClick={() => setOpts(!opts)}><Icon name="sliders" size={16} /></button>
        {opts && <div className="b-opts" role="dialog" aria-label="Build settings"><b className="small">{T.label}</b><p className="small muted">{T.hint}. Model: {model}.</p><p className="small muted">Web photos: {webOn ? 'on' : 'off'} · Power: {TIER_INFO[tier].label} ({TIER_INFO[tier].steps.length - 1} step{TIER_INFO[tier].steps.length > 2 ? 's' : ''})</p><p className="small muted">{draft.length}/6000 characters · <kbd>⌘</kbd><kbd>↵</kbd> to send</p></div>}</span>
      <span className="grow" />
      <button className={`b-ib ${listening ? 'rec' : ''}`} title={canTalk ? (listening ? 'Listening… tap to stop' : 'Dictate') : 'Dictation isn’t supported in this browser'} aria-label={listening ? 'Stop dictation' : 'Dictate'} aria-pressed={listening} onClick={() => canTalk ? talk() : toast('Dictation isn’t supported in this browser. On iPhone, use the keyboard’s mic key instead.', 'err')}><Icon name="mic" size={16} />{listening && <span className="hide-sm">Listening…</span>}</button>
      <button className="b-send" aria-label={p.html ? 'Apply change' : `Build ${T.label.toLowerCase()}`} disabled={!!busy || draft.trim().length < 4 || !status.ai.ok} onClick={generate}>{busy === 'generate' ? <span className="spin" /> : <Icon name="arrow" />}</button>
    </div></div>;

  if (!started) return <div className="page b-home">
    <div className="b-home-hero">
      <span className="kicker">Build</span>
      <h1>What will you build today?</h1>
      <p className="muted">Describe it in plain words. Ikarvo writes a working app you can refine by chat, preview on any device, push to GitHub and deploy to Vercel.</p>
      {from && <div className="nextbar"><span>From {from}</span><p className="small muted">The brief is prefilled. Review it, then build.</p></div>}
      {typePicker}
      {decideRow}
      {composer(true)}
      <BuildIntake intake={intake} onChange={setIntake} githubOk={status.github.ok} />
      <ErrorNote error={error} onClose={() => setError(null)} />
      {!status.ai.ok && <p className="small muted">No AI key on this server (needs <code>AI_API_KEY</code>). <button className="link" onClick={useStarter}>Open the hand-written starter</button> to try preview, export and deploy.</p>}
      <div className="b-chips" aria-label="Starting points">{T.chips.map(s => <button key={s.title} className="b-chip" onClick={() => setDraft(s.prompt)}><Icon name="spark" size={13} />{s.title}</button>)}</div>
      <ol className="b-steps"><li><b>1</b>Describe</li><li><b>2</b>Refine by chat</li><li><b>3</b>Ship to GitHub &amp; Vercel</li></ol>
    </div>
    {!!recent.length && <section className="b-recent"><div className="row between"><h2 className="h2">Recent projects</h2><span className="small muted">{recent.length} total</span></div>
      <div className="b-recent-grid">{recent.slice(0, 6).map(r => <button key={r.id} className="b-card" onClick={() => openProject(r.id)}>
        <div className="b-thumb" aria-hidden><iframe tabIndex={-1} title="" sandbox="" srcDoc={r.data.html} loading="lazy" /></div>
        <b>{r.title}</b><span className="small muted">{(r.data.versions?.length ?? 1)} version{(r.data.versions?.length ?? 1) === 1 ? '' : 's'} · {r.data.files ? `${TYPES[kindOf(r.data)].label} · ${r.data.files.length} files` : 'HTML page'} · {ago(r.updated_at)}</span>
        {r.data.deployUrl && <span className="chip good">Live</span>}</button>)}</div></section>}
  </div>;

  return <div className="b-ws" data-pane={pane}>
    <header className="b-top">
      <button className="btn ghost sm" onClick={reset} aria-label="New project"><Icon name="plus" /><span className="hide-sm">New</span></button>
      <div className="b-title"><b>{title || 'Untitled app'}</b><span className="small muted">{versions.length ? `v${versions.length}` : ''}{p.model ? ` · ${p.model}` : ''}{files ? ` · ${files.length} files` : ''}</span></div>
      <div className="seg sm b-panes" role="tablist" aria-label="Panel">{(['chat', 'preview'] as const).map(k => <button key={k} role="tab" aria-selected={pane === k} className={pane === k ? 'on' : ''} onClick={() => setPane(k)}>{k === 'chat' ? 'Chat' : 'Preview'}</button>)}</div>
      <span className="grow" />
      <button className="btn ghost sm" disabled={!html} onClick={exportIt}><Icon name="download" /><span className="hide-sm">{files ? 'Export .zip' : 'Export'}</span></button>
      <div className="b-ship"><button className="btn primary sm" aria-expanded={ship} onClick={() => setShip(!ship)}><Icon name="triangle" />Deploy<Icon name="chevron-down" size={14} /></button>
        {ship && <div className="b-pop" role="dialog" aria-label="Deploy and share">
          <h3>Ship this app</h3>
          <label className="label">Repository name<input className="input" value={repo} onChange={e => setRepo(e.target.value)} placeholder={title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'my-app'} /></label>
          <button className="btn wide" disabled={!!busy || !status.github.ok} onClick={push} title={status.github.ok ? '' : `Needs ${status.github.missing.join(', ')}`}><Icon name="github" />{busy === 'github' ? 'Pushing…' : 'Push to GitHub'}</button>
          <button className="btn wide" disabled={!!busy || !status.vercel.ok} onClick={deploy} title={status.vercel.ok ? '' : `Needs ${status.vercel.missing.join(', ')}`}><Icon name="triangle" />{busy === 'vercel' ? 'Deploying…' : 'Deploy to Vercel'}</button>
          {(!status.github.ok || !status.vercel.ok) && <p className="small muted">{!status.github.ok && <>GitHub needs {status.github.missing.join(', ')}. </>}{!status.vercel.ok && <>Vercel needs {status.vercel.missing.join(', ')}.</>}</p>}
          {p.deployUrl ? <div className="b-live"><span className="chip good">Live</span><a className="link small" href={p.deployUrl} target="_blank" rel="noreferrer">{p.deployUrl.replace(/^https?:\/\//, '')}</a>
            <button className="btn ghost sm icon" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(p.deployUrl!); toast('Link copied'); }}><Icon name="copy" /></button></div>
            : <p className="small muted">Deploying gives you a public URL to share.</p>}
          <div className="divider" /><span className="label">Promote it</span>
          <Acts items={[['Make an ad', () => act({ kind: 'ad', product: `${title}: ${p.prompt.slice(0, 300)}`, angle: 'Launch announcement', from: 'Build Studio' })],
            ['Plan launch', () => act({ kind: 'campaign', goal: `Launch ${title}${p.deployUrl ? ` (live at ${p.deployUrl})` : ''}`, product: p.prompt.slice(0, 500), from: 'Build Studio', autorun: true })],
            ['Announce', () => act({ kind: 'post', text: `Just shipped: ${title}.${p.deployUrl ? ` ${p.deployUrl}` : ''}`, from: 'Build Studio' })]]} />
        </div>}</div>
    </header>

    <div className="b-split">
      <section className="b-chat" aria-label="Build chat">
        <div className="b-log" ref={log}>
          {versions.map((v, i) => <div key={v.at + i} className="b-turn">
            <div className="b-msg me"><p>{v.prompt}</p></div>
            <div className={`b-msg ai ${viewing === i ? 'on' : ''}`}>
              <div className="row between"><b className="small">Version {i + 1}</b><span className="small muted">{ago(v.at)}</span></div>
              <p className="small muted">{v.files ? `${v.files.length} files: ${v.files.slice(0, 4).map(f => f.path).join(', ')}${v.files.length > 4 ? '…' : ''}` : `HTML page · ${(v.html.length / 1024).toFixed(1)} KB`} · {v.model}</p>
              <div className="row">{i === versions.length - 1 && viewing == null ? <span className="chip good">Current</span>
                : <><button className="btn ghost sm" onClick={() => { setViewing(viewing === i ? null : i); setPane('preview'); }}>{viewing === i ? 'Back to current' : 'Preview'}</button><button className="btn ghost sm" onClick={() => restore(i)}>Restore</button></>}</div>
            </div></div>)}
          {busy === 'generate' && <div className="b-turn"><div className="b-msg me"><p>{draft}</p></div>
            <div className="b-msg ai working" role="status"><ul className="b-phases">{PHASES.map((ph, i) => <li key={ph} className={i < phase ? 'done' : i === phase ? 'now' : ''}>{i < phase ? <Icon name="check" size={13} /> : i === phase ? <span className="spin" /> : <i />}{ph}</li>)}</ul><span className="small muted">{TIER_INFO[tier].label} · {tier === 'fast' ? 'usually 15–40 seconds' : tier === 'pro' ? 'usually 40–90 seconds' : 'usually 1–3 minutes'}</span></div></div>}
          {from && <div className="nextbar"><span>From {from}</span><p className="small muted">Push or deploy from the Deploy menu to ship the fix.</p></div>}
        </div>
        <ErrorNote error={error} onClose={() => setError(null)} />
        {p.html && (!p.files || kindOf(p) !== kind) && <p className="small muted b-note">Next run rebuilds this as a {TYPES[kind].label.toLowerCase()} ({TYPES[kind].hint}).</p>}
        {typePicker}
        {decideRow}
        <BuildIntake intake={intake} onChange={setIntake} githubOk={status.github.ok} />
        {composer()}
      </section>

      <section className="b-stage" aria-label="Preview and code">
        <div className="b-bar">
          <div className="seg sm" role="tablist" aria-label="View">{(['preview', 'code'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'preview' ? 'Preview' : 'Code'}</button>)}</div>
          {tab === 'preview' && <div className="b-url"><span className="dot" aria-hidden />{pages.length > 1 ? <select aria-label="Page" value={page} onChange={e => setPage(e.target.value)}>{pages.map(pg => <option key={pg}>{pg}</option>)}</select> : <span>/{page === 'index.html' ? '' : page}</span>}
            <button className="btn ghost sm icon" aria-label="Reload preview" onClick={() => setNonce(n => n + 1)}><Icon name="play" size={14} /></button></div>}
          <span className="grow" />
          {tab === 'preview' && !(liveKind === 'mobile' && files) && <div className="seg sm" role="group" aria-label="Device">{(['desktop', 'tablet', 'phone'] as const).map(d => <button key={d} aria-label={d} aria-pressed={device === d} title={d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}><Icon name={d === 'desktop' ? 'monitor' : d} /></button>)}</div>}
          <button className="btn ghost sm icon" aria-label="Open preview in a new tab" disabled={!html} onClick={openTab}><Icon name="arrow" /></button>
          <button className="btn ghost sm icon" aria-label="Copy code" disabled={!html} onClick={() => { navigator.clipboard.writeText(code); toast(files ? `${shown?.path} copied` : 'HTML copied'); }}><Icon name="copy" /></button>
        </div>
        {live && <div className="b-banner small">Viewing version {viewing! + 1} of {versions.length}. <button className="link" onClick={() => restore(viewing!)}>Restore it</button> or <button className="link" onClick={() => setViewing(null)}>back to current</button>.</div>}
        <div className={`b-canvas ${liveKind === 'mobile' && files ? 'phone mobile' : device} ${tab}`}>
          {!html ? <div className="b-skel" aria-hidden><span className="sk" style={{ height: 44 }} /><span className="sk" style={{ height: 220 }} /><div className="b-skel-row"><span className="sk" /><span className="sk" /><span className="sk" /></div></div>
            : tab === 'preview' ? <div className="b-frame"><iframe key={page + nonce + (viewing ?? '')} title="App preview" sandbox="allow-scripts allow-forms allow-modals" srcDoc={srcDoc} /></div>
            : <div className="b-code">{files && <nav className="b-tree" aria-label="Files">{tree(files).map(([dir, fs]) => <div key={dir}>{dir && <span className="b-dir"><Icon name="folder" size={13} />{dir}</span>}
                {fs.map(f => <button key={f.path} className={f.path === shown?.path ? 'on' : ''} onClick={() => setFile(f.path)} style={{ paddingLeft: dir ? 26 : 10 }}><span>{f.path.split('/').pop()}</span><i>{(f.content.length / 1024).toFixed(1)}K</i></button>)}</div>)}</nav>}
              <pre className="code" aria-label={shown?.path ?? 'index.html'}><code>{code.split('\n').map((l, i) => <span key={i} className="ln"><em>{i + 1}</em>{l}{'\n'}</span>)}</code></pre></div>}
          {busy === 'generate' && <div className="veil" role="status"><p>{PHASES[phase]}…</p><span className="gen-bar"><i /></span></div>}
        </div>
      </section>
    </div>
  </div>;
}
