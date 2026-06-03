import { getGolferHandicap } from '@/lib/ghin-api';

export async function POST(request: Request) {
  try {
    const { token, ghin_number } = await request.json();

    if (!token) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!ghin_number) {
      return Response.json({ error: 'GHIN number is required' }, { status: 400 });
    }

    const golfer = await getGolferHandicap(token, ghin_number);
    return Response.json({ golfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch golfer';
    return Response.json({ error: message }, { status: 500 });
  }
}
