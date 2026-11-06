'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from '../Icon';
import { useWs, ErrorNote, Pill } from '../ws';
import { api, fmtDate } from '@/lib/client/api';
import type { Doc } from '@/lib/client/store';
import { createClient } from '@/lib/supabase/client';
import { useSettings, AGENTS, type Settings as S } from '@/lib/client/settings';
import type { Brand } from '../growth/useBrand';
import Integrations from '../Integrations';

const TABS = [
  ['Workspace', [['websites', 'Websites', 'globe'], ['team', 'Team', 'users'], ['credits', 'Usage & credits', 'bolt']]],
  ['AI CMO', [['agents', 'Agents', 'spark'], ['personalization', 'Personalization', 'user'], ['skills', 'Skills', 'layers']]],
  ['Connections', [['integrations', 'Integrations & alerts', 'plug']]],
  ['Account', [['account', 'Profile & security', 'settings'], ['devices', 'Sessions', 'monitor']]],
] as const;
type Tab = (typeof TABS)[number][1][number][0];
const META: Record<Tab, [string, string]> = {
  websites: ['Websites', 'The sites your AI CMO analyses. The primary site drives the dashboard, documents and agents.'],
  team: ['Team', 'Invite people into this workspace and manage their roles.'],
  credits: ['Usage & credits', 'Your monthly allowance, what each action costs, and recent spend.'],
  agents: ['Agents', 'Turn agents on or off and tune how each one writes. Changes apply on the next run.'],
  personalization: ['Personalization', 'How the CMO addresses you, the language it writes in, and what it remembers.'],
  skills: ['Skills', 'Markdown playbooks for the AI CMO. MCP servers live under Integrations.'],
  integrations: ['Integrations & alerts', 'Connected accounts, provider keys and daily brief delivery.'],
  account: ['Profile & security', 'Sign-in email, password and account deletion.'],
  devices: ['Sessions', 'Where you are signed in.'],
};
type Usage = { plan: string; planName?: string; allowance: number; used: number; remaining: number; resetsAt: string; events: { action: string; cost: number; at: string }[]; costs: Record<string, { cost: number; label: string }>; ledger: string };
export function Row({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return <div className="s-row"><div className="s-row-l">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}{hint && <p>{hint}</p>}</div><div className="s-row-c">{children}</div></div>;
}

export default function Settings() {
  const { store, status, toast, email } = useWs(); const { settings, save } = useSettings(store);
  const [tab, setTabS] = useState<Tab>('websites'); const [s, setS] = useState<S>(settings); const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  useEffect(() => setS(settings), [settings]);
  useEffect(() => { const t = new URLSearchParams(location.search).get('tab'); if (t && TABS.some(g => g[1].some(x => x[0] === t))) setTabS(t as Tab); }, []);
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const setTab = (t: Tab) => { if (dirty && !confirm('You have unsaved changes. Discard them?')) return; if (dirty) setS(settings); setTabS(t); const u = new URL(location.href); u.searchParams.set('tab', t); history.replaceState(null, '', u); };
  useEffect(() => { if (!dirty) return; const f = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', f); return () => window.removeEventListener('beforeunload', f); }, [dirty]);
  const commit = async () => { setSaving('saving'); setError(null); try { await save(s); setSaving('saved'); toast('Settings saved'); setTimeout(() => setSaving('idle'), 1800); } catch (e) { setError(e); setSaving('idle'); } };
  const A = <K extends keyof S['agents']>(k: K, patch: Partial<S['agents'][K]>) => setS({ ...s, agents: { ...s.agents, [k]: { ...s.agents[k], ...patch } } });
  const P = (patch: Partial<S['personal']>) => setS({ ...s, personal: { ...s.personal, ...patch } });
  const [title, desc] = META[tab];
  return <div className="page s-page">
    <header className="s-head"><h1>Settings</h1><p className="muted small">{email}{status.preview ? ' · Preview mode: settings are kept in this browser' : ''}</p></header>
    <div className="s-grid">
      <nav className="s-nav" aria-label="Settings sections">
        <label className="sr-only" htmlFor="s-jump">Section</label>
        <select id="s-jump" className="input s-jump" value={tab} onChange={e => setTab(e.target.value as Tab)}>{TABS.map(([g, items]) => <optgroup key={g} label={g}>{items.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</optgroup>)}</select>
        {TABS.map(([g, items]) => <div key={g} className="s-group"><span className="s-group-l">{g}</span>{items.map(([id, l, ic]) => <button key={id} className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon name={ic} size={15} />{l}</button>)}</div>)}
      </nav>
      <div className="s-body">
        <div className="s-title"><h2>{title}</h2><p className="muted">{desc}</p></div>
        <ErrorNote error={error} onClose={() => setError(null)} />
        {tab === 'websites' && <Websites />}
        {tab === 'credits' && <Credits settings={settings} />}
        {tab === 'agents' && <div className="stack">
          <AgentBox name="SEO analysis" desc="Keyword intent, audits and article spelling." on={s.agents.seo.on} set={on => A('seo', { on })}><Row label="Market" htmlFor="ag-mkt" hint="Used for keyword intent and spelling."><select id="ag-mkt" className="input" value={s.agents.seo.market} onChange={e => A('seo', { market: e.target.value })}>{['United States (English)', 'United Kingdom (English)', 'India (English)', 'Germany (German)', 'France (French)', 'Spain (Spanish)', 'Brazil (Portuguese)', 'Japan (Japanese)', 'Global'].map(m => <option key={m}>{m}</option>)}</select></Row></AgentBox>
          <AgentBox name="Reddit & HN" desc="Finds threads where your product helps and drafts replies for approval." on={s.agents.reddit.on} set={on => A('reddit', { on })}>
            <Row label="Reply style" htmlFor="ag-rs"><textarea id="ag-rs" rows={3} value={s.agents.reddit.style} onChange={e => A('reddit', { style: e.target.value })} /></Row>
            <Row label="Search region" htmlFor="ag-rr"><select id="ag-rr" className="input" value={s.agents.reddit.region} onChange={e => A('reddit', { region: e.target.value })}>{['Global', 'US', 'UK', 'India', 'EU'].map(m => <option key={m}>{m}</option>)}</select></Row>
            <Row label="Priority subreddits" hint="Up to 20. Press Enter to add."><ListEdit label="Subreddits" max={20} items={s.agents.reddit.subreddits} set={v => A('reddit', { subreddits: v.map(x => x.replace(/^r\//, '')) })} placeholder="SaaS" /></Row>
            <Row label="Search keywords" hint="Up to 30."><ListEdit label="Keywords" max={30} items={s.agents.reddit.keywords} set={v => A('reddit', { keywords: v })} placeholder="invoice tool for freelancers" /></Row></AgentBox>
          <AgentBox name="X / Twitter" desc="Drafts posts and threads in your voice." on={s.agents.x.on} set={on => A('x', { on })}><Row label="Brand voice" htmlFor="ag-x"><textarea id="ag-x" rows={3} value={s.agents.x.voice} onChange={e => A('x', { voice: e.target.value })} placeholder="Short, dry, build-in-public. No threads longer than 5 posts." /></Row></AgentBox>
          <AgentBox name="LinkedIn" desc="Founder-voice posts." on={s.agents.linkedin.on} set={on => A('linkedin', { on })}><Row label="Brand voice" htmlFor="ag-li"><textarea id="ag-li" rows={3} value={s.agents.linkedin.voice} onChange={e => A('linkedin', { voice: e.target.value })} placeholder="First person founder voice, one lesson per post, no engagement bait." /></Row></AgentBox>
          <AgentBox name="Articles" desc="Long-form SEO articles." on={s.agents.articles.on} set={on => A('articles', { on })}><Row label="Instructions" htmlFor="ag-ar"><textarea id="ag-ar" rows={3} value={s.agents.articles.instructions} onChange={e => A('articles', { instructions: e.target.value })} /></Row>
            <Row label="AI hero image" hint="Uses the media provider, 40 credits each."><label className="switch"><input type="checkbox" aria-label="AI hero image" checked={s.agents.articles.heroImage} onChange={e => A('articles', { heroImage: e.target.checked })} /><i /></label></Row>
            {s.agents.articles.heroImage && <Row label="Image style" htmlFor="ag-is"><input id="ag-is" className="input" value={s.agents.articles.imageStyle} onChange={e => A('articles', { imageStyle: e.target.value })} placeholder="Flat editorial illustration, warm palette" /></Row>}</AgentBox>
          <AgentBox name="UGC videos" desc="Drafts UGC scripts. Nothing renders in the background, so credits are never spent without you." on={s.agents.ugc.on} set={on => A('ugc', { on })}>
            <Row label="Draft frequency" htmlFor="ag-uf"><select id="ag-uf" className="input" value={s.agents.ugc.frequency} onChange={e => A('ugc', { frequency: e.target.value as 'daily' })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="manual">Only when I ask</option></select></Row>
            <Row label="Auto-render reminder" htmlFor="ag-ua"><select id="ag-ua" className="input" value={s.agents.ugc.autoVideo} onChange={e => A('ugc', { autoVideo: e.target.value as 'off' })}><option value="off">Off</option><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option></select></Row></AgentBox>
          <AgentBox name="Show HN" desc="Prepares a Show HN post." on={s.agents.hn.on} set={on => A('hn', { on })}><Row label="Technical notes" htmlFor="ag-hn"><textarea id="ag-hn" rows={2} value={s.agents.hn.notes} onChange={e => A('hn', { notes: e.target.value })} /></Row></AgentBox>
          {AGENTS.filter(a => ['geo', 'influencer', 'backlinks', 'competitors'].includes(a.key)).map(a => <AgentBox key={a.key} name={a.name} desc={a.what} on={s.agents[a.key].on} set={on => A(a.key, { on } as never)} />)}
        </div>}
        {tab === 'integrations' && <div className="stack"><Notifications /><Integrations /></div>}
        {tab === 'skills' && <Skills />}
        {tab === 'team' && <Team />}
        {tab === 'personalization' && <div className="stack">
          <section className="s-card"><header><h3>Profile</h3><p>Shown to the CMO with every chat.</p></header>
            <Row label="What should we call you?" htmlFor="p-call" hint={`${s.personal.callMe.length}/50`}><input id="p-call" className="input" maxLength={50} value={s.personal.callMe} onChange={e => P({ callMe: e.target.value })} /></Row>
            <Row label="What do you do?" htmlFor="p-role" hint={`${s.personal.role.length}/100`}><input id="p-role" className="input" maxLength={100} value={s.personal.role} placeholder="Founder, marketer, engineer…" onChange={e => P({ role: e.target.value })} /></Row>
            <Row label="Anything else" htmlFor="p-about" hint={`${s.personal.about.length}/3000`}><textarea id="p-about" rows={4} maxLength={3000} value={s.personal.about} onChange={e => P({ about: e.target.value })} /></Row></section>
          <section className="s-card"><header><h3>Language & model</h3></header>
            <Row label="Content language" htmlFor="p-lang" hint="Documents, posts, articles, UGC scripts and chat."><select id="p-lang" className="input" value={s.personal.language} onChange={e => P({ language: e.target.value })}>{['English', 'Hindi', 'Spanish', 'Portuguese', 'French', 'German', 'Italian', 'Dutch', 'Japanese', 'Korean', 'Indonesian', 'Arabic'].map(l => <option key={l}>{l}</option>)}</select></Row>
            <Row label="Model" hint="Set by the server owner (AI_MODEL) so keys never reach the browser."><code className="s-code">{status.ai.note ?? 'not configured'}</code></Row></section>
          <Memories /></div>}
        {tab === 'account' && <Account />}
        {tab === 'devices' && <Devices />}
      </div>
    </div>
    {(dirty || saving !== 'idle') && <div className="s-savebar" role="region" aria-label="Unsaved changes"><span>{saving === 'saved' ? <><Icon name="check" size={15} />Saved</> : 'You have unsaved changes'}</span>
      <div className="row"><button className="btn ghost sm" disabled={saving === 'saving' || !dirty} onClick={() => setS(settings)}>Discard</button><button className="btn primary sm" disabled={saving === 'saving' || !dirty} onClick={commit}>{saving === 'saving' ? <><span className="spin" />Saving…</> : 'Save changes'}</button></div></div>}
  </div>;
}
function AgentBox({ name, desc, on, set, children }: { name: string; desc?: string; on: boolean; set: (on: boolean) => void; children?: React.ReactNode }) {
  return <section className={`s-card agentbox ${on ? '' : 'off'}`}><header className="s-card-h"><div><h3>{name}</h3>{desc && <p>{desc}</p>}</div><label className="switch"><input type="checkbox" aria-label={`${name} agent`} checked={on} onChange={e => set(e.target.checked)} /><i /></label></header>{on && children}</section>;
}
function ListEdit({ label, items, set, max, placeholder }: { label: string; items: string[]; set: (v: string[]) => void; max: number; placeholder: string }) {
  const [v, setV] = useState('');
  return <div><span className="sr-only">{label} · {items.length}/{max}</span><div className="chips">{items.map(i => <span key={i} className="chip">{i} <button className="btn ghost sm icon" aria-label={`Remove ${i}`} onClick={() => set(items.filter(x => x !== i))}>×</button></span>)}</div>
    <div className="row"><input className="input sm" aria-label={`Add to ${label}`} value={v} placeholder={placeholder} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && v.trim() && items.length < max) { set([...items, v.trim()]); setV(''); } }} /><button className="btn sm" disabled={!v.trim() || items.length >= max} onClick={() => { set([...items, v.trim()]); setV(''); }}>+ Add</button></div></div>;
}
function Websites() {
  const { store, toast, go } = useWs(); const [list, setList] = useState<Doc<Brand>[]>([]); const [edit, setEdit] = useState<string | null>(null); const [url, setUrl] = useState(''); const active = typeof window === 'undefined' ? null : localStorage.getItem('ikarvo:activeBrand');
  useEffect(() => { store.list<Brand>('brands').then(setList).catch(() => {}); }, [store]);
  async function change(b: Doc<Brand>) { if (!confirm(`Switch ${b.title} to ${url}? Its documents, audit and competitors are cleared and the analysis restarts.`)) return; const d = await store.save<Brand>('brands', { id: b.id, title: url, data: { url, notes: '' } }); localStorage.setItem('ikarvo:activeBrand', d.id); toast('Website changed; run onboarding from the dashboard'); go('home'); }
  async function remove(b: Doc<Brand>) { if (!confirm(`Delete ${b.title} and its documents? Posts, articles and other agent output are kept.`)) return; await store.remove('brands', b.id); setList(l => l.filter(x => x.id !== b.id)); if (active === b.id) localStorage.removeItem('ikarvo:activeBrand'); window.dispatchEvent(new Event('ikarvo:brand')); }
  return <div className="stack"><div className="row between"><h2 className="h2">Websites</h2><button className="btn sm" onClick={() => { localStorage.setItem('ikarvo:addSite', '1'); go('home'); }}><Icon name="plus" />Add website</button></div>
    {list.map(b => <section key={b.id} className="s-card"><div className="row between"><span><b>{b.title}</b> {(active ?? list[0]?.id) === b.id && <span className="chip good">Primary</span>}<br /><span className="small muted">{b.data.url} · updated {fmtDate(b.updated_at)}</span></span>
      <div className="row">{(active ?? list[0]?.id) !== b.id && <button className="btn ghost sm" onClick={() => { localStorage.setItem('ikarvo:activeBrand', b.id); window.dispatchEvent(new Event('ikarvo:brand')); toast(`${b.title} is now primary`); setList([...list]); }}>Make primary</button>}<button className="btn ghost sm" onClick={() => { setEdit(edit === b.id ? null : b.id); setUrl(b.data.url); }}>Edit</button><button className="btn ghost sm" onClick={() => remove(b)}>Delete</button></div></div>
      {edit === b.id && <div className="row"><input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" /><button className="btn sm" onClick={() => change(b)}>Change URL</button></div>}
      {edit === b.id && <p className="small err-text">Changing the URL clears this website&apos;s documents and restarts the analysis.</p>}</section>)}
    {!list.length && <p className="muted">No websites yet. Add one from the dashboard.</p>}</div>;
}
function Credits({ settings }: { settings: S }) {
  const [u, setU] = useState<Usage | null>(null); const [error, setError] = useState<unknown>(null);
  useEffect(() => { api<Usage>('/api/credits').then(setU).catch(setError); }, []);
  if (error) return <ErrorNote error={error} />; if (!u) return <span className="spin" />;
  const est: [string, string, number][] = [['articles', 'article', 8], ['x', 'marketing', 8], ['linkedin', 'marketing', 4], ['reddit', 'reply', 20], ['geo', 'visibility', 4], ['ugc', 'ugc', 4], ['hn', 'hn', 1]];
  const rows = est.filter(([k]) => settings.agents[k as keyof S['agents']]?.on).map(([k, action, n]) => ({ k, label: u.costs[action]?.label ?? action, cost: u.costs[action]?.cost ?? 2, n }));
  const total = rows.reduce((a, r) => a + r.cost * r.n, 0); const pct = Math.min(100, Math.round(u.used / u.allowance * 100));
  return <div className="stack"><section className="s-card"><div className="row between"><h3>Credits · {u.planName ?? u.plan} plan</h3><span className={`pill ${u.remaining / u.allowance > .2 ? 'on' : 'off'}`}><i />{u.remaining / u.allowance > .2 ? 'Healthy' : 'Running low'}</span></div>
    <div className="stats"><div className="stat"><span className="small muted">Used</span><b>{u.used}/{u.allowance}</b></div><div className="stat"><span className="small muted">Remaining</span><b>{u.remaining}</b></div><div className="stat"><span className="small muted">Resets</span><b>{new Date(u.resetsAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}</b></div></div>
    <div className="meter"><i style={{ width: `${pct}%` }} /></div>
    <p className="small muted">Ledger: {u.ledger === 'memory' ? 'preview mode, kept in server memory and reset on restart' : 'Supabase (credit_events)'}. Failed AI calls are refunded automatically. Allowances: <code>CREDITS_FREE_MONTHLY</code> / <code>CREDITS_PRO_MONTHLY</code>.</p></section>
    <section className="s-card"><h3>Monthly estimate for enabled agents</h3><div className="table">{rows.map(r => <div key={r.k} className="tr"><span>{r.label}</span><span className="small muted">{r.cost} cr × {r.n}/mo</span><b>{r.cost * r.n} cr</b></div>)}</div>
      <p className="small">Estimated {total} of {u.allowance} credits/month{total > u.allowance ? ' (over your allowance: turn agents off or upgrade in Billing)' : ` · ${u.allowance - total} spare`}.</p></section>
    <section className="s-card"><h3>Price list</h3><div className="table">{Object.entries(u.costs).map(([k, c]) => <div key={k} className="tr"><span>{c.label}</span><span className="small muted">{k}</span><b>{c.cost} cr</b></div>)}</div><p className="small muted">Crawls, audits, competitor snapshots, design extraction, PageSpeed, publishing and exports are free.</p></section>
    <section className="s-card"><h3>Recent activity</h3>{u.events.length ? <div className="table">{u.events.map((e, i) => <div key={i} className="tr"><span>{e.action}</span><span className="small muted">{fmtDate(e.at)}</span><b className={e.cost < 0 ? 'ok-text' : ''}>{e.cost > 0 ? '−' : '+'}{Math.abs(e.cost)}</b></div>)}</div> : <p className="small muted">No credit activity yet.</p>}</section></div>;
}
function Notifications() {
  const [st, setSt] = useState<Record<string, { label: string; ok: boolean; missing: string[] }> | null>(null); const [busy, setBusy] = useState(''); const [error, setError] = useState<unknown>(null); const [ok, setOk] = useState('');
  useEffect(() => { fetch('/api/notify/status').then(r => r.json()).then(setSt).catch(() => {}); }, []);
  return <section className="s-card"><header><h3>Daily brief & alerts</h3></header><p className="small muted">A daily summary (published, waiting for approval, failures) goes to your own Telegram or WhatsApp chat via <code>/api/cron/digest</code> (09:00 IST on Vercel Cron). Only your configured chat receives messages.</p>
    <div className="table">{st && Object.entries(st).map(([k, v]) => <div key={k} className="tr"><span><b>{v.label}</b></span><Pill ok={v.ok}>{v.ok ? 'Configured' : 'Not configured'}</Pill><span className="row">{v.ok ? <button className="btn sm" disabled={!!busy} onClick={async () => { setBusy(k); setError(null); setOk(''); try { await api('/api/notify/test', { channel: k }); setOk(`Test sent to ${v.label}`); } catch (e) { setError(e); } finally { setBusy(''); } }}>{busy === k ? 'Sending…' : 'Send test'}</button> : <span className="small muted">{v.missing.join(', ')}</span>}</span></div>)}</div>
    {ok && <p className="small ok-text">{ok}</p>}<ErrorNote error={error} onClose={() => setError(null)} /></section>;
}
function Skills() {
  const { store, toast } = useWs(); const [skills, setSkills] = useState<Doc<{ name: string; description: string; body: string; url: string }>[]>([]);
  const [url, setUrl] = useState(''); const [busy, setBusy] = useState(''); const [error, setError] = useState<unknown>(null); const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { store.list<{ name: string; description: string; body: string; url: string }>('skills').then(setSkills).catch(() => {}); }, [store]);
  async function add() { setBusy('s'); setError(null); try { const r = await api<{ name: string; description: string; body: string; url: string }>('/api/skills', { url }); const d = await store.save('skills', { title: r.name, data: r }); setSkills(s => [d, ...s]); setUrl(''); toast(`Installed ${r.name}`); } catch (e) { setError(e); } finally { setBusy(''); } }
  return <div className="stack"><section className="s-card"><h3>Skills</h3><p className="small muted">A skill is a Markdown playbook (SKILL.md style) from any public URL, e.g. a GitHub file. Installed skills are added to your AI CMO&apos;s context.</p>
    <div className="row"><input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/blob/main/skills/launch/SKILL.md" /><button className="btn sm" disabled={!url || busy === 's'} onClick={add}>{busy === 's' ? 'Fetching…' : 'Add skill'}</button></div>
    {skills.length ? <div className="table">{skills.map(s => <div key={s.id}><div className="tr vis" onClick={() => setOpen(open === s.id ? null : s.id)}><span><b>{s.data.name}</b><br /><span className="small muted">{s.data.description || s.data.url}</span></span><span className="small muted">{s.data.body.length} chars</span><button className="btn ghost sm" onClick={async e => { e.stopPropagation(); await store.remove('skills', s.id); setSkills(x => x.filter(y => y.id !== s.id)); }}>Remove</button></div>{open === s.id && <pre className="code small excerpt">{s.data.body.slice(0, 3000)}</pre>}</div>)}</div> : <p className="small muted">None installed yet.</p>}</section>
    <section className="s-card"><h3>MCP servers</h3><p className="small muted">Remote MCP connections (connect, permissions, tool execution, audit log) are on the <a href="/app?view=integrations">Integrations</a> page under MCP servers.</p></section>
    <ErrorNote error={error} onClose={() => setError(null)} /></div>;
}
type Member = { email: string; role: string; status: string; created_at: string };
function Team() {
  const { status, toast } = useWs(); const [list, setList] = useState<Member[]>([]); const [shared, setShared] = useState<{ owner: string; ownerEmail: string; role: string }[]>([]); const [email, setEmail] = useState(''); const [role, setRole] = useState('editor'); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const cloud = !status.preview && status.supabase.ok;
  const load = useCallback(() => { if (cloud) api<{ roster: Member[]; workspaces: typeof shared }>('/api/team').then(r => { setList(r.roster); setShared(r.workspaces); }).catch(setError); }, [cloud]);
  useEffect(load, [load]);
  async function invite() { setBusy(true); setError(null); try { const r = await api<{ note: string }>('/api/team/invite', { email, role }); setEmail(''); toast(r.note); load(); } catch (e) { setError(e); } finally { setBusy(false); } }
  async function remove(m: Member) { setError(null); const r = await fetch(`/api/team?email=${encodeURIComponent(m.email)}`, { method: 'DELETE' }); if (!r.ok) setError(new Error((await r.json().catch(() => ({}))).error || 'Could not remove')); else { toast(`${m.email} removed`); load(); } }
  return <section className="s-card"><header><h3>Members</h3></header><p className="small muted">Invite people into this workspace. Once they sign in with the invited address they see and edit your projects, brands, posts, articles and Ad Studio work (viewers can only read). Credits, chats, settings and connected accounts like Meta stay personal.</p>
    {!cloud && <p className="note setup small">Preview mode has no accounts, so invites are off. Configure Supabase and sign in to share a workspace.</p>}
    <div className="row"><input className="input" type="email" aria-label="Teammate email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@company.com" disabled={!cloud} /><select className="input sm" aria-label="Role" value={role} onChange={e => setRole(e.target.value)} disabled={!cloud}><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button className="btn sm" disabled={!cloud || busy || !email} onClick={invite}>{busy ? 'Inviting…' : 'Invite'}</button></div>
    <ErrorNote error={error} onClose={() => setError(null)} />
    {list.length > 0 && <div className="table">{list.map(m => <div key={m.email} className="tr"><span>{m.email}</span><span className="chip">{m.role}</span><span className="row"><span className="small muted">{m.status === 'active' ? 'Joined' : 'Invite pending'}</span><button className="btn ghost sm" onClick={() => remove(m)}>Remove</button></span></div>)}</div>}
    {shared.length > 0 && <><h4>Workspaces shared with you</h4><div className="table">{shared.map(w => <div key={w.owner} className="tr"><span>{w.ownerEmail || w.owner}</span><span className="chip">{w.role}</span><span className="small muted">Switch from the sidebar</span></div>)}</div></>}
  </section>;
}
function Memories() {
  const { store } = useWs(); const [list, setList] = useState<Doc<{ text: string }>[]>([]); const [v, setV] = useState('');
  useEffect(() => { store.list<{ text: string }>('memories').then(setList).catch(() => {}); }, [store]);
  return <section className="s-card"><header><h3>Memories</h3></header><p className="small muted">Facts the CMO saved from your chats (it proposes at most one per reply). They are sent with every chat. Delete anything wrong.</p>
    <div className="row"><input className="input" value={v} onChange={e => setV(e.target.value)} placeholder="We only sell to EU companies" /><button className="btn sm" disabled={!v.trim()} onClick={async () => { const d = await store.save('memories', { title: v.slice(0, 60), data: { text: v } }); setList(l => [d, ...l]); setV(''); }}>Add</button></div>
    {list.length ? <div className="table">{list.map(m => <div key={m.id} className="tr"><span>{m.data.text}</span><span className="small muted">{fmtDate(m.updated_at)}</span><button className="btn ghost sm" onClick={async () => { await store.remove('memories', m.id); setList(l => l.filter(x => x.id !== m.id)); }}>Delete</button></div>)}</div> : <p className="small muted">No memories yet.</p>}</section>;
}
function Account() {
  const { status, email, toast } = useWs(); const [ne, setNe] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [confirmText, setConfirm] = useState(''); const [error, setError] = useState<unknown>(null); const [msg, setMsg] = useState('');
  const cloud = !status.preview && status.supabase.ok;
  async function changeEmail() { setError(null); const { error } = await createClient().auth.updateUser({ email: ne }); if (error) setError(error); else setMsg(`Confirmation sent to ${ne}. The change applies after you click the link.`); }
  async function changePw() { setError(null); if (pw.length < 10) return setError(new Error('Use at least 10 characters.')); if (pw !== pw2) return setError(new Error('Passwords do not match.')); const { error } = await createClient().auth.updateUser({ password: pw }); if (error) setError(error); else { toast('Password changed'); setPw(''); setPw2(''); } }
  async function del() { setError(null); try { await api('/api/account/delete', { confirm: confirmText }); location.href = '/'; } catch (e) { setError(e); } }
  return <div className="stack">{!cloud && <p className="note setup">Preview mode: account changes need Supabase auth (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) and a signed-in user.</p>}
    <section className="s-card"><header><h3>Email address</h3><p>Current: <b>{email}</b></p></header>
      <Row label="New email" htmlFor="a-em" hint="We send a confirmation link; the change applies after you click it."><input id="a-em" className="input" type="email" autoComplete="email" value={ne} onChange={e => setNe(e.target.value)} placeholder="new@company.com" disabled={!cloud} /></Row>
      {msg && <p className="small ok-text">{msg}</p>}
      <footer className="s-card-f"><span className="small muted">Requires confirmation</span><button className="btn sm" disabled={!cloud || !/^\S+@\S+\.\S+$/.test(ne)} onClick={changeEmail}>Send confirmation</button></footer></section>
    <section className="s-card"><header><h3>Password</h3><p>At least 10 characters.</p></header>
      <Row label="New password" htmlFor="a-pw"><input id="a-pw" className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} disabled={!cloud} /></Row>
      <Row label="Confirm password" htmlFor="a-pw2" hint={pw2 && pw !== pw2 ? <span className="err-text">Passwords do not match</span> : undefined}><input id="a-pw2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} disabled={!cloud} /></Row>
      <footer className="s-card-f"><span className="small muted">{pw && pw.length < 10 ? `${10 - pw.length} more characters` : ''}</span><button className="btn sm" disabled={!cloud || pw.length < 10 || pw !== pw2} onClick={changePw}>Update password</button></footer></section>
    <section className="s-card danger"><header><h3>Delete account</h3><p>Permanently removes projects, documents, posts, articles and credit history. This cannot be undone.</p></header>
      <Row label="Type DELETE to confirm" htmlFor="a-del"><input id="a-del" className="input" value={confirmText} onChange={e => setConfirm(e.target.value)} placeholder="DELETE" disabled={!cloud} /></Row>
      <footer className="s-card-f"><span /><button className="btn sm danger" disabled={!cloud || confirmText !== 'DELETE'} onClick={del}>Delete account</button></footer></section>
    <ErrorNote error={error} onClose={() => setError(null)} /></div>;
}
function Devices() {
  const { status, toast } = useWs(); const [ua, setUa] = useState(''); const cloud = !status.preview && status.supabase.ok;
  useEffect(() => setUa(navigator.userAgent), []);
  const name = (() => { const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'; const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : ''; return `${b}${os ? ` on ${os}` : ''}`; })();
  return <section className="s-card"><header><h3>Active sessions</h3></header><div className="table"><div className="tr"><span><b>{name}</b> <span className="chip good">This device</span></span><span className="small muted">active now</span><span /></div></div>
    <p className="small muted">Supabase does not expose a per-device session list to the browser, so other devices are not listed. You can end every other session at once:</p>
    <button className="btn sm" disabled={!cloud} onClick={async () => { const { error } = await createClient().auth.signOut({ scope: 'others' }); toast(error ? error.message : 'Signed out of all other devices', error ? 'err' : 'ok'); }}>Sign out other devices</button>
    {!cloud && <p className="small muted">Needs Supabase auth (not available in preview mode).</p>}</section>;
}
