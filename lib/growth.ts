import 'server-only';
import { NextResponse } from 'next/server';
import { requireActor, consumeQuota } from '@/lib/auth';
import { chatJson, AiError } from '@/lib/ai';
import { fail, readJson } from '@/lib/http';
import { refund } from '@/lib/credits';

export const NO_HYPE = 'Write like a sharp human operator. Be specific to this product. No invented statistics, customers, testimonials or features. Avoid: revolutionize, unlock, game-changer, elevate, seamless, cutting-edge, in today\'s fast-paced world.';

/** Shared wrapper: auth → JSON body → quota → AI JSON call → response. */
export function aiJsonRoute(build: (b: Record<string, unknown>) => { system: string; user: string; maxTokens?: number } | string) {
  return async (req: Request) => {
    const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
    const b = await readJson(req); if (!b) return fail(400, 'Request body must be JSON.');
    const spec = build(b); if (typeof spec === 'string') return fail(400, spec);
    const action = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? 'ai';
    const limited = await consumeQuota(actor, 30, action); if (limited) return limited;
    try { const { data, model } = await chatJson({ ...spec, temperature: 0.6, maxTokens: spec.maxTokens ?? 4000 }); return NextResponse.json({ result: data, model }); }
    catch (e) { await refund(actor, action); const err = e instanceof AiError ? e : new AiError(String(e)); return fail(err.status, err.message, err.status === 503 ? ['AI_API_KEY'] : undefined); }
  };
}
export const briefText = (b: unknown) => (typeof b === 'string' ? b : JSON.stringify(b ?? '')).slice(0, 8000);
