const COOKIE_NAME = 'golf_access';
const VALID_CODES = ['birdie2026'];
const EXPIRY_SECONDS = 60 * 60 * 48; // 48 hours

// Access levels:
//  - 'full': the owner (entered the invite code) — the whole app.
//  - 'pool': arrived via an organizer share link — pool games only (create,
//    manage, scorecards). Blocked from the dashboard and the tournament side.
export type AccessLevel = 'full' | 'pool';

// Secret token used in organizer share links (?key=...). Grants 'pool' access
// (create/manage pool games) WITHOUT exposing the full app.
export const ORGANIZER_TOKEN = 'poolparty2026';

// Routes a 'pool'-level (share-link) visitor may see. Everything else (dashboard,
// tournament pages, quick game) requires 'full' access.
export function isPoolAllowedPath(pathname: string): boolean {
  return pathname === '/pool' || pathname.startsWith('/pool/') || pathname === '/game/play';
}

export function checkInviteCode(code: string): boolean {
  return VALID_CODES.includes(code.trim().toLowerCase());
}

export function setAccessCookie(level: AccessLevel = 'full') {
  document.cookie = `${COOKIE_NAME}=${level}; path=/; max-age=${EXPIRY_SECONDS}; SameSite=Lax`;
}

export function getAccessLevel(): AccessLevel | null {
  if (typeof document === 'undefined') return null;
  const c = document.cookie.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE_NAME}=`));
  if (!c) return null;
  const val = c.slice(COOKIE_NAME.length + 1);
  return val === 'full' || val === 'pool' ? val : 'full'; // legacy 'granted' cookie -> full
}

export function hasAccessCookie(): boolean {
  return getAccessLevel() !== null;
}

// If the URL carries the organizer token (?key=...), grant 'pool' access and
// return that level. Returns null if no valid token present.
export function checkShareTokenInUrl(): AccessLevel | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = new URLSearchParams(window.location.search).get('key');
    if (key && key === ORGANIZER_TOKEN) {
      setAccessCookie('pool');
      return 'pool';
    }
  } catch {
    // ignore malformed URLs
  }
  return null;
}

export function clearAccessCookie() {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}
