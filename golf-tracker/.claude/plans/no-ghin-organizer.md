# A no-GHIN organizer: dependency map and options (§5.cd)

**DEFERRED 2026-10-01 (§5.ch):** only GHIN-login users organize, for now. Non-GHIN players keep
scoring and seeing the leaderboard. Revisit this with §5c security; the map below stays as
reference.

This plan was mapped on 2026-10-01 by a read-only sweep. Craig wants an organizer with no GHIN account,
but "a lot of the app relies on ghin numbers". This file lists those dependencies and the options for
each. Building any of it is Craig's call.

## The map

The app has no identity of its own. Who you are is whatever GHIN golfer `/api/ghin/login` returns:
`getCreatorGhin()` (`src/lib/pool-identity.ts:56`). The invite gate (`src/lib/invite-gate.ts`) sets
an access level and carries no identity.

**Hard dependencies (no workaround today):**

| Dependency | Where |
|---|---|
| A `ghin_token` is required just to open the page | `home/page.tsx:102`, `dashboard/page.tsx:77`, `home/stats/page.tsx:63`, `home/groups/[id]/page.tsx:108`, `home/feedback/page.tsx:19` |
| Game owner `createdByGhin`. Without it the game saves untagged, and the organizer can't list it again. | stamped in `pool/new/page.tsx:669`, `tournament/new/page.tsx:163`, `game/new`, `money-game`, `solo` |
| The "My Games" filter | `pool/page.tsx:28-47`, `pool-game.ts:2559`, `home/page.tsx:108-127`, `solo-round.ts:214` |
| Roster, group and format scope (`owner_ghin`) | `roster.ts:44-52,141-158`, `roster-groups.ts:85`, `pool-formats.ts:85,103` |
| The app owner is a configured GHIN | `invite-gate.ts:77-101` |
| **Course and tee data:** GHIN course search, with no manual entry anywhere | `ghin-api.ts:82,134`, `course-step.tsx:87,113` (and 6 other setup pages). The only other way is a recent course copied from an earlier game. |

**Soft dependencies (a fallback exists):**
- **Handicap index:** typed by hand.
- **Adding players:** "Add manually", with `ghinNumber: null`.
- **Guest scoring:** the share token (`?key=`), with no login.
- **Stats rollups:** keyed by roster `playerId`, not GHIN. Only the "mine" lens needs the GHIN.
- **Recent courses and feedback:** both work with a null GHIN.

**Not a dependency:** the app never posts scores to GHIN.

## The two problems, and the options for each

### 1. Identity: who owns the game and finds it again

- **A. A device identity.** Make a random organizer id the first time, keep it in localStorage, and
  use it wherever `createdByGhin` / `owner_ghin` is used today. GHIN login later *links* that id.
  - *Cost:* small (S–M).
  - *Catch:* clearing the phone or switching phones loses "My Games". Ids are numbers today, so this
    needs a non-GHIN id space, e.g. negative or a prefix.
- **B. A real account** (Supabase email magic link). The account is the identity, and GHIN is an
  optional linked attribute.
  - *Upside:* survives a new phone, and it's the right long-term shape.
  - *Catch:* it overlaps the deferred §5c accounts/RLS hardening. M–L, plus a live migration.
- **C. A to B.** Ship A now, shaped so the id can later be claimed by an account.

### 2. Course data: setting up a course no one has played before

- **i. A server-side app credential.** The course-search proxy uses the app's own GHIN login, not
  the user's, so anyone can search. *Small.* Needs Craig's GHIN terms comfort and a stored secret.
- **ii. Manual course entry.** Par, stroke index, rating and slope per tee. Works for any course
  anywhere, but it's tedious, and wrong SI/slope data means wrong strokes (bar #6).
- **iii. Both.** Search first, manual as the fallback.

The visibility work (§5.cb) keys players by GHIN. Whatever identity is picked here has to fit that
too, so ask before §5.cb's lib functions harden on `number`.

## The question for Craig

Pick one identity option (A / B / C) and one course option (i / ii / iii). Is it a beta bar item? It
moves bar #1 for a stranger with no GHIN.
