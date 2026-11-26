import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_WINDOW_MS = 60_000;
const API_RATE_LIMIT = 120;
const PAGE_RATE_LIMIT = 300;

function clientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

function checkRateLimit(ip: string, isApi: boolean): { ok: boolean; retryAfter?: number } {
  const limit = isApi ? API_RATE_LIMIT : PAGE_RATE_LIMIT;
  const key = ip + ':' + (isApi ? 'api' : 'page');
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  entry.count++;
  if (entry.count > limit) {
    return { ok: false, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }
  return { ok: true };
}

export async function middleware(request: NextRequest) {
  const ip = clientIp(request);
  const isApi = request.nextUrl.pathname.startsWith('/api/');
  const rl = checkRateLimit(ip, isApi);
  if (!rl.ok) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfter ?? 60), 'Content-Type': 'text/plain' },
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.PREVIEW_MODE === '1' || !url || !supabaseKey) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/billing/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
