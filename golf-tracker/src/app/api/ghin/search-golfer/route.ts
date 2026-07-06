import { searchGolfersByName } from '@/lib/ghin-api';

export async function POST(request: Request) {
  try {
    const { token, first_name, last_name, state } = await request.json();

    if (!token) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!first_name && !last_name) {
      return Response.json({ error: 'A first or last name is required' }, { status: 400 });
    }

    const golfers = await searchGolfersByName(token, first_name || '', last_name || '', state);
    return Response.json({ golfers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search golfers';
    return Response.json({ error: message }, { status: 500 });
  }
}
