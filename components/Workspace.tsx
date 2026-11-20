'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from './Icon';
import { WsProvider, ErrorNote } from './ws';
import { api, ApiError, type Status } from '@/lib/client/api';
import { cloudStore, localStore, setActiveWorkspace, WS_KEY } from '@/lib/client/store';
import { createClient } from '@/lib/supabase/client';
import BuildStudio from './BuildStudio';
import Projects from './Projects';
import AdStudio from './ad/AdStudio';
import Marketing from './Marketing';
import Integrations from './Integrations';
import Billing from './Billing';
import Home from './cmo/Home';
import SettingsView from './cmo/Settings';
import CreditsPill from './cmo/CreditsPill';
import ThemeToggle from './ThemeToggle';
import CommandPalette, { type Cmd } from './CommandPalette';
import { MARKETING_TABS } from './ws';

const NAV = [
  { id: 'home', label: 'AI CMO', icon: 'home' }, { id: 'build', label: 'Build', icon: 'build' }, { id: 'projects', label: 'Projects', icon: 'folder' },
  { id: 'ads', label: 'Ad Studio', icon: 'film' }, { id: 'marketing', label: 'Marketing', icon: 'megaphone' },
  { id: 'integrations', label: 'Integrations', icon: 'plug' }, { id: 'billing', label: 'Billing & setup', icon: 'card' }, { id: 'settings', label: 'Settings', icon: 'settings' },
] as const;
type View = (typeof NAV)[number]['id'];

type Shared = { owner: string; ownerEmail: string; role: string };
function Shell({ status, email, mode, shared, active }: { status: Status; email: string; mode: 'local' | 'cloud'; shared: Shared[]; active: string | null }) {
  const params = useSearchParams(); const router = useRouter();
  const view = (NAV.some(n => n.id === params.get('view')) ? params.get('view') : 'home') as View;
  const go = (v: View, tab?: string) => { const nav = () => router.replace(`/app?view=${v}${tab ? `&tab=${tab}` : ''}`, { scroll: false });
    nav(); if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); };
  const [k, setK] = useState(false);
  const cmds: Cmd[] = [
    ...NAV.map(n => ({ id: 'v-' + n.id, label: n.label, group: 'Go to', icon: n.icon, run: () => go(n.id) })),
    ...MARKETING_TABS.map(t => ({ id: 'm-' + t, label: t === 'hn' ? 'Hacker News' : t === 'meta' ? 'Meta Ads' : t[0].toUpperCase() + t.slice(1), group: 'Marketing', icon: t === 'meta' ? 'megaphone' : 'doc', hint: 'Marketing', run: () => go('marketing', t) })),
    { id: 'a-new', label: 'New app from a prompt', group: 'Actions', icon: 'plus', run: () => go('build') },
    { id: 'a-credits', label: 'Credits & usage', group: 'Actions', icon: 'bolt', run: () => go('settings', 'credits') },
    { id: 'a-team', label: 'Invite a teammate', group: 'Actions', icon: 'users', run: () => go('settings', 'team') },
    { id: 'a-theme', label: 'Toggle light / dark theme', group: 'Actions', icon: 'moon', run: () => { const d = document.documentElement; const n = d.dataset.theme === 'dark' ? 'light' : 'dark'; d.dataset.theme = n; try { localStorage.setItem('ikarvo:theme', n); } catch {} } },
  ];
  return <WsProvider status={status} store={mode === 'cloud' ? cloudStore : localStore} email={email} onOpenProject={() => go('build')} onGo={(v, t) => go(v as View, t)}>
    <div className="ws">
      <aside className="side">
        <Link href="/" className="wordmark">Ikar<em>vo</em></Link>
        <button className="side-k" onClick={() => setK(true)} aria-label="Open command menu (Ctrl+K)"><Icon name="search" /><span>Search or jump…</span><kbd>⌘K</kbd></button>
        <nav aria-label="Workspace">{NAV.map(n => <button key={n.id} className={view === n.id ? 'on' : ''} aria-current={view === n.id ? 'page' : undefined} onClick={() => go(n.id)}><Icon name={n.icon} />{n.label}</button>)}</nav>
        <div className="side-mobile-tools"><ThemeToggle /></div>
        <div className="side-foot">
          <div className="side-tools"><ThemeToggle /><span className="small muted">Theme</span></div>
          <CreditsPill onOpen={() => go('settings', 'credits')} onTour={() => { localStorage.setItem('ikarvo:tourNow', '1'); window.dispatchEvent(new Event('ikarvo:tour')); go('home'); }} />
          {status.preview && <div className="preview-tag">Preview mode<br /><span>Data stays in this browser</span></div>}
          {shared.length > 0 && <label className="label ws-switch">Workspace<select className="input sm" value={active ?? ''} onChange={e => { if (e.target.value) localStorage.setItem(WS_KEY, e.target.value); else localStorage.removeItem(WS_KEY); location.reload(); }}>
            <option value="">My workspace</option>{shared.map(w => <option key={w.owner} value={w.owner}>{w.ownerEmail || 'Shared workspace'} · {w.role}</option>)}</select></label>}
          <div className="who"><span className="avatar">{email.slice(0, 1).toUpperCase()}</span><span className="small">{email}</span>
            {mode === 'cloud' && <button className="btn ghost sm icon" title="Sign out" aria-label="Sign out" onClick={async () => { await createClient().auth.signOut(); location.href = '/'; }}><Icon name="logout" /></button>}</div>
        </div>
      </aside>
      <main className="main" id="main">
        <div key={view} className="view-enter">
        {view === 'home' && <Home />}{view === 'settings' && <SettingsView />}
        {view === 'projects' && <Projects />}{view === 'ads' && <AdStudio />}{view === 'marketing' && <Marketing />}
        {view === 'integrations' && <Integrations />}{view === 'billing' && <Billing />}
        </div>
        <div className={view === 'build' ? 'view-enter' : undefined} hidden={view !== 'build'}><BuildStudio /></div>
      </main>
      <CommandPalette commands={cmds} open={k} setOpen={setK} />
    </div>
  </WsProvider>;
}

function Boot() {
  return <div className="boot" aria-busy="true" aria-label="Loading workspace"><div className="boot-side"><span className="sk" style={{ height: 26, width: 90, marginBottom: 18 }} />{Array.from({ length: 8 }, (_, i) => <span key={i} className="sk" style={{ height: 30 }} />)}</div>
    <div className="boot-main"><span className="sk sk-line" style={{ width: 70 }} /><span className="sk sk-title" /><span className="sk sk-line" style={{ width: '55%' }} /><div className="boot-grid">{Array.from({ length: 6 }, (_, i) => <span key={i} className="sk sk-card" />)}</div></div></div>;
}

function GoogleMark() {
  return <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.1h12.5c-.3 2.1-1.6 5.2-4.7 7.3l7.6 5.9c4.5-4.1 6.7-10.2 6.7-17.2Z" />
    <path fill="#FBBC05" d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1Z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.9l-7.6-5.9c-2 1.4-4.8 2.5-8.3 2.5-6.3 0-11.7-3.7-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48Z" />
  </svg>;
}

function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in'); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [googleBusy, setGoogleBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [msg, setMsg] = useState(''); const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    // Provider errors come back on /app?authError=… (see app/auth/callback).
    const params = new URLSearchParams(location.search); const code = params.get('authError');
    if (code) {
      setError(new Error(code === 'access_denied' ? 'Google sign-in was cancelled. Try again, or use your email.' : 'We could not finish signing you in with Google. Try again, or use your email.'));
      params.delete('authError'); const qs = params.toString();
      history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}`);
    }
    // Only offer Google when the provider is switched on for this Supabase project.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    let live = true;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then(r => (r.ok ? r.json() : null))
      .then((s: { external?: { google?: boolean } } | null) => { if (live) setGoogle(!!s?.external?.google); })
      .catch(() => { if (live) setGoogle(false); });
    return () => { live = false; };
  }, []);
  async function withGoogle() {
    setError(null); setMsg(''); setGoogleBusy(true);
    try {
      const { error } = await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback?next=/app`, queryParams: { prompt: 'select_account' } } });
      if (error) throw error;
    } catch (err) { setError(err); setGoogleBusy(false); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setMsg('');
    const sb = createClient(); const redirect = `${location.origin}/auth/callback?next=/app`;
    try {
      if (mode === 'reset') { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect }); if (error) throw error; setMsg('If that address has an account, a reset link is on its way.'); }
      else if (mode === 'up') { const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } }); if (error) throw error; if (!data.session) setMsg('Check your inbox to confirm your address.'); }
      else { const { error } = await sb.auth.signInWithPassword({ email, password: pw }); if (error) throw error; location.reload(); }
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <div className="auth"><div className="auth-art"><Link href="/" className="wordmark lg">Ikar<em>vo</em></Link><div><p className="display">Build it, ship it, sell it. From one brief.</p><ul><li><b>01</b>Prompt to a working app, live in minutes</li><li><b>02</b>Push to GitHub, deploy to Vercel</li><li><b>03</b>UGC and motion ads, Meta campaigns</li><li><b>04</b>An AI CMO that writes the launch</li></ul></div><span className="small" style={{ color: '#9f988a', position: 'relative', zIndex: 1 }}>© Ikarvo</span></div>
    <form className="auth-card" onSubmit={submit}><h1>{mode === 'up' ? 'Create your account' : mode === 'reset' ? 'Reset password' : 'Welcome back'}</h1><p className="auth-sub">{mode === 'up' ? 'Free to start. No card needed.' : mode === 'reset' ? 'We’ll email you a secure link.' : 'Sign in to your workspace.'}</p>
      {google && mode !== 'reset' && <><button type="button" className="btn auth-google" onClick={withGoogle} disabled={busy || googleBusy}><GoogleMark />{googleBusy ? 'Opening Google…' : 'Continue with Google'}</button><div className="auth-sep"><span>or</span></div></>}
      <label className="label">Email<input className="input" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      {mode !== 'reset' && <label className="label">Password<input className="input" type="password" required minLength={8} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={e => setPw(e.target.value)} /></label>}
      <button className="btn primary wide" disabled={busy}>{busy ? <><span className="spin" aria-hidden />One moment…</> : mode === 'up' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
      {msg && <p className="small ok-text">{msg}</p>}<ErrorNote error={error} />
      <div className="row between small"><button type="button" className="link" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>{mode === 'up' ? 'Have an account? Sign in' : 'New here? Create an account'}</button>
        {mode === 'in' && <button type="button" className="link" onClick={() => setMode('reset')}>Forgot password?</button>}</div>
    </form></div>;
}

export default function Workspace() {
  const [shared, setShared] = useState<Shared[] | null>(null); const [active, setActive] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null); const [email, setEmail] = useState<string | null>(null); const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    api<Status>('/api/status').then(async s => {
      setStatus(s);
      if (s.preview) { setShared([]); setEmail('preview@local'); return; }
      if (!s.supabase.ok) return;
      const sb = createClient(); const { data } = await sb.auth.getUser();
      if (data.user) {
        let workspaces: Shared[] = [];
        try { workspaces = (await api<{ workspaces: Shared[] }>('/api/team')).workspaces; }
        catch (e) {
          // A stored token can outlive its account (deleted or revoked). Drop it rather than render a shell that cannot load data.
          if (e instanceof ApiError && e.status === 401) { await sb.auth.signOut().catch(() => {}); localStorage.removeItem(WS_KEY); setActiveWorkspace(null); setActive(null); setShared([]); setEmail(''); return; }
        }
        const want = localStorage.getItem(WS_KEY);
        const ok = workspaces.find(w => w.owner === want) ? want : null; if (!ok) localStorage.removeItem(WS_KEY);
        setActiveWorkspace(ok); setActive(ok); setShared(workspaces);
      } else setShared([]);
      setEmail(data.user?.email ?? '');
      sb.auth.onAuthStateChange((_e: string, sess: { user?: { email?: string } } | null) => setEmail(sess?.user?.email ?? ''));
    }).catch(setErr);
  }, []);
  if (err) return <div className="fullcenter"><ErrorNote error={err} /></div>;
  if (!status || ((email === null || shared === null) && (status.preview || status.supabase.ok))) return <Boot />;
  if (!status.preview && !status.supabase.ok) return <div className="fullcenter"><div className="auth-card"><h1>Connect a backend</h1><p className="muted">Add your Supabase project keys to <code>.env.local</code> and restart. To look around without a backend, set <code>PREVIEW_MODE=1</code> (development only).</p><div className="envs">{status.supabase.missing.map(k => <code key={k}>{k}</code>)}</div></div></div>;
  if (!status.preview && !email) return <AuthForm />;
  return <Suspense><Shell status={status} email={email || ''} mode={status.preview ? 'local' : 'cloud'} shared={shared ?? []} active={active} /></Suspense>;
}
