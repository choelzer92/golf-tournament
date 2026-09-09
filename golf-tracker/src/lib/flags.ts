// Feature flags. Plain compile-time consts — flip and rebuild to toggle.
//
// HOME_V2: routes a logged-in `full` user to the user-centric Home hub (`/home`)
// after login instead of `/dashboard`.
//
// ON as of 2026-08-12. It was off by default while /home was unfinished, and that had a
// real cost: the whole "continuing" feature set — the money ledger, settle-up, groups —
// was effectively invisible, since /dashboard has no link to /home/stats at all. Combined
// with the completion bug (nothing ever set status:'completed'), the season-money feature
// had never been usable by anyone: unreachable AND fed by an always-empty array.
//
// Turned on only after both landing screens were fixed and verified:
//   - /home/stats — money is group-scoped, "My money" crosses groups (FINDINGS.md F-009)
//   - /home/groups/[id] — a dashboard, not a 5,249px member list (F-010)
//
// `/home` renders a "Classic dashboard" link, so anyone who prefers the old screen is one
// tap away. The no-account share-link (`pool`) flow is untouched either way — a `pool`
// visitor is redirected off non-/pool routes by InviteGate.
export const HOME_V2 = true;

// SOLO_ROUNDS: shows an entry point to the solo-round shot-logging feature
// (`/solo`) — the golf-trainer Layer 1 that logs each shot (club + shape + GPS)
// to learn real per-club distances. Default OFF — when false there is no link
// to it anywhere (the routes exist but are unreachable from the UI), so the
// working app is unchanged. Full-access users only; not on the pool share path.
export const SOLO_ROUNDS = true;
