/* eslint-disable @next/next/no-img-element -- local object URLs */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { ErrorNote } from '../ws';
import { api } from '@/lib/client/api';
import { ASPECTS, FONTS, drawFrame, loadFont, total, uid, type Aspect, type Assets, type Bg, type CaptionStyle, type Device, type Project, type Scene, type Template, type TextAnim, type Transition } from './engine';
import { render, resolved, webmToMp4, CodecUnsupported, type Format, type Rendered } from './export';
import { audioCtx, idbPut, type AssetApi } from './assets';

const TPL: [Template, string][] = [['title', 'Title'], ['kinetic', 'Kinetic type'], ['device', 'Device mockup'], ['feature', 'Feature + bullets'], ['stat', 'Big number'], ['steps', 'Steps'], ['cta', 'End card / CTA'], ['broll', 'B-roll (image/video)'], ['avatar', 'Actor / avatar']];
const ANIMS: TextAnim[] = ['rise', 'pop', 'mask', 'type', 'split', 'none'];
const TRANS: Transition[] = ['cut', 'fade', 'slide', 'push', 'zoom', 'wipe'];
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
export type SavedRender = { id: string; name: string; project: string; format: Format | 'png'; width: number; height: number; duration: number; audio: boolean; at: string; size: number };

function activeVideos(p: Project, assets: Assets, t: number) {
  const out: [HTMLVideoElement, number][] = []; const used = new Set<HTMLVideoElement>();
  if (p.avatar) { const a = assets.get(p.avatar.asset); if (a?.el instanceof HTMLVideoElement) { out.push([a.el, t]); used.add(a.el); } }
  let acc = 0; for (const s of p.scenes) { if (s.image) { const a = assets.get(s.image); if (a?.el instanceof HTMLVideoElement && !used.has(a.el) && t >= acc && t < acc + s.dur) out.push([a.el, t - acc]); } acc += s.dur; }
  return out;
}

export default function Editor({ project: p, setProject, assets: A, onRendered }: { project: Project; setProject: (f: (p: Project) => Project) => void; assets: AssetApi; onRendered?: (r: SavedRender) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null); const [t, setT] = useState(0); const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<string>(p.scenes[0]?.id ?? ''); const [err, setErr] = useState<unknown>(null);
  const T = total(p); const tRef = useRef(0); tRef.current = t; const pRef = useRef(p); pRef.current = p;
  const srcs = useRef<AudioBufferSourceNode[]>([]);
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => { Promise.all([loadFont(p.brand.display), loadFont(p.brand.body)]).then(() => document.fonts.ready).then(() => setFontsReady(n => n + 1)); }, [p.brand.display, p.brand.body]);

  const draw = useCallback((time: number) => { const c = canvas.current; if (!c) return; const [w, h] = ASPECTS[pRef.current.aspect]; const s = 540 / Math.max(w, h); c.width = Math.round(w * s); c.height = Math.round(h * s); drawFrame(c.getContext('2d')!, resolved(pRef.current), A.assets, time, [c.width, c.height]); }, [A.assets]);
  useEffect(() => { if (playing) return; for (const [v, vt] of activeVideos(p, A.assets, t)) { v.pause(); if (Math.abs(v.currentTime - vt) > 0.04) v.currentTime = Math.min(vt, (v.duration || 1e9) - 0.05); } draw(t); const id = setTimeout(() => draw(t), 120); return () => clearTimeout(id); }, [p, t, playing, draw, A.assets, fontsReady]);

  const stopAudio = () => { srcs.current.forEach(s => { try { s.stop(); } catch {} }); srcs.current = []; };
  useEffect(() => {
    if (!playing) { stopAudio(); [...A.assets.values()].forEach(a => a.el instanceof HTMLVideoElement && a.el.pause()); return; }
    const ctx = audioCtx(); void ctx.resume(); const start = ctx.currentTime - tRef.current; const pp = pRef.current;
    for (const tr of [pp.music && { ...pp.music, m: true }, pp.voice, pp.avatar].filter(Boolean) as { asset: string; volume: number; m?: boolean }[]) {
      const b = A.assets.get(tr.asset)?.buffer; if (!b || tRef.current >= b.duration) continue; const s = ctx.createBufferSource(); s.buffer = b; const g = ctx.createGain(); g.gain.value = tr.m && (pp.voice || pp.avatar) ? tr.volume * 0.45 : tr.volume; s.connect(g).connect(ctx.destination); s.start(0, tRef.current); srcs.current.push(s);
    }
    let raf = 0; const tick = () => { const now = ctx.currentTime - start; if (now >= total(pRef.current)) { setPlaying(false); setT(0); return; }
      for (const [v, vt] of activeVideos(pRef.current, A.assets, now)) { if (v.paused) void v.play().catch(() => {}); if (Math.abs(v.currentTime - vt) > 0.3) v.currentTime = vt; }
      draw(now); setT(now); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => { cancelAnimationFrame(raf); stopAudio(); };
  }, [playing, draw, A.assets]);

  const scene = p.scenes.find(s => s.id === sel) ?? p.scenes[0];
  const upd = (patch: Partial<Scene>) => setProject(q => ({ ...q, scenes: q.scenes.map(s => s.id === scene.id ? { ...s, ...patch } : s) }));
  const seekScene = (id: string) => { let acc = 0; for (const s of p.scenes) { if (s.id === id) { setT(acc + Math.min(1.2, s.dur * 0.6)); break; } acc += s.dur; } setSel(id); };
  const addScene = (tpl: Template) => { const s: Scene = { id: uid(), template: tpl, dur: 2.8, headline: tpl === 'cta' ? 'Start free today' : 'New scene', anim: 'rise', transition: 'fade', bg: 'solid' }; setProject(q => { const i = q.scenes.findIndex(x => x.id === sel); const sc = [...q.scenes]; sc.splice(i + 1, 0, s); return { ...q, scenes: sc }; }); setSel(s.id); };
  const pickImage = async (f: File | undefined) => { if (!f) return; try { const a = await A.addBlob(f, f.name); upd({ image: a.id, ...(scene.template === 'title' || scene.template === 'kinetic' ? { bg: 'image' as Bg } : {}) }); } catch (e) { setErr(e); } };

  // timeline drag (reorder) + resize
  const dragId = useRef<string | null>(null); const pps = 46;
  const onResize = (id: string) => (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); const x0 = e.clientX; const d0 = p.scenes.find(s => s.id === id)!.dur;
    const mv = (ev: PointerEvent) => setProject(q => ({ ...q, scenes: q.scenes.map(s => s.id === id ? { ...s, dur: Math.round(Math.max(0.6, Math.min(15, d0 + (ev.clientX - x0) / pps)) * 10) / 10 } : s) }));
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); };
  const drop = (target: string) => { const id = dragId.current; dragId.current = null; if (!id || id === target) return; setProject(q => { const sc = q.scenes.filter(s => s.id !== id); const i = sc.findIndex(s => s.id === target); sc.splice(i, 0, q.scenes.find(s => s.id === id)!); return { ...q, scenes: sc }; }); };
  const lane = (k: 'music' | 'voice' | 'avatar') => { const tr = p[k]; const a = tr && A.assets.get(tr.asset); return a ? { a, w: Math.min(T, a.duration ?? T) * pps } : null; };
  const addTrack = async (k: 'music' | 'voice', f?: File) => { if (!f) return; try { const a = await A.addBlob(f, f.name); setProject(q => ({ ...q, [k]: { asset: a.id, volume: k === 'music' ? 0.6 : 1 } })); } catch (e) { setErr(e); } };

  return <div className="ed">
    <div className="ed-stage">
      <div className={`ed-canvas a${p.aspect.replace(':', '-')}`}><canvas ref={canvas} aria-label="Video preview" />{p.safe && <div className="safe" />}</div>
      <div className="ed-transport">
        <button className="btn sm icon" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(x => !x)}><Icon name={playing ? 'pause' : 'play'} /></button>
        <input type="range" className="scrub" min={0} max={T} step={0.01} value={Math.min(t, T)} onChange={e => { setPlaying(false); setT(+e.target.value); }} aria-label="Scrub" />
        <span className="mono small">{fmt(t)} / {fmt(T)}</span>
        <div className="seg">{(Object.keys(ASPECTS) as Aspect[]).map(a => <button key={a} className={p.aspect === a ? 'on' : ''} onClick={() => setProject(q => ({ ...q, aspect: a }))}>{a}</button>)}</div>
        <label className="chk small"><input type="checkbox" checked={!!p.safe} onChange={e => setProject(q => ({ ...q, safe: e.target.checked }))} />Safe zones</label>
        <label className="chk small"><input type="checkbox" checked={p.grain !== false} onChange={e => setProject(q => ({ ...q, grain: e.target.checked }))} />Film grain</label>
      </div>
    </div>

    <aside className="ed-side">
      <BrandKit p={p} setProject={setProject} A={A} onErr={setErr} />
      {scene && <section className="ed-card"><div className="row between"><h3 className="h3">Scene {p.scenes.indexOf(scene) + 1}</h3>
        <div className="row"><button className="btn ghost sm icon" title="Duplicate" aria-label="Duplicate scene" onClick={() => { const c = { ...scene, id: uid() }; setProject(q => { const sc = [...q.scenes]; sc.splice(sc.indexOf(scene) + 1, 0, c); return { ...q, scenes: sc }; }); setSel(c.id); }}><Icon name="copy" /></button>
          <button className="btn ghost sm icon" title="Delete" aria-label="Delete scene" disabled={p.scenes.length < 2} onClick={() => { setProject(q => ({ ...q, scenes: q.scenes.filter(s => s.id !== scene.id) })); setSel(p.scenes.find(s => s.id !== scene.id)?.id ?? ''); }}><Icon name="x" /></button></div></div>
        <label className="label">Layout<select className="input" value={scene.template} onChange={e => upd({ template: e.target.value as Template })}>{TPL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {['title', 'device', 'feature', 'steps'].includes(scene.template) && <label className="label">Kicker<input className="input" value={scene.kicker ?? ''} onChange={e => upd({ kicker: e.target.value })} /></label>}
        {scene.template === 'stat' && <label className="label">Number<input className="input" value={scene.stat ?? ''} onChange={e => upd({ stat: e.target.value })} /></label>}
        <label className="label">{scene.template === 'cta' ? 'Line' : 'Headline'}<textarea rows={2} value={scene.headline} onChange={e => upd({ headline: e.target.value })} /></label>
        {scene.template !== 'kinetic' && <label className="label">{scene.template === 'cta' ? 'Button' : 'Supporting line'}<input className="input" value={scene.sub ?? ''} onChange={e => upd({ sub: e.target.value })} /></label>}
        {['feature', 'steps'].includes(scene.template) && <label className="label">{scene.template === 'steps' ? 'Steps' : 'Bullets'} (one per line)<textarea rows={3} value={(scene.items ?? []).join('\n')} onChange={e => upd({ items: e.target.value.split('\n').slice(0, 5) })} /></label>}
        {['device', 'feature'].includes(scene.template) && <label className="label">Mockup<div className="seg wide">{(['phone', 'laptop', 'browser', 'none'] as Device[]).map(d => <button key={d} className={(scene.device ?? 'browser') === d ? 'on' : ''} onClick={() => upd({ device: d })}>{d}</button>)}</div></label>}
        <div className="label">{scene.template === 'device' || scene.template === 'feature' ? 'Screenshot / screen recording' : 'Image or video'}
          <div className="row">{scene.image && A.assets.get(scene.image) ? <span className="chip">{A.assets.get(scene.image)!.name.slice(0, 26)}</span> : <span className="small muted">None</span>}
            <label className="btn sm"><Icon name="image" />Upload<input type="file" hidden accept="image/*,video/*" onChange={e => pickImage(e.target.files?.[0])} /></label>
            {scene.image && <button className="btn ghost sm" onClick={() => upd({ image: undefined, bg: scene.bg === 'image' ? 'solid' : scene.bg })}>Remove</button>}</div></div>
        <div className="two"><label className="label">Text motion<select className="input" value={scene.anim} onChange={e => upd({ anim: e.target.value as TextAnim })}>{ANIMS.map(a => <option key={a}>{a}</option>)}</select></label>
          <label className="label">Transition in<select className="input" value={scene.transition} onChange={e => upd({ transition: e.target.value as Transition })}>{TRANS.map(a => <option key={a}>{a}</option>)}</select></label></div>
        <div className="two"><label className="label">Background<select className="input" value={scene.bg} onChange={e => upd({ bg: e.target.value as Bg })}>{(['solid', 'gradient', 'grid', 'image'] as Bg[]).map(a => <option key={a} disabled={a === 'image' && !scene.image}>{a}</option>)}</select></label>
          <label className="label">Tone<select className="input" value={scene.tone ?? 'light'} onChange={e => upd({ tone: e.target.value as Scene['tone'] })}><option value="light">Brand background</option><option value="dark">Dark</option><option value="accent">Accent</option></select></label></div>
        <label className="label">Duration {scene.dur.toFixed(1)}s<input type="range" min={0.6} max={10} step={0.1} value={scene.dur} onChange={e => upd({ dur: +e.target.value })} /></label>
      </section>}
    </aside>

    <section className="tl" aria-label="Timeline">
      <div className="tl-head"><span className="small muted">Timeline · drag to reorder, drag the right edge to trim</span>
        <div className="row"><select className="input sm" value="" onChange={e => e.target.value && addScene(e.target.value as Template)} aria-label="Add scene"><option value="">+ Add scene…</option>{TPL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div></div>
      <div className="tl-body" onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const x = e.clientX - r.left + (e.currentTarget as HTMLElement).scrollLeft - 88; if (x >= 0 && (e.target as HTMLElement).classList.contains('tl-body')) { setPlaying(false); setT(Math.min(T, x / pps)); } }}>
        <div className="tl-lane"><span className="tl-lab">Scenes</span><div className="tl-track">{p.scenes.map((s, i) => <div key={s.id} draggable onDragStart={() => { dragId.current = s.id; }} onDragOver={e => e.preventDefault()} onDrop={() => drop(s.id)}
            className={`tl-clip ${s.id === scene?.id ? 'on' : ''} t-${s.template}`} style={{ width: s.dur * pps }} onClick={() => seekScene(s.id)} title={s.headline}>
            <b>{i + 1}</b><span>{s.stat ? `${s.stat} ` : ''}{s.headline}</span><em>{s.dur.toFixed(1)}s · {s.transition}</em><i className="tl-grip" onPointerDown={onResize(s.id)} /></div>)}</div></div>
        {(['avatar', 'voice', 'music'] as const).map(k => { const l = lane(k); if (k === 'avatar' && !l) return null;
          return <div key={k} className="tl-lane"><span className="tl-lab">{k === 'avatar' ? 'Actor' : k === 'voice' ? 'Voice' : 'Music'}</span><div className="tl-track">
            {l ? <div className={`tl-audio a-${k}`} style={{ width: Math.max(40, l.w) }}><span>{l.a.name.slice(0, 40)}</span>
                <input type="range" min={0} max={1.5} step={0.05} value={p[k]!.volume} aria-label={`${k} volume`} onClick={e => e.stopPropagation()} onChange={e => setProject(q => ({ ...q, [k]: { ...q[k]!, volume: +e.target.value } }))} />
                <button className="btn ghost sm icon" aria-label={`Remove ${k}`} onClick={() => setProject(q => ({ ...q, [k]: undefined }))}>×</button></div>
              : k !== 'avatar' && <label className="tl-empty">{k === 'music' ? 'Add a music track (your own licensed file)' : 'Add voiceover audio'}<input type="file" hidden accept="audio/*" onChange={e => addTrack(k, e.target.files?.[0])} /></label>}
          </div></div>; })}
        <div className="tl-lane"><span className="tl-lab">Captions</span><div className="tl-track caps">
          {p.captions?.words.length ? <>{p.captions.words.slice(0, 400).map((w, i) => <span key={i} className="cw" style={{ left: w.start * pps, width: Math.max(8, (w.end - w.start) * pps - 2) }}>{w.w}</span>)}</>
            : <span className="tl-empty static">Captions come from the voiceover (UGC tab) or a script below.</span>}</div></div>
        <div className="tl-head-line" style={{ left: 88 + t * pps }} />
      </div>
      <CaptionBar p={p} setProject={setProject} />
    </section>
    <ExportPanel p={p} A={A} onRendered={onRendered} />
    <ErrorNote error={err} onClose={() => setErr(null)} />
  </div>;
}

function CaptionBar({ p, setProject }: { p: Project; setProject: (f: (p: Project) => Project) => void }) {
  const c = p.captions;
  return <div className="row cap-bar"><label className="chk small"><input type="checkbox" checked={!!c?.on} disabled={!c?.words.length} onChange={e => setProject(q => ({ ...q, captions: { ...q.captions!, on: e.target.checked } }))} />Burn in captions</label>
    <div className="seg">{(['bold', 'box', 'minimal'] as CaptionStyle[]).map(s => <button key={s} disabled={!c?.words.length} className={c?.style === s ? 'on' : ''} onClick={() => setProject(q => ({ ...q, captions: { ...q.captions!, style: s } }))}>{s}</button>)}</div>
    {c?.estimated && <span className="small warn-text">Timing estimated from text length (this voice provider returns no word timestamps).</span>}</div>;
}

function BrandKit({ p, setProject, A, onErr }: { p: Project; setProject: (f: (p: Project) => Project) => void; A: AssetApi; onErr: (e: unknown) => void }) {
  const [open, setOpen] = useState(false); const [url, setUrl] = useState(p.brand.url ? `https://${p.brand.url.replace(/^https?:\/\//, '')}` : ''); const [busy, setBusy] = useState(false); const [found, setFound] = useState<string[]>([]);
  const b = p.brand; const set = (patch: Partial<typeof b>) => setProject(q => ({ ...q, brand: { ...q.brand, ...patch } }));
  async function fromSite() { setBusy(true); try { const r = await api<{ colors: { hex: string }[]; themeColor: string | null; logo: string | null }>('/api/growth/design', { url }); const cs = [r.themeColor, ...r.colors.map(c => c.hex)].filter((x): x is string => !!x && /^#[0-9a-f]{6}$/i.test(x)); setFound([...new Set(cs)].slice(0, 10)); if (r.logo) { try { const a = await A.addUrl(r.logo, 'logo'); if (a.kind === 'image') set({ logo: a.id }); } catch {} } set({ url: url.replace(/^https?:\/\//, '').replace(/\/$/, '') }); } catch (e) { onErr(e); } finally { setBusy(false); } }
  return <section className="ed-card"><button className="row between wide plain" onClick={() => setOpen(o => !o)} aria-expanded={open}><h3 className="h3">Brand kit</h3><span className="swatches">{[b.bg, b.fg, b.accent, b.accent2].map((c, i) => <i key={i} style={{ background: c }} />)}<Icon name={open ? 'chevron-up' : 'chevron-down'} /></span></button>
    {open && <>
      <div className="two"><label className="label">Name<input className="input" value={b.name} onChange={e => set({ name: e.target.value })} /></label><label className="label">URL on end card<input className="input" value={b.url ?? ''} onChange={e => set({ url: e.target.value })} /></label></div>
      <div className="colors">{(['bg', 'fg', 'accent', 'accent2'] as const).map(k => <label key={k} className="label">{({ bg: 'Background', fg: 'Text', accent: 'Accent', accent2: 'Second' })[k]}<input type="color" className="input color" value={b[k]} onChange={e => set({ [k]: e.target.value })} /></label>)}</div>
      <div className="two"><label className="label">Display font<select className="input" value={b.display} onChange={e => set({ display: e.target.value })}>{FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}</select></label>
        <label className="label">Body font<select className="input" value={b.body} onChange={e => set({ body: e.target.value })}>{FONTS.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}</select></label></div>
      <div className="label">Logo<div className="row">{b.logo && A.assets.get(b.logo) ? <img className="logo-thumb" src={A.assets.get(b.logo)!.url} alt="Logo" /> : <span className="small muted">None</span>}<label className="btn sm">Upload<input type="file" hidden accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) try { set({ logo: (await A.addBlob(f, f.name)).id }); } catch (er) { onErr(er); } }} /></label>{b.logo && <button className="btn ghost sm" onClick={() => set({ logo: undefined })}>Remove</button>}</div></div>
      <div className="label">Pull colors and logo from your site<div className="row"><input className="input" placeholder="https://yourproduct.com" value={url} onChange={e => setUrl(e.target.value)} /><button className="btn sm" disabled={busy || url.length < 4} onClick={fromSite}>{busy ? <span className="spin" /> : 'Fetch'}</button></div></div>
      {!!found.length && <div className="found"><span className="small muted">Found on the site, click to use as accent (shift-click for background):</span><div className="swatches big">{found.map(c => <button key={c} title={c} style={{ background: c }} onClick={e => set(e.shiftKey ? { bg: c } : { accent: c })} />)}</div></div>}
    </>}</section>;
}

function ExportPanel({ p, A, onRendered }: { p: Project; A: AssetApi; onRendered?: (r: SavedRender) => void }) {
  const [format, setFormat] = useState<Format>('mp4'); const [height, setHeight] = useState<720 | 1080>(1080); const [fps, setFps] = useState<30 | 60>(30);
  const [aspects, setAspects] = useState<Aspect[]>([p.aspect]); const [prog, setProg] = useState<{ p: number; label: string } | null>(null);
  const [out, setOut] = useState<(Rendered & { url: string; id: string })[]>([]); const [err, setErr] = useState<unknown>(null); const [fallback, setFallback] = useState(false); const ab = useRef<AbortController | null>(null);
  useEffect(() => { setAspects(a => a.includes(p.aspect) ? a : [p.aspect, ...a]); }, [p.aspect]);
  async function go() {
    setErr(null); setFallback(false); ab.current = new AbortController();
    try {
      for (const [i, asp] of aspects.entries()) {
        const q = { ...p, aspect: asp }; let r: Rendered;
        const hasAudio = !!(q.music || q.voice || q.avatar); const aacOk = !hasAudio || format !== 'mp4' || (typeof AudioEncoder !== 'undefined' && !!(await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 }).catch(() => ({ supported: false }))).supported);
        try { if (!aacOk) throw new CodecUnsupported('no AAC encoder'); r = await render(q, A.assets, { format, height, fps, signal: ab.current.signal, onProgress: (x, label) => setProg({ p: (i + x) / aspects.length, label: `${asp} · ${label}` }) }); }
        catch (e) { if (e instanceof CodecUnsupported && format === 'mp4') { setFallback(true); setProg({ p: i / aspects.length, label: `${asp} · ${aacOk ? 'H.264' : 'AAC audio'} encoder unavailable, rendering WebM then converting with ffmpeg.wasm` });
            const w = await render(q, A.assets, { format: 'webm', height, fps, signal: ab.current.signal, onProgress: (x, label) => setProg({ p: (i + x * 0.6) / aspects.length, label: `${asp} · ${label}` }) });
            const mp4 = await webmToMp4(w.blob, x => setProg({ p: (i + 0.6 + x * 0.4) / aspects.length, label: `${asp} · Converting to MP4 (ffmpeg.wasm)` }));
            r = { ...w, blob: mp4, format: 'mp4', name: w.name.replace(/\.webm$/, '.mp4'), codec: 'h264 (ffmpeg.wasm)' }; } else throw e; }
        const id = uid(); const name = `${(p.name || 'ad').replace(/[^\w-]+/g, '-').toLowerCase()}-${asp.replace(':', 'x')}-${height}p.${r.format}`;
        await idbPut(`render:${id}`, { blob: r.blob, meta: { id, name, project: p.name, format: r.format, width: r.width, height: r.height, duration: r.duration, audio: r.audio, at: new Date().toISOString(), size: r.blob.size } satisfies SavedRender }).catch(() => {});
        onRendered?.({ id, name, project: p.name, format: r.format, width: r.width, height: r.height, duration: r.duration, audio: r.audio, at: new Date().toISOString(), size: r.blob.size });
        setOut(o => [{ ...r, name, id, url: URL.createObjectURL(r.blob) }, ...o]);
      }
    } catch (e) { if ((e as Error)?.name !== 'AbortError') setErr(e); } finally { setProg(null); ab.current = null; }
  }
  return <section className="ed-export"><div className="row between"><h3 className="h3">Export</h3><span className="small muted">Rendered on your device with WebCodecs. Nothing is uploaded.</span></div>
    <div className="exp-opts">
      <div className="label">Formats<div className="seg">{(['mp4', 'webm'] as Format[]).map(f => <button key={f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>)}</div></div>
      <div className="label">Quality<div className="seg">{([720, 1080] as const).map(h => <button key={h} className={height === h ? 'on' : ''} onClick={() => setHeight(h)}>{h}p</button>)}</div></div>
      <div className="label">Frame rate<div className="seg">{([30, 60] as const).map(f => <button key={f} className={fps === f ? 'on' : ''} onClick={() => setFps(f)}>{f} fps</button>)}</div></div>
      <div className="label">Sizes<div className="seg wrap">{(Object.keys(ASPECTS) as Aspect[]).map(a => <button key={a} className={aspects.includes(a) ? 'on' : ''} onClick={() => setAspects(x => x.includes(a) ? (x.length > 1 ? x.filter(y => y !== a) : x) : [...x, a])}>{a}</button>)}</div></div>
      {prog ? <button className="btn" onClick={() => ab.current?.abort()}>Cancel</button> : <button className="btn primary" onClick={go}><Icon name="download" />Render {aspects.length > 1 ? `${aspects.length} videos` : 'video'}</button>}
    </div>
    {prog && <div className="progress" role="progressbar" aria-valuenow={Math.round(prog.p * 100)}><i style={{ width: `${prog.p * 100}%` }} /><span>{prog.label} · {Math.round(prog.p * 100)}%</span></div>}
    {fallback && <p className="small muted">This browser lacks a native H.264 or AAC encoder, so MP4 was produced by converting WebM with ffmpeg.wasm (about 30 MB, loaded once from unpkg).</p>}
    <ErrorNote error={err} onClose={() => setErr(null)} />
    {!!out.length && <div className="renders">{out.map(r => <figure key={r.id} className="render"><video src={r.url} controls playsInline />
      <figcaption><b>{r.name}</b><span className="small muted">{r.width}×{r.height} · {r.duration.toFixed(1)}s · {(r.blob.size / 1e6).toFixed(1)} MB · {r.codec}{r.audio ? ' · audio' : ' · silent'}</span>
        {r.warnings.map(w => <span key={w} className="small warn-text">{w}</span>)}<a className="btn sm" href={r.url} download={r.name}><Icon name="download" />Download</a></figcaption></figure>)}</div>}
  </section>;
}
