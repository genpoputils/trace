import { NextRequest, NextResponse } from 'next/server';
import { githubClient } from '@/lib/github/github-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { owner, repo } = body;

    if (!owner || !repo) {
      return NextResponse.json({ error: 'owner and repo are required parameters' }, { status: 400 });
    }

    const tokenFromCookie = req.cookies.get('gh_token')?.value;
    const token = body.token || tokenFromCookie;

    const branches = await githubClient.listBranches(owner, repo, token);
    return NextResponse.json({ branches });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list repository branches' },
      { status: 500 }
    );
  }
}
