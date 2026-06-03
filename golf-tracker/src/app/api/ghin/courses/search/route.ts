import { searchCourses } from '@/lib/ghin-api';

export async function POST(request: Request) {
  try {
    const { token, name, state } = await request.json();

    if (!token) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!name && !state) {
      return Response.json({ error: 'Course name or state is required' }, { status: 400 });
    }

    const courses = await searchCourses(token, name || '', state || '');
    console.log('Course search response:', JSON.stringify(courses).slice(0, 500));
    return Response.json({ courses });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Search failed';
    return Response.json({ error: message }, { status: 500 });
  }
}
