import { NextResponse } from 'next/server';
import { aiPreset, featureStatus, envValue } from '@/lib/env';
import { aiModels } from '@/lib/ai';
import { readLastAnswered } from '@/lib/aiLastModel';
export const dynamic = 'force-dynamic';
// Reports which features are configured. Only booleans, env var *names* and model names are exposed, never values.
export async function GET() {
  const status = featureStatus();
  const preset = aiPreset();
  const base = (envValue('AI_BASE_URL') || preset?.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const { primary, fallbacks, chain } = aiModels();
  const answered = await readLastAnswered();
  return NextResponse.json({
    ...status,
    ai: {
      ...status.ai,
      note: `Chain: ${chain.join(' → ')} via ${base}`,
      models: { provider: preset?.label ?? null, primary, fallbacks, chain },
      // Read from storage, so every instance reports the same answer instead of only the one that served it.
      answering: answered?.model ?? null,
      answeringAt: answered?.at ?? null,
    },
  });
}
