import { NextRequest, NextResponse } from 'next/server';
import { githubClient } from '@/lib/github/github-client';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // empty body
    }

    const tokenFromCookie = req.cookies.get('gh_token')?.value;
    const token = body.token || tokenFromCookie;

    const repos = await githubClient.listUserRepos(token);
    return NextResponse.json({ repos });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list GitHub repositories' },
      { status: 500 }
    );
  }
}
