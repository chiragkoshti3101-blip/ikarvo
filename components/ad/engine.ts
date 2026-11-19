/**
 * Ikarvo motion engine. Deterministic: drawFrame(ctx, project, t) always paints the same pixels for the same t,
 * so the preview, the scrubber and the frame-by-frame exporter share one code path.
 */
export type Aspect = '9:16' | '1:1' | '4:5' | '16:9';
export const ASPECTS: Record<Aspect, [number, number]> = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '16:9': [1920, 1080] };
export type Template = 'title' | 'kinetic' | 'device' | 'feature' | 'stat' | 'steps' | 'cta' | 'broll' | 'avatar';
export type TextAnim = 'rise' | 'pop' | 'mask' | 'type' | 'split' | 'none';
export type Transition = 'cut' | 'fade' | 'slide' | 'push' | 'zoom' | 'wipe';
export type Device = 'phone' | 'laptop' | 'browser' | 'none';
export type Bg = 'solid' | 'gradient' | 'grid' | 'image';
export type Scene = { id: string; template: Template; dur: number; kicker?: string; headline: string; sub?: string; stat?: string; items?: string[]; image?: string; device?: Device; anim: TextAnim; transition: Transition; bg: Bg; tone?: 'light' | 'dark' | 'accent' };
export type Brand = { name: string; bg: string; fg: string; accent: string; accent2: string; display: string; body: string; logo?: string; url?: string };
export type Word = { w: string; start: number; end: number };
export type CaptionStyle = 'bold' | 'box' | 'minimal';
export type Project = { id: string; name: string; aspect: Aspect; fps: number; brand: Brand; scenes: Scene[]; music?: { asset: string; volume: number }; voice?: { asset: string; volume: number }; avatar?: { asset: string; volume: number }; captions?: { on: boolean; style: CaptionStyle; words: Word[]; estimated?: boolean }; safe?: boolean; grain?: boolean };
export type Asset = { id: string; kind: 'image' | 'video' | 'audio'; name: string; url: string; el?: HTMLImageElement | HTMLVideoElement; buffer?: AudioBuffer; duration?: number };
export type Assets = Map<string, Asset>;

export const TRANS = 0.5;
export const uid = () => Math.random().toString(36).slice(2, 10);
export const total = (p: Project) => p.scenes.reduce((a, s) => a + s.dur, 0);
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t: number) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const spring = (t: number) => { t = clamp(t); return 1 - Math.exp(-6 * t) * Math.cos(9 * t); };

function hexA(hex: string, a: number) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function lum(hex: string) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = []; for (const para of text.split('\n')) { let line = ''; for (const w of para.split(/\s+/).filter(Boolean)) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t; } lines.push(line); }
  return lines.filter((l, i) => l || i === 0);
}
function cover(ctx: CanvasRenderingContext2D, el: CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number }, x: number, y: number, w: number, h: number, zoom = 1, pan = 0, fit: 'cover' | 'contain' = 'cover') {
  const iw = el.videoWidth || el.naturalWidth || el.width || 1, ih = el.videoHeight || el.naturalHeight || el.height || 1;
  const s = (fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)) * zoom; const dw = iw * s, dh = ih * s;
  ctx.drawImage(el, x + (w - dw) / 2 + pan * (dw - w) / 2, y + (h - dh) / 2, dw, dh);
}

type Ctx = { ctx: CanvasRenderingContext2D; W: number; H: number; u: number; p: Project; assets: Assets; t: number; global: number; s: Scene; colors: { bg: string; fg: string; mut: string; acc: string; acc2: string } };

function palette(p: Project, s: Scene) {
  const b = p.brand; const tone = s.tone ?? (lum(b.bg) > 0.5 ? 'light' : 'dark');
  if (tone === 'accent') return { bg: b.accent, fg: lum(b.accent) > 0.6 ? '#111111' : '#ffffff', mut: lum(b.accent) > 0.6 ? '#00000099' : '#ffffffb3', acc: b.fg === b.accent ? b.accent2 : (lum(b.accent) > 0.6 ? '#111111' : '#ffffff'), acc2: b.accent2 };
  if (tone === 'dark') { const bg = lum(b.bg) < 0.5 ? b.bg : b.fg; const fg = lum(b.bg) < 0.5 ? b.fg : b.bg; return { bg, fg, mut: hexA(fg, 0.62), acc: b.accent, acc2: b.accent2 }; }
  const bg = lum(b.bg) >= 0.5 ? b.bg : b.fg; const fg = lum(b.bg) >= 0.5 ? b.fg : b.bg; return { bg, fg, mut: hexA(fg, 0.6), acc: b.accent, acc2: b.accent2 };
}

function background(c: Ctx) {
  const { ctx, W, H, u, s, colors, global } = c; ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, W, H);
  if (s.bg === 'gradient') {
    const x = W * (0.25 + 0.12 * Math.sin(global * 0.35)), y = H * (0.3 + 0.1 * Math.cos(global * 0.3));
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.9); g.addColorStop(0, hexA(colors.acc, 0.35)); g.addColorStop(0.45, hexA(colors.acc2, 0.12)); g.addColorStop(1, hexA(colors.bg, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  } else if (s.bg === 'grid') {
    ctx.strokeStyle = hexA(colors.fg, 0.07); ctx.lineWidth = Math.max(1, u * 0.12); const step = u * 9; const off = (global * u * 3) % step;
    for (let x = -off; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = -off; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  } else if (s.bg === 'image' && s.image) { const a = c.assets.get(s.image); if (a?.el) { cover(ctx, a.el, 0, 0, W, H, 1.06 + 0.06 * (c.t / s.dur)); ctx.fillStyle = hexA(colors.bg, 0.55); ctx.fillRect(0, 0, W, H); } }
}

/** Kinetic text block. Returns the height used. */
function text(c: Ctx, str: string, x: number, y: number, maxW: number, size: number, opt: { font: string; weight: number; color: string; anim: TextAnim; delay?: number; lh?: number; align?: CanvasTextAlign; highlight?: string; tracking?: number }) {
  const { ctx, t } = c; ctx.font = `${opt.weight} ${size}px ${opt.font}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(opt.tracking ?? 0) * size}px`; } catch { /* older browsers */ }
  const lines = wrap(ctx, str, maxW); const lh = size * (opt.lh ?? 1.04); const t0 = t - (opt.delay ?? 0); let wi = 0;
  const out = c.s.dur - t < 0.35 && c.s.transition !== 'cut' ? 0 : 1; void out;
  lines.forEach((line, li) => {
    const words = line.split(' '); const lw = ctx.measureText(line).width; let cx = opt.align === 'center' ? x - lw / 2 : opt.align === 'right' ? x - lw : x; const by = y + size + li * lh;
    if (opt.anim === 'mask') { const k = easeOut((t0 - li * 0.12) / 0.6); ctx.save(); ctx.beginPath(); ctx.rect(cx - size, by - size * 1.05, lw + size * 2, size * 1.3); ctx.clip(); ctx.fillStyle = opt.color; ctx.fillText(line, cx, by + (1 - k) * size * 1.2); ctx.restore(); return; }
    if (opt.anim === 'type') { const chars = Math.floor(clamp(t0 / 1.2) * str.length); const before = lines.slice(0, li).join(' ').length + (li ? 1 : 0); const vis = line.slice(0, Math.max(0, chars - before)); ctx.fillStyle = opt.color; ctx.fillText(vis, cx, by); if (chars - before >= 0 && chars - before <= line.length && Math.floor(t * 2) % 2 === 0) ctx.fillRect(cx + ctx.measureText(vis).width + size * 0.05, by - size * 0.8, size * 0.06, size * 0.9); return; }
    for (const w of words) {
      const ww = ctx.measureText(w).width; const k = opt.anim === 'none' ? 1 : (opt.anim === 'pop' ? spring : easeOut)((t0 - wi * 0.07) / 0.55);
      const hi = opt.highlight && w.replace(/\W/g, '').toLowerCase() === opt.highlight.toLowerCase();
      ctx.save(); ctx.globalAlpha *= clamp(k * 1.4);
      if (opt.anim === 'rise') ctx.translate(0, (1 - k) * size * 0.6);
      if (opt.anim === 'pop') { ctx.translate(cx + ww / 2, by - size * 0.35); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); ctx.translate(-(cx + ww / 2), -(by - size * 0.35)); }
      if (opt.anim === 'split') { const n = w.length; let lx = cx; for (let i = 0; i < n; i++) { const ch = w[i]; const cw = ctx.measureText(ch).width; const kk = easeOut((t0 - wi * 0.05 - i * 0.025) / 0.5); ctx.globalAlpha = kk; ctx.fillStyle = hi ? c.colors.acc : opt.color; ctx.fillText(ch, lx + (1 - kk) * (i - n / 2) * size * 0.25, by - (1 - kk) * size * 0.3); lx += cw; } ctx.restore(); cx += ww + ctx.measureText(' ').width; wi++; continue; }
      if (hi) { ctx.fillStyle = c.colors.acc; rr(ctx, cx - size * 0.08, by - size * 0.86, (ww + size * 0.16) * easeOut((t0 - wi * 0.07 - 0.25) / 0.4), size * 1.06, size * 0.12); ctx.fill(); ctx.fillStyle = lum(c.colors.acc) > 0.6 ? '#111' : '#fff'; } else ctx.fillStyle = opt.color;
      ctx.fillText(w, cx, by); ctx.restore(); cx += ww + ctx.measureText(' ').width; wi++;
    }
  });
  try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'; } catch { /* noop */ }
  return lines.length * lh;
}

function device(c: Ctx, kind: Device, cx: number, cy: number, maxW: number, maxH: number, img?: HTMLImageElement | HTMLVideoElement) {
  const { ctx, u, t, colors } = c; const k = easeOut(t / 0.9); const float = Math.sin(c.global * 1.2) * u * 0.6;
  ctx.save(); ctx.translate(cx, cy + (1 - k) * u * 12 + float); ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k); ctx.globalAlpha *= clamp(k * 1.5);
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = u * 6; ctx.shadowOffsetY = u * 3;
  const screen = (x: number, y: number, w: number, h: number, r: number) => { ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip(); if (img) { ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h); cover(ctx, img, x, y, w, h, 1, 0, kind === 'phone' ? 'cover' : 'cover'); } else { const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, hexA(colors.acc, 0.9)); g.addColorStop(1, hexA(colors.acc2, 0.9)); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `600 ${u * 3}px ${c.p.brand.body}`; ctx.textAlign = 'center'; ctx.fillText('Add a screenshot', x + w / 2, y + h / 2); ctx.textAlign = 'left'; } ctx.restore(); };
  if (kind === 'phone') { let h = maxH, w = h * 0.49; if (w > maxW) { w = maxW; h = w / 0.49; } const r = w * 0.16;
    ctx.fillStyle = '#0d0d0f'; rr(ctx, -w / 2, -h / 2, w, h, r); ctx.fill(); ctx.shadowColor = 'transparent'; const b = w * 0.035; screen(-w / 2 + b, -h / 2 + b, w - b * 2, h - b * 2, r * 0.82);
    ctx.fillStyle = '#0d0d0f'; rr(ctx, -w * 0.15, -h / 2 + b * 1.6, w * 0.3, w * 0.075, w * 0.04); ctx.fill(); }
  else if (kind === 'laptop') { let w = maxW, h = w * 0.62; if (h > maxH) { h = maxH; w = h / 0.62; } const sh = h * 0.9;
    ctx.fillStyle = '#1b1b1e'; rr(ctx, -w * 0.44, -h / 2, w * 0.88, sh, w * 0.02); ctx.fill(); ctx.shadowColor = 'transparent'; const b = w * 0.018; screen(-w * 0.44 + b, -h / 2 + b, w * 0.88 - b * 2, sh - b * 2, w * 0.006);
    ctx.fillStyle = '#c9c9ce'; rr(ctx, -w / 2, -h / 2 + sh, w, h * 0.06, w * 0.01); ctx.fill(); ctx.fillStyle = '#9b9ba1'; rr(ctx, -w * 0.08, -h / 2 + sh, w * 0.16, h * 0.022, w * 0.008); ctx.fill(); }
  else { let w = maxW, h = w * 0.66; if (h > maxH) { h = maxH; w = h / 0.66; } const bar = h * 0.075;
    ctx.fillStyle = '#ffffff'; rr(ctx, -w / 2, -h / 2, w, h, w * 0.018); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#efefef'; rr(ctx, -w / 2, -h / 2, w, bar, [w * 0.018, w * 0.018, 0, 0] as unknown as number); ctx.fill();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-w / 2 + bar * (0.6 + i * 0.55), -h / 2 + bar / 2, bar * 0.16, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = '#ffffff'; rr(ctx, -w * 0.25, -h / 2 + bar * 0.22, w * 0.5, bar * 0.56, bar * 0.28); ctx.fill(); ctx.fillStyle = '#777'; ctx.font = `${bar * 0.3}px ${c.p.brand.body}`; ctx.textAlign = 'center'; ctx.fillText(c.p.brand.url || `${c.p.brand.name.toLowerCase().replace(/\s+/g, '')}.com`, 0, -h / 2 + bar * 0.6); ctx.textAlign = 'left';
    screen(-w / 2, -h / 2 + bar, w, h - bar, 0); }
  ctx.restore();
}

function chrome(c: Ctx) {
  const { ctx, W, H, u, p, global, colors } = c; const pad = u * 7;
  const logo = p.brand.logo ? c.assets.get(p.brand.logo)?.el : undefined;
  ctx.globalAlpha = 0.95;
  if (logo) { const h = u * 4.2; const lw = h * ((logo as HTMLImageElement).naturalWidth || 1) / ((logo as HTMLImageElement).naturalHeight || 1); ctx.drawImage(logo, pad, pad, Math.min(lw, u * 22), h); }
  else { ctx.fillStyle = colors.fg; ctx.font = `700 ${u * 3}px ${p.brand.body}`; ctx.textBaseline = 'top'; try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${u * 0.4}px`; } catch { /* */ } ctx.fillText(p.brand.name.toUpperCase(), pad, pad); try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'; } catch { /* */ } }
  ctx.globalAlpha = 1; const T = total(p); ctx.fillStyle = hexA(colors.fg, 0.15); ctx.fillRect(pad, H - pad * 0.6, W - pad * 2, u * 0.35); ctx.fillStyle = colors.acc; ctx.fillRect(pad, H - pad * 0.6, (W - pad * 2) * clamp(global / T), u * 0.35);
}

function scene(c: Ctx) {
  const { ctx, W, H, u, s, t, colors, p } = c; const portrait = H > W * 1.2; const pad = u * 8; const maxW = W - pad * 2; const disp = p.brand.display, body = p.brand.body;
  const img = s.image ? c.assets.get(s.image)?.el : undefined;
  if (s.template === 'avatar' || s.template === 'broll') {
    const el = s.template === 'avatar' ? (p.avatar ? c.assets.get(p.avatar.asset)?.el : img) : img;
    if (el) { const z = s.template === 'broll' ? 1.04 + 0.1 * (t / s.dur) : 1; cover(ctx, el, 0, 0, W, H, z, s.template === 'broll' ? Math.sin(c.global * 0.2) * 0.3 : 0); }
    else { background(c); ctx.fillStyle = colors.mut; ctx.font = `500 ${u * 3.4}px ${body}`; ctx.textAlign = 'center'; ctx.fillText(s.template === 'avatar' ? 'Avatar video appears here' : 'Add a product image', W / 2, H / 2); ctx.textAlign = 'left'; }
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (s.headline) { const size = u * (portrait ? 7.2 : 6); const k = easeOut(t / 0.4); ctx.save(); ctx.globalAlpha = k; ctx.font = `800 ${size}px ${body}`; const lines = wrap(ctx, s.headline, maxW * 0.92); const y0 = portrait ? H * 0.16 : H * 0.12;
      lines.forEach((ln, i) => { const lw = ctx.measureText(ln).width; ctx.fillStyle = i === 0 ? colors.acc : '#ffffff'; rr(ctx, W / 2 - lw / 2 - size * 0.3, y0 + i * size * 1.25 - size * 0.05 + (1 - k) * u * 4, lw + size * 0.6, size * 1.2, size * 0.2); ctx.fill(); ctx.fillStyle = i === 0 ? (lum(colors.acc) > 0.6 ? '#111' : '#fff') : '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(ln, W / 2, y0 + i * size * 1.25 + size * 0.08 + (1 - k) * u * 4); });
      ctx.textAlign = 'left'; ctx.restore(); }
    return;
  }
  background(c);
  if (s.template === 'kinetic') {
    const words = s.headline.split(/\s+/).filter(Boolean); const per = Math.max(0.28, (s.dur - 0.4) / Math.max(1, words.length)); const i = Math.min(words.length - 1, Math.floor(t / per)); const lt = t - i * per;
    const size = u * (portrait ? 20 : 17); ctx.font = `800 ${size}px ${disp}`; let fs = size; while (ctx.measureText(words[i] ?? '').width > maxW && fs > u * 6) { fs *= 0.92; ctx.font = `800 ${fs}px ${disp}`; }
    const k = spring(lt / (per * 0.7)); ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k); ctx.fillStyle = i % 3 === 2 ? colors.acc : colors.fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = clamp(k * 2); ctx.fillText(words[i] ?? '', 0, 0); ctx.restore();
    if (s.sub) { ctx.font = `500 ${u * 3.6}px ${body}`; ctx.fillStyle = colors.mut; ctx.textAlign = 'center'; ctx.globalAlpha = easeOut((t - s.dur * 0.6) / 0.5); ctx.fillText(s.sub, W / 2, H / 2 + size * 0.9); ctx.globalAlpha = 1; ctx.textAlign = 'left'; }
    return;
  }
  if (s.template === 'device' || s.template === 'feature') {
    const el = img; const dev = s.device && s.device !== 'none' ? s.device : (portrait ? 'phone' : 'browser');
    if (portrait) {
      let y = pad * 1.6; if (s.kicker) { ctx.font = `700 ${u * 2.8}px ${body}`; ctx.fillStyle = colors.acc; ctx.globalAlpha = easeOut(t / 0.4); ctx.fillText(s.kicker.toUpperCase(), pad, y + u * 2.8); ctx.globalAlpha = 1; y += u * 6; }
      y += text(c, s.headline, pad, y, maxW, u * 8.4, { font: disp, weight: 600, color: colors.fg, anim: s.anim, lh: 1.02 }); if (s.sub) y += u * 2 + text(c, s.sub, pad, y + u * 2, maxW, u * 3.6, { font: body, weight: 400, color: colors.mut, anim: s.anim === 'none' ? 'none' : 'rise', delay: 0.35, lh: 1.35 });
      device(c, dev, W / 2, y + (H - y - pad) / 2 + u * 3, maxW * (dev === 'phone' ? 0.8 : 1), H - y - pad * 1.6, el);
    } else {
      const colW = W * 0.4; let y = H * 0.3; if (s.kicker) { ctx.font = `700 ${u * 2.4}px ${body}`; ctx.fillStyle = colors.acc; ctx.fillText(s.kicker.toUpperCase(), pad, y); y += u * 3; }
      y += text(c, s.headline, pad, y, colW, u * 6.4, { font: disp, weight: 600, color: colors.fg, anim: s.anim }); if (s.sub) text(c, s.sub, pad, y + u * 2.5, colW, u * 2.8, { font: body, weight: 400, color: colors.mut, anim: 'rise', delay: 0.35, lh: 1.4 });
      device(c, dev, W * 0.7, H / 2 + u * 2, W * 0.5, H * 0.72, el);
    }
    if (s.template === 'feature' && s.items?.length) { const by = portrait ? H * 0.86 : H * 0.82; ctx.font = `600 ${u * 2.6}px ${body}`; let x = pad; s.items.slice(0, 3).forEach((it, i) => { const k = easeOut((t - 0.6 - i * 0.15) / 0.4); const w = ctx.measureText(it).width + u * 4; ctx.globalAlpha = k; ctx.fillStyle = hexA(colors.fg, 0.08); rr(ctx, x, by, w, u * 5, u * 2.5); ctx.fill(); ctx.fillStyle = colors.fg; ctx.fillText(it, x + u * 2, by + u * 3.4); x += w + u * 1.5; }); ctx.globalAlpha = 1; }
    return;
  }
  if (s.template === 'stat') {
    const raw = s.stat || '10x'; const m = raw.match(/^([^\d]*)([\d.,]+)(.*)$/); const k = easeInOut(t / 1.4);
    const shown = m ? `${m[1]}${(parseFloat(m[2].replace(/,/g, '')) * k).toLocaleString('en-US', { maximumFractionDigits: m[2].includes('.') ? 1 : 0 })}${m[3]}` : raw;
    const size = u * (portrait ? 26 : 22); ctx.font = `700 ${size}px ${disp}`; let fs = size; while (ctx.measureText(raw).width > maxW && fs > u * 8) { fs *= 0.92; ctx.font = `700 ${fs}px ${disp}`; }
    ctx.fillStyle = colors.acc; ctx.textBaseline = 'alphabetic'; ctx.fillText(shown, pad, H * 0.5);
    text(c, s.headline, pad, H * 0.53, maxW, u * 5.4, { font: body, weight: 600, color: colors.fg, anim: s.anim, delay: 0.5, lh: 1.15 });
    if (s.sub) { ctx.font = `400 ${u * 2.6}px ${body}`; ctx.fillStyle = colors.mut; ctx.globalAlpha = easeOut((t - 0.9) / 0.4); ctx.fillText(s.sub, pad, H - pad * 1.6); ctx.globalAlpha = 1; }
    return;
  }
  if (s.template === 'steps') {
    let y = pad * 2; y += text(c, s.headline, pad, y, maxW, u * (portrait ? 7.4 : 5.6), { font: disp, weight: 600, color: colors.fg, anim: s.anim }); y += u * 5;
    (s.items ?? []).slice(0, 4).forEach((it, i) => { const k = easeOut((t - 0.5 - i * 0.35) / 0.5); ctx.globalAlpha = k; const rowH = u * (portrait ? 13 : 10);
      ctx.fillStyle = colors.acc; ctx.font = `700 ${u * 3.2}px ${body}`; ctx.fillText(String(i + 1).padStart(2, '0'), pad + (1 - k) * u * 4, y + u * 4);
      ctx.fillStyle = hexA(colors.fg, 0.14); ctx.fillRect(pad + u * 9, y + u * 5.2, (maxW - u * 9) * k, Math.max(1, u * 0.12));
      ctx.globalAlpha = k; text({ ...c, t: 99 }, it, pad + u * 9, y - u * 0.4, maxW - u * 9, u * (portrait ? 3.8 : 3), { font: body, weight: 500, color: colors.fg, anim: 'none', lh: 1.25 }); y += rowH; ctx.globalAlpha = 1; });
    return;
  }
  if (s.template === 'cta') {
    const k = spring(t / 0.9); const logo = p.brand.logo ? c.assets.get(p.brand.logo)?.el : undefined; let y = H * (portrait ? 0.36 : 0.3);
    if (logo) { const h = u * 9; const lw = h * ((logo as HTMLImageElement).naturalWidth || 1) / ((logo as HTMLImageElement).naturalHeight || 1); ctx.globalAlpha = clamp(k); ctx.drawImage(logo, W / 2 - lw / 2, y - h, lw, h); ctx.globalAlpha = 1; y += u * 4; }
    y += text(c, s.headline, W / 2, y, maxW, u * (portrait ? 8 : 6.6), { font: disp, weight: 600, color: colors.fg, anim: s.anim, align: 'center' });
    const label = s.sub || 'Start free'; ctx.font = `700 ${u * 3.4}px ${body}`; const bw = ctx.measureText(label).width + u * 10, bh = u * 9; const by = y + u * 6;
    ctx.save(); ctx.translate(W / 2, by + bh / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.globalAlpha = clamp(k * 1.3); ctx.fillStyle = colors.acc; rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2); ctx.fill(); ctx.fillStyle = lum(colors.acc) > 0.6 ? '#111' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, u * 0.2); ctx.restore();
    if (p.brand.url) { ctx.font = `500 ${u * 3}px ${body}`; ctx.fillStyle = colors.mut; ctx.textAlign = 'center'; ctx.globalAlpha = easeOut((t - 0.6) / 0.4); ctx.fillText(p.brand.url, W / 2, by + bh + u * 7); ctx.globalAlpha = 1; ctx.textAlign = 'left'; }
    return;
  }
  // title
  let y = portrait ? H * 0.3 : H * 0.28; if (s.kicker) { ctx.font = `700 ${u * 2.8}px ${body}`; ctx.fillStyle = colors.acc; ctx.globalAlpha = easeOut(t / 0.4); ctx.fillText(s.kicker.toUpperCase(), pad, y); ctx.globalAlpha = 1; ctx.fillStyle = colors.acc; ctx.fillRect(pad, y + u * 1.6, u * 8 * easeOut(t / 0.6), u * 0.5); y += u * 5; }
  y += text(c, s.headline, pad, y, maxW, u * (portrait ? 11 : 8.5), { font: disp, weight: 600, color: colors.fg, anim: s.anim, lh: 1.0, highlight: s.stat });
  if (s.sub) text(c, s.sub, pad, y + u * 3, maxW * 0.85, u * (portrait ? 4 : 3.2), { font: body, weight: 400, color: colors.mut, anim: s.anim === 'none' ? 'none' : 'rise', delay: 0.45, lh: 1.35 });
}

function captions(c: Ctx) {
  const { ctx, W, H, u, p, global } = c; const cap = p.captions; if (!cap?.on || !cap.words.length) return;
  const i = cap.words.findIndex(w => global >= w.start && global < w.end + 0.15); if (i < 0) return;
  const g0 = Math.floor(i / 4) * 4; const group = cap.words.slice(g0, g0 + 4); const size = u * (H > W ? 5.6 : 4.2);
  ctx.font = `800 ${size}px ${p.brand.body}`; ctx.textBaseline = 'middle'; const line = group.map(w => w.w).join(' '); const lw = ctx.measureText(line).width; let x = W / 2 - lw / 2; const y = H * (H > W ? 0.72 : 0.82);
  if (cap.style === 'box') { ctx.fillStyle = 'rgba(0,0,0,.72)'; rr(ctx, x - size * 0.4, y - size * 0.75, lw + size * 0.8, size * 1.5, size * 0.25); ctx.fill(); }
  group.forEach((w, j) => { const active = g0 + j === i; const ww = ctx.measureText(w.w).width; const k = active ? spring((global - w.start) / 0.25) : 1;
    ctx.save(); ctx.translate(x + ww / 2, y); if (active && cap.style !== 'minimal') ctx.scale(0.92 + 0.08 * k, 0.92 + 0.08 * k);
    if (cap.style === 'bold') { ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(w.w, -ww / 2, 0); }
    ctx.fillStyle = active && cap.style !== 'minimal' ? p.brand.accent : '#ffffff'; ctx.fillText(w.w, -ww / 2, 0); ctx.restore(); x += ww + ctx.measureText(' ').width; });
}

function grain(c: Ctx) { const { ctx, W, H, global } = c; ctx.save(); ctx.globalAlpha = 0.04; const s = Math.floor(global * 24); for (let i = 0; i < 260; i++) { const r = Math.sin((i + 1) * 9301 + s * 49297) * 233280; const x = (r - Math.floor(r)) * W; const r2 = Math.sin((i + 7) * 7919 + s * 104729) * 233280; const y = (r2 - Math.floor(r2)) * H; ctx.fillStyle = i % 2 ? '#fff' : '#000'; ctx.fillRect(x, y, 2, 2); } ctx.restore(); }

export function sceneAt(p: Project, t: number) { let acc = 0; for (let i = 0; i < p.scenes.length; i++) { const s = p.scenes[i]; if (t < acc + s.dur || i === p.scenes.length - 1) return { i, s, lt: t - acc, start: acc }; acc += s.dur; } return { i: 0, s: p.scenes[0], lt: 0, start: 0 }; }

export function drawFrame(ctx: CanvasRenderingContext2D, p: Project, assets: Assets, t: number, size?: [number, number]) {
  const [W, H] = size ?? ASPECTS[p.aspect]; const u = Math.min(W, H) / 100; ctx.save(); ctx.clearRect(0, 0, W, H);
  if (!p.scenes.length) { ctx.fillStyle = p.brand.bg; ctx.fillRect(0, 0, W, H); ctx.restore(); return; }
  const { i, s, lt } = sceneAt(p, t); const mk = (sc: Scene, lt2: number): Ctx => ({ ctx, W, H, u, p, assets, t: lt2, global: t, s: sc, colors: palette(p, sc) });
  const prev = i > 0 ? p.scenes[i - 1] : null; const tr = s.transition; const k = easeInOut(lt / TRANS);
  if (prev && tr !== 'cut' && lt < TRANS) {
    ctx.save(); if (tr === 'push') ctx.translate(-W * k, 0); if (tr === 'zoom') { ctx.translate(W / 2, H / 2); ctx.scale(1 + 0.08 * k, 1 + 0.08 * k); ctx.translate(-W / 2, -H / 2); } scene(mk(prev, prev.dur + lt)); ctx.restore();
    ctx.save(); if (tr === 'fade' || tr === 'zoom') ctx.globalAlpha = k; if (tr === 'slide' || tr === 'push') ctx.translate(W * (1 - k), 0);
    if (tr === 'zoom') { ctx.translate(W / 2, H / 2); ctx.scale(1.12 - 0.12 * k, 1.12 - 0.12 * k); ctx.translate(-W / 2, -H / 2); }
    if (tr === 'wipe') { ctx.beginPath(); ctx.rect(0, 0, W * k, H); ctx.clip(); }
    if (tr === 'slide') { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = u * 8; } scene(mk(s, lt)); ctx.restore();
    if (tr === 'wipe') { ctx.fillStyle = p.brand.accent; ctx.fillRect(W * k - u * 0.8, 0, u * 0.8, H); }
  } else scene(mk(s, lt));
  const c0 = mk(s, lt); if (s.template !== 'avatar' && s.template !== 'broll') chrome(c0); captions(c0); if (p.grain !== false) grain(c0);
  if (p.safe) { ctx.strokeStyle = 'rgba(255,0,80,.6)'; ctx.setLineDash([u, u]); ctx.lineWidth = 2; const top = H > W ? H * 0.12 : u * 5, bot = H > W ? H * 0.2 : u * 5; ctx.strokeRect(u * 5, top, W - u * 10, H - top - bot); ctx.setLineDash([]); }
  ctx.restore();
}

/** Split script into caption words with estimated timings (used when the voice provider returns none). */
export function estimateWords(script: string, start: number, dur: number): Word[] {
  const words = script.split(/\s+/).filter(Boolean); if (!words.length) return []; const weight = words.map(w => 1 + w.length / 6 + (/[.,!?]$/.test(w) ? 0.6 : 0)); const sum = weight.reduce((a, b) => a + b, 0);
  let t = start; return words.map((w, i) => { const d = dur * weight[i] / sum; const o = { w, start: t, end: t + d * 0.95 }; t += d; return o; });
}

export const FONTS: { label: string; value: string; google?: string }[] = [
  { label: 'App serif (display)', value: 'var(--font-display), Georgia, serif' }, { label: 'App sans', value: 'var(--font-sans), system-ui, sans-serif' },
  { label: 'Inter', value: '"Inter", system-ui, sans-serif', google: 'Inter:wght@400;500;600;700;800' }, { label: 'Space Grotesk', value: '"Space Grotesk", sans-serif', google: 'Space+Grotesk:wght@400;500;600;700' },
  { label: 'Instrument Serif', value: '"Instrument Serif", serif', google: 'Instrument+Serif' }, { label: 'Fraunces', value: '"Fraunces", serif', google: 'Fraunces:wght@400;600;700;800' },
  { label: 'Archivo', value: '"Archivo", sans-serif', google: 'Archivo:wght@400;600;700;800;900' }, { label: 'DM Sans', value: '"DM Sans", sans-serif', google: 'DM+Sans:wght@400;500;700;800' },
  { label: 'Playfair Display', value: '"Playfair Display", serif', google: 'Playfair+Display:wght@400;600;700;800' }, { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace', google: 'JetBrains+Mono:wght@400;600;800' },
];
/** Canvas can't read CSS variables, so resolve them to real family names first. */
export function resolveFont(v: string) { if (typeof document === 'undefined' || !v.includes('var(')) return v; const css = getComputedStyle(document.body); return v.replace(/var\((--[\w-]+)\)/g, (_, n) => css.getPropertyValue(n).trim() || 'sans-serif'); }
export async function loadFont(f: string) { const meta = FONTS.find(x => x.value === f); if (meta?.google && !document.querySelector(`link[data-font="${meta.label}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `https://fonts.googleapis.com/css2?family=${meta.google}&display=swap`; l.dataset.font = meta.label; document.head.appendChild(l); await new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 4000); }); }
  const fam = resolveFont(f); await Promise.all([400, 600, 800].map(w => document.fonts.load(`${w} 40px ${fam}`).catch(() => null))); }
