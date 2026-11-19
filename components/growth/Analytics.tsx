'use client';
import { useEffect, useState } from 'react';
import { useWs, ErrorNote, Pill } from '../ws';
import { api } from '@/lib/client/api';

type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };
export type Report = { range: { start: string; end: string }; search?: { totals: Row | null; previous: Row | null; queries: Row[]; pages: Row[]; daily: Row[] }; searchError?: string;
  analytics?: { metrics: string[]; current: number[]; previous: number[]; daily: [string, number][]; pages: [string, number, number][]; channels: [string, number][] }; analyticsError?: string };
type Conn = { configured: boolean; connected: boolean; sites?: string[]; properties?: { id: string; name: string }[]; sitesError?: string | null; propertiesError?: string | null };
const delta = (a?: number, b?: number) => a == null || !b ? null : Math.round(((a - b) / b) * 100);
function Stat({ label, v, prev, fmt = (x: number) => x.toLocaleString('en-US'), invert }: { label: string; v?: number; prev?: number; fmt?: (x: number) => string; invert?: boolean }) {
  const d = delta(v, prev); const good = d == null ? null : invert ? d < 0 : d > 0;
  return <div className="stat"><span className="small muted">{label}</span><b>{v == null ? '–' : fmt(v)}</b>{d != null && <span className={`small ${good ? 'ok-text' : 'err-text'}`}>{d > 0 ? '+' : ''}{d}% vs prior 28d</span>}</div>;
}
function Spark({ values }: { values: number[] }) { if (values.length < 2) return null; const m = Math.max(...values, 1);
  return <svg className="spark" viewBox={`0 0 ${values.length - 1} 40`} preserveAspectRatio="none"><polyline fill="none" stroke="var(--acc)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" points={values.map((v, i) => `${i},${40 - (v / m) * 38}`).join(' ')} /></svg>; }

export default function Analytics() {
  const { status, toast } = useWs(); const [conn, setConn] = useState<Conn | null>(null); const [site, setSite] = useState(''); const [prop, setProp] = useState('');
  const [rep, setRep] = useState<Report | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  useEffect(() => { fetch('/api/google/report').then(r => r.json()).then((c: Conn) => { setConn(c); setSite(c.sites?.[0] ?? ''); setProp(c.properties?.[0]?.id ?? ''); }).catch(setError); }, []);
  async function load() { setBusy(true); setError(null); try { const r = await api<Report>('/api/google/report', { site, property: prop }); setRep(r); localStorage.setItem('kx_last_google_report', JSON.stringify(r)); } catch (e) { setError(e); } finally { setBusy(false); } }
  async function disconnect() { await fetch('/api/google/disconnect', { method: 'POST' }); setConn(c => c && { ...c, connected: false }); setRep(null); toast('Google disconnected'); }
  const s = rep?.search, a = rep?.analytics;
  return <div className="growth">
    <section className="panel">
      <div className="row between"><h2 className="h2">Search Console + GA4</h2><Pill ok={!!conn?.connected}>{conn?.connected ? 'Connected' : status.google.ok ? 'Not connected' : 'Not configured'}</Pill></div>
      <p className="small muted">Read-only access (<code>webmasters.readonly</code>, <code>analytics.readonly</code>). The refresh token is kept in an encrypted, http-only cookie on this browser.</p>
      {!status.google.ok ? <ErrorNote error={Object.assign(new Error('Google OAuth is not configured. Create an OAuth client (Web) in Google Cloud, enable the Search Console and Analytics Data APIs, and add the redirect URI /api/google/callback.'), { setup: status.google.missing })} />
        : !conn?.connected ? <a className="btn primary wide" href="/api/google/connect">Connect Google</a> : <>
          <label className="label">Search Console property<select className="input" value={site} onChange={e => setSite(e.target.value)}><option value="">None</option>{conn.sites?.map(x => <option key={x}>{x}</option>)}</select></label>
          {conn.sitesError && <p className="small err-text">{conn.sitesError}</p>}
          <label className="label">GA4 property<select className="input" value={prop} onChange={e => setProp(e.target.value)}><option value="">None</option>{conn.properties?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {conn.propertiesError && <p className="small err-text">{conn.propertiesError}</p>}
          <button className="btn primary wide" disabled={busy || (!site && !prop)} onClick={load}>{busy ? <><span className="spin" />Loading…</> : 'Load 28-day report'}</button>
          <button className="btn ghost sm" onClick={disconnect}>Disconnect</button></>}
      <ErrorNote error={error} onClose={() => setError(null)} />
    </section>
    <section className="docs">
      {!rep ? <div className="blank"><h3>Real traffic, next to your content work</h3><p>Clicks, impressions, CTR and position from Search Console; sessions, users, conversions and channels from GA4. Last 28 days against the 28 before. The weekly report uses the latest load.</p></div> : <>
        <p className="small muted">{rep.range.start} → {rep.range.end}</p>
        {rep.searchError && <p className="small err-text">Search Console: {rep.searchError}</p>}
        {s && <><h3>Search</h3><div className="stats"><Stat label="Clicks" v={s.totals?.clicks} prev={s.previous?.clicks} /><Stat label="Impressions" v={s.totals?.impressions} prev={s.previous?.impressions} /><Stat label="CTR" v={s.totals?.ctr} prev={s.previous?.ctr} fmt={x => `${(x * 100).toFixed(1)}%`} /><Stat label="Avg position" v={s.totals?.position} prev={s.previous?.position} fmt={x => x.toFixed(1)} invert /></div>
          <Spark values={s.daily.map(d => d.clicks)} />
          <div className="table spaced">{s.queries.slice(0, 12).map(q => <div key={q.keys?.[0]} className="tr"><span>{q.keys?.[0]}</span><span className="chip">{q.clicks} clicks</span><span className="small muted">{q.impressions} impr · pos {q.position.toFixed(1)}</span></div>)}</div></>}
        {rep.analyticsError && <p className="small err-text">GA4: {rep.analyticsError}</p>}
        {a && <><h3 className="spaced">Analytics</h3><div className="stats">{a.metrics.map((m, i) => <Stat key={m} label={m} v={a.current[i]} prev={a.previous[i]} fmt={m === 'engagementRate' ? x => `${(x * 100).toFixed(0)}%` : undefined} />)}</div>
          <Spark values={a.daily.map(d => d[1])} />
          <div className="two spaced"><div className="table">{a.pages.map(p => <div key={p[0]} className="tr"><span className="trunc">{p[0]}</span><span className="small muted">{p[1]} views</span></div>)}</div>
            <div className="table">{a.channels.map(c => <div key={c[0]} className="tr"><span>{c[0]}</span><span className="small muted">{c[1]} sessions</span></div>)}</div></div></>}
      </>}
    </section>
  </div>;
}
