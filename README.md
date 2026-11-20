# Ikarvo

Ikarvo is one workspace for four jobs:
- **Build**: prompt → working single-file web app with live preview.
- **Ship**: GitHub repo push, Vercel deploy, Stripe billing.
- **Advertise**: UGC and launch ad concepts, an in-browser motion-graphics renderer, and AI image/video.
- **Market**: campaign copy, a content calendar and launch listings.

Next.js 15 (App Router) · React 19 · Supabase · plain CSS (no UI kit).

## Quick start (no keys at all)

```bash
npm install
cp .env.example .env.local
# in .env.local set:  PREVIEW_MODE=1
npm run dev        # http://localhost:3000
```

Preview mode skips sign-in and stores data in localStorage. It only works under `next dev` unless you also set `ALLOW_PREVIEW_IN_PRODUCTION=1`.

**What works without keys:** the landing page, the workspace UI, the starter template with live preview, device sizes, code view and HTML export. Also: the motion-ad renderer (3 looks × 3 aspect ratios, editable scenes, WebM export via MediaRecorder), the content calendar (schedule, mark as posted, .ics and .csv export) and the projects library. Every AI or integration action returns a clear "Setup needed" message that names the exact env vars.

## Turning features on

| Feature | Env vars | Provider-side setup |
|---|---|---|
| Accounts + cloud data | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Run the migrations (below). Under Auth → URL config, add `{APP_URL}/auth/callback`. |
| AI (apps, ad concepts, marketing) | `AI_API_KEY`, optionally `AI_BASE_URL`, `AI_MODEL`, `AI_FALLBACK_MODELS` | Any OpenAI-compatible `/chat/completions` endpoint. OpenRouter is the default. |
| Integration sessions | `SESSION_SECRET` (`openssl rand -hex 32`) | Encrypts GitHub/Vercel tokens (AES-256-GCM, httpOnly cookie). |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub → Settings → Developer settings → OAuth App. Callback: `{APP_URL}/api/github/callback`. Scope requested: `repo`. |
| Vercel (multi-user) | `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`, `VERCEL_INTEGRATION_SLUG` | Create a Vercel Integration. Redirect URL: `{APP_URL}/api/vercel/callback`. |
| Vercel (single owner) | `VERCEL_TOKEN`, optional `VERCEL_TEAM_ID` | Every deploy goes to that one account. Use only for personal installs. |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` | Create a recurring Price. Webhook: `{APP_URL}/api/billing/webhook` with events `checkout.session.completed` and `customer.subscription.updated` / `deleted`. Enable the Customer Portal. Local: `stripe listen --forward-to localhost:3000/api/billing/webhook`. |
| Meta Ads (Facebook/Instagram) | `META_APP_ID`, `META_APP_SECRET`, `SESSION_SECRET`; optional `META_LOGIN_CONFIG_ID`, `META_GRAPH_VERSION`, single-owner `META_ADS_TOKEN` + `META_AD_ACCOUNT_ID` + `FACEBOOK_PAGE_ID` | Business app with Marketing API + Facebook Login for Business. Redirect URI `{APP_URL}/api/meta/callback`. Scopes: `ads_management`, `ads_read`, `business_management` (+ `pages_show_list`, `pages_read_engagement`). Advanced Access to `ads_management` needs App Review. See *Meta Ads (v8)*. |
| AI image/video | `REPLICATE_API_TOKEN` **or** `FAL_KEY`; model IDs are overridable | Defaults: Replicate `black-forest-labs/flux-schnell` and `minimax/video-01`; fal `fal-ai/flux/schnell` and `fal-ai/kling-video/v1/standard/text-to-video`. |

`/api/status` reports which features are configured. It returns booleans and env var *names* only, never values. **Billing & setup** in the app shows the same checklist.


## Marketing workspace (Growth)

The Marketing section has seven tabs. They all share one **strategy brief**, saved in the `brands` table.

| Tab | What it does | Keys |
|---|---|---|
| Strategy & audit | Fetches your homepage plus `robots.txt`, `sitemap.xml` and `llms.txt` (with an SSRF guard), then scores 17 search and AI-readiness checks: title, meta, H1, indexable text, alt text, canonical, Open Graph, JSON-LD, sitemap, AI-crawler blocking, llms.txt, speed. **Write strategy brief** turns the page into product, positioning/ICP, messaging pillars, objections, competitors, brand voice, keyword opportunities and a 30-day plan with tick-off tasks. Exports as Markdown. | Audit: **none**. Brief: `AI_API_KEY` |
| Community radar | Searches Hacker News (Algolia API) and Reddit for recent threads, flags buying intent, and drafts a disclosed, help-first reply. Nothing is posted for you. | HN: **none**. Reddit: optional `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`. Replies: `AI_API_KEY` |
| AI visibility | Asks buyer-style prompts (up to 15) of one or more models and records whether your brand and competitors are named, plus their position. History is saved. This is a proxy via your provider, not a scrape of the ChatGPT or Google UI. | `AI_API_KEY`, optional `VISIBILITY_MODELS` |
| Articles | Brief-grounded, answer-first articles with an FAQ and meta description, and a SERP preview. Exports `.md` with front-matter. Can create a **WordPress draft** or commit Markdown to a GitHub repo folder. | `AI_API_KEY`; WordPress vars; GitHub OAuth |
| Social calendar | Schedule posts, plan a run of posts with AI, export `.ics`/`.csv`. **Publish** posts to X and LinkedIn on click only. | X / LinkedIn tokens to publish |
| Campaign copy / Launch listing | Positioning, ad copy and emails; a Product Hunt-style listing. Both use the brief. | `AI_API_KEY` |

Run the migrations again (`supabase db push`) to add the `brands`, `articles`, `visibility` and `threads` tables.
Test tip: `NEXT_DIST_DIR=.next-test` lets a second dev server run from the same checkout.

## Growth v2 (beyond the basics)

Marketing is grouped into **Research / Create / Distribute / Measure**; deep-link with `/app?view=marketing&tab=<id>`.

| Feature | Route | Keys | Notes |
|---|---|---|---|
| Full-site crawl | `POST /api/growth/crawl` | none | robots.txt + sitemap(s), link-BFS fallback, ≤50 pages, SSRF-guarded fetches, per-page + site-wide issues, CSV export |
| SEO fix PR | `POST /api/growth/seo-pr` | GitHub OAuth | new branch `ikarvo/seo-fixes-*`: llms.txt, sitemap.xml, robots.txt, Organization JSON-LD, SEO-FIXES.md; opens a PR, never touches the default branch |
| Creator finder | `POST /api/growth/influencers` | `YOUTUBE_API_KEY` and/or `X_BEARER_TOKEN` | follower filters; outreach drafts via `/api/growth/outreach` (never sent) |
| Backlink finder | `POST /api/growth/backlinks` | `BRAVE_SEARCH_API_KEY` or `SERPER_API_KEY` | guest-post / resource / listicle / directory / alternatives / review footprints |
| Search Console + GA4 | `/api/google/*` | `GOOGLE_CLIENT_ID/SECRET`, `SESSION_SECRET` | read-only scopes, 28d vs prior 28d |
| Auto-publisher | `/api/cron/publish` | `CRON_SECRET`, `SCHEDULER_OWNER_USER_ID`, `SUPABASE_SERVICE_ROLE_KEY` + channel tokens | only `approved` posts whose `at` is due; 3 attempts; Vercel Cron every 10 min (Hobby plans allow daily only) |
| Social publishing | `POST /api/publish/social/{x,linkedin,threads,bluesky,facebook,instagram,tiktok}` | per channel | Instagram needs an image URL, TikTok a video URL (default privacy SELF_ONLY) |
| CMS drafts | `POST /api/publish/cms/{wordpress,ghost,webflow,sanity,hubspot,wix,medium}` | per CMS | always drafts; Framer = CSV export |
| Grounded AI visibility | `POST /api/growth/visibility` (`grounded:true`) | `PERPLEXITY_API_KEY` or OpenRouter key | records citations and whether your domain / crawled pages are cited |
| Competitor tracker | `POST /api/growth/competitors` | none | homepage + /pricing snapshots, diffed client-side |
| Voice checker | `POST /api/growth/voice` | none (AI optional) | readability, sentence length, clichés, banned phrases; AI score + rewrite |
| A/B headlines | `POST /api/growth/headlines` | `AI_API_KEY` | 6 variants, one hypothesis each |
| Weekly report | `POST /api/growth/report` | `AI_API_KEY` for narrative | numbers counted from saved data, AI only writes prose |

Trigger the scheduler manually: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/publish`.
Apply `supabase/migrations/20261019230000_growth_v2.sql` for the new tables.

## Connected flow

Every finding has one-click actions that open another section prefilled (`act()` / `take()` handoff in `components/ws.tsx`, prompt builders in `components/growth/actions.ts`):
audit/crawl issues → **Fix in Build Studio** (page rebuild brief with the exact issues) or **Deploy fix as GitHub PR**; competitor snapshot → **Beat this competitor** (auto-builds a counter landing page), counter-campaign, comparison ad, "alternatives" article; AI-visibility gaps → answer article / comparison page / post; keywords → article; creators/backlinks → ad brief, partner or resource page, guest article; articles → posts, ad, keyword landing page; campaign → landing page, ad, posts; posts → ad; A/B variants → variant page / ad; report next actions and gaps → **Do it**; Build Studio → ad, launch campaign, announcement. Nothing is sent or published by a handoff; posts it creates are unapproved drafts.

## Database

```bash
supabase link --project-ref <ref>
supabase db push        # applies supabase/migrations/*
```
Migrations create:
- `profiles`: a plan field that only the webhook writes, plus an auto-insert trigger.
- `projects`, `campaigns`, `posts`, `listings`: owner-only RLS on every operation.
- `ai_usage_buckets` with `consume_ai_quota()`: an atomic quota of 30 AI requests per user per hour.

## Checks

```bash
npm run typecheck && npm run lint && npm run build
```

## Layout

```
app/page.tsx                 landing
app/app/page.tsx             workspace (components/Workspace.tsx)
app/api/{generate,creative,marketing}   AI routes (lib/ai.ts)
app/api/media[/id]           Replicate / fal jobs (lib/media.ts)
app/api/github/*             OAuth + push      app/api/vercel/*   OAuth/token + deploy
app/api/billing/*            Stripe checkout, portal, signed webhook (lib/stripe.ts)
components/MotionCanvas.tsx  canvas motion-graphics renderer + video export
lib/client/store.ts          Supabase or localStorage document store
```

## Known limits
- Generated apps are static site bundles (`index.html` plus CSS/JS, or a `package.json` project), not Next.js apps. GitHub push and Vercel deploy ship exactly those files, capped at 1.5 MB of source.
- Social publishing runs on click only, with single-account env tokens (no per-user OAuth). Instagram needs an image URL, TikTok a video URL and lands in the inbox as a draft, and Framer has no public CMS write API, so it exports CSV instead.
- The background publisher needs `CRON_SECRET` and `SCHEDULER_OWNER_USER_ID` plus channel tokens. On the Vercel Hobby plan its cron fires once a day, so a scheduled post is also a reminder and an `.ics` event.
- MCP servers are listed with their tools, but agents never execute those tools for you.
- Video export needs WebCodecs (Chrome/Edge, Safari 17+). Firefox has no H.264 encoder, so MP4 export goes through ffmpeg.wasm (~30 MB, loaded from unpkg).
- Generated media is polled from the provider and never stored; only user uploads reach Supabase Storage (`media-uploads`). Vercel caps request bodies at 4.5 MB, so larger renders have to be uploaded by hand.
- Nothing is posted, sent or published by a handoff or by the AI CMO: the posts it creates are unapproved drafts and every Meta object is created `PAUSED`.
- There is no automated test suite. `scripts/qa-sweep.mjs` is a manual authenticated sweep: create a throwaway user, run it against a deployment, delete the user.

## AI CMO home, credits & settings (v6)

- **AI CMO home** (`/app`, default view): website switcher, Lighthouse scores (PageSpeed Insights), agent log, a context panel (editable product profile, generated documents: product info, marketing strategy, competitor analysis, content calendar, design guide, content strategy; uploaded .md/.txt/.csv/.json context files; auto-found competitors), per-channel agent cards with on/off toggles, a daily brief feed, and a chat-style CMO with suggestions, @mentions, history, memories and one-click actions. A 9-step product tour can be replayed from the sidebar menu.
- **Onboarding**: URL → audit/crawl/design/pagespeed → brief → competitors → documents (live log) → socials → Google connect.
- **Credits**: every AI call spends credits (`lib/credits.ts`, costs listed there) and is refunded on failure. Monthly allowance from `CREDITS_FREE_MONTHLY` / `CREDITS_PRO_MONTHLY`. Cloud mode uses the `spend_credits`/`refund_credits` RPCs; preview mode uses an in-memory ledger that resets on restart.
- **Settings** tabs: websites, credits, agents (toggle + custom instructions + subreddits/language), integrations (Google, GitHub, Vercel, Telegram/WhatsApp notifications), skills & MCP, team, personalization & memories, account & security (delete account), devices.
- New agents: UGC video scripts (rendered via the media provider), Hacker News radar, free SEO tools (UTM, meta check, llms.txt, robots.txt, JSON-LD).
- New routes: `/api/credits`, `/api/cmo/{docs,competitors,chat}`, `/api/growth/{pagespeed,design,ugc,hn}`, `/api/notify/{status,test}`, `/api/cron/digest`, `/api/skills`, `/api/mcp`, `/api/team/invite`, `/api/account/delete`.
- Migration: `supabase/migrations/20261020010000_credits_and_settings.sql`.

Honest limits: MCP servers are listed (tools/list) but tools are not executed; team invites send a Supabase invite but don't share a workspace yet; Devices can only "sign out other sessions" (Supabase does not list sessions); PDF/DOCX uploads aren't parsed; Hacker News posting is manual.

## Ad Studio, integrations audit & plans (v7)

- **Plans**: our own neutral, credits-based plans (`lib/plans.ts`): Starter 150 credits/month free, Growth 1000 credits/month at your Stripe price. Every number and name is a placeholder you set via `PLAN_*` / `CREDITS_*` env vars (`/api/plans` lists the configurable keys). Upgrade is disabled until Stripe is configured.
- **Marketing → AI CMO**: an "Open AI CMO" header button and an entry card at the top of Marketing. New tabs: **Email sequences** (`/api/growth/sequence`, A/B subjects), **Launch plan** (T-14…T+14 run-sheet, each task opens the tab that does it, .ics export) and **Budget planner** (pure math: spend → clicks → sign-ups → CAC vs LTV; no AI, no made-up benchmarks, you enter CPM/CTR/CVR).
- **Ad Studio** (`components/ad/*`):
  - *Launch video*: template gallery (launch, feature drop, 3-step explainer, milestone, countdown), canvas engine with 9 layouts (title, kinetic type, device mockups phone/laptop/browser with your screenshots or screen recordings, feature, big number, steps, CTA, b-roll, actor), 6 text animations, 6 transitions, brand kit (colours, Google fonts, logo, "pull from site"), timeline with drag-reorder / trim, music + voice lanes with volume and ducking, burned-in word-level captions (3 styles), safe-zone overlay, autosave.
  - *Export*: WebCodecs → MP4 (H.264/AAC via mp4-muxer) or WebM (VP9/Opus via webm-muxer), 720p/1080p, 30/60 fps, several aspect ratios in one go (9:16, 1:1, 4:5, 16:9). If the browser lacks an H.264 or AAC encoder, it renders WebM and converts with ffmpeg.wasm. All on-device.
  - *UGC ad*: hooks library (our own formulas, filled from your brief) → AI script → voiceover (ElevenLabs with word timestamps, OpenAI TTS, or upload) → actor (HeyGen v3, Synthesia, Creatify, an uploaded creator video, or none) → b-roll (uploads or Replicate/fal) → auto-composed timeline with captions and CTA end card.
  - *Static ads*: 5 layouts × 5 sizes (1080², 1080×1350, 1080×1920, 1200×628, 1200²), copy variants per platform with server-side character-limit checks, PNG export.
  - *Deliver*: renders kept in IndexedDB; download; upload to Facebook Page, Meta ad account video library, TikTok inbox (draft) or YouTube (private unless your app is audited); schedule on the content calendar + .ics.
- **Integrations page** rebuilt from `/api/integrations`: one status per integration, exact missing env keys, token-lifetime warnings, and only actions that work. See `../INTEGRATIONS-AUDIT.md`.
- New routes: `/api/plans`, `/api/integrations`, `/api/ad/{tts,avatar,avatar/[id],proxy,publish,publish/status,adcopy}`, `/api/growth/{sequence,launch}`. Migration `20261020020000_ads_and_lifecycle.sql`.

Honest limits: provider avatars use the provider's voice (our voiceover is a data URL they cannot fetch); captions for OpenAI TTS, uploaded audio and avatar video are estimated from text length; Vercel caps upload bodies at 4.5 MB, so publish larger videos from a self-hosted server or download and upload manually; TikTok uploads land as inbox drafts until your app passes audit; music is your own file (no stock library is bundled).


## Meta Ads (v8)

Integrations → **Paid ads → Meta Ads** connects a Meta business account with OAuth (Marketing API login), then you pick the **ad account** and the **Facebook Page** the ads run as. Marketing → **Meta Ads** (also suggested by the AI CMO chat) is the paid-social workspace.

| Variable | Required | What it is |
|---|---|---|
| `META_APP_ID` | yes | App ID of your Meta app (developers.facebook.com → app type *Business*). |
| `META_APP_SECRET` | yes | App secret. Used for the code exchange, the long-lived token exchange and `appsecret_proof` on every Graph call. |
| `SESSION_SECRET` | yes | Seals the user token (AES-256-GCM) before it is written to Supabase. |
| `META_LOGIN_CONFIG_ID` | no | Facebook Login for Business configuration; replaces the scope list in the dialog. |
| `META_GRAPH_VERSION` | no | Graph API version, default `v26.0`. |
| `META_ADS_TOKEN`, `META_AD_ACCOUNT_ID`, `FACEBOOK_PAGE_ID` | no | Single-owner install: a system-user token instead of per-workspace OAuth. |
| `META_GRAPH_BASE`, `META_GRAPH_VIDEO_BASE`, `META_OAUTH_BASE` | tests only | Point Graph/OAuth at a mock server. |

**Storage.** Migration `20261020120000_meta_ads.sql` adds `meta_connections` (one row per workspace owner: sealed long-lived token, expiry, granted scopes, selected ad account and Page) and `meta_ad_events` (audit log of every object Ikarvo created, launched, paused or resumed). Both have owner-only RLS. In `PREVIEW_MODE` (no Supabase) the sealed record lives in an httpOnly cookie instead.

**What the AI CMO does (all real Graph calls):**
- **Audience:** the brief (product/app) → AI audience plan → every interest, location and demographic resolved with the targeting search API (`/search?type=adinterest|adgeolocation|adTargetingCategory`). Suggestions Meta can't resolve are shown struck through and are never sent. Manual search for interests, locations, demographics and behaviours. Custom audiences listed from `/act_{id}/customaudiences`; lookalikes created there (`subtype=LOOKALIKE`); customer lists uploaded as SHA-256 hashed emails (`POST /api/meta/audiences {kind:"customer_list"}`).
- **Reach:** `GET /act_{id}/delivery_estimate` for the exact targeting spec and optimisation goal, refreshed as you edit.
- **Creative:** Ad Studio renders (UGC and motion-graphics MP4s from this browser) are uploaded to `/act_{id}/advideos`; the ad account video library is the picker.
- **Create:** campaign → ad set (budget, start/end, targeting) → video creative (`object_story_spec.video_data`, Meta-generated thumbnail) → ad. **Every object is created `PAUSED`.** If a later step fails, the already-created objects are returned (still paused).
- **Launch:** only `POST /api/meta/campaigns/{id} {action:"launch", confirm:"LAUNCH"}` sets ad sets, ads and campaign `ACTIVE`; the UI sends it only from the Launch dialog that shows budget, schedule and max spend and needs a checkbox. Pause/resume use the same route (resume also needs the confirmation).
- **Insights:** spend, reach, impressions, frequency, CTR, CPC and CPA (spend ÷ results for the optimisation goal) with daily series and per-ad breakdown.
- **Recommendations:** rule-based findings from those numbers (CTR, frequency, CPA vs target, spend without results, worst vs best ad), rewritten by the AI CMO when AI is configured. Advice only; nothing changes at Meta.

**No fake success.** Missing `META_APP_ID` / `META_APP_SECRET` / `SESSION_SECRET` → HTTP 503 naming the variable. No token for the workspace → 503 naming `META_ADS_TOKEN` and telling you to connect in Integrations. Meta errors are passed through with their message and `fbtrace_id`.

**Before real use:** create the Meta app, add the redirect URI, add yourself as an app admin/tester (Standard Access works on ad accounts you own), and submit **App Review for Advanced Access to `ads_management`** (plus `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`) and Business Verification before other businesses can connect. The ad account needs a payment method; customer lists need the Custom Audience terms accepted.
