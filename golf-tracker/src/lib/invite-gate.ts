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
//
// LEGACY, and deliberately still valid: this one constant was the ONLY share token
// for every link ever sent, so revoking it would break games friends are currently
// playing. Player links now carry a PER-GAME token instead (see shareTokenForGame
// in lib/pool-game.ts) — individually shareable and revocable. This constant stays
// accepted so links already in group chats keep working.
//
// NOTE: neither token restricts DATABASE access — RLS is open by decision (see
// DECISIONS.md §5c). These gate the UI only.
export const ORGANIZER_TOKEN = 'poolparty2026';

// A per-game share token: random, opaque, and revocable by regenerating it. Long
// enough not to be guessable, short enough to sit in a URL and a QR code.
export function generateShareToken(): string {
  // 18 bytes -> 24 base64url chars. crypto is available in the browser and in Node 19+.
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

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
    if (!key) return null;

    // The legacy shared token, still honored (see ORGANIZER_TOKEN).
    if (key === ORGANIZER_TOKEN) {
      setAccessCookie('pool');
      return 'pool';
    }

    // A PER-GAME token on a game URL (/pool/<id>?key=<token>). The gate runs before
    // any game data is loaded, so it cannot validate the token here — it grants
    // 'pool' UI access and the GAME PAGE verifies the token against the game it
    // loads (see shareTokenMatches). Granting UI access on a token-shaped key is no
    // weaker than the legacy constant, which anyone could already copy; the real
    // access boundary is RLS, deliberately deferred (DECISIONS.md §5c).
    if (/^\/pool\/[^/]+/.test(window.location.pathname) && isShareTokenShaped(key)) {
      setAccessCookie('pool');
      return 'pool';
    }
  } catch {
    // ignore malformed URLs
  }
  return null;
}

/** Does this look like a token we generated? Cheap shape check, not validation. */
export function isShareTokenShaped(key: string): boolean {
  return /^[A-Za-z0-9_-]{20,32}$/.test(key);
}

export function clearAccessCookie() {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}
