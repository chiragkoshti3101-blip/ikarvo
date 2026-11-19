import { refund } from '@/lib/credits';
import { NextResponse } from 'next/server';
import { requireActor, consumeQuota } from '@/lib/auth';
import { chatJson, AiError } from '@/lib/ai';
import { fail, readJson, str } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 90;

const SHAPES: Record<string, string> = {
  campaign: `{"positioning":string,"headline":string,"subhead":string,"angles":[{"name":string,"message":string}],"emails":[{"subject":string,"body":string}],"adCopy":[{"platform":string,"primary":string,"headline":string}]}`,
  social: `{"posts":[{"channel":"X"|"LinkedIn"|"Instagram"|"TikTok"|"Threads","dayOffset":number,"time":"HH:MM","text":string,"hashtags":[string]}]}  (8-12 posts spread over the requested number of days, channel-native length and voice)`,
  listing: `{"name":string,"tagline":string (<=60 chars),"description":string (<=260 chars),"firstComment":string,"topics":[string],"features":[string],"faq":[{"q":string,"a":string}]}  (for Product Hunt / app directories)`,
};

export async function POST(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const b = await readJson(req); if (!b) return fail(400, 'Request body must be JSON.');
  const kind = str(b.kind, 20); if (!SHAPES[kind]) return fail(400, 'kind must be campaign, social or listing.');
  const product = str(b.product, 3000); if (product.length < 8) return fail(400, 'Describe the product first.');
  const limited = await consumeQuota(actor, 30, 'marketing'); if (limited) return limited;
  try {
    const { data, model } = await chatJson({ temperature: 0.75, maxTokens: 3500,
      system: `You are a senior growth marketer. Write specific, non-generic copy. No invented stats, testimonials or claims beyond the brief. Avoid cliches like "revolutionize", "unlock", "game-changer", "elevate". Return strict JSON shaped exactly like: ${SHAPES[kind]}`,
      user: `Strategy brief: ${str(b.brief, 6000) || '(none)'}\nProduct: ${product}\nAudience: ${str(b.audience, 400)}\nGoal: ${str(b.goal, 300)}\nVoice: ${str(b.voice, 200)}\nDays: ${Math.min(30, Math.max(3, Number(b.days) || 14))}` });
    return NextResponse.json({ result: data, model });
  } catch (e) { await refund(actor, 'marketing'); const err = e instanceof AiError ? e : new AiError(String(e)); return fail(err.status, err.message, err.status === 503 ? ['AI_API_KEY'] : undefined); }
}
