import { ghinLogin, getGolferHandicap } from '@/lib/ghin-api';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return Response.json(
        { error: 'GHIN number and password are required' },
        { status: 400 }
      );
    }

    const token = await ghinLogin(username, password);

    let golfer = null;
    const ghinNumber = Number(username);
    if (!isNaN(ghinNumber)) {
      golfer = await getGolferHandicap(token, ghinNumber);
    }

    return Response.json({
      success: true,
      token,
      golfer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return Response.json({ error: message }, { status: 401 });
  }
}
