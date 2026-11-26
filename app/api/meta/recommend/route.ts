import { NextResponse } from 'next/server';
import { consumeQuota } from '@/lib/auth';
import { readJson, fail } from '@/lib/http';
import { chat, parseJson } from '@/lib/ai';
import { envValue } from '@/lib/env';
import { INSIGHT_FIELDS, graph, isCtx, metaCtx, metaFail, normInsight, resultTypeFor, type Insight, type RawInsight } from '@/lib/meta';
export const runtime = 'nodejs'; export const maxDuration = 120;
type Rec = { title: string; why: string; action: string; impact: 'high' | 'medium' | 'low'; kind: 'creative' | 'audience' | 'budget' | 'delivery' | 'tracking' };
/**
 * Optimisation advice grounded in the campaign's real insights. Deterministic rules first (always available, cite the
 * numbers), then the AI CMO rewrites/extends them when AI is configured. Advice only: nothing is changed at Meta.
 */
export async function POST(req: Request) {
  const ctx = await metaCtx(); if (!isCtx(ctx)) return ctx;
  const b = await readJson<{ campaignId?: string; targetCpa?: number; result?: string }>(req); const id = b?.campaignId ?? '';
  if (!/^\d+$/.test(id)) return fail(400, 'Pass campaignId.');
  try {
    const t = ctx.conn.token; const rt = b?.result || await resultTypeFor(t, id);
    const [c, tot, ads] = await Promise.all([
      graph<{ name: string; effective_status: string; objective: string }>(t, id, { params: { fields: 'name,effective_status,objective' } }),
      graph<{ data: RawInsight[] }>(t, `${id}/insights`, { params: { fields: INSIGHT_FIELDS, date_preset: 'last_7d' } }),
      graph<{ data: RawInsight[] }>(t, `${id}/insights`, { params: { fields: `ad_id,ad_name,${INSIGHT_FIELDS}`, date_preset: 'last_7d', level: 'ad' } }),
    ]);
    const s: Insight | null = tot.data[0] ? normInsight(tot.data[0], rt) : null; const per = ads.data.map(a => normInsight(a, rt)); const cur = ctx.conn.currency ?? 'USD';
    const m = (x: number) => `${cur} ${x.toFixed(2)}`; const rules: Rec[] = [];
    if (!s || s.impressions === 0) rules.push({ title: c.effective_status === 'PAUSED' ? 'Campaign is paused' : 'No delivery yet', why: c.effective_status === 'PAUSED' ? 'It was created PAUSED and has not been launched.' : `Status is ${c.effective_status} with 0 impressions in 7 days.`, action: c.effective_status === 'PAUSED' ? 'Review targeting and creative, then Launch when ready.' : 'Check ad review status in Ads Manager and widen the audience if the estimate is under 100k.', impact: 'high', kind: 'delivery' });
    else {
      if (s.ctr < 0.8) rules.push({ title: 'Hook is not stopping the scroll', why: `CTR is ${s.ctr.toFixed(2)}% over ${s.impressions.toLocaleString('en-US')} impressions (Meta feed ads commonly land around 0.9–1.5%).`, action: 'Cut a new Ad Studio variant that opens on the pain point in the first 2 seconds, with captions burned in.', impact: 'high', kind: 'creative' });
      if (s.frequency > 3) rules.push({ title: 'Audience fatigue', why: `Frequency is ${s.frequency.toFixed(1)}: the same people see the ad 3+ times a week.`, action: 'Broaden interests or add a 1–3% lookalike, and rotate in a fresh creative.', impact: 'medium', kind: 'audience' });
      if (b?.targetCpa && s.cpa && s.cpa > b.targetCpa * 1.3) rules.push({ title: 'CPA above target', why: `CPA is ${m(s.cpa)} vs your target ${m(b.targetCpa)}.`, action: 'Shift budget to the best ad below, and switch optimization to landing-page views if you optimise for clicks.', impact: 'high', kind: 'budget' });
      if (s.results === 0 && s.spend > 0) rules.push({ title: 'Spend without results', why: `${m(s.spend)} spent, 0 ${s.resultType.replace(/_/g, ' ')}s.`, action: 'Confirm the Meta Pixel / Conversions API fires on the landing page, then check the link works on mobile.', impact: 'high', kind: 'tracking' });
      const ranked = per.filter(a => a.impressions > 500).sort((x, y) => (x.cpa ?? 1e9) - (y.cpa ?? 1e9));
      if (ranked.length >= 2 && ranked[0].cpa && ranked.at(-1)!.cpa && ranked.at(-1)!.cpa! > ranked[0].cpa * 1.5) rules.push({ title: `Pause "${ranked.at(-1)!.adName}"`, why: `Its CPA (${m(ranked.at(-1)!.cpa!)}) is ${(ranked.at(-1)!.cpa! / ranked[0].cpa).toFixed(1)}× the best ad "${ranked[0].adName}" (${m(ranked[0].cpa)}).`, action: 'Pause the weakest ad so budget concentrates on the winner.', impact: 'medium', kind: 'creative' });
      if (!rules.length) rules.push({ title: 'Healthy: scale carefully', why: `CTR ${s.ctr.toFixed(2)}%, frequency ${s.frequency.toFixed(1)}${s.cpa ? `, CPA ${m(s.cpa)}` : ''}.`, action: 'Raise the daily budget by at most 20% every 3 days to avoid resetting learning.', impact: 'medium', kind: 'budget' });
    }
    let recs = rules; let source: 'rules' | 'ai' = 'rules';
    if ((envValue('AI_API_KEY') || envValue('INCEPTION_API_KEY')) && s && s.impressions > 0) {
      const q = await consumeQuota(ctx.actor, 30, 'meta_recommend'); if (q) return q;
      try {
        const r = await chat({ json: true, temperature: 0.3, maxTokens: 1200, system: 'You are the performance-marketing lead of Ikarvo\'s AI CMO optimising a Meta ad campaign. Use ONLY the numbers given; never invent metrics. Return strict JSON {"recommendations":[{"title":string,"why":string (cite the numbers),"action":string (one concrete step),"impact":"high"|"medium"|"low","kind":"creative"|"audience"|"budget"|"delivery"|"tracking"}]} with 3-5 items, highest impact first.',
          user: JSON.stringify({ campaign: c, currency: cur, last7d: s, ads: per, targetCpa: b?.targetCpa ?? null, ruleFindings: rules }) });
        const out = parseJson<{ recommendations: Rec[] }>(r.content).recommendations; if (Array.isArray(out) && out.length) { recs = out.slice(0, 5); source = 'ai'; }
      } catch { /* keep rule-based findings */ }
    }
    return NextResponse.json({ source, campaign: c.name, summary: s, recommendations: recs });
  } catch (e) { return metaFail(e); }
}
