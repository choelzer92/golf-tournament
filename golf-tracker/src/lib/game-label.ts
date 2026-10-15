// THE GAME LABEL (F-115, DECISIONS §5.da / §5.db) — what is being played, in one line, so someone
// opening a game that was sent to them knows the bet before the first tee.
//
//   "$30 Nassau ($10/$10/$10) · 4v4 · best net & best gross · match play · + $5 a junk point"
//   "$40 front & back ($20/$20) · 2v2 · best ball · Stableford match play"
//   "$200 pot ($25 each) · 4v4 · best net & best gross · stroke play · Pays front / back / overall / junk (25% each)"
//
// The rule, in Craig's words and order: total risked (with the split next to it) · teams · the
// FORMAT, always, best ball included ("we need to be clear what is being played") · match or stroke
// play (Stableford either way) · how a pot pays.
//
// THE MONEY IS WHAT ONE PLAYER RISKS (§5.db). The two engines store it differently: a classic
// head-to-head pool's legs are per PLAYER; a team game's legs, $/hole, $/point and pot buy-in are per
// TEAM, the team's winnings split evenly across its players (`perPlayerNets`). So a 2v2 team game at
// $10 a leg reads "$15 Nassau ($5/$5/$5)". Uneven teams have no one per-player figure, so the label
// states the team's stake and says so ("a team").
//
// Pure: reads the saved game only. An individual mode (skins, Stableford, Wolf…) keeps the
// game-kind label; this rule is about team bets.

import { DEFAULT_MATCH_CONFIG, type PoolGame } from './pool-game';
import { getGameMode, defaultSettings, type SettingsBag } from './game-modes';
import { matchesOf, matchSizeOf } from './game-modes/matches';
import { sidesForCompute } from './game-modes/context';
import { gameKindLabel, structureLabel } from './game-structure';
import { evenTeamSize } from './game-modes/stake-unit';

/** A stake as a golfer says it: "$10", or "$7.50" when a team's stake splits unevenly. */
function stake(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
}

const FORMAT_WORD: Record<string, string> = {
  'best-ball': 'best ball',
  'net-and-gross': 'best net & best gross',
  'two-best-net': 'two best net',
  'two-best-gross': 'two best gross',
  combined: 'combined',
  scramble: 'scramble',
  'alternate-shot': 'alternate shot',
};

// A legacy classic pool (no teamFormat) plays its `ballSelection`.
const BALL_WORD: Record<string, string> = {
  '1-net-1-gross': 'best net & best gross',
  '2-best-net': 'two best net',
  '2-best-gross': 'two best gross',
};

const NUMBER_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "2v2", "4v4" for two even teams; "3 teams of 4", "4 pairs", uneven shapes as `structureLabel`. */
export function teamsWord(sizes: number[]): string {
  if (sizes.length === 2 && sizes[0] === sizes[1]) return `${sizes[0]}v${sizes[0]}`;
  return structureLabel({ kind: 'teams', teamSizes: sizes });
}

/** Legs, per player (or per team when `unit` says so). Absent legs are 0. */
export interface LegsBet { front: number; back: number; overall: number }

/**
 * The bet half of a fixed-leg game. Every leg set → "$30 Nassau ($10/$10/$10)"; one leg names its
 * holes ("$20 for 18 holes", "$10 front 9"); any other pair follows "$40 front & back ($20/$20)".
 * A nine-hole game plays one leg, at the overall rate, named for the nine (both engines settle it so).
 */
export function legsBetLabel(legs: LegsBet, holesPlaying: PoolGame['holesPlaying'], unit = ''): string | null {
  if (holesPlaying === 'front9' || holesPlaying === 'back9') {
    return legs.overall > 0 ? `${stake(legs.overall)}${unit} ${holesPlaying === 'front9' ? 'front 9' : 'back 9'}` : null;
  }
  const set = ([['front', legs.front], ['back', legs.back], ['overall', legs.overall]] as const).filter(([, v]) => v > 0);
  if (set.length === 0) return null;
  const total = stake(set.reduce((s, [, v]) => s + v, 0));
  if (set.length === 3) return `${total} Nassau${unit} (${set.map(([, v]) => stake(v)).join('/')})`;
  if (set.length === 1) {
    const [leg] = set[0];
    return leg === 'overall' ? `${total}${unit} for 18 holes` : `${total}${unit} ${leg} 9`;
  }
  return `${total}${unit} ${set.map(([k]) => k).join(' & ')} (${set.map(([, v]) => stake(v)).join('/')})`;
}

/** Pot slices (fractions or shares, any scale) and the places each pays → "Pays …" / "Winner takes all". */
export function potPaysLabel(slices: { front: number; back: number; overall: number; junk: number }, places: number[]): string {
  const named = (['front', 'back', 'overall', 'junk'] as const).filter((k) => slices[k] > 0);
  const sum = named.reduce((s, k) => s + slices[k], 0);
  const paid = places.filter((p) => p > 0);
  const placesText = paid.length > 1 ? `top ${paid.length} paid (${paid.join('/')})` : null;
  if (named.length <= 1) return placesText ? `Pays ${placesText}` : 'Winner takes all';
  const pct = named.map((k) => Math.round((slices[k] / sum) * 100));
  const slicesText = pct.every((p) => p === pct[0])
    ? `${named.join(' / ')} (${pct[0]}% each)`
    : named.map((k, i) => `${k} ${pct[i]}%`).join(' / ');
  return `Pays ${slicesText}${placesText ? `, ${placesText}` : ''}`;
}

const playWord = (match: boolean, stableford: boolean): string =>
  `${stableford ? 'Stableford ' : ''}${match ? 'match play' : 'stroke play'}`;

function classicLabel(game: PoolGame): string {
  const sizes = game.teams.map((t) => t.playerIds.length);
  const nine = game.holesPlaying === 'front9' || game.holesPlaying === 'back9';
  const format = game.teamFormat ? FORMAT_WORD[game.teamFormat] : BALL_WORD[game.ballSelection];
  const stableford = !!game.teamFormat && game.teamScoreBasis === 'stableford';
  if (game.moneyMode === 'match') {
    const cfg = game.matchConfig ?? DEFAULT_MATCH_CONFIG;
    const legs = cfg.legDollars;
    const junk = cfg.junkPerPoint > 0 ? `+ ${stake(cfg.junkPerPoint)} a junk point` : null;
    return [
      legsBetLabel(legs, game.holesPlaying),
      teamsWord(sizes),
      format,
      playWord(cfg.scoring === 'holes', stableford),
      junk,
    ].filter(Boolean).join(' · ');
  }
  const pot = game.entryPerPlayer * game.players.length;
  const s = game.potSplit;
  // A nine-hole pot puts the whole non-junk pot on the overall (computePoolResult).
  const slices = nine ? { front: 0, back: 0, overall: 1 - s.junk, junk: s.junk } : s;
  return [
    pot > 0 ? `${stake(pot)} pot (${stake(game.entryPerPlayer)} each)` : null,
    teamsWord(sizes),
    format,
    playWord(false, stableford),
    pot > 0 ? potPaysLabel(slices, game.positionSplit) : null,
  ].filter(Boolean).join(' · ');
}

function teamGameLabel(game: PoolGame, schemaDefaults: SettingsBag): string {
  const st: SettingsBag = { ...schemaDefaults, ...(game.modeSettings ?? {}) };
  const num = (k: string) => { const n = parseFloat(String(st[k] ?? '')); return Number.isNaN(n) ? 0 : n; };
  const str = (k: string) => String(st[k] ?? '');
  // The teams the engine settles on (stored sides, else the tee groups, else a legacy 2v2's split).
  const sides = sidesForCompute(game);
  const sizes = sides.map((s) => s.playerIds.length);
  // §5.db: the team's stake, split evenly across its players — unless the teams differ in size.
  const even = sizes.length > 0 && sizes.every((k) => k === sizes[0]) && sizes[0] > 0;
  const per = (n: number) => (even ? n / sizes[0] : n);
  const unit = even ? '' : ' a team';
  const nine = game.holesPlaying === 'front9' || game.holesPlaying === 'back9';

  const matchSize = matchSizeOf(st);
  const matches = matchSize > 0 ? matchesOf(sides, game.teams, matchSize) : null;
  const teams = matches && matches.length > 0
    ? `${teamsWord(sizes)} · ${NUMBER_WORD[matches.length] ?? matches.length} ${matchSize}v${matchSize} match${matches.length === 1 ? '' : 'es'}`
    : teamsWord(sizes);
  const match = matches && matches.length > 0 ? str('matchCounting') !== 'strokes' : str('result') === 'match';
  const play = playWord(match, str('scoring') === 'stableford');
  const format = FORMAT_WORD[str('format')] ?? str('format');
  const junk = str('junkEnabled') === 'true' && str('moneyModel') !== 'pot' ? '+ junk' : null;

  let bet: string | null = null;
  let pays: string | null = null;
  switch (str('moneyModel') || 'legs') {
    case 'legs':
      bet = legsBetLabel({ front: per(num('legFront')), back: per(num('legBack')), overall: per(num('legOverall')) }, game.holesPlaying, unit);
      break;
    case 'per-hole':
      bet = num('dollarsPerHole') > 0 ? `${stake(per(num("dollarsPerHole")))} a hole${unit}` : null;
      break;
    case 'per-point':
      bet = num('dollarsPerPoint') > 0 ? `${stake(per(num("dollarsPerPoint")))} a point${unit}` : null;
      break;
    case 'pot': {
      const buyIn = num('sideBuyIn');
      if (buyIn > 0) {
        bet = `${stake(buyIn * sizes.length)} pot (${even ? `${stake(per(buyIn))} each` : `${stake(buyIn)} a team`})`;
        const junkSlice = str('junkEnabled') === 'true' && str('junkPayout') === 'pot' ? Math.max(0, num('potJunk')) : 0;
        const f = Math.max(0, num('potFront'));
        const b = Math.max(0, num('potBack'));
        const o = Math.max(0, num('potOverall'));
        const slices = nine ? { front: 0, back: 0, overall: f + b + o, junk: junkSlice } : { front: f, back: b, overall: o, junk: junkSlice };
        const places = str('potSplit').split(',').map((x) => parseFloat(x)).filter((x) => !Number.isNaN(x));
        pays = potPaysLabel(slices, places.length > 0 ? places : [100]);
      }
      break;
    }
  }
  return [bet, teams, format, play, pays, junk].filter(Boolean).join(' · ');
}

/** §5.dd: the players on every team of a team-engine game when they're all the same size (else
 *  null), read off the teams the engine actually settles on. Its stakes show per player then. */
export function stakeTeamSizeOf(game: PoolGame): number | null {
  const mode = getGameMode(game.gameMode);
  if (mode?.category !== 'team-within-group') return null;
  return evenTeamSize(sidesForCompute(game).map((s) => s.playerIds.length));
}

/** The one-line game label for a saved (or draft) game. */
export function gameLabel(game: PoolGame): string {
  const mode = getGameMode(game.gameMode);
  if (!mode) return classicLabel(game);
  if (mode.category !== 'team-within-group') return gameKindLabel(game);
  return teamGameLabel(game, defaultSettings(mode.settings));
}

/**
 * The short name for something that needs one — an unnamed event or round (§5.cz, F-117/F-118): the
 * teams and the format ("4v4 best ball"). An individual mode is its name ("Skins").
 */
export function gameTypeName(game: PoolGame): string {
  const mode = getGameMode(game.gameMode);
  if (mode && mode.category !== 'team-within-group') return mode.name;
  if (!mode) {
    const format = game.teamFormat ? FORMAT_WORD[game.teamFormat] : BALL_WORD[game.ballSelection];
    return [teamsWord(game.teams.map((t) => t.playerIds.length)), format].filter(Boolean).join(' ');
  }
  const st: SettingsBag = { ...defaultSettings(mode.settings), ...(game.modeSettings ?? {}) };
  const sizes = sidesForCompute(game).map((s) => s.playerIds.length);
  return [teamsWord(sizes), FORMAT_WORD[String(st.format ?? '')]].filter(Boolean).join(' ');
}
