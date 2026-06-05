const COOKIE_NAME = 'golf_access';
const VALID_CODES = ['birdie2026'];
const EXPIRY_SECONDS = 60 * 60 * 48; // 48 hours

export function checkInviteCode(code: string): boolean {
  return VALID_CODES.includes(code.trim().toLowerCase());
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
