import 'server-only';
import { envValue } from '@/lib/env';

export class AiError extends Error { constructor(message: string, public status = 502) { super(message); } }

export async function chat(opts: { system: string; user: string; temperature?: number; maxTokens?: number; json?: boolean; model?: string }) {
  const key = envValue('AI_API_KEY');
  if (!key) throw new AiError('AI is not configured. Add AI_API_KEY (e.g. an OpenRouter key) to .env.local and restart.', 503);
  const base = (envValue('AI_BASE_URL') || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const model = opts.model || envValue('AI_MODEL') || 'openai/gpt-4o-mini';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  if (envValue('AI_HTTP_REFERER')) headers['HTTP-Referer'] = envValue('AI_HTTP_REFERER');
  if (envValue('AI_APP_TITLE')) headers['X-Title'] = envValue('AI_APP_TITLE');
  const payload = JSON.stringify({ model, temperature: opts.temperature ?? 0.5, max_tokens: opts.maxTokens ?? 3000,
    ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }] });
  // Providers (Gemini, OpenAI, OpenRouter) return 429/5xx under load. Retry those twice before failing the user's run.
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  let res: Response | null = null; let lastStatus = 0; let lastMessage = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${base}/chat/completions`, { method: 'POST', headers, signal: AbortSignal.timeout(90_000), body: payload });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/timeout|abort/i.test(m)) throw new AiError('The AI provider timed out. Try again or use a faster model.');
      if (attempt < 2) { await new Promise(r => setTimeout(r, 1500 * (attempt + 1))); continue; }
      throw new AiError(`Could not reach the AI provider: ${m}`);
    }
    if (res.ok) break;
    const status = res.status; lastStatus = status; lastMessage = (await res.json().catch(() => ({})))?.error?.message ?? '';
    if (!RETRYABLE.has(status) || attempt === 2) break;
    // Rate limits are usually per minute, so they need a longer wait than a one-off 5xx.
    await new Promise(r => setTimeout(r, (status === 429 ? 8000 : 1200) * (attempt + 1)));
  }
  if (!res || !res.ok) {
    const status = res?.status ?? lastStatus;
    const busy = RETRYABLE.has(status) && status !== 429;
    const hint = busy ? ' The provider is busy right now — try again in a few seconds.' : '';
    throw new AiError(`AI provider error (${status}): ${lastMessage || (busy ? 'temporarily unavailable' : 'unknown error')}.${hint}`, status === 401 || status === 402 ? 400 : 502);
  }
  const data = await res.json().catch(() => ({}));
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new AiError('The AI provider returned an empty response.');
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : '';
  return { content: content.trim(), model, finishReason };
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
