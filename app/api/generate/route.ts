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

const WEB_OUTLINE = `${BUILD_STANDARD}\n\nYou are the lead engineer on a Next.js 15 (App Router, TypeScript, React 19) product. Plan the project before it is written.\nReturn ONLY JSON: {"files":[{"path":"app/page.tsx","purpose":"one line"}]}.\nRules:\n- 8 to 14 files. These are required: package.json, tsconfig.json, app/layout.tsx, app/page.tsx, app/globals.css, preview.html, at least one app/api/**/route.ts, and lib/ with the typed data store.\n- Add the components and screens the request needs. Relative paths only, no spaces, lowercase folders.\n- Tailwind is NOT installed: the design lives in app/globals.css.\n- preview.html is one self-contained HTML document that renders the main screens with working client-side interactions.\n- Every path you list will be written, so keep the list to what the product actually needs.`;

const webFileSystem = (paths: string[], outline: OutlinePart[]) => `${BUILD_STANDARD}\n\nYou are writing part of a Next.js 15 (App Router, TypeScript, React 19) project.\nThe complete file list is:\n${outline.map(p => `- ${p.path}: ${p.purpose}`).join('\n')}\n\nWrite ONLY these files now: ${paths.join(', ')}.\nReturn ONLY JSON: {"files":[{"path":"...","content":"..."}]} containing exactly those paths.\nRules:\n- Every file is complete: all imports resolve, every component and export used exists in the file list above, nothing is a TODO.\n- No comments in code. Compact but readable; this is a real product, not a sketch.\n- 'use client' on components that use state, effects, events or browser APIs. Do not use next/image, next/font or any package that is not in package.json.\n- Data access: lib/ holds the store with typed helpers; API routes validate input, return JSON and set status codes; client code calls those routes.\n- Tailwind is not installed. Styles go in app/globals.css (imported by app/layout.tsx) and components use className.\n- preview.html, when listed, is ONE self-contained HTML document (inline CSS and JS, no external scripts) that faithfully renders the main screens with working client-side interactions. It is the live preview.`;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
const filesFrom = (text: string): AppFile[] => (parseJson<{ files?: AppFile[] }>(text).files ?? [])
  .filter(f => f && typeof f.path === 'string' && typeof f.content === 'string')
  .map(f => ({ path: f.path.trim(), content: f.content }));

/** Plan the project, then write it in batches small enough that no reply is cut off. */
async function webProject(opts: { user: string; maxTokens: number; tm: string; temperature: number; steps: string[] }) {
  const { user, tm, temperature, steps } = opts;
  const outlineRes = await chat({ system: WEB_OUTLINE, temperature: 0.2, maxTokens: 1800, json: true, model: tm, user });
  steps.push('outline');
  const raw = parseJson<{ files?: OutlinePart[] }>(outlineRes.content).files ?? [];
  const seen = new Set<string>();
  const outline: OutlinePart[] = [];
  for (const p of raw) {
    const path = String(p?.path ?? '').trim().replace(/^(\.\/)+/, '');
    if (!PATH_OK.test(path) || !/\.(tsx|ts|css|json|html|md)$/i.test(path) || seen.has(path)) continue;
    seen.add(path); outline.push({ path, purpose: String(p?.purpose ?? '').slice(0, 160) });
  }
  for (const path of REQUIRED_WEB) if (!seen.has(path)) { seen.add(path); outline.push({ path, purpose: 'required project file' }); }
  const list = outline.slice(0, 18);
  const config = list.filter(p => CORE_FILE.test(p.path));
  const preview = list.filter(p => p.path === 'preview.html');
  const rest = list.filter(p => !CORE_FILE.test(p.path) && p.path !== 'preview.html');
  const groups = [...(config.length ? [config] : []), ...chunk(rest, 3), ...(preview.length ? [preview] : [])];
  const files: AppFile[] = [];
  const write = async (paths: string[], cap: number) => {
    const system = webFileSystem(paths, list);
    const ask = `${user}\n\nWRITE THESE FILES NOW: ${paths.join(', ')}`;
    try { return filesFrom((await chat({ system, temperature, maxTokens: cap, json: true, model: tm, user: ask })).content); }
    catch (e) {
      if (!(e instanceof AiError)) throw e;
      // A batch that still overruns gets one terser attempt with a larger budget.
      const again = await chat({ system: `${system}\n\nReturn ONLY the JSON object. Keep each file lean: no comments, compact CSS, minimal markup, but every file complete.`, temperature: 0.2, maxTokens: Math.min(cap * 2, 24000), json: true, model: tm, user: ask });
      return filesFrom(again.content);
    }
  };
  for (const group of groups) {
    const paths = group.map(p => p.path);
    const cap = paths.includes('preview.html') ? 12000 : Math.min(8000, opts.maxTokens);
    const got = await write(paths, cap);
    files.push(...got.filter(f => paths.includes(f.path)));
    steps.push(`files:${paths.length}`);
  }
  const missing = REQUIRED_WEB.filter(r => !files.some(f => f.path === r));
  if (missing.length) {
    files.push(...(await write(missing, 9000)).filter(f => missing.includes(f.path)));
    steps.push('fill-missing');
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
  if (kind) try {
    const steps: string[] = []; let plan = '';
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
  } catch (e) { await refund(actor, 'generate'); const err = e instanceof AiError ? e : new AiError(e instanceof Error ? e.message : String(e)); return fail(err.status, err.message, err.status === 503 ? ['AI_API_KEY'] : undefined); }
  try {
    const { content, model } = await chat({ system: SYSTEM, temperature: 0.3, maxTokens: cfg.maxTokens, model: tm,
      user: previous ? `Revise this app. Keep everything that works unless asked otherwise.\n\nREQUEST:\n${prompt}\n\nCURRENT HTML:\n${previous}` : `Build:\n${prompt}` });
    return NextResponse.json({ html: extractHtml(content), model });
  } catch (e) { await refund(actor, 'generate'); const err = e instanceof AiError ? e : new AiError(String(e)); return fail(err.status, err.message, err.status === 503 ? ['AI_API_KEY'] : undefined); }
}
