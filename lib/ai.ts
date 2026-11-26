import 'server-only';
import { aiPreset, envValue } from '@/lib/env';
import { recordLastAnswered } from '@/lib/aiLastModel';

export class AiError extends Error { constructor(message: string, public status = 502) { super(message); } }

type ChatOpts = { system: string; user: string; temperature?: number; maxTokens?: number; json?: boolean; model?: string };

// Providers (Gemini, OpenAI, OpenRouter) return 429/5xx under load or when a model's quota is spent.
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The configured chain: AI_MODEL first, then AI_FALLBACK_MODELS. Quotas are per model, so one exhausted model must not take the product down. */
export function aiModels(base?: string) {
  const preset = aiPreset();
  const primary = base || envValue('AI_MODEL') || preset?.models[0] || 'openai/gpt-4o-mini';
  const configured = (envValue('AI_FALLBACK_MODELS') || '').split(',').map(m => m.trim()).filter(Boolean);
  // A preset knows the rest of its own model family, so naming the provider is enough to get a working chain.
  const fallbacks = configured.length ? configured : (preset?.models.slice(1) ?? []);
  const chain = [primary, ...fallbacks.filter(m => m !== primary)].slice(0, 4);
  return { primary, fallbacks: chain.slice(1), chain, provider: preset?.label ?? null };
}

/** Base URL, token parameter name and temperature bounds: per provider, and every value can be overridden by env. */
function aiRuntime() {
  const preset = aiPreset();
  return {
    base: (envValue('AI_BASE_URL') || preset?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    tokenParam: preset?.tokenParam ?? 'max_tokens',
    // Sending a temperature the provider rejects fails the whole call, so clamp instead of trusting the caller.
    temperature: (t: number) => {
      const [lo, hi] = preset?.temperature ?? [-Infinity, Infinity];
      return Math.min(Math.max(t, lo), hi);
    },
  };
}

function modelChain(explicit?: string) {
  const { primary, fallbacks } = aiModels(explicit);
  return [primary, ...fallbacks];
}

/** The useful part of a provider error sits in different places; an empty string here used to reach the user as "unknown error". */
async function providerError(res: Response) {
  const body = await res.text().catch(() => '');
  try {
    const j = JSON.parse(body) as { error?: { message?: unknown; status?: unknown }; message?: unknown };
    const m = j?.error?.message ?? j?.error?.status ?? j?.message;
    // Some providers (Inception among them) nest an object here, which used to reach the user as "[object Object]".
    return (typeof m === 'string' ? m : m ? JSON.stringify(m) : body).slice(0, 220);
  } catch { return body.slice(0, 220); }
}

export async function chat(opts: ChatOpts) {
  const key = envValue('AI_API_KEY') || envValue('INCEPTION_API_KEY');
  if (!key) throw new AiError('AI is not configured. Add AI_API_KEY (e.g. an OpenRouter key) to .env.local and restart.', 503);
  const { base, tokenParam, temperature } = aiRuntime();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  if (envValue('AI_HTTP_REFERER')) headers['HTTP-Referer'] = envValue('AI_HTTP_REFERER');
  if (envValue('AI_APP_TITLE')) headers['X-Title'] = envValue('AI_APP_TITLE');
  const deadline = Date.now() + 240_000; // the routes cap at 300s, so leave room to answer
  const tried: string[] = [];
  let status = 0; let message = '';
  for (const model of modelChain(opts.model)) {
    const payload = JSON.stringify({ model, temperature: temperature(opts.temperature ?? 0.5), [tokenParam]: opts.maxTokens ?? 3000,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }] });
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, signal: AbortSignal.timeout(90_000), body: payload });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        // A model that hangs (rather than answering 429) would burn the whole budget, so treat it like a failure
        // of that model and let the chain move on.
        if (/timeout|abort/i.test(m)) { status = 504; message = `no response within 90s`; break; }
        if (attempt === 0) { await sleep(1500); continue; }
        throw new AiError(`Could not reach the AI provider: ${m}`);
      }
      if (res.ok) break;
      status = res.status; message = await providerError(res);
      if (!RETRYABLE.has(status) || attempt === 1) break;
      // Rate limits are usually per minute, so they need a longer wait than a one-off 5xx.
      await sleep(status === 429 ? 6000 : 1200);
    }
    if (res?.ok) {
      const data = await res.json().catch(() => ({}));
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new AiError('The AI provider returned an empty response.');
      const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : '';
      await recordLastAnswered(model);
      return { content: content.trim(), model, finishReason };
    }
    tried.push(`${model} (${status})`);
    // A key or billing problem is not per-model, so spend no further models on it.
    if (status === 401 || status === 402 || status === 403) break;
    if (Date.now() > deadline) break;
  }
  const hint = status === 429
    ? ' The provider is rate limiting this key — check the model quota, or set AI_FALLBACK_MODELS to models with headroom.'
    : RETRYABLE.has(status) ? ' The provider is busy right now — try again in a few seconds.' : '';
  throw new AiError(`AI provider error (${status}): ${message || 'unknown error'}.${hint}${tried.length > 1 ? ` Tried: ${tried.join(', ')}.` : ''}`,
    status === 401 || status === 402 ? 400 : 502);
}

/** chat() + parseJson(): one corrective retry when the model returns truncated or malformed JSON. */
export async function chatJson<T>(opts: { system: string; user: string; temperature?: number; maxTokens?: number; model?: string }): Promise<{ data: T; model: string }> {
  const first = await chat({ ...opts, json: true });
  try { return { data: parseJson<T>(first.content), model: first.model }; }
  catch (e) {
    if (!(e instanceof AiError)) throw e;
    const again = await chat({ ...opts, json: true, temperature: Math.min(opts.temperature ?? 0.5, 0.3),
      user: `${opts.user}\n\nYour previous reply could not be used (${e.message}). Return the complete JSON object again: compact, valid, nothing truncated, no commentary.` });
    return { data: parseJson<T>(again.content), model: again.model };
  }
}

export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
  if (start < 0) throw new AiError('The AI response was not valid JSON. Try again.');
  try { return JSON.parse(cleaned.slice(start, end + 1)) as T; }
  catch {
    // Most parse failures are output that stopped mid-file at the token limit. Say so instead of blaming the format.
    const truncated = !/}\s*$/.test(cleaned.slice(start));
    throw new AiError(truncated
      ? 'The build was cut off before it finished. Try again, or ask for fewer pages in one pass.'
      : 'The AI response was not valid JSON. Try again.');
  }
}
