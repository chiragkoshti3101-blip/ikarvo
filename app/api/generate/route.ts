import { envValue } from '@/lib/env';
import { isTier, type Tier } from '@/lib/tiers';
import { refund } from '@/lib/credits';
import { NextResponse } from 'next/server';
import { requireActor, consumeQuota } from '@/lib/auth';
import { chat, AiError } from '@/lib/ai';
import { fail, readJson, str } from '@/lib/http';
import { parseJson } from '@/lib/ai';
import { cleanFiles, KINDS, type AppFile, type Kind } from '@/lib/appfiles';
import { BUILD_STANDARD } from '@/lib/prompts/master';
import { normalizeIntake, intakeBrief } from '@/lib/intake';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Server-side tier config: model (env-overridable), output budget and steps. */
const TIER_CFG: Record<Tier, { model: () => string; maxTokens: number; plan: boolean; review: boolean }> = {
  fast: { model: () => envValue('AI_MODEL_FAST') || 'google/gemini-2.5-flash', maxTokens: 12000, plan: false, review: false },
  pro: { model: () => envValue('AI_MODEL_PRO') || envValue('AI_MODEL') || 'anthropic/claude-sonnet-4.5', maxTokens: 24000, plan: true, review: false },
  max: { model: () => envValue('AI_MODEL_MAX') || 'anthropic/claude-opus-4.1', maxTokens: 40000, plan: true, review: true },
};
const PLANNER = `${BUILD_STANDARD}\n\nYou are a principal product engineer. Write a concise build plan for the request: the file list with one-line purposes, screens/pages, data model, key interactions, the real copy for the main headline, and one layout or content idea that comes from this specific product rather than a generic template. Plain text, under 300 words. No code.`;
// The build prompt already carries BUILD_STANDARD, so the review pass only needs its own instruction.
const REVIEW = `\n\nYou are now REVIEWING a previous attempt. Check it against the request and plan: fix bugs, broken imports/links, missing required files, unhandled states, accessibility and visual polish. Remove anything on the DO NOT PRODUCE list (invented statistics or testimonials, placeholder copy, decorative filler) and make every screen read like this business's real product. Return the complete corrected file set in the same JSON format.`;

const SYSTEM = `${BUILD_STANDARD}\n\nYou are a senior product engineer and designer. Produce one complete, production-quality, standalone HTML document for the user's app.
Rules:
- Output ONLY the HTML document starting with <!doctype html>. No markdown, no commentary.
- All CSS inside <style>, all JS inside <script>. No external JS libraries or build tools. Google Fonts <link> is allowed.
- Semantic, accessible, responsive markup. Interactions must actually work (use localStorage for persistence where useful).
- No analytics, trackers, or code that sends data to third parties.`;
const JSON_OUT = 'Return ONLY a JSON object: {"files":[{"path":"...","content":"..."}, ...]}. No markdown.';

// ---- Web apps are assembled in batches ----------------------------------------------------------------
// A full Next.js project does not fit in one reply: the model stops mid-file and the whole build is lost.
// So the file list is planned first, then each small group is written on its own and merged.
type OutlinePart = { path: string; purpose: string };
const PATH_OK = /^(?!\/)(?!.*\.\.)[a-zA-Z0-9_\-./]{1,120}$/;
const CORE_FILE = /^(package\.json|tsconfig\.json|next\.config\.[a-z]+|\.env\.example|README\.md|\.gitignore|postcss\.config\.js)$/;
const REQUIRED_WEB = ['package.json', 'tsconfig.json', 'app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'preview.html'];
/** Used when the outline reply itself is unusable, so one bad planning reply cannot kill the build. */
const DEFAULT_WEB_FILES: OutlinePart[] = [
  ...REQUIRED_WEB.map(path => ({ path, purpose: 'required project file' })),
  { path: 'lib/store.ts', purpose: 'typed data store and sample records' },
  { path: 'app/api/data/route.ts', purpose: 'read and write records' },
];

const WEB_OUTLINE = `${BUILD_STANDARD}\n\nYou plan a Next.js 15 (App Router, TypeScript, React 19) product before it is written.\nList the files, one per line, exactly as: path :: what it contains and exports\nNo heading, no numbering, no markdown, no code, no commentary.\nRules:\n- 6 to 9 files, no more. Required: package.json, tsconfig.json, app/layout.tsx, app/page.tsx, app/globals.css, preview.html, one app/api/**/route.ts, and lib/store.ts with the types and the data store.\n- Keep the screens in app/page.tsx (it is a client component). Add at most TWO component files, only if a screen really needs one, and say in the outline exactly which props each takes.\n- Never plan a .module.css file or any per-component stylesheet: every class lives in app/globals.css.\n- Relative paths, lowercase folders, no spaces.\n- preview.html is one self-contained HTML document that renders the main screens.`;

const webFileSystem = (paths: string[], outline: OutlinePart[], note: string, shared: string) => `${BUILD_STANDARD}\n\nYou are writing part of a Next.js 15 (App Router, TypeScript, React 19) project.\nThe complete file list is:\n${outline.map(p => `- ${p.path}: ${p.purpose}`).join('\n')}\n\n${shared ? `These files are already written and their exports are final. Import from them exactly as they are; do not redefine or rename anything:\n${shared}\n\n` : ''}The product request:\n${note}\n\nOutput format — repeat this block once per file, with nothing before, between or after the files:\n===FILE: path===\n<the complete file content>\n===FILE: next-path===\n\nWrite exactly these files now: ${paths.join(', ')}.\nRules:\n- Every file is complete: all imports resolve against the files above, every name you import exists, nothing is a TODO or placeholder.\n- No comments in code. Compact but readable; this is a real product, not a sketch.\n- 'use client' at the top of app/page.tsx and of any component that uses state, effects, events or browser APIs.\n- Do not import .module.css, next/image, next/font, or any package that is not in package.json.\n- Data access: lib/store.ts holds the types and the store; API routes validate input, return JSON and set status codes; the page fetches those routes.\n- No CSS framework is installed: no Tailwind and no utility classes such as flex, grid, bg-emerald-600 or p-4 — they do nothing here. Only use class names that exist in app/globals.css.
- TypeScript must compile with zero errors, and nobody can run tsc for you: keep types simple. Do not build one generic helper that two different record types share. Sort and filter helpers take a key: string and read the value with record[key] after a local cast, or exist once per table with that table's own row type. Every function argument must match its declared signature at every call site.\n- preview.html is ONE self-contained HTML document (inline CSS and JS, no external scripts) that faithfully renders the main screens with working client-side interactions. It is the live preview.\nBegin with ===FILE: ${paths[0]}===`;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** A file that stops mid-token must never reach the project: it compiles into nonsense the user has to find. */
function looksComplete(path: string, content: string): boolean {
  const body = content.trim();
  if (!body) return false;
  if (/\.html?$/i.test(path)) return /<\/html>\s*$/i.test(body);
  if (/\.json$/i.test(path)) { try { JSON.parse(body); return true; } catch { return false; } }
  const count = (re: RegExp) => (body.match(re) || []).length;
  const braces = count(/\{/g) - count(/\}/g);
  const parens = count(/\(/g) - count(/\)/g);
  const ticks = count(/`/g) % 2;
  if (braces !== 0 || parens !== 0 || ticks !== 0) return false;
  if (/[=(,]$/.test(body)) return false;
  return !/```/.test(body);
}

/** Files are written between ===FILE: path=== markers, so a reply cut short still yields every complete file before the cut. */
function partsFrom(text: string, wanted: string[]): AppFile[] {
  const marks = [...text.matchAll(/^[ \t]*===FILE:\s*([^\s=]+)\s*===\s*$/gm)];
  const out: AppFile[] = [];
  for (let i = 0; i < marks.length; i++) {
    const path = marks[i][1].trim().replace(/^(\.\/)+/, '');
    const from = (marks[i].index ?? 0) + marks[i][0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const content = text.slice(from, to ?? text.length)
      .replace(/^\r?\n/, '')
      .replace(/^[ \t]*```[a-zA-Z]*\r?\n/, '')
      .replace(/\r?\n[ \t]*```\s*$/, '')
      .trimEnd();
    if (!content || (wanted.length && !wanted.includes(path))) continue;
    if (!looksComplete(path, content)) continue; // dropped, the repair pass asks for it again
    out.push({ path, content });
  }
  return out;
}

/** Every name a file exports, so importers can be checked without a compiler. */
function exportsOf(content: string) {
  const names = new Set<string>();
  for (const m of content.matchAll(/export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) for (const part of m[1].split(',')) {
    const name = part.trim().split(/\s+as\s+/).pop()?.trim();
    if (name) names.add(name);
  }
  if (/export\s+default/.test(content)) names.add('default');
  return names;
}

/** Resolve a relative import against the project files (with and without extensions). */
function resolveImport(from: string, spec: string, files: AppFile[]) {
  const base = from.split('/').slice(0, -1);
  for (const part of spec.replace(/^\.\//, '').split('/')) {
    if (part === '..') base.pop(); else if (part && part !== '.') base.push(part);
  }
  const target = base.join('/');
  const hit = files.find(f => f.path === target || f.path === `${target}.ts` || f.path === `${target}.tsx` || f.path === `${target}/index.ts` || f.path === `${target}/index.tsx`);
  return { target, hit };
}

/** Plan the project, then write it in batches small enough that no reply is cut off, retrying only what is missing. */
async function webProject(opts: { user: string; maxTokens: number; tm: string; temperature: number; steps: string[] }) {
  const { user, tm, temperature, steps } = opts;
  let raw: OutlinePart[] = [];
  try {
    const outlineRes = await chat({ system: WEB_OUTLINE, temperature: 0.2, maxTokens: 1600, model: tm, user });
    raw = outlineRes.content.split('\n').map(line => {
      const m = line.match(/^[\s\-*\d.)]*`?([A-Za-z0-9_\-./]+\.(?:tsx|ts|css|json|html|md))`?\s*(?:::|—|-)?\s*(.*)$/);
      return m ? { path: m[1], purpose: m[2].trim().slice(0, 200) } : null;
    }).filter((p): p is OutlinePart => !!p);
    steps.push('outline');
  } catch (e) {
    if (!(e instanceof AiError)) throw e;
    steps.push('outline-fallback');
  }
  if (raw.length < 4) { raw = [...DEFAULT_WEB_FILES, ...raw]; steps.push('outline-default'); }
  const seen = new Set<string>();
  const outline: OutlinePart[] = [];
  for (const p of raw) {
    const path = String(p?.path ?? '').trim().replace(/^(\.\/)+/, '');
    if (!PATH_OK.test(path) || !/\.(tsx|ts|css|json|html|md)$/i.test(path) || seen.has(path)) continue;
    seen.add(path); outline.push({ path, purpose: String(p?.purpose ?? '') || 'product file' });
  }
  for (const path of REQUIRED_WEB) if (!seen.has(path)) { seen.add(path); outline.push({ path, purpose: 'required project file' }); }
  const list = outline.slice(0, 14);
  const files: AppFile[] = [];
  const wanted = new Set(list.map(p => p.path));
  const sharedNow = () => files
    .filter(f => f.path === 'app/globals.css' || f.path.startsWith('lib/'))
    .map(f => `===FILE: ${f.path}===\n${f.content}`).join('\n\n');
  const write = async (paths: string[], extra = '') => {
    const system = webFileSystem(paths, list, user, sharedNow()) + extra;
    const ask = `Write exactly these files now: ${paths.join(', ')}. Start with ===FILE: ${paths[0]}=== and use one ===FILE: path=== marker per file.`;
    const cap = paths.includes('preview.html') ? 20000 : 14000;
    let got: AppFile[];
    try { got = partsFrom((await chat({ system, temperature, maxTokens: cap, model: tm, user: ask })).content, paths); }
    catch (e) {
      if (!(e instanceof AiError)) throw e;
      steps.push('retry-smaller');
      got = partsFrom((await chat({ system, temperature: 0.2, maxTokens: 7000, model: tm, user: ask })).content, paths);
    }
    for (const f of got) if (wanted.has(f.path) && !files.some(x => x.path === f.path)) files.push(f);
    steps.push(`wrote:${got.length}/${paths.length}`);
    return got.map(f => f.path);
  };

  const config = list.filter(p => CORE_FILE.test(p.path));
  const contract = list.filter(p => p.path === 'app/globals.css' || p.path.startsWith('lib/'));
  const api = list.filter(p => !CORE_FILE.test(p.path) && !p.path.startsWith('lib/') && p.path !== 'app/globals.css' && /^app\/api\//.test(p.path));
  const preview = list.filter(p => p.path === 'preview.html');
  const ui = list.filter(p => ![...config, ...contract, ...api, ...preview].some(x => x.path === p.path));
  const previewNote = '\n\npreview.html is the live demo of this app. Keep it under 220 lines and under 14,000 characters: one screen with the KPI row, the main table with 6 sample rows, the second view, and the export button working. Inline CSS and JS only, no external requests, no frameworks. It must end with </html>.';

  if (config.length) await write(config.map(p => p.path));
  if (contract.length) await write(contract.map(p => p.path));
  for (const group of chunk(api.map(p => p.path), 2)) await write(group);
  // app/page.tsx is the whole product UI, so it always gets a call of its own.
  const page = ui.find(p => p.path === 'app/page.tsx');
  if (page) await write([page.path]);
  for (const group of chunk(ui.filter(p => p.path !== 'app/page.tsx').map(p => p.path), 2)) await write(group);
  if (preview.length) await write(preview.map(p => p.path), previewNote);

  // Repair: missing planned files first, then imports that point at nothing.
  for (let round = 0; round < 2; round++) {
    const missing = list.map(p => p.path).filter(path => !files.some(f => f.path === path));
    if (!missing.length) break;
    steps.push(`repair:${missing.length}`);
    for (const group of chunk(missing, 2)) await write(group, group.includes('preview.html') ? previewNote : '');
  }
  for (let round = 0; round < 2; round++) {
    const broken: { path: string; spec: string; from: string }[] = [];
    for (const f of files) for (const m of f.content.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const { target, hit } = resolveImport(f.path, m[1], files);
      if (!hit) broken.push({ path: target, spec: m[1], from: f.path });
    }
    if (!broken.length) break;
    const want = [...new Set(broken.map(b => b.path))].slice(0, 3);
    steps.push(`imports:${broken.length}`);
    for (const path of want) await write([path]);
  }
  // Repair: a module imported for a name it does not export.
  const need = new Map<string, Set<string>>();
  for (const f of files) for (const m of f.content.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g)) {
    const { hit } = resolveImport(f.path, m[2], files);
    if (!hit) continue;
    const have = exportsOf(hit.content);
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name && !have.has(name)) (need.get(hit.path) ?? need.set(hit.path, new Set()).get(hit.path)!).add(name);
    }
  }
  for (const [path, names] of need) {
    steps.push(`exports:${path}`);
    const system = `${BUILD_STANDARD}\n\nYou are rewriting ONE file of a Next.js 15 (TypeScript) project so other files compile against it.\nFile: ${path}\nIt must export these names, because other files already import them: ${[...names].join(', ')}.\nKeep it small, complete, typed, and consistent with the rest of the project:\n${list.map(p => `- ${p.path}: ${p.purpose}`).join('\n')}\nOutput only ===FILE: ${path}=== followed by the whole file.`;
    const got = partsFrom((await chat({ system, temperature: 0.2, maxTokens: 6000, model: tm, user: `Product: ${user}\n\nRewrite ${path} with those exports.` })).content, [path]);
    for (const f of got) if (!files.some(x => x.path === f.path)) files.push(f);
  }
  // A preview is the face of the build, so make one more, deliberately small, attempt before giving up.
  if (!files.some(f => f.path === 'preview.html')) {
    steps.push('preview-fallback');
    const tiny = await chat({ system: `${BUILD_STANDARD}\n\nWrite ONE file: a single self-contained HTML document named preview.html for the app described below. Under 120 lines. Inline CSS and JS only, no external requests, no frameworks. Show the main screen with real sample records and make the primary interactions work. Output only ===FILE: preview.html=== followed by the document, ending with </html>.`, temperature: 0.2, maxTokens: 9000, model: tm, user });
    files.push(...partsFrom(tiny.content, ['preview.html']));
  }
  return cleanFiles(files);
}

/** One prompt template per project type. Every template returns a file set; web and mobile also carry a previewable artefact. */
const SYSTEMS: Record<Kind, string> = {
  web: `${BUILD_STANDARD}\n\nYou are a senior full-stack engineer and designer. Produce a full-stack Next.js 15 (App Router, TypeScript) project for the user's request.
${JSON_OUT}
Rules:
- Required: package.json (next, react, react-dom; scripts dev/build/start), tsconfig.json, app/layout.tsx, app/page.tsx, app/globals.css, at least one API route under app/api/**/route.ts, and components under components/.
- Keep server data in a small in-memory or JSON-file store in lib/ with typed helpers, and note env vars in .env.example if any are needed.
- ALSO include preview.html: ONE self-contained HTML document (inline CSS and JS, no external JS) that faithfully renders the main screens of the app with working client-side interactions. It is shown as the live preview.
- At most 20 files.`,
  mobile: `${BUILD_STANDARD}\n\nYou are a senior React Native engineer and mobile designer. Produce an Expo (SDK 52) React Native app for the user's request.
${JSON_OUT}
Rules:
- Required: package.json (expo, react, react-native, expo-status-bar; "main": "node_modules/expo/AppEntry.js"), app.json, babel.config.js, and App.js.
- App.js must contain the WHOLE UI with a default export App component and import ONLY from "react", "react-native" and "expo-status-bar". It is previewed in the browser through react-native-web, so do not use native-only modules, navigation libraries or images from the file system. Implement screens/tabs with useState.
- Use StyleSheet.create, SafeAreaView, ScrollView/FlatList, Pressable and TextInput. Design for a 390x844 phone screen with touch-sized targets and a bottom tab bar when there are several screens.
- At most 8 files.`,
  site: `${BUILD_STANDARD}\n\nYou are a senior web designer and front-end engineer. Produce a static multi-page marketing website for the user's request.
${JSON_OUT}
Rules:
- Required: index.html plus 2-5 more pages that fit the brief (e.g. features.html, pricing.html, about.html, contact.html), styles.css and main.js.
- Every page links styles.css and main.js with relative paths and shares the same header navigation and footer. No build step, no npm packages, no CDNs except a Google Fonts <link>.
- Strong marketing structure: hero, social proof, feature sections, clear calls to action, SEO <title> and meta description per page. Forms validate client-side only.
- At most 12 files.`,
};

function extractHtml(content: string) {
  let html = content.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  const i = html.search(/<!doctype html|<html[\s>]/i);
  if (i > 0) html = html.slice(i);
  if (!/<html[\s>]/i.test(html)) throw new AiError('The AI response did not contain a full HTML document. Try again.');
  return html;
}

export async function POST(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const body = await readJson(req); if (!body) return fail(400, 'Request body must be JSON.');
  const prompt = str(body.prompt, 6000); const previous = str(body.previousHtml, 40000);
  const kind: Kind | null = KINDS.includes(body.kind as Kind) ? body.kind as Kind : body.multi === true ? 'site' : null;
  const web = body.web === true; const tier: Tier = isTier(body.tier) ? body.tier : 'pro'; const cfg = TIER_CFG[tier]; const tm = cfg.model(); const temperature = 0.3;
  // The picker's answers travel with the request; the server never trusts raw strings from the client.
  const chosen = intakeBrief(normalizeIntake(body.intake));
  let prevFiles: AppFile[] | null = null;
  if (kind && body.previousFiles) { try { prevFiles = cleanFiles(body.previousFiles); } catch (e) { return fail(400, e instanceof Error ? e.message : String(e)); } }
  if (prompt.length < 4) return fail(400, 'Describe what you want to build.');
  const limited = await consumeQuota(actor, 30, 'generate'); if (limited) return limited;
  const extra = web ? '\n\nYou may use real photos from https://images.unsplash.com (hot-linked) where they help.' : '';
  if (kind) {
    const steps: string[] = [];
    try {
    let plan = '';
    // A web app is planned and written in batches; a single reply cannot hold the whole project.
    if (kind === 'web' && !prevFiles) {
      const files = await webProject({ user: `Build:\n${prompt}${chosen}${extra}`, maxTokens: cfg.maxTokens, tm, temperature, steps });
      if (!files.some(f => f.path === 'preview.html')) throw new AiError('The AI did not return a preview for this web app. Try again.');
      return NextResponse.json({ files, model: tm, kind, tier, steps });
    }
    if (cfg.plan) { plan = (await chat({ system: PLANNER, temperature: 0.2, maxTokens: 1500, model: tm, user: `PROJECT TYPE: ${kind}\n\nREQUEST:\n${prompt}${chosen}${prevFiles ? `\n\nCURRENT FILES: ${prevFiles.map(f => f.path).join(', ')}` : ''}` })).content; steps.push('plan'); }
    const brief = prevFiles ? `Revise this project. Keep everything that works unless asked otherwise. Return the complete file set.\n\nREQUEST:\n${prompt}${chosen}\n\nCURRENT FILES:\n${JSON.stringify(prevFiles).slice(0, 60000)}` : `Build:\n${prompt}${chosen}`;
    // A long file set can stop at the output limit or come back malformed. One corrective retry recovers most of those
    // instead of charging the user for a failed build.
    const system = SYSTEMS[kind] + extra;
    const user = plan ? `${brief}\n\nPLAN:\n${plan}` : brief;
    let files: AppFile[]; let model: string;
    let first = await chat({ system, temperature, maxTokens: cfg.maxTokens, json: true, model: tm, user });
    model = first.model;
    // A reply stopped at the output limit can never parse. Ask again with a bigger budget and a terser brief.
    if (first.finishReason === 'length') {
      steps.push('extend');
      first = await chat({ system: `${system}\n\nReturn ONLY the JSON object. Keep the code lean: no comments, compact CSS, minimal markup, but every file complete.`, temperature: 0.2, maxTokens: Math.min(cfg.maxTokens * 2, 40000), json: true, model: tm, user });
      model = first.model;
    }
    try { files = cleanFiles(parseJson<{ files: AppFile[] }>(first.content).files); }
    catch (e) {
      if (!(e instanceof AiError)) throw e;
      steps.push('retry');
      const again = await chat({ system: `${system}\n\nReturn ONLY the JSON object, compact, with no commentary. Every file must be complete and the object must end with a closing brace.`, temperature: 0.2, maxTokens: cfg.maxTokens, json: true, model: tm,
        user: `${user}\n\nThe previous reply could not be used (${e.message}). Return the full file set again, using fewer files if that helps, but nothing truncated.` });
      files = cleanFiles(parseJson<{ files: AppFile[] }>(again.content).files); model = again.model;
    }
    steps.push('build');
    if (cfg.review) try {
      const rv = await chat({ system: SYSTEMS[kind] + extra + REVIEW, temperature: 0.2, maxTokens: cfg.maxTokens, json: true, model: tm, user: `REQUEST:\n${prompt}\n\nPLAN:\n${plan}\n\nFILES:\n${JSON.stringify(files).slice(0, 90000)}` });
      files = cleanFiles(parseJson<{ files: AppFile[] }>(rv.content).files); steps.push('review');
    } catch { steps.push('review-skipped'); }
    if (kind === 'web' && !files.some(f => f.path === 'preview.html')) throw new AiError('The AI did not return a preview for this web app. Try again.');
    if (kind === 'mobile' && !files.some(f => /^(src\/)?App\.(js|jsx|tsx|ts)$/.test(f.path))) throw new AiError('The AI did not return App.js for this mobile app. Try again.');
    return NextResponse.json({ files, model, kind, tier, steps });
    } catch (e) {
      await refund(actor, 'generate');
      const err = e instanceof AiError ? e : new AiError(e instanceof Error ? e.message : String(e));
      console.error('[generate]', err.message, steps.join(' > '));
      // The steps travel with the error so a failed build can be diagnosed without guessing.
      return NextResponse.json({ error: err.message, steps, ...(err.status === 503 ? { setup: ['AI_API_KEY'] } : {}) }, { status: err.status });
    }
  }
  try {
    const { content, model } = await chat({ system: SYSTEM, temperature: 0.3, maxTokens: cfg.maxTokens, model: tm,
      user: previous ? `Revise this app. Keep everything that works unless asked otherwise.\n\nREQUEST:\n${prompt}\n\nCURRENT HTML:\n${previous}` : `Build:\n${prompt}` });
    return NextResponse.json({ html: extractHtml(content), model });
  } catch (e) { await refund(actor, 'generate'); const err = e instanceof AiError ? e : new AiError(String(e)); return fail(err.status, err.message, err.status === 503 ? ['AI_API_KEY'] : undefined); }
}
