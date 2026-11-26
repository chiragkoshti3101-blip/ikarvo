// Persists which AI model last answered, so /api/status can report it even on a
// cold serverless instance. Storage is the source of truth; an in-memory cache
// keeps repeated status calls cheap.
import { envValue } from '@/lib/env';

type Answered = { model: string; at: string } | null;

const PATH = 'ai-last-model.json';
const BUCKET = 'app-state';
const TTL_MS = 10_000;

let memory: Answered = null;
let cached: Answered = null;
let cachedAt = 0;

function supabaseUrl() { return envValue('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, ''); }
function serviceKey() { return envValue('SUPABASE_SERVICE_ROLE_KEY'); }

function canPersist() { return !!supabaseUrl() && !!serviceKey(); }

export async function recordLastAnswered(model: string) {
  const value: Answered = { model, at: new Date().toISOString() };
  memory = value;
  cached = value;
  cachedAt = Date.now();
  if (!canPersist()) return;
  try {
    // Awaited on purpose: a fire-and-forget request is dropped when the serverless function freezes after the
    // response, which left the stored value stale. The timeout keeps a slow storage call off the critical path.
    await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${PATH}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey(),
        Authorization: `Bearer ${serviceKey()}`,
        'Content-Type': 'application/json',
        'x-upsert': 'true',
      },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(1500),
    });
  } catch { /* best effort: the in-memory value still answers this instance */ }
}

export async function readLastAnswered(): Promise<Answered> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (!canPersist()) return memory;
  try {
    const res = await fetch(`${supabaseUrl()}/storage/v1/object/${BUCKET}/${PATH}`, {
      headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      cached = memory;
      cachedAt = Date.now();
      return cached;
    }
    const value = (await res.json()) as Answered;
    if (value && typeof value.model === 'string') {
      memory = value;
      cached = value;
      cachedAt = Date.now();
      return value;
    }
    cached = memory;
    cachedAt = Date.now();
    return cached;
  } catch {
    cached = memory;
    cachedAt = Date.now();
    return cached;
  }
}
