import { getCourseDetails } from '@/lib/ghin-api';

export async function POST(request: Request) {
  try {
    const { token, course_id } = await request.json();

    if (!token) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!course_id) {
      return Response.json({ error: 'Course ID is required' }, { status: 400 });
    }

    const course = await getCourseDetails(token, course_id);
    return Response.json({ course });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch course details';
    return Response.json({ error: message }, { status: 500 });
  }
}
