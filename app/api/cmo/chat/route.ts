import { NextResponse } from 'next/server';
import { requireActor, consumeQuota } from '@/lib/auth';
import { chatJson, AiError } from '@/lib/ai';
import { refund } from '@/lib/credits';
import { NO_HYPE, briefText } from '@/lib/growth';
import { CMO_PLAYBOOK } from '@/lib/prompts/master';
import { fail, readJson, str } from '@/lib/http';
export const runtime = 'nodejs';
export const maxDuration = 90;
const KINDS = 'build|ad|post|article|campaign|tab';
const TABS = 'strategy,crawl,visibility,competitors,community,articles,campaign,listing,voice,calendar,influencers,backlinks,analytics,report,ugc,tools,meta';
/** AI CMO chat. Grounded in the user's documents, memories, skills and settings. Returns a reply plus optional one-click actions. */
export async function POST(req: Request) {
  const actor = await requireActor(); if (actor instanceof NextResponse) return actor;
  const b = await readJson(req); if (!b) return fail(400, 'Request body must be JSON.');
  const msgs = (Array.isArray(b.messages) ? b.messages : []).slice(-12).map((m: { role?: string; content?: string }) => `${m.role === 'user' ? 'USER' : 'CMO'}: ${str(m.content, 3000)}`);
  if (!msgs.length) return fail(400, 'Say something first.');
  const limited = await consumeQuota(actor, 30, 'chat'); if (limited) return limited;
  try {
    const { data, model } = await chatJson<Record<string, unknown>>({ temperature: 0.5, maxTokens: 1800,
      system: `${CMO_PLAYBOOK}\n\nYou are the user's AI CMO inside Ikarvo. ${NO_HYPE} Ground every answer in the CONTEXT; if something is missing, say which document or connection would fix it. You have no browser in this chat: when a site has to be analysed, say that the Crawl, AI visibility and Competitors tabs fetch the real pages, and offer the matching action instead of describing a site you have not read. You never publish or send anything; you propose actions the user clicks.
For paid social, the "meta" tab runs real Meta (Facebook/Instagram) ads: AI audience targeting resolved via Meta's targeting search, reach estimates, Ad Studio videos as creatives, campaigns created PAUSED, insights (spend, reach, CTR, CPA) and optimization advice. Suggest it with kind "tab", tab "meta" when the user asks about ads; launching always needs their explicit confirmation there.
Language: ${str(b.language, 40) || 'English'}. Address the user as ${str(b.callMe, 50) || 'you'}${str(b.role, 100) ? ` (${str(b.role, 100)})` : ''}.
Return strict JSON: {"reply": markdown string, "actions": [{"label": string, "kind": "${KINDS}", "prompt"?: string, "angle"?: string, "text"?: string, "channel"?: string, "topic"?: string, "goal"?: string, "tab"?: one of ${TABS}}] (0-3 items, only when genuinely useful), "suggestions": [3 short follow-up questions], "memory": string|null (one durable fact about the user/business worth remembering, else null)}`,
      user: `CONTEXT\nBrief:\n${briefText(b.brief)}\n\nDocuments (${str(b.focus, 100) ? `user pointed at: ${str(b.focus, 100)}` : 'all'}):\n${briefText(b.docs).slice(0, 9000)}\n\nMemories:\n${briefText(b.memories).slice(0, 2000)}\nSkills:\n${briefText(b.skills).slice(0, 3000)}\nAgent settings:\n${briefText(b.agents).slice(0, 1500)}\nAbout the user: ${str(b.about, 3000)}\n\nCONVERSATION\n${msgs.join('\n')}` });
    return NextResponse.json({ ...data, model });
  } catch (e) { await refund(actor, 'chat'); const err = e instanceof AiError ? e : new AiError(String(e)); return fail(err.status, err.message, err.status === 503 ? ['AI_API_KEY'] : undefined); }
}
