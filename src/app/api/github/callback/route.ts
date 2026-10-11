import { NextRequest, NextResponse } from 'next/server';
import { githubClient } from '@/lib/github/github-client';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const storedState = req.cookies.get('gh_oauth_state')?.value;

  if (!code) {
    return NextResponse.redirect(`${req.nextUrl.origin}?github_error=missing_code`);
  }

  // Validate state
  if (storedState && state && state !== storedState) {
    return NextResponse.redirect(`${req.nextUrl.origin}?github_error=invalid_state`);
  }

  try {
    const redirectUri = `${req.nextUrl.origin}/api/github/callback`;
    const token = await githubClient.exchangeCode(code, redirectUri);

    const response = NextResponse.redirect(`${req.nextUrl.origin}?github_connected=true`);
    response.cookies.set('gh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('GitHub OAuth callback failed:', error);
    const msg = encodeURIComponent(error instanceof Error ? error.message : 'Unknown OAuth error');
    return NextResponse.redirect(`${req.nextUrl.origin}?github_error=${msg}`);
  }
}
