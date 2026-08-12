// Domain fixtures beyond a single pool game: roster players, saved groups, and a
// multi-week LEDGER of completed games.
//
// These exist to make the "continuing" surfaces critique-able. /home/stats was
// structurally dead until the completion fix (nothing ever set
// status:'completed', so buildGameLedgers always got an empty array) — so its
// settle-up math, four lenses, and by-group inference have never been seen with
// real data. Same for /home/groups/[id], the reuse mechanism behind "config is a
// one-time cost".
//
// DEV/TEST ONLY — imported by the sandbox seed page, never by app code.

import type { GameScore, Player } from '@/lib/game-state';
import type { PoolGame, PoolTeam } from '@/lib/pool-game';
import type { RosterGroup } from '@/lib/roster-groups';
import type { RosterPlayer } from '@/lib/roster';

export const SANDBOX_GHIN = 1234567;   // the "logged-in organizer" in sandbox

export const PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
export const ALL18 = Array.from({ length: 18 }, (_, i) => i + 1);

// A realistic standing group. Craig's real "Weekend Warriors" is 61 members while
// only 8-20 play any given day — list UIs behave very differently at that size
// than at 4, so the fixture matches reality rather than convenience.
const FIRST = ['Craig', 'Jym', 'Dave', 'Rick', 'Sam', 'Tony', 'Will', 'Gary', 'Pete', 'Hank',
  'Luis', 'Omar', 'Neil', 'Ross', 'Kurt', 'Vince', 'Dean', 'Cal', 'Brett', 'Ike',
  'Marty', 'Chip', 'Duane', 'Fred', 'Glen', 'Hal', 'Ivan', 'Jack', 'Ken', 'Lou',
  'Manny', 'Norm', 'Oscar', 'Phil', 'Quinn', 'Randy', 'Stu', 'Ted', 'Uri', 'Vic',
  'Wade', 'Xavier', 'Yuri', 'Zane', 'Abe', 'Bart', 'Carl', 'Don', 'Earl', 'Frank',
  'Gus', 'Herb', 'Irv', 'Joe', 'Karl', 'Leo', 'Mack', 'Ned', 'Otis', 'Paul', 'Ray'];
const LAST = ['Hoelzer', 'Youngberg', 'Miller', 'Tanaka', 'Ortiz', 'Belmont', 'Chen',
  'Fox', 'Nash', 'Boyle', 'Ramos', 'Haddad', 'Preston', 'Calder', 'Weiss'];

function idxFor(i: number): number {
  // Spread 0.4 .. 26 so flights, off-the-low, and allowance all have real range.
  return Math.round((0.4 + (i * 25.6) / 60) * 10) / 10;
}

/** N roster players with stable ids `rp1..rpN`. */
export function rosterPlayers(n = 61): RosterPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `rp${i + 1}`,
    // rp1 IS the sandbox organizer, so the "My money" lens has a real identity to match.
    // Without this the roster had no player carrying SANDBOX_GHIN and the lens fell back
    // to its "couldn't match your GHIN" state — which was the graceful path working, but
    // it meant the interesting view was never exercised.
    ghinNumber: i === 0 ? SANDBOX_GHIN : 2000000 + i,
    name: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`,
    handicapIndex: idxFor(i),
    gender: i % 9 === 8 ? ('F' as const) : ('M' as const),   // a mixed field
    defaultTeeName: i % 9 === 8 ? 'Red' : 'Blue',
    defaultTeeRank: null,
    hcapUpdatedAt: '2026-08-01T12:00:00.000Z',
    ownerGhin: SANDBOX_GHIN,
  }));
}

/** Rows as the `players` table stores them (snake_case). */
export function rosterRows(players: RosterPlayer[]): Record<string, unknown>[] {
  return players.map((p) => ({
    id: p.id,
    ghin_number: p.ghinNumber,
    name: p.name,
    handicap_index: p.handicapIndex,
    gender: p.gender,
    default_tee_name: p.defaultTeeName,
    default_tee_rank: p.defaultTeeRank ?? null,
    hcap_updated_at: p.hcapUpdatedAt ?? null,
    owner_ghin: p.ownerGhin ?? null,
  }));
}

/** Saved groups: one large standing group, one small crew, one saved format. */
export function groups(players: RosterPlayer[]): RosterGroup[] {
  return [
    {
      id: 'g-weekend-warriors',
      name: 'Weekend Warriors',
      ownerGhin: SANDBOX_GHIN,
      playerIds: players.slice(0, 61).map((p) => p.id),
      defaults: {
        moneyMode: 'pot',
        entryPerPlayer: 25,
        handicapAllowance: 100,
        strokeMethod: 'off-the-low',
        handicapBasis: 'course',
        ballSelection: '1-net-1-gross',
        useCaptains: true,
        junkValues: { birdie: 1, eagle: 2, albatross: 3, groupHug: 1, ctp: 1 },
      },
    },
    {
      id: 'g-tuesday-crew',
      name: 'Tuesday Crew',
      ownerGhin: SANDBOX_GHIN,
      playerIds: players.slice(0, 8).map((p) => p.id),
      defaults: { moneyMode: 'match', handicapAllowance: 90, strokeMethod: 'off-the-low' },
    },
    {
      id: 'f-2v2-bestball',
      name: '2v2 Best Ball (Stableford)',
      ownerGhin: SANDBOX_GHIN,
      playerIds: [],
      defaults: {
        kind: 'format',
        gameMode: 'team-2v2',
        modeSettings: {
          format: 'best-ball', scoring: 'stableford', result: 'match',
          moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 10,
        },
      },
    },
  ];
}

export function groupRows(gs: RosterGroup[]): Record<string, unknown>[] {
  return gs.map((g) => ({
    id: g.id,
    name: g.name,
    owner_ghin: g.ownerGhin,
    player_ids: g.playerIds,
    defaults: g.defaults,
  }));
}

// ---------------------------------------------------------------------------
// Ledger: several COMPLETED games over weeks, so /home/stats has real money
// ---------------------------------------------------------------------------

function course() {
  const holes = PARS.map((par, i) => ({
    number: i + 1, par,
    yardage: par === 3 ? 165 : par === 5 ? 520 : 400,
    handicap: i + 1,
  }));
  return {
    courseId: 1, courseName: 'Sandbox National', city: 'Denver', state: 'CO',
    teeSets: [{
      id: 1, name: 'Blue', gender: 'M' as const, totalYardage: 6500, totalPar: 72,
      ratings: [
        { type: 'Total' as const, courseRating: 72.0, slopeRating: 113 },
        { type: 'Front' as const, courseRating: 36.0, slopeRating: 113 },
        { type: 'Back' as const, courseRating: 36.0, slopeRating: 113 },
      ],
      holes,
    }],
    selectedTeeId: 1,
  };
}

function asPlayers(rps: RosterPlayer[]): Player[] {
  return rps.map((p) => ({
    id: p.id, name: p.name, handicapIndex: p.handicapIndex,
    gender: p.gender ?? 'M', teeSetId: 1,
  }));
}

export interface SeededGame {
  game: PoolGame;
  scoresByMatchup: [string, GameScore[]][];
}

/**
 * One COMPLETED pool game. `offsets` is per-team strokes-over-par, so the winner
 * is deterministic and the money is predictable.
 */
function completedPool(
  opts: {
    id: string; name: string; playedAt: string; roster: RosterPlayer[];
    teamCount: number; entryPerPlayer: number; offsets: number[];
    sourceGroupId?: string;
  },
): SeededGame {
  const perTeam = 4;
  const used = opts.roster.slice(0, opts.teamCount * perTeam);
  const players = asPlayers(used);
  const teams: PoolTeam[] = Array.from({ length: opts.teamCount }, (_, i) => ({
    id: `${opts.id}-t${i + 1}`,
    name: `Team ${i + 1}`,
    playerIds: used.slice(i * perTeam, (i + 1) * perTeam).map((p) => p.id),
    matchupId: `${opts.id}-m${i + 1}`,
    captainId: used[i * perTeam]?.id,
  }));

  const game: PoolGame = {
    id: opts.id,
    name: opts.name,
    createdAt: opts.playedAt,
    course: course(),
    players,
    teams,
    ballSelection: '1-net-1-gross',
    moneyMode: 'pot',
    entryPerPlayer: opts.entryPerPlayer,
    handicapAllowance: 100,
    handicapBasis: 'course',
    strokeMethod: 'off-the-low',
    potSplit: { front: 0.25, back: 0.25, overall: 0.25, junk: 0.25 },
    positionSplit: [70, 30],
    junkValues: { birdie: 1, eagle: 2, albatross: 3, groupHug: 1, ctp: 1 },
    ctpWinners: {},
    status: 'completed',              // the whole point — the ledger needs this
    sourceGroupId: opts.sourceGroupId,
    createdByGhin: SANDBOX_GHIN,
  };

  const scoresByMatchup: [string, GameScore[]][] = teams.map((t, ti) => [
    t.matchupId,
    t.playerIds.flatMap((pid, pi) =>
      ALL18.map((h) => ({
        playerId: pid,
        hole: h,
        // team offset + a little per-player variation so junk/birdies exist
        grossScore: PARS[h - 1] + (opts.offsets[ti] ?? 1) + ((pi + h) % 3 === 0 ? -1 : 0),
      })),
    ),
  ]);

  return { game, scoresByMatchup };
}

/**
 * A season of finished games across several weeks, all tagged to a group so the
 * by-group lens and the settle-up math have something real to roll up.
 */
export function ledgerSeason(roster: RosterPlayer[]): SeededGame[] {
  return [
    completedPool({
      id: 'lg-1', name: 'Warriors — Week 1', playedAt: '2026-06-06T15:00:00.000Z',
      roster, teamCount: 3, entryPerPlayer: 25, offsets: [0, 1, 2],
      sourceGroupId: 'g-weekend-warriors',
    }),
    completedPool({
      id: 'lg-2', name: 'Warriors — Week 2', playedAt: '2026-06-13T15:00:00.000Z',
      roster: roster.slice(4), teamCount: 3, entryPerPlayer: 25, offsets: [2, 0, 1],
      sourceGroupId: 'g-weekend-warriors',
    }),
    completedPool({
      id: 'lg-3', name: 'Warriors — Week 3', playedAt: '2026-06-20T15:00:00.000Z',
      roster, teamCount: 2, entryPerPlayer: 50, offsets: [1, 0],
      sourceGroupId: 'g-weekend-warriors',
    }),
    completedPool({
      id: 'lg-4', name: 'Tuesday Crew — Skins Day', playedAt: '2026-07-07T15:00:00.000Z',
      roster, teamCount: 2, entryPerPlayer: 20, offsets: [0, 2],
      sourceGroupId: 'g-tuesday-crew',
    }),
    // An untagged game — exercises the player-overlap INFERENCE path in
    // gameBelongsToGroup (games created before group tagging existed).
    completedPool({
      id: 'lg-5', name: 'Untagged Saturday', playedAt: '2026-07-18T15:00:00.000Z',
      roster, teamCount: 2, entryPerPlayer: 25, offsets: [1, 1],
    }),
  ];
}
