'use client';

// SANDBOX SEED PAGE — reachable only when NEXT_PUBLIC_SANDBOX=1.
//
// Why this exists: reaching an interesting game state through the UI means a
// 6-step wizard plus 72 score entries. That's fine once; it's prohibitive when
// iterating on the UI. This page seeds a fully-formed game into the in-memory
// store in one click, so any state is one hop away.
//
// It renders NOTHING outside sandbox mode (see the IS_SANDBOX guard), and because
// the sandbox flag is compile-time false in a production build, the seeding code
// is dead-code-eliminated there. See src/lib/supabase.ts.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IS_SANDBOX, supabase } from '@/lib/supabase';
import { savePoolGame, type PoolGame } from '@/lib/pool-game';
import { saveGameScores } from '@/lib/tournament-state';
import { setAccessCookie } from '@/lib/invite-gate';
import { saveGhinIdentity } from '@/lib/pool-identity';
import type { GameScore, Player, CourseSelection } from '@/lib/game-state';
import {
  SANDBOX_GHIN, groupRows, groups as makeGroups, ledgerSeason,
  rosterPlayers, rosterRows,
} from '@/test/fixtures-domain';

// --- fixture data (mirrors src/test/fixtures.ts, kept standalone so the app
// never imports test code) --------------------------------------------------

const PARS = [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];

function course(): CourseSelection {
  const holes = PARS.map((par, i) => ({
    number: i + 1,
    par,
    yardage: par === 3 ? 165 : par === 5 ? 520 : 400,
    handicap: i + 1,
  }));
  return {
    courseId: 1,
    courseName: 'Sandbox National',
    city: 'Denver',
    state: 'CO',
    teeSets: [{
      id: 1,
      name: 'Blue',
      gender: 'M',
      totalYardage: 6500,
      totalPar: 72,
      ratings: [
        { type: 'Total', courseRating: 72.0, slopeRating: 113 },
        { type: 'Front', courseRating: 36.0, slopeRating: 113 },
        { type: 'Back', courseRating: 36.0, slopeRating: 113 },
      ],
      holes,
    }],
    selectedTeeId: 1,
  };
}

const NAMES = ['Craig Hoelzer', 'Jym Youngberg', 'Dave Miller', 'Rick Tanaka',
  'Sam Ortiz', 'Tony Belmont', 'Will Chen', 'Gary Fox'];

function players(indexes: number[]): Player[] {
  return indexes.map((handicapIndex, i) => ({
    id: `sp${i + 1}`,
    name: NAMES[i] ?? `Player ${i + 1}`,
    handicapIndex,
    gender: 'M' as const,
    teeSetId: 1,
  }));
}

function baseGame(over: Partial<PoolGame> & { players: Player[] }): PoolGame {
  return {
    id: over.id ?? crypto.randomUUID(),
    name: 'Sandbox Game',
    createdAt: new Date().toISOString(),
    course: course(),
    teams: [],
    ballSelection: '1-net-1-gross',
    moneyMode: 'pot',
    entryPerPlayer: 25,
    handicapAllowance: 100,
    handicapBasis: 'course',
    strokeMethod: 'full',
    potSplit: { front: 0.25, back: 0.25, overall: 0.25, junk: 0.25 },
    positionSplit: [100],
    junkValues: { birdie: 1, eagle: 2, albatross: 3, groupHug: 1, ctp: 1 },
    ctpWinners: {},
    status: 'active',
    ...over,
  };
}

// gross scores relative to par, per player
function scores(ids: string[], offsets: number[], holeNums: number[]): GameScore[] {
  return ids.flatMap((id, pi) =>
    holeNums.map((h) => ({ playerId: id, hole: h, grossScore: PARS[h - 1] + (offsets[pi] ?? 0) })),
  );
}

const ALL18 = Array.from({ length: 18 }, (_, i) => i + 1);
const BACK9 = [10, 11, 12, 13, 14, 15, 16, 17, 18];

// --- scenarios --------------------------------------------------------------

interface Scenario {
  key: string;
  label: string;
  detail: string;
  // Pool-game scenarios return a game to save + where to open it.
  build?: () => { game: PoolGame; goTo: (id: string) => string };
  // Domain scenarios (roster/groups/ledger) seed several tables directly and
  // return a fixed destination.
  buildDomain?: () => { goTo: string };
}

// Seed rows straight into the fake backend's tables. The roster/groups libs read
// via hydrate*(), which selects from these tables — so the app populates itself
// exactly as it would from Supabase.
async function seedTable(table: string, rows: Record<string, unknown>[]) {
  if (rows.length > 0) await supabase.from(table).upsert(rows as never);
}

// Make the app believe an organizer is logged in: the /home routes gate on a GHIN
// token, and roster/group visibility is scoped to the viewer's GHIN.
function signInAsOrganizer() {
  sessionStorage.setItem('ghin_token', 'sandbox-token');
  saveGhinIdentity({ golfer_id: SANDBOX_GHIN, first_name: 'Craig', last_name: 'Hoelzer' });
}

const SCENARIOS: Scenario[] = [
  {
    key: '2v2-bestball-partial',
    label: '2v2 best ball — mid-round (thru 7)',
    detail: 'Verifies side names on the SCORECARD (the "Team A" bug) and side labels while scoring.',
    build: () => {
      const ps = players([4, 12, 8, 16]);
      const game = baseGame({
        players: ps,
        name: '2v2 Best Ball',
        gameMode: 'team-2v2',
        subTeams: { a: ['sp1', 'sp2'], b: ['sp3', 'sp4'] },
        modeSettings: {
          format: 'best-ball', scoring: 'stableford', result: 'match',
          moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 10,
          junkEnabled: true, junkBirdie: 2, junkEagle: 5, junkAlbatross: 10, junkBasis: 'gross',
        },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1' }],
      });
      saveGameScores('sm1', scores(ps.map((p) => p.id), [0, 1, 1, 2], [1, 2, 3, 4, 5, 6, 7]));
      return { game, goTo: (id) => `/pool/${id}` };
    },
  },
  {
    key: 'three-sides',
    label: 'Three sides in one group (6 players)',
    detail: 'F-006 N sides: three pairs, pairwise round-robin money, to-par ranking, three side colours.',
    build: () => {
      const ps = players([4, 12, 8, 16, 6, 14]);
      const game = baseGame({
        players: ps,
        name: 'Three Pairs',
        gameMode: 'team-2v2',
        sides: [
          { id: 'a', playerIds: ['sp1', 'sp2'] },
          { id: 'b', playerIds: ['sp3', 'sp4'] },
          { id: 'c', playerIds: ['sp5', 'sp6'] },
        ],
        modeSettings: {
          format: 'best-ball', scoring: 'stroke', result: 'total',
          moneyModel: 'per-point', dollarsPerPoint: 1,
          junkEnabled: true, junkBirdie: 2, junkEagle: 5, junkAlbatross: 10, junkBasis: 'gross',
        },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1' }],
      });
      // Deliberately separated sides so the board shows a real order, and side C is thru
      // FEWER holes than A and B — the case that used to pay a side for playing less golf.
      saveGameScores('sm1', [
        ...scores(['sp1', 'sp2'], [0, 1], ALL18),
        ...scores(['sp3', 'sp4'], [1, 2], ALL18),
        ...scores(['sp5', 'sp6'], [2, 3], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      ]);
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
  // --- F-019: playing groups and sides are INDEPENDENT axes -------------------------
  //
  // Nothing else in this file exercises the case: every other side-game seed above stores ONE
  // team ({id:'st1', name:'Group', playerIds: everybody}), which is exactly the shape F-019 is
  // about. These three seed what a real day of golf looks like — separate tee times, separate
  // scorecards, and sides whose members SPAN them.
  {
    key: 'two-groups-four-sides',
    label: 'F-019: 8 players, TWO tee times, four sides',
    detail: 'The headline case. Two foursomes at 8:10 and 8:20, four sides that CROSS the two groups (your partner is in the other foursome). Check the Teams sheet and Scorecards — today they claim "1 foursome" of eight.',
    build: () => {
      const ps = players([4, 12, 8, 16, 6, 14, 10, 2]);
      const game = baseGame({
        players: ps,
        name: 'Two Tee Times',
        gameMode: 'team-2v2',
        // Every side pairs a player from group 1 with one from group 2 — the crossing IS the
        // finding. A leaderboard that only reads teams[0] shows half a field.
        sides: [
          { id: 'a', name: 'The Hogs', playerIds: ['sp1', 'sp5'] },
          { id: 'b', name: 'The Dawgs', playerIds: ['sp2', 'sp6'] },
          { id: 'c', name: 'The Cats', playerIds: ['sp3', 'sp7'] },
          { id: 'd', name: 'The Rats', playerIds: ['sp4', 'sp8'] },
        ],
        modeSettings: {
          format: 'best-ball', scoring: 'stroke', result: 'total',
          moneyModel: 'per-point', dollarsPerPoint: 1,
          junkEnabled: true, junkBirdie: 2, junkEagle: 5, junkAlbatross: 10, junkBasis: 'gross',
        },
        teams: [
          { id: 'st1', name: 'Group 1', playerIds: ['sp1', 'sp2', 'sp3', 'sp4'], matchupId: 'sm1', teeTime: '8:10' },
          { id: 'st2', name: 'Group 2', playerIds: ['sp5', 'sp6', 'sp7', 'sp8'], matchupId: 'sm2', teeTime: '8:20' },
        ],
      });
      // Scores live under BOTH matchups — the union the engine has to read. Group 2 is a hole
      // behind, the ordinary state of two tee times.
      saveGameScores('sm1', scores(['sp1', 'sp2', 'sp3', 'sp4'], [0, 1, 2, 3], ALL18));
      saveGameScores('sm2', scores(['sp5', 'sp6', 'sp7', 'sp8'], [1, 0, 3, 2], ALL18.slice(0, 17)));
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
  {
    key: 'threesome-plus-guest',
    label: 'F-019: 7 players as 4 + 3, one guest on no side',
    detail: 'A threesome is a real tee group, and the random who joined is in a group but on nobody\'s side. Checks 3-player groups and that a sideless player still appears on the card.',
    build: () => {
      const ps = players([4, 12, 8, 16, 6, 14, 10]);
      const game = baseGame({
        players: ps,
        name: 'Foursome And A Threesome',
        gameMode: 'team-2v2',
        // sp7 (Will) is deliberately on NO side — he's along for the round, not the money.
        sides: [
          { id: 'a', name: 'The Hogs', playerIds: ['sp1', 'sp5'] },
          { id: 'b', name: 'The Dawgs', playerIds: ['sp2', 'sp6'] },
          { id: 'c', name: 'The Cats', playerIds: ['sp3', 'sp4'] },
        ],
        modeSettings: {
          format: 'best-ball', scoring: 'stroke', result: 'total',
          moneyModel: 'per-point', dollarsPerPoint: 1,
        },
        teams: [
          { id: 'st1', name: 'Group 1', playerIds: ['sp1', 'sp2', 'sp3', 'sp4'], matchupId: 'sm1', teeTime: '9:00' },
          { id: 'st2', name: 'Group 2', playerIds: ['sp5', 'sp6', 'sp7'], matchupId: 'sm2', teeTime: '9:10' },
        ],
      });
      saveGameScores('sm1', scores(['sp1', 'sp2', 'sp3', 'sp4'], [0, 1, 2, 1], ALL18));
      saveGameScores('sm2', scores(['sp5', 'sp6', 'sp7'], [1, 2, 0], ALL18));
      return { game, goTo: (id) => `/pool/${id}/teams` };
    },
  },
  {
    key: 'one-group-side-game',
    label: 'F-019 control: 4 players, ONE group (must not change)',
    detail: 'The shape every existing side game has. Pinned in one-group-golden.test.ts and here for eyeballing: it must look and settle exactly as it does today.',
    build: () => {
      const ps = players([4, 12, 8, 16]);
      const game = baseGame({
        players: ps,
        name: 'Ordinary 2v2',
        gameMode: 'team-2v2',
        sides: [
          { id: 'a', playerIds: ['sp1', 'sp4'] },
          { id: 'b', playerIds: ['sp2', 'sp3'] },
        ],
        modeSettings: {
          format: 'best-ball', scoring: 'stroke', result: 'total',
          moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20,
        },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1', teeTime: '8:30' }],
      });
      saveGameScores('sm1', scores(ps.map((p) => p.id), [0, 1, 2, 1], ALL18));
      return { game, goTo: (id) => `/pool/${id}/teams` };
    },
  },
  {
    key: 'walk-in-legs',
    label: 'Three sides, LEGS money — side C walked in at 12',
    detail: 'F-016b: the front nine is complete but the back and overall are short, so "Close out game" must ask whether those legs pay. Open, then scroll to Close out game.',
    build: () => {
      const ps = players([4, 12, 8, 16, 6, 14]);
      const game = baseGame({
        players: ps,
        name: 'Walked In At 12',
        gameMode: 'team-2v2',
        sides: [
          { id: 'a', playerIds: ['sp1', 'sp2'] },
          { id: 'b', playerIds: ['sp3', 'sp4'] },
          { id: 'c', playerIds: ['sp5', 'sp6'] },
        ],
        // LEGS money — the only model that settles per leg, so the only one the prompt applies to.
        modeSettings: {
          format: 'best-ball', scoring: 'stroke', result: 'total',
          moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 20,
        },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1' }],
      });
      // A and B finish all 18. C stops at 12 — so the FRONT nine was finished by everyone
      // (it still pays) while the back and overall were not (the prompt asks about those two).
      saveGameScores('sm1', [
        ...scores(['sp1', 'sp2'], [0, 1], ALL18),
        ...scores(['sp3', 'sp4'], [1, 2], ALL18),
        ...scores(['sp5', 'sp6'], [1, 2], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      ]);
      return { game, goTo: (id) => `/pool/${id}` };
    },
  },
  {
    key: 'three-sides-pot',
    label: 'Three sides playing a POT (uneven 3/2/1)',
    detail: 'DECISIONS 5.ag: buy-in is PER SIDE, so the solo player and the trio have the same stake.',
    build: () => {
      const ps = players([4, 12, 8, 16, 6, 14]);
      const game = baseGame({
        players: ps,
        name: 'Pot, Three Sides',
        gameMode: 'team-2v2',
        sides: [
          { id: 'a', playerIds: ['sp1', 'sp2', 'sp3'] },
          { id: 'b', playerIds: ['sp4', 'sp5'] },
          { id: 'c', playerIds: ['sp6'] },
        ],
        modeSettings: {
          format: 'best-ball', scoring: 'stroke', result: 'total',
          moneyModel: 'pot', sideBuyIn: 20, potSplit: '70,30',
        },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1' }],
      });
      saveGameScores('sm1', [
        ...scores(['sp1', 'sp2', 'sp3'], [0, 1, 2], ALL18),
        ...scores(['sp4', 'sp5'], [1, 2], ALL18),
        ...scores(['sp6'], [2], ALL18),
      ]);
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
  {
    key: '2v2-nine-complete',
    label: '2v2 on a nine — complete',
    detail: 'Verifies the ONE-leg collapse + caption (was "Front · Back · Overall" over a lone row).',
    build: () => {
      const ps = players([2, 10, 6, 14]);
      const game = baseGame({
        players: ps,
        name: '2v2 Back Nine',
        gameMode: 'team-2v2',
        holesPlaying: 'back9',
        subTeams: { a: ['sp1', 'sp2'], b: ['sp3', 'sp4'] },
        modeSettings: {
          format: 'best-ball', scoring: 'stableford', result: 'match',
          moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 10,
          sideAName: 'The Hogs', sideBName: 'The Dawgs',
        },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1' }],
      });
      saveGameScores('sm1', scores(ps.map((p) => p.id), [0, 1, 1, 1], BACK9));
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
  {
    key: 'skins-2p',
    label: 'Skins — 2 players, complete',
    detail: 'Verifies the field-size fix (hardcoded >= 4 called a 2-player dead heat "leading").',
    build: () => {
      const ps = players([6, 6]);
      const game = baseGame({
        players: ps,
        name: 'Two-Man Skins',
        gameMode: 'skins',
        entryPerPlayer: 0,
        modeSettings: {
          scoreBasis: 'net', carryover: true, moneyModel: 'nassau',
          nassauSplit: 'three', nassauFront: 5, nassauBack: 5, nassauTotal: 10,
        },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1' }],
      });
      // Identical rounds → a true dead heat on every segment.
      saveGameScores('sm1', scores(ps.map((p) => p.id), [0, 0], ALL18));
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
  {
    key: 'pool-2x4-partial',
    label: 'Classic pool — 2 foursomes, mid-round (thru 6)',
    detail: 'The known mid-round zero-sum bug: board shows more lost than won.',
    build: () => {
      const ps = players([0, 6, 12, 18, 3, 9, 15, 21]);
      const game = baseGame({
        players: ps,
        name: 'Saturday Pool',
        teams: [
          { id: 'st1', name: 'Team 1', playerIds: ['sp1', 'sp2', 'sp3', 'sp4'], matchupId: 'sm1', captainId: 'sp1' },
          { id: 'st2', name: 'Team 2', playerIds: ['sp5', 'sp6', 'sp7', 'sp8'], matchupId: 'sm2', captainId: 'sp5' },
        ],
      });
      const six = [1, 2, 3, 4, 5, 6];
      saveGameScores('sm1', scores(['sp1', 'sp2', 'sp3', 'sp4'], [0, 1, 1, 2], six));
      saveGameScores('sm2', scores(['sp5', 'sp6', 'sp7', 'sp8'], [1, 1, 2, 2], six));
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
  {
    key: 'pool-2x4-complete',
    label: 'Classic pool — 2 foursomes, FULLY scored',
    detail: 'Verifies close-out → Stats & money (the completion bug). Ready to close out.',
    build: () => {
      const ps = players([0, 6, 12, 18, 3, 9, 15, 21]);
      const game = baseGame({
        players: ps,
        name: 'Closeout Test Pool',
        teams: [
          { id: 'st1', name: 'Team 1', playerIds: ['sp1', 'sp2', 'sp3', 'sp4'], matchupId: 'sm1', captainId: 'sp1' },
          { id: 'st2', name: 'Team 2', playerIds: ['sp5', 'sp6', 'sp7', 'sp8'], matchupId: 'sm2', captainId: 'sp5' },
        ],
      });
      saveGameScores('sm1', scores(['sp1', 'sp2', 'sp3', 'sp4'], [0, 1, 1, 2], ALL18));
      saveGameScores('sm2', scores(['sp5', 'sp6', 'sp7', 'sp8'], [1, 1, 2, 2], ALL18));
      return { game, goTo: (id) => `/pool/${id}` };
    },
  },
  {
    key: 'pool-stableford',
    label: 'Stableford pool — 4 foursomes, most points wins',
    detail: 'F-006: the headline case the classic pool could not express. Team 1 birdies everything (54 pts) and MUST be shown 1st and paid — an earlier pass ranked lower-is-better and paid the 36-point team. Also proves the per-hole grid greens the HIGHEST number under points.',
    build: () => {
      const ps = players([0, 0, 0, 0, 0, 0, 0, 0]);
      const game = baseGame({
        players: ps,
        name: 'Stableford Outing',
        teamFormat: 'best-ball',
        teamScoreBasis: 'stableford',
        positionSplit: [70, 30],
        teams: [
          { id: 'st1', name: 'Team 1', playerIds: ['sp1', 'sp2'], matchupId: 'sm1' },
          { id: 'st2', name: 'Team 2', playerIds: ['sp3', 'sp4'], matchupId: 'sm2' },
          { id: 'st3', name: 'Team 3', playerIds: ['sp5', 'sp6'], matchupId: 'sm3' },
          { id: 'st4', name: 'Team 4', playerIds: ['sp7', 'sp8'], matchupId: 'sm4' },
        ],
      });
      // Birdies (3 pts/hole) → pars (2) → bogeys (1) → doubles (0). Ranking must follow.
      saveGameScores('sm1', scores(['sp1', 'sp2'], [-1, -1], ALL18));
      saveGameScores('sm2', scores(['sp3', 'sp4'], [0, 0], ALL18));
      saveGameScores('sm3', scores(['sp5', 'sp6'], [1, 1], ALL18));
      saveGameScores('sm4', scores(['sp7', 'sp8'], [2, 2], ALL18));
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
  {
    key: 'pool-scramble-match',
    label: 'Scramble pool — 2 foursomes head-to-head, Stableford',
    detail: 'F-006: Stableford in MATCH mode, where three separate consumers each ranked lower-is-better and paid the losing team the whole leg. The birdie team must win all three legs.',
    build: () => {
      const ps = players([4, 10, 16, 22, 6, 12, 18, 24]);
      const game = baseGame({
        players: ps,
        name: 'Scramble Match',
        teamFormat: 'scramble',
        teamScoreBasis: 'stableford',
        moneyMode: 'match',
        matchConfig: {
          legDollars: { front: 10, back: 10, overall: 20 },
          junkPerPoint: 5,
          scoring: 'holes',
          pointsPerHole: { win: 1, tie: 0.5, loss: 0 },
        },
        teams: [
          { id: 'st1', name: 'Team 1', playerIds: ['sp1', 'sp2', 'sp3', 'sp4'], matchupId: 'sm1' },
          { id: 'st2', name: 'Team 2', playerIds: ['sp5', 'sp6', 'sp7', 'sp8'], matchupId: 'sm2' },
        ],
      });
      // One ball per team: every member carries the same gross, as the scorecard writes.
      saveGameScores('sm1', scores(['sp1', 'sp2', 'sp3', 'sp4'], [-1, -1, -1, -1], ALL18));
      saveGameScores('sm2', scores(['sp5', 'sp6', 'sp7', 'sp8'], [1, 1, 1, 1], ALL18));
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
  {
    key: 'ledger-season',
    label: 'Season ledger — 5 completed games, 61-player roster',
    detail: 'The "continuing" payoff surface. /home/stats was structurally dead until the completion fix, so its settle-up math and four lenses have never been seen with real data.',
    buildDomain: () => {
      signInAsOrganizer();
      const roster = rosterPlayers(61);
      const gs = makeGroups(roster);
      void seedTable('players', rosterRows(roster));
      void seedTable('roster_groups', groupRows(gs));
      for (const { game, scoresByMatchup } of ledgerSeason(roster)) {
        savePoolGame(game);
        for (const [mid, scores] of scoresByMatchup) saveGameScores(mid, scores);
      }
      return { goTo: '/home/stats' };
    },
  },
  {
    key: 'groups-large',
    label: 'Groups — 61-member standing group + small crew + saved format',
    detail: 'The reuse mechanism behind "config is a one-time cost". List UIs behave very differently at 61 members than at 4.',
    buildDomain: () => {
      signInAsOrganizer();
      const roster = rosterPlayers(61);
      const gs = makeGroups(roster);
      void seedTable('players', rosterRows(roster));
      void seedTable('roster_groups', groupRows(gs));
      // Seed the season too, so the dashboard's Money and Recent games sections render.
      // Without games they're correctly absent — which made the page look unfinished.
      for (const { game, scoresByMatchup } of ledgerSeason(roster)) {
        savePoolGame(game);
        for (const [mid, scores] of scoresByMatchup) saveGameScores(mid, scores);
      }
      return { goTo: '/home/groups/g-weekend-warriors' };
    },
  },
  {
    key: 'home-hub',
    label: 'Home hub — games + groups populated',
    detail: 'The user-centric hub (HOME_V2). Verifies the merged game list, status pills, and recency sort.',
    buildDomain: () => {
      signInAsOrganizer();
      const roster = rosterPlayers(61);
      const gs = makeGroups(roster);
      void seedTable('players', rosterRows(roster));
      void seedTable('roster_groups', groupRows(gs));
      for (const { game, scoresByMatchup } of ledgerSeason(roster)) {
        savePoolGame(game);
        for (const [mid, scores] of scoresByMatchup) saveGameScores(mid, scores);
      }
      return { goTo: '/home' };
    },
  },
  {
    key: 'bonuses-manual',
    label: 'Manual bonuses — sandies & barkies on the scorecard',
    detail: "Craig's spec: the scorer taps a bonus for any player in their foursome, per hole. Open, then Enter Scores.",
    build: () => {
      const ps = players([4, 10, 14, 20]);
      const game = baseGame({
        players: ps,
        name: 'Sandies & Barkies',
        customBonuses: [
          { id: 'sandie', label: 'Sandie', points: 2, hint: 'up and down from a bunker' },
          { id: 'barkie', label: 'Barkie', points: 2, hint: 'hit a tree and still made par' },
          { id: 'greenie', label: 'Greenie', points: 1, hint: 'on in regulation on a par 3' },
        ],
        bonusMarks: { 3: { sp1: ['greenie'] }, 5: { sp2: ['sandie'], sp1: ['barkie'] } },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1' }],
      });
      saveGameScores('sm1', scores(ps.map((p) => p.id), [0, 1, 1, 2], [1, 2, 3, 4, 5]));
      return { game, goTo: (id) => `/pool/${id}` };
    },
  },
  {
    key: 'recent-courses',
    label: 'Past games (for recent-course chips)',
    detail: "JY's request: seeds completed games so /pool/new can offer their courses without retyping.",
    buildDomain: () => {
      signInAsOrganizer();
      const roster = rosterPlayers(61);
      for (const { game, scoresByMatchup } of ledgerSeason(roster)) {
        savePoolGame(game);
        for (const [mid, scores] of scoresByMatchup) saveGameScores(mid, scores);
      }
      return { goTo: '/pool/new' };
    },
  },
  {
    key: 'wolf-partial',
    label: 'Wolf — 4 players, thru 5',
    detail: 'Decision-input game: per-hole Wolf breakdown + expandable standings.',
    build: () => {
      const ps = players([5, 11, 8, 14]);
      const game = baseGame({
        players: ps,
        name: 'Wolf Game',
        gameMode: 'wolf',
        modeSettings: {
          scoreBasis: 'net', basePoints: 1, loneMultiplier: 2, blindMultiplier: 3,
          moneyModel: 'per-point', dollarsPerPoint: 2,
        },
        wolfOrder: ['sp1', 'sp2', 'sp3', 'sp4'],
        wolfDecisions: {
          1: { wolfId: 'sp1', mode: 'partner', partnerId: 'sp3' },
          2: { wolfId: 'sp2', mode: 'lone', partnerId: null },
          3: { wolfId: 'sp3', mode: 'blind', partnerId: null },
          4: { wolfId: 'sp4', mode: 'partner', partnerId: 'sp1' },
          5: { wolfId: 'sp1', mode: 'lone', partnerId: null },
        },
        teams: [{ id: 'st1', name: 'Group', playerIds: ps.map((p) => p.id), matchupId: 'sm1' }],
      });
      saveGameScores('sm1', [
        ...scores(['sp1'], [-1], [1, 2, 3, 4, 5]),
        ...scores(['sp2'], [0], [1, 2, 3, 4, 5]),
        ...scores(['sp3'], [1], [1, 2, 3, 4, 5]),
        ...scores(['sp4'], [0], [1, 2, 3, 4, 5]),
      ]);
      return { game, goTo: (id) => `/pool/${id}/leaderboard` };
    },
  },
];

export default function SandboxPage() {
  const router = useRouter();
  const [seeded, setSeeded] = useState<{ key: string; id: string; goTo: string } | null>(null);

  if (!IS_SANDBOX) {
    return (
      <div className="min-h-full bg-gray-50 p-8">
        <p className="text-sm text-gray-600">
          Sandbox mode is off. Start the server with <code className="bg-gray-200 px-1">NEXT_PUBLIC_SANDBOX=1</code>.
        </p>
      </div>
    );
  }

  function seed(s: Scenario) {
    setAccessCookie('full');            // skip the invite gate
    if (s.buildDomain) {
      const { goTo } = s.buildDomain();
      setSeeded({ key: s.key, id: '', goTo });
      return;
    }
    const { game, goTo } = s.build!();
    savePoolGame(game);
    setSeeded({ key: s.key, id: game.id, goTo: goTo(game.id) });
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-purple-900 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">Sandbox — seed a game state</h1>
          <p className="text-xs text-purple-200">
            In-memory data only. Nothing here touches a real database.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-3">
        {SCENARIOS.map((s) => (
          <div key={s.key} className="bg-white rounded-lg shadow p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.detail}</p>
              </div>
              <button
                onClick={() => seed(s)}
                className="shrink-0 rounded-md bg-purple-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-800"
              >
                Seed
              </button>
            </div>
            {seeded?.key === s.key && (
              <div className="mt-3 flex items-center gap-3 border-t pt-3">
                <span className="text-xs text-green-700 font-medium">Seeded ✓</span>
                <button
                  onClick={() => router.push(seeded.goTo)}
                  className="text-sm font-semibold text-purple-700 hover:text-purple-900 underline"
                >
                  Open →
                </button>
                <code className="text-[10px] text-gray-400 truncate">{seeded.goTo}</code>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
