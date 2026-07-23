// Organizer identity for the pool feature.
//
// The GHIN identity (who logged in) is what tags a created game and filters
// "My Pool Games". It used to live ONLY in sessionStorage, which the browser
// clears on tab close — so a returning organizer who reopened the share link
// had no identity and saw an empty list even though their games were saved
// (the #1 "nothing saved" report). We now ALSO mirror the identity to
// localStorage so it survives a tab close: a returning organizer sees their
// history without logging in again. sessionStorage still takes precedence so a
// fresh login this session always wins.
//
// NOTE: only the lightweight identity (GHIN number + name) is persisted here.
// The GHIN bearer token stays in sessionStorage only (it is a short-lived
// credential and must not outlive the session).

const GOLFER_KEY = 'ghin_golfer';

// Persist the golfer identity from a login response to BOTH session and local
// storage, so it survives both the active session and a tab close.
export function saveGhinIdentity(golfer: unknown): void {
  if (!golfer) return;
  try {
    const raw = JSON.stringify(golfer);
    sessionStorage.setItem(GOLFER_KEY, raw);
    localStorage.setItem(GOLFER_KEY, raw);
  } catch {
    /* storage unavailable (private mode / quota) — ignore */
  }
}

// The stored golfer object: the fresh session copy first, else the durable
// local copy from a previous visit.
function readGolfer(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(GOLFER_KEY) ?? localStorage.getItem(GOLFER_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// The logged-in organizer's GHIN number (session or durable local), or null if
// they've never logged in on this device.
export function getCreatorGhin(): number | null {
  const g = readGolfer();
  if (!g) return null;
  // Probe every field GHIN uses for the golfer's number across its endpoints:
  // `golfer_id` (login/email response), `ghin`/`ghin_number` (golfer lookup),
  // `id` (fallback). Missing `golfer_id` here is what let an email-login
  // identity read as null even after a successful login.
  const n = Number(g.ghin ?? g.ghin_number ?? g.golfer_id ?? g.id);
  return isNaN(n) ? null : n;
}

// Their display name, if known — for a friendly "Showing your games" line.
export function getCreatorName(): string | null {
  const g = readGolfer();
  if (!g) return null;
  const name = [g.first_name, g.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}
