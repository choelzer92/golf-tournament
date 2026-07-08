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

    const { token, golferUser } = await ghinLogin(username, password);

    // Resolve the golfer's identity so the caller always knows who logged in
    // (used to tag pool games by creator), whether they used GHIN # or email.
    let golfer: Record<string, unknown> | null = null;
    // The login response carries the golfer's GHIN even for email logins.
    const ghinFromLogin = Number(golferUser?.ghin_number ?? golferUser?.ghin ?? golferUser?.id);
    const ghinNumber = !isNaN(Number(username)) ? Number(username) : (!isNaN(ghinFromLogin) ? ghinFromLogin : NaN);
    if (!isNaN(ghinNumber)) {
      try {
        golfer = await getGolferHandicap(token, ghinNumber);
      } catch {
        golfer = null;
      }
    }
    // Fall back to the login identity (has ghin + name) if the lookup didn't run
    // or failed — so the golfer object is never null on a successful login.
    if (!golfer && golferUser) golfer = golferUser;

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
