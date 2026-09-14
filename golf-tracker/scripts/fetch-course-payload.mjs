// Fetch a course's RAW GetCourseDetails payload from GHIN and save it to a file,
// so course-parse work (F-023 / the course-data audit) has real payloads to test
// against. READ-ONLY against GHIN; touches no database.
//
// Run:
//   GHIN_USER=you@email.com GHIN_PASS=yourpassword node scripts/fetch-course-payload.mjs "The Meadows" WV
//
// Credentials come from env vars only — never written anywhere. Output lands in
// course-payloads/<course-name>.json (gitignored raw data; commit only what's
// needed as a test fixture, trimmed of anything personal).

import { writeFile, mkdir } from 'node:fs/promises';

const FIREBASE_URL = 'https://firebaseinstallations.googleapis.com/v1/projects/ghin-mobile-app/installations';
const GOOGLE_API_KEY = 'AIzaSyBxgTOAWxiud0HuaE5tN-5NTlzFnrtyz-I';
const GHIN_BASE = 'https://api2.ghin.com/api/v1';

const [, , courseNameArg, stateArg] = process.argv;
const user = process.env.GHIN_USER;
const pass = process.env.GHIN_PASS;

if (!user || !pass || !courseNameArg || !stateArg) {
  console.error('Usage: GHIN_USER=... GHIN_PASS=... node scripts/fetch-course-payload.mjs "<course name>" <STATE>');
  console.error('Example: GHIN_USER=me@x.com GHIN_PASS=secret node scripts/fetch-course-payload.mjs "The Meadows" WV');
  process.exit(1);
}

async function getFirebaseToken() {
  const res = await fetch(FIREBASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GOOGLE_API_KEY },
    body: JSON.stringify({
      appId: '1:884417644529:web:47fb315bc6c70242f72650',
      authVersion: 'FIS_v2',
      fid: 'fg6JfS0U01YmrelthLX9Iz',
      sdkVersion: 'w:0.5.7',
    }),
  });
  if (!res.ok) throw new Error(`Firebase session failed: ${res.status}`);
  return (await res.json()).authToken.token;
}

async function login() {
  const firebaseToken = await getFirebaseToken();
  const res = await fetch(`${GHIN_BASE}/golfer_login.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: firebaseToken, user: { email_or_ghin: user, password: pass } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.errors?.digital_profile?.[0]?.top_line || `Login failed: ${res.status}`);
  }
  return (await res.json()).golfer_user.golfer_user_token;
}

async function ghinGet(path, token, params) {
  const url = new URL(`${GHIN_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GHIN ${path} -> ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

const token = await login();
console.log('Logged in.');

// Same search the app uses (searchCourses attempt 1).
const stateCode = stateArg.includes('-') ? stateArg : `US-${stateArg}`;
const search = await ghinGet('/crsCourseMethods.asmx/SearchCourses.json', token, {
  source: 'GHINcom', status: 'Active', state: stateCode, name: courseNameArg,
});
const courses = search.courses ?? [];
if (courses.length === 0) {
  console.error(`No courses found for "${courseNameArg}" in ${stateCode}.`);
  process.exit(1);
}
console.log(`Found ${courses.length} course(s):`);
for (const c of courses) console.log(`  ${c.CourseID ?? c.course_id}: ${c.CourseName ?? c.course_name} (${c.City ?? ''})`);

await mkdir('course-payloads', { recursive: true });

for (const c of courses) {
  const id = c.CourseID ?? c.course_id;
  const name = String(c.CourseName ?? c.course_name ?? id);
  const details = await ghinGet('/crsCourseMethods.asmx/GetCourseDetails.json', token, {
    course_id: String(id), include_altered_tees: 'false', source: 'GHINcom',
  });
  const file = `course-payloads/${name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${id}.json`;
  await writeFile(file, JSON.stringify({ search_row: c, details }, null, 2));
  console.log(`Saved ${file}`);
}
console.log('Done. The token was held in memory only.');
