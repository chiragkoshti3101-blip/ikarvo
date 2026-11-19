# Deploying Ikarvo (US production)

This is the exact runbook for shipping Ikarvo to a US audience. You do the two
account steps (Vercel + Supabase); the repo is already configured for both.

## 0. What is already done in the repo

- `vercel.json` pins the US East region (`iad1`), keeps the publish/digest cron
  jobs, and adds baseline security headers.
- `middleware.ts` refreshes the Supabase session cookie on every non-static route.
- `supabase/migrations/*` contain every table, RLS policy and RPC the app needs.
- `lib/env.ts` (`featureStatus()`) tells you exactly which keys are still missing;
  `/api/status` returns the same list with no secret values.
- The UI is US English with `en-US` dates/numbers and USD-aware money formatting.

## 1. Supabase project (US)

1. Create a project at https://supabase.com — choose a **US region** (e.g. `us-east-1`).
2. Copy from **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (anon/publishable key)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; used by the Stripe webhook + cron)
3. Apply the schema from this checkout:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push        # applies every file in supabase/migrations
   ```

4. Under **Authentication → URL Configuration**:
   - Site URL: `https://<your-domain>`
   - Redirect URL: `https://<your-domain>/auth/callback`

## 2. Vercel project (US)

1. Import the GitHub repo `chiragkoshti3101-blip/ikarvo` at https://vercel.com.
2. Framework preset: **Next.js** (auto-detected). Region is forced to `iad1` by `vercel.json`.
3. Add the environment variables below in **Settings → Environment Variables**
   (Production + Preview). Only the first block is required to boot with accounts.

### Required for accounts + database

| Key | Where |
|---|---|
| `APP_URL` | `https://<your-domain>` (no trailing slash) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API (server-only) |
| `SESSION_SECRET` | `openssl rand -hex 32` |

### Strongly recommended

| Key | Purpose |
|---|---|
| `AI_API_KEY` (+ optional `AI_BASE_URL`, `AI_MODEL`) | Any OpenAI-compatible `/chat/completions` endpoint |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Subscription billing |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Repo push (callback `{APP_URL}/api/github/callback`) |
| `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET`, `VERCEL_INTEGRATION_SLUG` | Per-user Vercel deploys |
| `REPLICATE_API_TOKEN` or `FAL_KEY` | AI image/video |
| `CRON_SECRET`, `SCHEDULER_OWNER_USER_ID` | Background publisher |

`/api/status` and **Settings → Setup** list anything still missing. Never paste
secrets into chat or commit them; set them in the Vercel dashboard.

### Stripe webhook

Point a webhook at `{APP_URL}/api/billing/webhook` with events
`checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`. Enable the Customer Portal.

## 3. Deploy & verify

```bash
npm run typecheck && npm run lint && npm run build
```

Then either push to the connected branch (Vercel builds automatically) or run
`vercel --prod`. After the first deploy:

1. Open `/` — landing page renders with canonical/OG tags.
2. Open `/app` — in production it requires sign-in; complete one sign-up and
   check that `/auth/callback` returns you to the workspace.
3. Visit `/api/status` — every feature you configured shows `ok: true`.
4. In **Settings → Credits**, confirm the monthly allowance matches your env.
5. Trigger the cron manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/publish`

## 4. US-specific configuration

- `APP_URL` must be the real US domain so OAuth callbacks and Stripe redirects match.
- Keep the Vercel region at `iad1` (set in `vercel.json`) for US latency.
- Plans and credit amounts are set with `PLAN_*` / `CREDITS_*` env vars; the charged
  amount always comes from the Stripe price.
- Money in Meta Ads is shown in the connected ad account's currency (USD for US accounts).

## Provisioned resources (created in this workspace)

- **Supabase project** `ikarvo` — region **East US (North Virginia) / us-east-1**, project ref `kshnymikdhfunzbbncuo`.
  All 9 migrations in `supabase/migrations` were applied (34 tables incl. `profiles`, `projects`,
  `campaigns`, `posts`, `brands`, `meta_connections`, `credit_events`).
- **Vercel project** `ikarvo` — production domain `https://ikarvo.vercel.app`, Git repo
  `chiragkoshti3101-blip/ikarvo` connected on the `main` branch.
- **Environment variables set in Vercel:** `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (plus existing
  `SESSION_SECRET`, `AI_*`, `CRON_SECRET`).
- **Supabase Auth** callbacks to configure after first deploy: Site URL `https://ikarvo.vercel.app`,
  redirect `https://ikarvo.vercel.app/auth/callback`.
