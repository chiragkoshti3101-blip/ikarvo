/* eslint-disable @next/next/no-img-element -- local object URLs */
'use client';
import { useEffect, useState } from 'react';
import Icon from '../Icon';
import { ErrorNote, Pill, useWs } from '../ws';
import { download } from '@/lib/client/api';
import { postFile } from '@/lib/client/upload';
import { idbDel, idbGet, idbKeys } from './assets';
import type { SavedRender } from './Editor';
import type { Readiness } from './Ugc';

type Item = SavedRender & { url: string; blob: Blob };
const CHANNELS = ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Facebook', 'LinkedIn', 'X', 'Meta Ads'];

export default function Deliver({ ready, rev }: { ready: Readiness | null; rev: number }) {
  const { store, toast, go } = useWs(); const [items, setItems] = useState<Item[]>([]); const [sel, setSel] = useState<string>('');
  const [target, setTarget] = useState('meta_page'); const [title, setTitle] = useState(''); const [desc, setDesc] = useState(''); const [privacy, setPrivacy] = useState('private');
  const [when, setWhen] = useState(() => { const d = new Date(Date.now() + 864e5); d.setMinutes(0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); }); const [chan, setChan] = useState('TikTok');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null); const [result, setResult] = useState<{ status: string; url?: string | null; note?: string; id?: string } | null>(null);
  useEffect(() => { let off = false; (async () => { const keys = await idbKeys('render:').catch(() => []); const out: Item[] = [];
    for (const k of keys) { const v = await idbGet<{ blob: Blob; meta: SavedRender }>(k); if (v) out.push({ ...v.meta, blob: v.blob, url: URL.createObjectURL(v.blob) }); }
    out.sort((a, b) => b.at.localeCompare(a.at)); if (!off) { setItems(out); setSel(s => s || out[0]?.id || ''); } })(); return () => { off = true; }; }, [rev]);
  const it = items.find(i => i.id === sel); const t = ready?.targets[target]; const isVideo = it && it.format !== 'png';
  useEffect(() => { if (it) setTitle(it.project); }, [it?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function publish() {
    if (!it) return; setBusy(true); setErr(null); setResult(null);
    try { const d = await postFile<NonNullable<typeof result>>('/api/ad/publish', new File([it.blob], it.name, { type: it.blob.type }), { target, title, description: desc, privacy }, { cloud: store.mode === 'cloud' });
      setResult(d); toast(`Uploaded to ${t?.label}: ${d.status}`); } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  async function schedule() {
    if (!it) return; const at = new Date(when); await store.save('posts', { title: `${chan} · ${it.project}`, data: { channel: chan, when, at: at.toISOString(), text: [title, desc].filter(Boolean).join('\n\n') || it.project, hashtags: [], approved: false, media: it.name } });
    const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; const end = new Date(at.getTime() + 15 * 6e4);
    download(`${it.name}.ics`, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ikarvo//Ad Studio//EN', 'BEGIN:VEVENT', `UID:${it.id}@ikarvo`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(at)}`, `DTEND:${f(end)}`, `SUMMARY:Post ${it.name} on ${chan}`, `DESCRIPTION:${(title + ' ' + desc).replace(/\n/g, '\\n').slice(0, 900)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'), 'text/calendar');
    toast(`Added to the content calendar for ${at.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`);
  }

  if (!items.length) return <div className="empty"><Icon name="film" /><h3>No renders yet</h3><p className="muted">Export a video in the Launch video or UGC tab, or save a static ad. Renders are kept in this browser (IndexedDB) until you publish or delete them.</p></div>;
  return <div className="deliver">
    <section className="dl-list">{items.map(i => <button key={i.id} className={`dl-item ${i.id === sel ? 'on' : ''}`} onClick={() => { setSel(i.id); setResult(null); }}>
      {i.format === 'png' ? <img src={i.url} alt="" /> : <video src={`${i.url}#t=1.5`} muted preload="metadata" />}
      <span><b>{i.name}</b><span className="small muted">{i.width}×{i.height}{i.duration ? ` · ${i.duration.toFixed(1)}s` : ''} · {(i.size / 1e6).toFixed(1)} MB</span></span></button>)}</section>
    {it && <section className="dl-main">
      <div className="dl-preview">{isVideo ? <video src={`${it.url}#t=1.5`} controls playsInline /> : <img src={it.url} alt={it.name} />}</div>
      <div className="row"><a className="btn" href={it.url} download={it.name}><Icon name="download" />Download</a><button className="btn ghost" onClick={async () => { await idbDel(`render:${it.id}`); setItems(x => x.filter(y => y.id !== it.id)); setSel(''); }}><Icon name="trash" />Delete</button></div>
      {isVideo ? <div className="ed-card"><h3 className="h3">Publish</h3>
        <div className="targets">{Object.entries(ready?.targets ?? {}).map(([k, r]) => <button key={k} className={`prov ${target === k ? 'on' : ''}`} onClick={() => setTarget(k)}><b>{r.label}</b><Pill ok={!r.missing.length}>{r.missing.length ? 'Not set up' : 'Ready'}</Pill></button>)}</div>
        {t && !!t.missing.length && <p className="small warn-text">Add {t.missing.join(', ')} to the server environment. <button className="link" onClick={() => go('integrations')}>See Integrations</button></p>}
        {target === 'youtube' && <p className="small muted">Needs Google connected with “Add YouTube” in Integrations. Unaudited Google apps can only upload private videos.</p>}
        {target === 'tiktok' && <p className="small muted">Uploads land in your TikTok inbox as a draft; you add the caption and post in the app.</p>}
        <label className="label">Title<input className="input" value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="label">Description / caption<textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} /></label>
        {(target === 'youtube' || target === 'meta_page') && <label className="label">Visibility<select className="input" value={privacy} onChange={e => setPrivacy(e.target.value)}><option value="private">Private / unpublished</option><option value="unlisted">Unlisted (YouTube)</option><option value="public">Public</option></select></label>}
        <button className="btn primary" disabled={busy || !!t?.missing.length} onClick={publish}>{busy ? <><span className="spin" />Uploading…</> : <><Icon name="upload" />Upload to {t?.label}</>}</button>
        {it.size > 4.5e6 && <p className="small muted">This file is {(it.size / 1e6).toFixed(1)} MB. On Vercel, request bodies over 4.5 MB are rejected; self-hosted Node has no such cap.</p>}
        {result && <div className="note ok"><b>{result.status}</b>{result.id && <span className="mono small"> id {result.id}</span>}{result.url && <> · <a href={result.url} target="_blank" rel="noreferrer">Open</a></>}{result.note && <p className="small">{result.note}</p>}</div>}
      </div> : <p className="small muted">Static images: download and upload in Ads Manager / Campaign Manager, or schedule them as a post below.</p>}
      <div className="ed-card"><h3 className="h3">Schedule on the content calendar</h3>
        <div className="two"><label className="label">Channel<select className="input" value={chan} onChange={e => setChan(e.target.value)}>{CHANNELS.map(c => <option key={c}>{c}</option>)}</select></label><label className="label">When<input className="input" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></label></div>
        <div className="row"><button className="btn" onClick={schedule}><Icon name="calendar" />Add to calendar + .ics</button><button className="btn ghost" onClick={() => go('marketing', 'calendar')}>Open calendar</button></div>
        <p className="small muted">Creates an unapproved calendar entry referencing this file. Nothing is posted until you approve and publish it.</p></div>
      <ErrorNote error={err} onClose={() => setErr(null)} />
    </section>}
  </div>;
}
