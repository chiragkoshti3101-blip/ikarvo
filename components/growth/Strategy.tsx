'use client';
import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { useWs, ErrorNote, Acts } from '../ws';
import { fixPagePrompt, routeTask } from './actions';
import { briefFor } from './useBrand';
import { api, download } from '@/lib/client/api';
import { useBrand, type Brand, type BrandDocs } from './useBrand';
import type { Check } from './types';

type AuditRes = { url: string; score: number; checks: Check[]; page: { title: string; description: string; h1: string[]; text: string; wordCount: number } };

function toMarkdown(b: Brand) {
  const d = b.docs; if (!d) return '';
  return `# ${d.product.name}: strategy brief\nSource: ${b.url}\n\n## Product\n${d.product.oneLiner}\n\n${d.product.whatItDoes}\n\n${d.product.features.map(f => `- ${f}`).join('\n')}\n\nPricing seen: ${d.product.pricingSeen}\n
## Positioning\n${d.positioning.statement}\n\n### Ideal customers\n${d.positioning.icp.map(i => `- **${i.segment}**: ${i.pain} (trigger: ${i.trigger})`).join('\n')}\n\n### Messaging pillars\n${d.positioning.messagingPillars.map(p => `- **${p.pillar}**: ${p.proof}`).join('\n')}\n\n### Objections\n${d.positioning.objections.map(o => `- *${o.objection}*: ${o.answer}`).join('\n')}\n
## Competitors\n${d.competitors.map(c => `- **${c.name}**: ${c.angle}. We differ: ${c.howWeDiffer}`).join('\n')}\n\n## Brand voice\nTraits: ${d.voice.traits.join(', ')}\n\nDo:\n${d.voice.do.map(x => `- ${x}`).join('\n')}\n\nDon't:\n${d.voice.dont.map(x => `- ${x}`).join('\n')}\n\n> ${d.voice.sampleLine}\n
## Keywords\n| Keyword | Intent | Why |\n|---|---|---|\n${d.keywords.map(k => `| ${k.keyword} | ${k.intent} | ${k.why} |`).join('\n')}\n\n## 30-day plan\n${d.plan.map(w => `### Week ${w.week}: ${w.focus}\n${w.actions.map(a => `- [ ] (${a.channel}, ${a.effort}) ${a.task}`).join('\n')}`).join('\n\n')}\n`;
}

export default function Strategy() {
  const { toast, status, act } = useWs(); const { brand, save, loading } = useBrand();
  const [url, setUrl] = useState(''); const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(''); const [error, setError] = useState<unknown>(null);
  useEffect(() => { if (brand) { setUrl(brand.url); setNotes(brand.notes); } }, [brand]);

  async function audit() {
    setBusy('audit'); setError(null);
    try { const a = await api<AuditRes>('/api/growth/audit', { url }); await save({ ...(brand ?? {}), url: a.url, notes, audit: { score: a.score, checks: a.checks, page: a.page, at: new Date().toISOString() } }, a.page.title || a.url); toast(`Audit complete · score ${a.score}`); }
    catch (e) { setError(e); } finally { setBusy(''); }
  }
  async function write() {
    if (!brand?.audit) return; setBusy('brief'); setError(null);
    try { const r = await api<{ result: BrandDocs }>('/api/growth/brief', { url: brand.url, title: brand.audit.page.title, description: brand.audit.page.description, pageText: brand.audit.page.text, notes }); await save({ ...brand, notes, docs: r.result, done: [] }); toast('Strategy brief written'); }
    catch (e) { setError(e); } finally { setBusy(''); }
  }
  const toggle = (key: string) => brand && save({ ...brand, done: brand.done?.includes(key) ? brand.done.filter(k => k !== key) : [...(brand.done ?? []), key] });
  const d = brand?.docs; const a = brand?.audit;
  const fails = a?.checks.filter(c => c.status !== 'pass') ?? [];

  return <div className="growth">
    <section className="panel">
      <div className="row between"><h2 className="h2">Website</h2>{a && <span className="small muted">Last audit {new Date(a.at).toLocaleString('en-US')}</span>}</div>
      <div className="url-row"><input className="input" placeholder="yourproduct.com" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && url && audit()} />
        <button className="btn primary" disabled={!url || !!busy} onClick={audit}>{busy === 'audit' ? <><span className="spin" />Reading site…</> : a ? 'Re-audit' : 'Analyze site'}</button></div>
      <label className="label">Notes for the strategist (optional)<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Who it's for, pricing, what makes it different, what you've tried…" /></label>
      <ErrorNote error={error} onClose={() => setError(null)} />
      {loading ? null : !a ? <p className="small muted">The audit fetches your page plus robots.txt, sitemap.xml and llms.txt, then scores search and AI-assistant readiness. It needs no API key.</p> : <>
        <div className="audit-head"><div className={`score s${a.score >= 80 ? 'hi' : a.score >= 55 ? 'mid' : 'lo'}`}><b>{a.score}</b><span>/100</span></div>
          <div><h3>{a.page.title || brand?.url}</h3><p className="small muted">{a.page.description || 'No meta description'} · {a.page.wordCount} words · {fails.length} issues</p></div></div>
        <ul className="checks">{[...a.checks].sort((x, y) => ['fail', 'warn', 'pass'].indexOf(x.status) - ['fail', 'warn', 'pass'].indexOf(y.status)).map(c => <li key={c.id} className={c.status}><i />{c.label}<span className="small muted">{c.detail}</span></li>)}</ul>
        {fails.length > 0 && <div className="nextbar"><span>Fix it</span><Acts items={[
          ['Fix these in Build Studio', () => act({ kind: 'build', title: `${a.page.title || 'Homepage'} (fixed)`.slice(0, 60), prompt: fixPagePrompt({ url: brand!.url, title: a.page.title, description: a.page.description, h1: a.page.h1, text: a.page.text, issues: fails.map(c => ({ severity: c.status, message: `${c.label}: ${c.detail}` })), brief: briefFor(brand) }), from: 'Site audit' })],
          ['Open SEO fix PR', () => act({ kind: 'tab', tab: 'crawl', from: 'Site audit' })]]} /></div>}
        <button className="btn primary wide" disabled={!!busy} onClick={write}>{busy === 'brief' ? <><span className="spin" />Writing strategy brief…</> : d ? 'Rewrite strategy brief' : 'Write strategy brief'}</button>
        {!status.ai.ok && <p className="small muted">The brief (product, positioning, competitors, voice, keywords, 30-day plan) needs <code>AI_API_KEY</code>.</p>}
      </>}
    </section>

    <section className="docs">
      {!d ? <div className="blank"><h3>One brief, every channel</h3><p>Analyze your site, then write the brief. Posts, articles, community replies and AI-visibility checks all read from it, so the messaging stays consistent.</p></div> : <>
        <div className="row between"><div><span className="kicker">Strategy brief</span><h2 className="display doc-title">{d.product.name}</h2><p className="muted">{d.product.oneLiner}</p></div>
          <button className="btn sm" onClick={() => brand && download(`${d.product.name.toLowerCase().replace(/\W+/g, '-')}-brief.md`, toMarkdown(brand), 'text/markdown')}><Icon name="download" />Export .md</button></div>
        <div className="doc-grid">
          <article className="card doc-card"><span className="label">Positioning</span><p className="lead">{d.positioning.statement}</p>{d.positioning.icp.map(i => <p key={i.segment} className="small"><b>{i.segment}.</b> {i.pain} <span className="muted">Trigger: {i.trigger}</span></p>)}</article>
          <article className="card doc-card"><span className="label">Messaging pillars</span>{d.positioning.messagingPillars.map(p => <p key={p.pillar} className="small"><b>{p.pillar}.</b> {p.proof}</p>)}<span className="label">Objections</span>{d.positioning.objections.map(o => <p key={o.objection} className="small"><em>“{o.objection}”</em> {o.answer}</p>)}</article>
          <article className="card doc-card"><span className="label">Competitors</span>{d.competitors.map(c => <div key={c.name}><p className="small"><b>{c.name}</b> · {c.angle}<br /><span className="muted">{c.howWeDiffer}</span></p><Acts items={[['Track & beat', () => act({ kind: 'tab', tab: 'competitors', from: 'Strategy brief' })]]} /></div>)}</article>
          <article className="card doc-card"><span className="label">Voice</span><div className="chips">{d.voice.traits.map(t => <span key={t} className="chip">{t}</span>)}</div><p className="small"><b>Do:</b> {d.voice.do.join(' · ')}</p><p className="small"><b>Don&apos;t:</b> {d.voice.dont.join(' · ')}</p><p className="quote small">{d.voice.sampleLine}</p></article>
          <article className="card doc-card wide-card"><span className="label">Keyword opportunities</span><div className="kw">{d.keywords.map(k => <div key={k.keyword}><b>{k.keyword}</b><span className="chip">{k.intent}</span><span className="small muted">{k.why}</span><Acts items={[['Write article', () => act({ kind: 'article', topic: k.keyword, from: 'Keyword opportunities' })]]} /></div>)}</div></article>
          <article className="card doc-card wide-card"><div className="row between"><span className="label">30-day plan</span><span className="small muted">{brand?.done?.length ?? 0}/{d.plan.reduce((n, w) => n + w.actions.length, 0)} done</span></div>
            <div className="weeks">{d.plan.map(w => <div key={w.week}><b>Week {w.week}</b><p className="small muted">{w.focus}</p>{w.actions.map((x, i) => { const key = `${w.week}-${i}`; return <label key={key} className={`task ${brand?.done?.includes(key) ? 'done' : ''}`}><input type="checkbox" checked={!!brand?.done?.includes(key)} onChange={() => toggle(key)} /><span><span className="chip">{x.channel}</span> {x.task} <span className="muted">· {x.effort}</span> <button className="btn act sm" onClick={e => { e.preventDefault(); act(routeTask(x.channel, x.task, `30-day plan, week ${w.week}`)); }}>Do it →</button></span></label>; })}</div>)}</div></article>
        </div></>}
    </section>
  </div>;
}
