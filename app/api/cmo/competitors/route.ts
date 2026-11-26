import { NextResponse } from 'next/server';
import { requireActor, consumeQuota } from '@/lib/auth';
import { chat, parseJson, AiError } from '@/lib/ai';
import { refund } from '@/lib/credits';
import { webSearch } from '@/lib/search';
import { envValue } from '@/lib/env';
import { NO_HYPE, briefText } from '@/lib/growth';
import { fail, readJson, str } from '@/lib/http';
export const runtime = 'nodejs';
/** Auto-find competitors. With a search key, candidates come from live search results; otherwise from the model (labelled unverified). */
export async function POST(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const b = await readJson(req); const name = str(b?.name, 100), category = str(b?.category, 100), domain = str(b?.domain, 200).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!name) return fail(400, 'Need the product name (write the strategy brief first).');
  if (!envValue('AI_API_KEY') && !envValue('INCEPTION_API_KEY')) return fail(503, 'Finding competitors needs an AI provider.', ['AI_API_KEY']);
  let hits: { title: string; url: string; snippet: string }[] = []; let source = 'model';
  if (envValue('BRAVE_SEARCH_API_KEY') || envValue('SERPER_API_KEY')) {
    try { hits = (await Promise.all([`${name} alternatives`, `${name} competitors`, `best ${category || name} tools`].map(q => webSearch(q, 8)))).flat(); source = 'search'; } catch { hits = []; }
  }
  const limited = await consumeQuota(actor, 30, 'competitors'); if (limited) return limited;
  try {
    const { content } = await chat({ json: true, temperature: 0.2, maxTokens: 1500, system: `You identify direct competitors. ${NO_HYPE} ${hits.length ? 'Only pick companies that appear in the search results given.' : 'Only name companies you are confident exist; never invent.'} Exclude ${domain || name} itself. Return strict JSON {"competitors":[{"name":string,"domain":string,"why":string}]} with 4-8 items.`,
      user: `Product: ${name} (${domain})\nCategory: ${category}\nBrief:\n${briefText(b?.brief).slice(0, 2500)}\n${hits.length ? `Search results:\n${hits.map(h => `- ${h.title} | ${h.url} | ${h.snippet}`).join('\n').slice(0, 6000)}` : ''}` });
    const r = parseJson<{ competitors: { name: string; domain: string; why: string }[] }>(content);
    return NextResponse.json({ competitors: (r.competitors ?? []).filter(c => c.domain && !c.domain.includes(domain || '\u0000')).slice(0, 8), source, verified: source === 'search' });
  } catch (e) { await refund(actor, 'competitors'); const err = e instanceof AiError ? e : new AiError(String(e)); return fail(err.status, err.message); }
}
