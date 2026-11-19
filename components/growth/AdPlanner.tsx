'use client';
import { useMemo, useState } from 'react';
import { download } from '@/lib/client/api';
/** Paid-acquisition budget planner. Pure arithmetic on your own assumptions: no AI, no credits, nothing invented. */
const PRESET: Record<string, { cpm: number; ctr: number; cvr: number }> = { Meta: { cpm: 12, ctr: 1.1, cvr: 3 }, TikTok: { cpm: 8, ctr: 0.9, cvr: 2 }, LinkedIn: { cpm: 40, ctr: 0.5, cvr: 4 }, 'Google Search': { cpm: 60, ctr: 4, cvr: 5 }, YouTube: { cpm: 9, ctr: 0.6, cvr: 1.5 } };
export default function AdPlanner() {
  const [budget, setBudget] = useState(1500); const [price, setPrice] = useState(29); const [trialToPaid, setTtp] = useState(15); const [months, setMonths] = useState(10); const [margin, setMargin] = useState(80);
  const [mix, setMix] = useState<Record<string, { on: boolean; share: number; cpm: number; ctr: number; cvr: number }>>(() => Object.fromEntries(Object.entries(PRESET).map(([k, p], i) => [k, { on: i < 2, share: i < 2 ? 50 : 0, ...p }])));
  const rows = useMemo(() => Object.entries(mix).filter(([, c]) => c.on && c.share > 0).map(([k, c]) => {
    const spend = budget * c.share / 100; const imps = spend / c.cpm * 1000; const clicks = imps * c.ctr / 100; const signups = clicks * c.cvr / 100; const paid = signups * trialToPaid / 100;
    return { k, spend, imps, clicks, cpc: clicks ? spend / clicks : 0, signups, cps: signups ? spend / signups : 0, paid, cac: paid ? spend / paid : 0 };
  }), [mix, budget, trialToPaid]);
  const t = rows.reduce((a, r) => ({ spend: a.spend + r.spend, clicks: a.clicks + r.clicks, signups: a.signups + r.signups, paid: a.paid + r.paid }), { spend: 0, clicks: 0, signups: 0, paid: 0 });
  const ltv = price * months * margin / 100; const cac = t.paid ? t.spend / t.paid : 0; const shares = Object.values(mix).filter(c => c.on).reduce((a, c) => a + c.share, 0);
  const n = (x: number, d = 0) => x.toLocaleString('en-US', { maximumFractionDigits: d }); const set = (k: string, f: string, v: number | boolean) => setMix(m => ({ ...m, [k]: { ...m[k], [f]: v } }));
  return <div className="growth">
    <section className="panel"><h2 className="h2">Ad budget planner</h2>
      <p className="small muted">Plan spend before you launch ads. Defaults are rough placeholders; replace them with your own numbers or last campaign&apos;s results.</p>
      <div className="two"><label className="label">Monthly budget ($)<input className="input" type="number" value={budget} onChange={e => setBudget(+e.target.value)} /></label><label className="label">Price / month ($)<input className="input" type="number" value={price} onChange={e => setPrice(+e.target.value)} /></label></div>
      <div className="two"><label className="label">Sign-up → paid (%)<input className="input" type="number" value={trialToPaid} onChange={e => setTtp(+e.target.value)} /></label><label className="label">Avg. months retained<input className="input" type="number" value={months} onChange={e => setMonths(+e.target.value)} /></label></div>
      <label className="label">Gross margin (%)<input className="input" type="number" value={margin} onChange={e => setMargin(+e.target.value)} /></label>
      <span className="label">Channels {shares !== 100 && <span className="err-text">· shares add to {shares}%</span>}</span>
      <div className="planner-mix">{Object.entries(mix).map(([k, c]) => <div key={k} className={`pm ${c.on ? '' : 'off'}`}><label className="row"><input type="checkbox" checked={c.on} onChange={e => set(k, 'on', e.target.checked)} /><b>{k}</b></label>
        {c.on && <div className="pm-grid">{(['share', 'cpm', 'ctr', 'cvr'] as const).map(f => <label key={f} className="small">{f === 'share' ? 'Share %' : f === 'cpm' ? 'CPM $' : f === 'ctr' ? 'CTR %' : 'Click→sign-up %'}<input className="input sm" type="number" step="0.1" value={c[f]} onChange={e => set(k, f, +e.target.value)} /></label>)}</div>}</div>)}</div>
    </section>
    <section className="docs">
      <div className="kpis"><div><span>Sign-ups</span><b>{n(t.signups)}</b></div><div><span>Paying customers</span><b>{n(t.paid, 1)}</b></div><div><span>Blended CAC</span><b>${n(cac)}</b></div><div><span>LTV (gross)</span><b>${n(ltv)}</b></div><div className={cac && ltv / cac >= 3 ? 'good' : 'bad'}><span>LTV : CAC</span><b>{cac ? n(ltv / cac, 1) : '–'}×</b></div><div><span>Payback</span><b>{cac && price ? n(cac / (price * margin / 100), 1) : '–'} mo</b></div></div>
      <div className="table"><div className="tr th planner"><span>Channel</span><span>Spend</span><span>Clicks</span><span>CPC</span><span>Sign-ups</span><span>Cost / sign-up</span><span>CAC</span></div>
        {rows.map(r => <div key={r.k} className="tr planner"><span>{r.k}</span><span>${n(r.spend)}</span><span>{n(r.clicks)}</span><span>${n(r.cpc, 2)}</span><span>{n(r.signups, 1)}</span><span>${n(r.cps)}</span><span>{r.cac ? `$${n(r.cac)}` : '–'}</span></div>)}</div>
      <p className="small muted">{cac && ltv / cac < 3 ? 'Below 3× LTV:CAC the channel mix is unlikely to pay back; improve conversion before adding budget.' : 'A healthy ratio on paper. Validate CTR and conversion with a small test before scaling.'}</p>
      <button className="btn ghost sm" onClick={() => download('ad-plan.csv', ['channel,spend,clicks,cpc,signups,cost_per_signup,cac', ...rows.map(r => [r.k, r.spend, r.clicks, r.cpc, r.signups, r.cps, r.cac].map(x => typeof x === 'number' ? x.toFixed(2) : x).join(','))].join('\n'), 'text/csv')}>Export CSV</button>
    </section>
  </div>;
}
