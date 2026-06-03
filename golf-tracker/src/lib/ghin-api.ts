const FIREBASE_URL = 'https://firebaseinstallations.googleapis.com/v1/projects/ghin-mobile-app/installations';
const GOOGLE_API_KEY = 'AIzaSyBxgTOAWxiud0HuaE5tN-5NTlzFnrtyz-I';
const GHIN_BASE = 'https://api2.ghin.com/api/v1';

const SESSION_BODY = {
  appId: '1:884417644529:web:47fb315bc6c70242f72650',
  authVersion: 'FIS_v2',
  fid: 'fg6JfS0U01YmrelthLX9Iz',
  sdkVersion: 'w:0.5.7',
};

async function getFirebaseToken(): Promise<string> {
  const res = await fetch(FIREBASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GOOGLE_API_KEY,
    },
    body: JSON.stringify(SESSION_BODY),
  });

  if (!res.ok) {
    throw new Error(`Firebase session failed: ${res.status}`);
  }

  const data = await res.json();
  return data.authToken.token;
}

export async function ghinLogin(username: string, password: string): Promise<string> {
  const firebaseToken = await getFirebaseToken();

  const res = await fetch(`${GHIN_BASE}/golfer_login.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: firebaseToken,
      user: { email_or_ghin: username, password },
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => null);
    const message = error?.errors?.digital_profile?.[0]?.top_line || `Login failed: ${res.status}`;
    throw new Error(message);
  }

  const data = await res.json();
  return data.golfer_user.golfer_user_token;
}

async function ghinFetch(path: string, token: string, params?: Record<string, string>) {
  const url = new URL(`${GHIN_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`GHIN API error: ${res.status} ${res.statusText} - ${body}`);
    throw new Error(`GHIN API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function searchCourses(token: string, name: string, state: string) {
  // Try multiple param formats to find what works
  const stateCode = state.includes('-') ? state : `US-${state}`;

  // Attempt 1: status=Active with state code format
  const params: Record<string, string> = {
    source: 'GHINcom',
    status: 'Active',
    state: stateCode,
  };
  if (name) params.name = name;

  console.log('Search attempt with params:', params);
  let data = await ghinFetch('/crsCourseMethods.asmx/SearchCourses.json', token, params);

  if ((data.courses || []).length > 0) {
    console.log('Found courses:', (data.courses || []).length);
    return data.courses || [];
  }

  // Attempt 2: try facility_name instead of name
  if (name) {
    const params2: Record<string, string> = {
      source: 'GHINcom',
      facility_name: name,
      state: stateCode,
    };
    console.log('Search attempt 2 with params:', params2);
    data = await ghinFetch('/crsCourseMethods.asmx/SearchCourses.json', token, params2);

    if ((data.courses || []).length > 0) {
      console.log('Found courses with facility_name:', (data.courses || []).length);
      return data.courses || [];
    }
  }

  // Attempt 3: try the /courses/search.json endpoint instead
  const params3: Record<string, string> = { source: 'GHINcom', state: stateCode };
  if (name) params3.name = name;

  console.log('Search attempt 3 (alt endpoint) with params:', params3);
  try {
    data = await ghinFetch('/courses/search.json', token, params3);
    console.log('Alt endpoint response:', JSON.stringify(data).slice(0, 500));
    return data.courses || data.Courses || [];
  } catch (e) {
    console.log('Alt endpoint failed:', e);
  }

  return [];
}

export async function getCourseDetails(token: string, courseId: number) {
  const data = await ghinFetch('/crsCourseMethods.asmx/GetCourseDetails.json', token, {
    course_id: courseId.toString(),
    include_altered_tees: 'false',
    source: 'GHINcom',
  });
  return data;
}

export async function getGolferHandicap(token: string, ghinNumber: number) {
  const data = await ghinFetch('/golfers.json', token, {
    golfer_id: ghinNumber.toString(),
    source: 'GHINcom',
    from_ghin: 'true',
    per_page: '1',
    page: '1',
  });
  console.log('Golfer response keys:', Object.keys(data));
  console.log('Golfer response:', JSON.stringify(data).slice(0, 500));
  const golfers = data.golfers || [];
  return golfers[0] || data.golfer || data;
}
