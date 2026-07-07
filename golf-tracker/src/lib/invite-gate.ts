const COOKIE_NAME = 'golf_access';
const VALID_CODES = ['birdie2026'];
const EXPIRY_SECONDS = 60 * 60 * 48; // 48 hours

// Secret token used in share links (?key=...) to grant app access without typing
// the invite code. Anyone with a link is in — that's the intent for sharing a
// pool game with a group.
export const SHARE_TOKEN = 'poolparty2026';

export function checkInviteCode(code: string): boolean {
  return VALID_CODES.includes(code.trim().toLowerCase());
}

// If the URL carries a valid share token (?key=...), grant access and return true.
// Called on mount by the gate before prompting for an invite code.
export function checkShareTokenInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const key = new URLSearchParams(window.location.search).get('key');
    if (key && key === SHARE_TOKEN) {
      setAccessCookie();
      return true;
    }
  } catch {
    // ignore malformed URLs
  }
  return false;
}

export function setAccessCookie() {
  document.cookie = `${COOKIE_NAME}=granted; path=/; max-age=${EXPIRY_SECONDS}; SameSite=Lax`;
}

export function hasAccessCookie(): boolean {
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
}

export function clearAccessCookie() {
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}
