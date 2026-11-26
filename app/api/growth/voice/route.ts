import { refund } from '@/lib/credits';
import { NextResponse } from 'next/server';
import { requireActor, consumeQuota } from '@/lib/auth';
import { chat, parseJson, AiError } from '@/lib/ai';
import { envValue } from '@/lib/env';
import { fail, readJson, str } from '@/lib/http';
export const runtime = 'nodejs';

const CLICHES = ['revolutionize', 'revolutionary', 'unlock', 'game-changer', 'game changer', 'elevate', 'seamless', 'seamlessly', 'cutting-edge', 'leverage', 'synergy', 'empower', 'supercharge', 'next-level', 'best-in-class', 'world-class', 'robust', 'in today\'s fast-paced', 'harness the power', 'dive into', 'delve'];
function syllables(w: string) { const m = w.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g); return Math.max(1, m?.length ?? 1); }
/** Deterministic metrics (no key) + optional AI voice scoring against the brief. */
export async function POST(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const b = await readJson(req); const text = str(b?.text, 20000); if (text.length < 20) return fail(400, 'Paste at least a sentence or two.');
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim()); const words = text.split(/\s+/).filter(Boolean);
  const syl = words.reduce((a, w) => a + syllables(w), 0);
  const flesch = Math.round(206.835 - 1.015 * (words.length / Math.max(1, sentences.length)) - 84.6 * (syl / Math.max(1, words.length)));
  const lower = text.toLowerCase(); const dont = (Array.isArray(b?.dont) ? b.dont : []).map(String);
  const found = [...CLICHES, ...dont.filter(d => d.split(' ').length <= 3).map(d => d.toLowerCase())].filter(c => lower.includes(c));
  const metrics = { words: words.length, sentences: sentences.length, avgSentence: Math.round(words.length / Math.max(1, sentences.length)), longSentences: sentences.filter(s => s.split(/\s+/).length > 28).length,
    readingEase: flesch, exclamations: (text.match(/!/g) ?? []).length, passiveHints: (text.match(/\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi) ?? []).length, cliches: [...new Set(found)], emoji: (text.match(/\p{Extended_Pictographic}/gu) ?? []).length };
  let ai: unknown = null, aiError: string | null = null;
  if (!envValue('AI_API_KEY') && !envValue('INCEPTION_API_KEY')) aiError = 'Add AI_API_KEY for a voice score and rewrite suggestions; metrics above need no key.';
  else {
    const limited = await consumeQuota(actor, 30, 'voice'); if (limited) return limited;
    try { const { content } = await chat({ json: true, temperature: 0.3, maxTokens: 1800, system: 'You are a brand editor. Score how well the text matches the brand voice (0-100) and list concrete fixes quoting the offending phrase. Return strict JSON: {"score":number,"verdict":string,"issues":[{"quote":string,"problem":string,"fix":string}],"rewrite":string}',
      user: `Voice traits: ${str(b?.traits, 300)}\nDo: ${str(b?.do, 600)}\nDon't: ${dont.join('; ').slice(0, 600)}\n\nTEXT:\n${text}` }); ai = parseJson(content); }
    catch (e) { await refund(actor, 'voice'); aiError = e instanceof AiError ? e.message : String(e); }
  }
  return NextResponse.json({ metrics, ai, aiError });
}
