import { NextRequest, NextResponse } from 'next/server';
import { githubClient } from '@/lib/github/github-client';

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const redirectUri = `${origin}/api/github/callback`;
    const state = Math.random().toString(36).substring(2, 15);

    const loginUrl = githubClient.getOAuthLoginUrl(redirectUri, state);

    const response = NextResponse.redirect(loginUrl);
    // Secure state cookie
    response.cookies.set('gh_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate GitHub authorization URL',
        instructions: 'Please configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env.local file.',
      },
      { status: 500 }
    );
  }
}
