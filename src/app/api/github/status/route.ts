import { NextResponse } from 'next/server';
import { githubClient } from '@/lib/github/github-client';

export async function GET() {
  const status = githubClient.getAuthStatus();
  return NextResponse.json({
    status,
    setupGuide: {
      requiredEnvVars: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
      optionalEnvVars: ['GITHUB_TOKEN'],
      callbackUrl: '/api/github/callback',
      homepageUrl: 'http://localhost:3000',
    },
  });
}
