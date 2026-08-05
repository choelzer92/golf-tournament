// Cross-game stats & money ledger (Phase 2 — read-only).
//
// Rolls up FINISHED games into per-player net dollars and simple performance,
// then offers four lenses: overall, by group, by game, by player. Money is only
// DISPLAYED here (who-owes-whom); settlement happens outside the app.
//
// The atomic unit is "player X's net $ in game G". Both money models reduce to
// it: a POOL game reports per-TEAM net (computePoolResult) which we split evenly
// across the team's players (mirroring pool's own perPersonNet); a TOURNAMENT
// already reports per-PLAYER net (computeMoneyLedger.netResult). Each game is
// zero-sum, so per-game player nets sum to ~0 — the whole ledger nets to ~0 too.
//
// Nothing here writes. It reads the game caches (hydrate first) and fetches each
// game's scores on demand, exactly as the pool leaderboard / tournament money
// pages do — so a Home rollup only pays for score fetches when it's opened.

import type { GameScore } from './game-state';
import { fetchGameScores } from './tournament-state';
import type { Tournament } from './tournament-state';
import { computeMoneyLedger } from './money-games';
import type { PoolGame } from './pool-game';
import { computePoolResult } from './pool-game';
import type { RosterGroup } from './roster-groups';

// One player's money + activity in ONE finished game.
export interface GamePlayerNet {
  gameId: string;
  gameName: string;
  gameKind: 'pool' | 'tournament';
  playedAt: string | null;    // ISO; pool games have createdAt, tournaments don't
  playerId: string;
  playerName: string;
  net: number;                // net dollars this game (+won / −lost)
}

// A finished game reduced to its per-player nets + the set of players in it
// (the player set drives by-group inference).
export interface GameLedger {
  gameId: string;
  gameName: string;
  gameKind: 'pool' | 'tournament';
  playedAt: string | null;
  playerIds: string[];
  playerNets: GamePlayerNet[];
  hasMoney: boolean;          // false = a finished game with no money configured
  // The group this game was CREATED from, stamped at creation (exact link). Absent
  // on games made outside a group AND on all games from before tagging existed —
  // those fall back to player-overlap inference. See gameBelongsToGroup.
  groupId?: string;
}

// A player's rolled-up totals across whatever set of games a lens selected.
export interface PlayerRollup {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  net: number;                // summed net dollars across the selected games
}

// One "X pays Y $Z" line from the greedy settlement.
export interface SettlementTransfer {
  fromPlayerId: string;
  fromName: string;
  toPlayerId: string;
  toName: string;
  amount: number;
}

// ---------------------------------------------------------------------------
// Per-game reduction
// ---------------------------------------------------------------------------

// Reduce a finished POOL game to per-player nets. Fetches each foursome's scores
// (like the leaderboard) and splits each team's net evenly across its players —
// pool's own perPersonNet convention. NOTE: no anti-sandbag concealment here;
// a finished game reveals every hole, and the ledger only counts finished games.
async function poolGameLedger(game: PoolGame): Promise<GameLedger> {
  const matchupIds = Array.from(new Set(game.teams.map((t) => t.matchupId)));
  const scoresByMatchup = new Map<string, GameScore[]>();
  await Promise.all(
    matchupIds.map(async (mid) => {
      const scores = await fetchGameScores(mid);
      if (scores) scoresByMatchup.set(mid, scores as GameScore[]);
    }),
  );

  const result = computePoolResult(game, scoresByMatchup);
  const nameOf = (pid: string) => game.players.find((p) => p.id === pid)?.name ?? '?';

  const playerNets: GamePlayerNet[] = [];
  for (const team of game.teams) {
    const payout = result.payouts.find((p) => p.teamId === team.id);
    const count = team.playerIds.length;
    // Split the team's net evenly across its members (pool's perPersonNet). If a
    // payout row is missing (unscored), everyone on the team is flat 0.
    const perPerson = payout && count > 0 ? payout.net / count : 0;
    for (const pid of team.playerIds) {
      playerNets.push({
        gameId: game.id,
        gameName: game.name,
        gameKind: 'pool',
        playedAt: game.createdAt ?? null,
        playerId: pid,
        playerName: nameOf(pid),
        net: perPerson,
      });
    }
  }

  return {
    gameId: game.id,
    gameName: game.name,
    gameKind: 'pool',
    playedAt: game.createdAt ?? null,
    playerIds: game.players.map((p) => p.id),
    playerNets,
    // A pool game always has money (entry pot or match legs) unless entry is 0
    // and it's pot mode — treat any nonzero net as "has money".
    hasMoney: playerNets.some((n) => n.net !== 0),
    groupId: game.sourceGroupId,
  };
}

// Reduce a finished TOURNAMENT to per-player nets. computeMoneyLedger already
// returns per-player netResult; a tournament with no money games returns null.
function tournamentLedger(t: Tournament): GameLedger {
  const ledger = computeMoneyLedger(t);
  const playerIds = t.players.map((p) => p.id);
  if (!ledger) {
    return {
      gameId: t.id,
      gameName: t.name,
      gameKind: 'tournament',
      playedAt: null,
      playerIds,
      playerNets: [],
      hasMoney: false,
      groupId: t.sourceGroupId,
    };
  }
  const playerNets: GamePlayerNet[] = ledger.players.map((e) => ({
    gameId: t.id,
    gameName: t.name,
    gameKind: 'tournament',
    playedAt: null,
    playerId: e.playerId,
    playerName: e.playerName,
    net: e.netResult,
  }));
  return {
    gameId: t.id,
    gameName: t.name,
    gameKind: 'tournament',
    playedAt: null,
    playerIds,
    playerNets,
    hasMoney: playerNets.length > 0,
    groupId: t.sourceGroupId,
  };
}

// Build ledgers for every FINISHED game in the given pool games + tournaments.
// Skips setup/active — only completed games have final money. Pool fetches are
// concurrent; tournaments are pure (scores already hydrated by the caller path).
export async function buildGameLedgers(
  poolGames: PoolGame[],
  tournaments: Tournament[],
): Promise<GameLedger[]> {
  const finishedPools = poolGames.filter((g) => g.status === 'completed');
  const finishedTourneys = tournaments.filter((t) => t.status === 'completed');
  const poolLedgers = await Promise.all(finishedPools.map(poolGameLedger));
  const tourneyLedgers = finishedTourneys.map(tournamentLedger);
  return [...poolLedgers, ...tourneyLedgers].sort((a, b) =>
    (b.playedAt ?? '').localeCompare(a.playedAt ?? ''),
  );
}

// ---------------------------------------------------------------------------
// Lenses
// ---------------------------------------------------------------------------

// A game "belongs to" a group in one of two ways:
//   1. EXACT (going forward): the game was created from the group, so it carries
//      that group's id. This is authoritative — no inference needed.
//   2. BACKFILL (past / untagged games): most of the GAME'S players are members
//      of the group. Right direction for a large standing roster — e.g.
//      "Weekend Warriors" may have 61 members but only 8–20 play any given day,
//      so a game of 12 WW members is a WW game even though it's a fraction of the
//      roster. Measured against the game's player count, not the group's size.
// An exact-tagged game NEVER falls through to inference, so a game tagged to
// group X won't also show under group Y just because of member overlap.
export function gameBelongsToGroup(ledger: GameLedger, group: RosterGroup): boolean {
  if (ledger.groupId) return ledger.groupId === group.id; // exact tag wins outright
  const members = new Set(group.playerIds);
  if (members.size === 0 || ledger.playerIds.length === 0) return false;
  const overlap = ledger.playerIds.filter((id) => members.has(id)).length;
  return overlap * 2 > ledger.playerIds.length; // strict majority of the game's players are members
}

export function ledgersForGroup(ledgers: GameLedger[], group: RosterGroup): GameLedger[] {
  return ledgers.filter((l) => gameBelongsToGroup(l, group));
}

// Roll a set of game ledgers up to per-player totals (net + games played),
// richest first. Every player who appears in any selected game is included.
export function rollupByPlayer(ledgers: GameLedger[]): PlayerRollup[] {
  const byPlayer = new Map<string, PlayerRollup>();
  for (const l of ledgers) {
    for (const n of l.playerNets) {
      const cur = byPlayer.get(n.playerId) ?? {
        playerId: n.playerId,
        playerName: n.playerName,
        gamesPlayed: 0,
        net: 0,
      };
      cur.gamesPlayed += 1;
      cur.net += n.net;
      // Keep the most recent non-"?" name we saw.
      if (n.playerName && n.playerName !== '?') cur.playerName = n.playerName;
      byPlayer.set(n.playerId, cur);
    }
  }
  return Array.from(byPlayer.values()).sort((a, b) => b.net - a.net);
}

// ---------------------------------------------------------------------------
// Settlement (who-owes-whom) — greedy min-cash-flow
// ---------------------------------------------------------------------------

// Turn per-player net balances into a minimal-ish set of "X pays Y" transfers:
// repeatedly settle the biggest debtor against the biggest creditor. Not
// provably optimal (that's NP-hard), but near-minimal and stable. Amounts are
// rounded to cents; balances within a cent of zero are treated as settled.
export function settleUp(rollups: PlayerRollup[]): SettlementTransfer[] {
  const EPS = 0.005;
  const creditors = rollups
    .filter((r) => r.net > EPS)
    .map((r) => ({ ...r, remaining: r.net }))
    .sort((a, b) => b.remaining - a.remaining);
  const debtors = rollups
    .filter((r) => r.net < -EPS)
    .map((r) => ({ ...r, remaining: -r.net }))
    .sort((a, b) => b.remaining - a.remaining);

  const transfers: SettlementTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.remaining, d.remaining);
    if (amount > EPS) {
      transfers.push({
        fromPlayerId: d.playerId,
        fromName: d.playerName,
        toPlayerId: c.playerId,
        toName: c.playerName,
        amount: Math.round(amount * 100) / 100,
      });
    }
    c.remaining -= amount;
    d.remaining -= amount;
    if (c.remaining <= EPS) ci++;
    if (d.remaining <= EPS) di++;
  }
  return transfers;
}
