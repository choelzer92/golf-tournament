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
    // The login response carries the golfer's number even for email logins —
    // GHIN puts it under `golfer_id` there (other endpoints use `ghin`). Probe
    // every known field or an email login resolves to no identity, which used to
    // leave `createdByGhin` null and trap the organizer in a re-login loop.
    const ghinFromLogin = Number(
      golferUser?.golfer_id ?? golferUser?.ghin_number ?? golferUser?.ghin ?? golferUser?.id
    );
    const ghinNumber = !isNaN(Number(username)) ? Number(username) : (!isNaN(ghinFromLogin) ? ghinFromLogin : NaN);
    if (!isNaN(ghinNumber)) {
      try {
        golfer = await getGolferHandicap(token, ghinNumber);
      } catch {
        golfer = null;
      }
    }
    // Fall back to the login identity (has the number + name) if the lookup
    // didn't run or failed — so the golfer object is never null on a login.
    if (!golfer && golferUser) golfer = golferUser;

    // Normalize: guarantee a numeric `ghin` on the returned golfer so every
    // caller (pool identity, roster) relies on ONE canonical field regardless of
    // which GHIN endpoint or login type produced it.
    if (golfer && !isNaN(ghinNumber) && golfer.ghin == null) {
      golfer = { ...golfer, ghin: ghinNumber };
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
