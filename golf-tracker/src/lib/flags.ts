// Feature flags. Plain compile-time consts — flip and rebuild to toggle.
//
// HOME_V2: routes a logged-in `full` user to the new user-centric Home hub
// (`/home`) after login instead of `/dashboard`. Default OFF — when false the
// app behaves exactly as before. The new Home is purely a logged-in
// convenience and is additive/read-only (Phase 1); the no-account share-link
// (`pool`) flow is untouched either way. See .claude/plans/adaptive-squishing-locket.md.
export const HOME_V2 = false;

// SOLO_ROUNDS: shows an entry point to the solo-round shot-logging feature
// (`/solo`) — the golf-trainer Layer 1 that logs each shot (club + shape + GPS)
// to learn real per-club distances. Default OFF — when false there is no link
// to it anywhere (the routes exist but are unreachable from the UI), so the
// working app is unchanged. Full-access users only; not on the pool share path.
export const SOLO_ROUNDS = true;
