import { NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth';
import { fail } from '@/lib/http';
import { listIntegrationActivity } from '@/lib/mcp/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get('limit') || 40)));
  try {
    const events = await listIntegrationActivity(actor, limit);
    return NextResponse.json({ events });
  } catch (e) {
    return fail(503, e instanceof Error ? e.message : String(e));
  }
}
