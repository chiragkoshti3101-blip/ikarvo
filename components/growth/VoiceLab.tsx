'use client';
import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { useWs, ErrorNote, Acts } from '../ws';
import { api } from '@/lib/client/api';
import { useBrand, briefFor } from './useBrand';

type Metrics = { words: number; sentences: number; avgSentence: number; longSentences: number; readingEase: number; exclamations: number; passiveHints: number; cliches: string[]; emoji: number };
type VoiceAi = { score: number; verdict: string; issues: { quote: string; problem: string; fix: string }[]; rewrite: string };
type Variant = { headline: string; subhead: string; angle: string; hypothesis: string };

export default function VoiceLab() {
  const { toast, status, act } = useWs(); const { brand } = useBrand();
  const [text, setText] = useState(''); const [traits, setTraits] = useState(''); const [dont, setDont] = useState('');
  const [v, setV] = useState<{ metrics: Metrics; ai: VoiceAi | null; aiError: string | null } | null>(null);
  const [headline, setHeadline] = useState(''); const [placement, setPlacement] = useState('Landing page hero'); const [variants, setVariants] = useState<{ variants: Variant[]; metric: string; notes: string } | null>(null);
  const [busy, setBusy] = useState(''); const [error, setError] = useState<unknown>(null);
  useEffect(() => { const d = brand?.docs; if (d && !traits) { setTraits(d.voice.traits.join(', ')); setDont(d.voice.dont.join('\n')); setHeadline(d.product.oneLiner); } }, [brand, traits]);
  async function check() { setBusy('voice'); setError(null); try { setV(await api('/api/growth/voice', { text, traits, do: brand?.docs?.voice.do.join('; ') ?? '', dont: dont.split('\n').filter(Boolean) })); } catch (e) { setError(e); } finally { setBusy(''); } }
  async function ab() { setBusy('ab'); setError(null); try { const r = await api<{ result: { variants: Variant[]; metric: string; notes: string } }>('/api/growth/headlines', { headline, placement, brief: briefFor(brand) }); setVariants(r.result); } catch (e) { setError(e); } finally { setBusy(''); } }
  const m = v?.metrics; const ease = m ? (m.readingEase >= 60 ? 'Easy' : m.readingEase >= 40 ? 'Fairly hard' : 'Hard') : '';
  return <div className="growth">
    <section className="panel">
      <h2 className="h2">Brand-voice check</h2>
      <p className="small muted">Readability, sentence length, clichés and your own banned phrases are checked locally (no key). With <code>AI_API_KEY</code> you also get a voice score with quoted fixes and a rewrite.</p>
      <label className="label">Voice traits<input className="input" value={traits} onChange={e => setTraits(e.target.value)} placeholder="Plain-spoken, specific, dry humor" /></label>
      <label className="label">Never say (one per line)<textarea rows={3} value={dont} onChange={e => setDont(e.target.value)} /></label>
      <label className="label">Copy to check<textarea rows={7} value={text} onChange={e => setText(e.target.value)} placeholder="Paste a post, email, landing section…" /></label>
      <button className="btn primary wide" disabled={!!busy || text.trim().length < 20} onClick={check}>{busy === 'voice' ? <><span className="spin" />Checking…</> : 'Check voice'}</button>
      <div className="divider" />
      <h2 className="h2">A/B headline variants</h2>
      <label className="label">Current headline<input className="input" value={headline} onChange={e => setHeadline(e.target.value)} /></label>
      <label className="label">Placement<input className="input" value={placement} onChange={e => setPlacement(e.target.value)} /></label>
      <button className="btn wide" disabled={!!busy || headline.trim().length < 4} onClick={ab}>{busy === 'ab' ? <><span className="spin" />Writing variants…</> : 'Write 6 test variants'}</button>
      {!status.ai.ok && <p className="small muted">Variants need <code>AI_API_KEY</code>.</p>}
      <ErrorNote error={error} onClose={() => setError(null)} />
    </section>
    <section className="docs">
      {!v && !variants && <div className="blank"><h3>Sound like one company everywhere</h3><p>Check any copy against your voice, then generate headline variants that each test one hypothesis.</p></div>}
      {m && <article className="card"><h3>Voice report</h3><div className="stats">
        <div className="stat"><span className="small muted">Reading ease</span><b>{m.readingEase}</b><span className="small">{ease}</span></div>
        <div className="stat"><span className="small muted">Avg sentence</span><b>{m.avgSentence}</b><span className="small">{m.longSentences} over 28 words</span></div>
        <div className="stat"><span className="small muted">Clichés</span><b>{m.cliches.length}</b><span className="small">{m.exclamations} “!” · {m.emoji} emoji</span></div>
        {v?.ai && <div className="stat"><span className="small muted">Voice match</span><b>{v.ai.score}</b><span className="small">{v.ai.verdict}</span></div>}</div>
        {!!m.cliches.length && <div className="chips">{m.cliches.map(c => <span key={c} className="chip bad">{c}</span>)}</div>}
        {v?.aiError && <p className="small muted">{v.aiError}</p>}
        {v?.ai?.issues.map((i, k) => <div key={k} className="quote small"><b>“{i.quote}”</b><p>{i.problem}</p><p className="ok-text">→ {i.fix}</p></div>)}
        {v?.ai?.rewrite && <><span className="label">Rewrite</span><p className="pre">{v.ai.rewrite}</p><button className="btn ghost sm" onClick={() => { navigator.clipboard.writeText(v.ai!.rewrite); toast('Copied'); }}><Icon name="copy" />Copy</button><Acts items={[['Schedule the rewrite as a post', () => act({ kind: 'post', text: v.ai!.rewrite, from: 'Voice check' })]]} /></>}
      </article>}
      {variants && <article className="card spaced"><h3>Test plan</h3><p className="small muted">Primary metric: {variants.metric}. {variants.notes}</p>
        <div className="table">{variants.variants.map((x, i) => <div key={i} className="tr ab"><span className="chip">{String.fromCharCode(66 + i)}</span><span><b>{x.headline}</b><br /><span className="small muted">{x.subhead}</span></span><span className="small"><b>{x.angle}</b>: {x.hypothesis}<Acts items={[['Build variant page', () => act({ kind: 'build', title: `Variant ${String.fromCharCode(66 + i)}: ${x.angle}`, prompt: `A ${placement.toLowerCase()} test variant.\nHeadline: ${x.headline}\nSubhead: ${x.subhead}\nHypothesis: ${x.hypothesis}\nKeep everything else identical to the control so the test is clean.\n\nProduct:\n${briefFor(brand).slice(0, 1000)}`, from: 'A/B headlines' })], ['Ad with this hook', () => act({ kind: 'ad', angle: x.headline, from: 'A/B headlines' })]]} /></span></div>)}</div>
        <p className="small muted">A is your current headline. Run one variant at a time against A until each arm has enough traffic to decide.</p></article>}
    </section>
  </div>;
}
