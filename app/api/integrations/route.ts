import { NextResponse } from 'next/server';
import { featureStatus, envValue } from '@/lib/env';
import { requireActor } from '@/lib/auth';
import { publisherStatus } from '@/lib/publishers';
import { githubSession, vercelSession } from '@/lib/integrations';
import { googleAccess, googleScopes, YOUTUBE_SCOPE } from '@/lib/google';
import { NOTIFY, notifyMissing, type NotifyChannel } from '@/lib/notify';
import { VIDEO_TARGETS, videoMissing, type VideoTarget } from '@/lib/videopub';
import { AVATAR, avatarMissing, type AvatarProvider } from '@/lib/avatar';
import { TTS, ttsMissing, type TtsProvider } from '@/lib/tts';
import { CAPTIONS, captionsMissing, type CaptionProvider } from '@/lib/captions';
import { MUSIC, musicMissing, type MusicProvider } from '@/lib/music';
import { xMode } from '@/lib/tokens';
import { listMcpConnections, mcpStorageReadyForEnv } from '@/lib/mcp/connections';
export const dynamic = 'force-dynamic'; export const runtime = 'nodejs';

/**
 * Single source of truth for the Integrations page. Every row: configured (env keys present), connected (a live
 * user token exists and, for Google, was just refreshed), the exact missing keys, and a warning when relevant.
 */
export async function GET() {
  const f = featureStatus();
  const gh = f.github.ok ? await githubSession().catch(() => null) : null;
  const vc = f.vercel.ok ? await vercelSession().catch(() => null) : null;
  let google: { connected: boolean; youtube: boolean; error?: string } = { connected: false, youtube: false };
  if (f.google.ok) { try { const t = await googleAccess(); google = { connected: !!t, youtube: !!t && (await googleScopes()).includes(YOUTUBE_SCOPE) }; } catch (e) { google = { connected: false, youtube: false, error: e instanceof Error ? e.message : String(e) }; } }
  const pub = publisherStatus(); const xm = xMode();
  const warn: Record<string, string> = {};
  if (xm === 'oauth2') warn.x = 'X_ACCESS_TOKEN looks like an OAuth 2.0 user token, which expires after 2 hours. Add X_API_KEY, X_API_SECRET and X_ACCESS_SECRET to use non-expiring OAuth 1.0a keys.';
  if (envValue('TIKTOK_ACCESS_TOKEN') && !envValue('TIKTOK_REFRESH_TOKEN')) warn.tiktok = 'TikTok access tokens expire after 24 hours. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REFRESH_TOKEN for automatic refresh.';
  if (pub.social.linkedin?.ok) warn.linkedin = 'LinkedIn member tokens last 60 days and cannot be refreshed without partner access. Re-issue LINKEDIN_ACCESS_TOKEN before it expires.';
  if (pub.cms.medium?.ok) warn.medium = 'Medium no longer issues new integration tokens; existing tokens still work.';
  if (envValue('LINKEDIN_API_VERSION') && Number(envValue('LINKEDIN_API_VERSION')) < 202511) warn.linkedinVersion = `LINKEDIN_API_VERSION=${envValue('LINKEDIN_API_VERSION')} is sunset. Remove it to use 202610.`;
  const mcpStore = mcpStorageReadyForEnv(!f.preview && f.supabase.ok);
  let mcp: { storageReady: boolean; missing: string[]; connected: number; total: number } = { storageReady: mcpStore.ok, missing: mcpStore.missing, connected: 0, total: 0 };
  if (mcpStore.ok) {
    const actor = await requireActor();
    if (!(actor instanceof NextResponse)) {
      try {
        const rows = await listMcpConnections(actor);
        mcp = { storageReady: true, missing: [], connected: rows.filter(r => r.status === 'connected').length, total: rows.length };
      } catch { /* schema not migrated yet */ }
    }
  }
  return NextResponse.json({
    preview: f.preview, features: f, warn,
    connections: { github: { configured: f.github.ok, connected: !!gh, login: gh?.login ?? null }, vercel: { configured: f.vercel.ok, connected: !!vc, source: vc?.source ?? null }, google: { configured: f.google.ok, ...google } },
    publishers: pub,
    notify: Object.fromEntries(Object.entries(NOTIFY).map(([k, n]) => [k, { label: n.label, missing: notifyMissing(k as NotifyChannel) }])),
    video: Object.fromEntries(Object.keys(VIDEO_TARGETS).map(k => [k, { label: VIDEO_TARGETS[k as VideoTarget].label, missing: videoMissing(k as VideoTarget) }])),
    avatar: Object.fromEntries(Object.keys(AVATAR).map(k => [k, { label: AVATAR[k as AvatarProvider].label, missing: avatarMissing(k as AvatarProvider) }])),
    tts: Object.fromEntries(Object.keys(TTS).map(k => [k, { label: TTS[k as TtsProvider].label, missing: ttsMissing(k as TtsProvider) }])),
    captions: Object.fromEntries(Object.keys(CAPTIONS).map(k => [k, { label: CAPTIONS[k as CaptionProvider].label, missing: captionsMissing(k as CaptionProvider) }])),
    music: Object.fromEntries(Object.keys(MUSIC).map(k => [k, { label: MUSIC[k as MusicProvider].label, missing: musicMissing(k as MusicProvider) }])),
    pagespeed: { keyed: !!envValue('PAGESPEED_API_KEY') },
    mcp,
  });
}
