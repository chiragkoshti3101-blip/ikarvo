'use client';
import { useEffect, useRef, useState } from 'react';
import { useWs, ErrorNote } from '../ws';
import { api, ApiError } from '@/lib/client/api';
import { briefFor, type Brand, type BrandDocs, type Competitor } from '../growth/useBrand';
import { cachedSettings, type Settings } from '@/lib/client/settings';

export type LogLine = { at: string; text: string; tone: 'run' | 'ok' | 'warn' | 'err' };
type Step = 'url' | 'run' | 'socials' | 'connect';
const now = () => new Date().toISOString();

/** First run: website → real audit, crawl, design signals, speed → AI brief, competitors, documents → socials → analytics. */
export default function Onboarding({ settings, saveSettings, onDone, addMode }: { settings: Settings; saveSettings: (s: Settings) => Promise<unknown>; onDone: () => void; addMode?: boolean }) {
  const { store, status } = useWs();
  const [step, setStep] = useState<Step>('url'); const [url, setUrl] = useState(''); const [log, setLog] = useState<LogLine[]>([]); const [error, setError] = useState<unknown>(null);
  const [x, setX] = useState(settings.company.x); const [li, setLi] = useState(settings.company.linkedin); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo({ top: 1e6 }); }, [log]);
  const say = (text: string, tone: LogLine['tone'] = 'run') => setLog(l => [...l, { at: now(), text, tone }]);
  const why = (e: unknown) => e instanceof ApiError ? `${e.message}${e.setup ? ` (needs ${e.setup.join(', ')})` : ''}` : e instanceof Error ? e.message : String(e);

  async function run() {
    setStep('run'); setError(null); setLog([]);
    let b: Brand = { url, notes: '' };
    if (addMode) localStorage.removeItem('ikarvo:activeBrand');
    let id: string | undefined; let name = '';
    const keep = async (next: Brand, title?: string) => { b = next; if (title) name = title; const d = await store.save<Brand>('brands', { id, title: name || next.url, data: next }); id = d.id; localStorage.setItem('ikarvo:activeBrand', d.id); };
    try {
      say(`Reading ${url} (page, robots.txt, sitemap.xml, llms.txt)…`);
      const a = await api<{ url: string; score: number; checks: Brand['audit'] extends infer T ? T extends { checks: infer C } ? C : never : never; page: NonNullable<Brand['audit']>['page'] }>('/api/growth/audit', { url });
      await keep({ ...b, url: a.url, audit: { score: a.score, checks: a.checks, page: a.page, at: now() } }, a.page.title || a.url);
      say(`Homepage readiness score ${a.score}/100 · ${a.checks.filter(c => c.status !== 'pass').length} issues · "${a.page.title}"`, 'ok');
    } catch (e) { say(`Could not read the site: ${why(e)}`, 'err'); setError(e); setStep('url'); return; }
    try { say('Crawling up to 5 pages from the sitemap…'); const c = await api<{ pages: unknown[]; score: number; discoveredBy: string }>('/api/growth/crawl', { url: b.url, maxPages: 5 }); await store.save('crawls', { title: b.url, data: c }); say(`Crawled ${c.pages.length} pages via ${c.discoveredBy} · site score ${c.score}`, 'ok'); }
    catch (e) { say(`Crawl skipped: ${why(e)}`, 'warn'); }
    try { say('Extracting colors, fonts and logo from the live site…'); const d = await api<{ colors: { hex: string }[]; fonts: string[] }>('/api/growth/design', { url: b.url }); await keep({ ...b, design: d }); say(`Design signals: ${d.colors.slice(0, 5).map(c => c.hex).join(' ')} · fonts ${d.fonts.slice(0, 3).join(', ') || 'none declared'}`, 'ok'); }
    catch (e) { say(`Design signals skipped: ${why(e)}`, 'warn'); }
    api<{ scores: Record<string, number | null>; at: string }>('/api/growth/pagespeed', { url: b.url }).then(async p => { await keep({ ...b, pagespeed: p }); window.dispatchEvent(new Event('ikarvo:brand')); }).catch(() => {});
    say('Lighthouse scores requested from PageSpeed Insights (runs in the background).');
    if (!status.ai.ok) { say('AI provider not configured: product info, strategy, competitors and documents need AI_API_KEY. Skipping to socials; you can generate them later from the Context panel.', 'warn'); setStep('socials'); return; }
    try { say('Writing product information, positioning, voice, keywords and a 30-day plan…'); const r = await api<{ result: BrandDocs }>('/api/growth/brief', { url: b.url, title: b.audit?.page.title, description: b.audit?.page.description, pageText: b.audit?.page.text, notes: '' }); await keep({ ...b, docs: r.result, done: [] }, r.result.product.name); say(`Product information + marketing strategy ready for ${r.result.product.name} (${r.result.product.category})`, 'ok');
      const s = cachedSettings(); if (!s.company.category) await saveSettings({ ...s, company: { ...s.company, category: r.result.product.category } }); }
    catch (e) { say(`Strategy brief failed: ${why(e)}`, 'err'); setStep('socials'); return; }
    try { say('Looking for competitors…'); const r = await api<{ competitors: Competitor[]; source: string; verified: boolean }>('/api/cmo/competitors', { name: b.docs!.product.name, category: b.docs!.product.category, domain: b.url, brief: briefFor(b) });
      await keep({ ...b, competitorsFound: r.competitors.map(c => ({ ...c, source: r.verified ? 'search' : 'AI suggestion (unverified)' })) }); say(`Found ${r.competitors.length} competitors (${r.verified ? 'from live search' : 'AI suggestions, unverified: add a search key to ground them'}): ${r.competitors.map(c => c.name).join(', ')}`, 'ok'); }
    catch (e) { say(`Competitor search failed: ${why(e)}`, 'warn'); }
    for (const [doc, label] of [['competitors', 'Competitor analysis'], ['content', 'Content strategy'], ['calendar', 'Content calendar'], ['design', 'Design guide']] as const) {
      try { say(`Writing ${label.toLowerCase()}…`); const r = await api<{ result: unknown }>('/api/cmo/docs', { doc, brief: briefFor(b), signals: doc === 'design' ? b.design : b.competitorsFound, instructions: cachedSettings().company.instructions, language: cachedSettings().personal.language });
        await keep({ ...b, extraDocs: { ...(b.extraDocs ?? {}), [doc]: { ...(r.result as object), at: now() } } }); say(`${label} ready`, 'ok'); }
      catch (e) { say(`${label} failed: ${why(e)}`, 'warn'); }
    }
    say('Context is ready. Add your social handles so agents can match your voice.', 'ok'); setStep('socials');
  }
  async function finishSocials(skip: boolean) { const s = cachedSettings(); const next = { ...s, company: { ...s.company, x: skip ? s.company.x : x.replace(/^@/, ''), linkedin: skip ? s.company.linkedin : li } }; await saveSettings(next); say(skip ? 'No handles added. Voice will come from your site copy.' : `Saved handles: ${[x && `@${x.replace(/^@/, '')}`, li].filter(Boolean).join(', ')}`, 'ok'); setStep('connect'); }
  async function finish() { const s = cachedSettings(); await saveSettings({ ...s, onboarded: true }); await store.save('logs', { title: `Onboarding ${url}`, data: { lines: log, at: now() } }); window.dispatchEvent(new Event('ikarvo:brand')); onDone(); }

  return <div className="onboard">
    <div className="onboard-card">
      <span className="kicker">{addMode ? 'Add a website' : 'Welcome to Ikarvo'}</span>
      {step === 'url' && <><h1 className="display">Start with your website.</h1><p className="muted">We read it the way a new marketing hire would: pages, speed, design, positioning, competitors. Then every agent works from what we learn. Nothing is published without your approval.</p>
        <form className="url-row" onSubmit={e => { e.preventDefault(); if (url.trim()) run(); }}><input className="input" autoFocus placeholder="yourproduct.com" value={url} onChange={e => setUrl(e.target.value)} /><button className="btn primary" disabled={!url.trim()}>Analyze</button></form>
        <ErrorNote error={error} onClose={() => setError(null)} />
        {!status.ai.ok && <p className="small muted">No AI key yet: the audit, crawl, design and speed checks still run for real. Documents need <code>AI_API_KEY</code>.</p>}</>}
      {step !== 'url' && <div className="agentlog" ref={box} data-tour="log">{log.map((l, i) => <div key={i} className={`ll ${l.tone}`}><span>{new Date(l.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>{l.text}</div>)}{step === 'run' && <div className="ll run"><span className="spin" />working…</div>}</div>}
      {step === 'socials' && <div className="stepbox"><h3>Your social accounts</h3><p className="small muted">Used to study your existing voice. We never post without approval; posting needs channel tokens in Integrations.</p>
        <div className="two"><label className="label">X handle<input className="input" placeholder="@yourbrand" value={x} onChange={e => setX(e.target.value)} /></label><label className="label">LinkedIn page<input className="input" placeholder="linkedin.com/company/yourbrand" value={li} onChange={e => setLi(e.target.value)} /></label></div>
        <div className="row"><button className="btn primary" onClick={() => finishSocials(false)}>Save & continue</button><button className="btn ghost" onClick={() => finishSocials(true)}>Do it later</button></div></div>}
      {step === 'connect' && <div className="stepbox"><h3>Connect your numbers (optional)</h3><p className="small muted">Search Console and GA4 feed the weekly report and the analytics view. Read-only.</p>
        {status.google.ok ? <a className="btn" href="/api/google/connect">Connect Google Search Console + GA4</a> : <ErrorNote error={Object.assign(new Error('Google OAuth is not configured on this server.'), { setup: status.google.missing })} />}
        <div className="row"><button className="btn primary" onClick={finish}>Open my dashboard</button></div></div>}
    </div>
  </div>;
}
