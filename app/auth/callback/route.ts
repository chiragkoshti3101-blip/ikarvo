import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth, email-confirmation and password-reset links all land here.
 * Google sign-in comes back as ?code=…; a denied or broken grant comes back as
 * ?error=access_denied (or an error_code) and is shown on the sign-in form instead
 * of a generic failure page.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = params.get('next');
  const destination = new URL(next?.startsWith('/') ? next : '/app', request.url);

  const denied = params.get('error') ?? params.get('error_code');
  const code = params.get('code');
  if (code && !denied) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(destination);
  }

  destination.pathname = '/app';
  destination.search = '';
  destination.searchParams.set('authError', denied === 'access_denied' ? 'access_denied' : 'provider');
  return NextResponse.redirect(destination);
}
