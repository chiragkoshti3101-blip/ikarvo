import { NextResponse } from 'next/server';
import { featureStatus, envValue } from '@/lib/env';
import { aiModels, lastAnsweredModel } from '@/lib/ai';
export const dynamic = 'force-dynamic';
// Reports which features are configured. Only booleans and env var *names* are exposed.
export async function GET() {
  const status = featureStatus();
  const base = (envValue('AI_BASE_URL') || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const { primary, fallbacks, chain } = aiModels();
  const answered = lastAnsweredModel();
  return NextResponse.json({
    ...status,
    ai: {
      ...status.ai,
      note: `Chain: ${chain.join(' → ')} via ${base}`,
      models: { primary, fallbacks, chain },
      // Whatever answers first wins, so this is the model that actually served the last request on this instance.
      answering: answered?.model ?? null,
      answeringAt: answered?.at ?? null,
    },
  });
}
