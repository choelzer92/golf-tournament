// PRESSES: new, separate bets started inside a head-to-head match (DECISIONS.md §5.dj).
//
// A press is a NEW bet for the leg's stake on the remaining holes of that leg's nine, started all
// square. The bet it presses stays live, so a comeback can win both: 2 down after 4, press 5–9,
// win 5, 7 and 9 and the press is 3 up AND the front is 1 up. It is not double or nothing.
//
// DESIGN NOTE: `.claude/plans/presses.md`. Goldens: `src/test/presses-golden.test.ts`.
// WIRED (§5.dk) through `computePresses` below: the team engine (two sides) and the classic pool's
// two-team match. Not Team → Match games (§5.dm): a press there never touches the team result.
//
// THE RULES THIS FILE ENCODES
// - The trigger is 2 down, in both modes. Auto starts the press the moment a bet goes 2 down; the
//   Press button is offered to the trailing side from 2 down.
// - ONLY THE SIDE THAT'S LOSING PRESSES (§5.dk; Wikipedia: a press is "offered ... by the side
//   that is losing"). The leg itself can be pressed once by EACH side: a leader who collapses to 2
//   down in the front is now losing it and may press it. A press can be pressed only by the side
//   that made it, when it's 2 down in it ("its newest press"). The leader never gets a press of a
//   press, and a press never multiplies: one press per bet per side.
// - A press runs from the next hole to the END OF ITS BET's holes (the nine for a front/back press;
//   18 for an overall press, if the overall may be pressed at all, which is Craig's call).
// - 2 down after the leg's last hole presses nothing: there's no hole left to play.
// - A press is counted on CONTESTED holes only (both sides posted), like its leg (§5.ai, F-016).
// - A Press tap stands once made, even if a score is corrected later so the bet is no longer 2
//   down: it's a bet that was made. A removed tap is gone (the note is kept for the record).
//
// Pure: no Date.now, no storage. Input is the hole-by-hole result of ONE head-to-head match.

import type { FormatSetting } from '../formats';
import { boolSetting, stringSetting } from './settings';

/** Who won a hole in a two-sided match. `null` = not contested yet (a side hasn't posted). */
export type HoleResult = 'a' | 'b' | 'halved' | null;
export type PressSide = 'a' | 'b';
export type PressLeg = 'front' | 'back' | 'overall';

/** A Press tap, stored on the game in button mode. */
export interface PressTap {
  /** The id of the bet being pressed: a leg key ('front') or a press id ('front.a'). */
  of: string;
  /** The press starts on this hole. */
  fromHole: number;
  /** The trailing side, who pressed. */
  by: PressSide;
  /** Set when the scorer removed the press; a removed press pays nothing. */
  removed?: { note: string };
  /** Team → Match games only: the match (MatchLine.id) the press belongs to. */
  match?: string;
}

export interface PressBet {
  /** 'front' for the leg itself; 'front.a' side a's press of it; 'front.a.a' a's press of that. */
  id: string;
  leg: PressLeg;
  /** The bet this one presses; null for the leg itself. */
  parent: string | null;
  /** The side that pressed; null for the leg itself. */
  pressedBy: PressSide | null;
  /** The holes this bet is played over, in order. */
  holes: number[];
  /** Holes won by side a minus holes won by side b, over contested holes. + = a is up. */
  margin: number;
  /** Contested holes played so far. */
  thru: number;
  /** Every hole of the bet has been contested. */
  complete: boolean;
  /** Who's ahead on the contested holes (the winner once complete); null = all square. */
  leader: PressSide | null;
}

/** The leg's holes. A 9-hole game has only the overall (front/back collapse into it). */
export function legHoles(leg: PressLeg, holeNumbers: number[]): number[] {
  const sorted = [...holeNumbers].sort((x, y) => x - y);
  if (leg === 'front') return sorted.filter((h) => h <= 9);
  if (leg === 'back') return sorted.filter((h) => h > 9);
  return sorted;
}

function scoreBet(
  base: Omit<PressBet, 'margin' | 'thru' | 'complete' | 'leader'>,
  results: ReadonlyMap<number, HoleResult>,
): PressBet {
  let margin = 0;
  let thru = 0;
  for (const h of base.holes) {
    const r = results.get(h) ?? null;
    if (r === null) continue;
    thru++;
    if (r === 'a') margin++;
    else if (r === 'b') margin--;
  }
  return {
    ...base,
    margin,
    thru,
    complete: thru === base.holes.length,
    leader: margin > 0 ? 'a' : margin < 0 ? 'b' : null,
  };
}

/** The bet's margin after `hole` (contested holes up to and including it). */
function marginThrough(holes: number[], results: ReadonlyMap<number, HoleResult>, hole: number): number {
  let m = 0;
  for (const h of holes) {
    if (h > hole) break;
    const r = results.get(h) ?? null;
    if (r === 'a') m++;
    else if (r === 'b') m--;
  }
  return m;
}

type BetBase = Omit<PressBet, 'margin' | 'thru' | 'complete' | 'leader'>;

/** Who may press this bet: either side on the leg itself; only its presser on a press. */
function pressers(bet: BetBase): PressSide[] {
  return bet.pressedBy ? [bet.pressedBy] : ['a', 'b'];
}

/** `side`'s margin in a bet: + = side is up. */
const forSide = (side: PressSide, aMargin: number) => (side === 'a' ? aMargin : -aMargin);

function byStart(x: PressBet, y: PressBet): number {
  return x.holes[0] - y.holes[0] || x.id.length - y.id.length || x.id.localeCompare(y.id);
}

/**
 * AUTO PRESS: a side that reaches 2 down in a bet it may press (after a contested hole) starts one
 * press of that bet from the bet's next hole. `removed` holds the ids of presses the scorer removed
 * (§5.dj: removable any time): each is dropped with its re-presses, and isn't started again.
 */
export function autoPresses(
  leg: PressLeg,
  holes: number[],
  results: ReadonlyMap<number, HoleResult>,
  trigger = 2,
  removed: ReadonlySet<string> = new Set(),
): PressBet[] {
  const out: PressBet[] = [];
  const queue: BetBase[] = [{ id: leg, leg, parent: null, pressedBy: null, holes }];
  while (queue.length) {
    const bet = queue.shift()!;
    out.push(scoreBet(bet, results));
    for (const side of pressers(bet)) {
      // The first contested hole after which `side` stands `trigger` down in this bet.
      let m = 0;
      for (let i = 0; i < bet.holes.length; i++) {
        const r = results.get(bet.holes[i]) ?? null;
        if (r === null) continue;
        if (r === 'a') m++;
        else if (r === 'b') m--;
        if (forSide(side, m) <= -trigger) {
          const rest = bet.holes.slice(i + 1);
          if (rest.length && !removed.has(`${bet.id}.${side}`)) {
            queue.push({ id: `${bet.id}.${side}`, leg, parent: bet.id, pressedBy: side, holes: rest });
          }
          break;
        }
      }
    }
  }
  return out.sort(byStart);
}

/**
 * BUTTON PRESS: the leg plus every press tapped (and not removed). A tap on a bet that doesn't
 * exist (its parent was removed) is dropped with it, so removing a press removes its re-presses.
 * A tap by a side that may not press that bet is ignored, and so is a second tap by the same side
 * on the same bet (the earliest stands).
 */
export function tappedPresses(
  leg: PressLeg,
  holes: number[],
  results: ReadonlyMap<number, HoleResult>,
  taps: PressTap[],
): PressBet[] {
  const bets = new Map<string, BetBase>();
  bets.set(leg, { id: leg, leg, parent: null, pressedBy: null, holes });
  const live = taps
    .filter((t) => !t.removed && (t.of === leg || t.of.startsWith(`${leg}.`)))
    .sort((x, y) => x.fromHole - y.fromHole);
  for (const t of live) {
    const parent = bets.get(t.of);
    const id = `${t.of}.${t.by}`;
    if (!parent || bets.has(id) || !pressers(parent).includes(t.by)) continue;
    const rest = parent.holes.filter((h) => h >= t.fromHole);
    if (!rest.length) continue;
    bets.set(id, { id, leg, parent: t.of, pressedBy: t.by, holes: rest });
  }
  return [...bets.values()].map((b) => scoreBet(b, results)).sort(byStart);
}

/**
 * Where the Press button shows, after the holes posted so far: each bet a side may press, is 2+
 * down in, and hasn't pressed yet, with at least one hole left. The button names the bet it
 * presses ("Press the front 9", "Press your press"), so one tap never presses two bets.
 */
export function pressOffers(
  bets: PressBet[],
  results: ReadonlyMap<number, HoleResult>,
  trigger = 2,
): { of: string; by: PressSide; fromHole: number }[] {
  const ids = new Set(bets.map((b) => b.id));
  const offers: { of: string; by: PressSide; fromHole: number }[] = [];
  for (const b of bets) {
    const last = [...b.holes].reverse().find((h) => (results.get(h) ?? null) !== null);
    if (last === undefined) continue;
    const next = b.holes.find((h) => h > last);
    if (next === undefined) continue;
    const m = marginThrough(b.holes, results, last);
    for (const side of pressers(b)) {
      if (!ids.has(`${b.id}.${side}`) && forSide(side, m) <= -trigger) {
        offers.push({ of: b.id, by: side, fromHole: next });
      }
    }
  }
  return offers;
}

/**
 * The money for a set of bets: each bet won pays `stake` from loser to winner; all square pays
 * nothing. Settles on contested holes, as its leg does (an unfinished leg is the close-out
 * question, §5.ai, and a voided leg voids its presses: pass `voided`).
 * Returns side a's net; side b's is its negative (two sides, zero-sum by construction).
 */
export function betsNet(bets: PressBet[], stake: number, voided: ReadonlySet<string> = new Set()): number {
  let a = 0;
  for (const b of bets) {
    if (voided.has(b.leg)) continue;
    if (b.leader === 'a') a += stake;
    else if (b.leader === 'b') a -= stake;
  }
  return a;
}

// ---------------------------------------------------------------------------
// WIRING (§5.dk): the settings, and one call per head-to-head match for every engine.
// ---------------------------------------------------------------------------

const PRESS_SHOW_IF = [{ key: 'moneyModel', in: ['legs'] }, { key: 'result', in: ['match'] }];

/** The presses settings. Off by default; shown only on match-play legs (§5.dk Q3). */
export const PRESS_SETTINGS: FormatSetting[] = [
  {
    key: 'presses', label: 'Presses', type: 'toggle', defaultValue: false,
    hint: 'A side 2 down can press: a new bet at the leg’s stake, from the next hole to the end of the nine. The bet it presses stays live.',
    showIf: PRESS_SHOW_IF,
  },
  {
    key: 'pressMode', label: 'A press starts', type: 'select',
    options: [
      { value: 'button', label: 'When the scorer taps Press' },
      { value: 'auto', label: 'Automatically at 2 down' },
    ],
    defaultValue: 'button',
    showIf: [...PRESS_SHOW_IF, { key: 'presses', in: ['true'] }],
  },
  {
    key: 'pressOverall', label: 'The overall can be pressed too', type: 'toggle', defaultValue: false,
    hint: 'Off: only the nines are pressed. On: the overall has its own press, to the 18th. Pressing a nine never presses the overall.',
    showIf: [...PRESS_SHOW_IF, { key: 'presses', in: ['true'] }],
  },
];

export const PRESS_KEYS: ReadonlySet<string> = new Set(PRESS_SETTINGS.map((s) => s.key));

/**
 * Can this team game press at all? Only a game where the two teams play EACH OTHER for the money:
 * two teams, no head-to-head matches inside (§5.dm). In a Team → Match game (Hogs v Dawgs) the
 * money is the team's, a press must never move it, and a match has no bet of its own to press.
 * Every surface hides the settings otherwise.
 */
export function pressesFit(teamSizes: number[], matchSize: number): boolean {
  return teamSizes.length === 2 && matchSize === 0;
}

export interface PressSettings { mode: 'auto' | 'button'; overall: boolean }

/** The game's press settings, or null when presses are off. */
export function pressSettingsOf(bag: Record<string, string | number | boolean>): PressSettings | null {
  if (!boolSetting(PRESS_SETTINGS, bag, 'presses')) return null;
  return {
    mode: stringSetting(PRESS_SETTINGS, bag, 'pressMode') === 'auto' ? 'auto' : 'button',
    overall: boolSetting(PRESS_SETTINGS, bag, 'pressOverall'),
  };
}

/** One press, ready for the board and the money card. Side ids are the game's own. */
export interface PressLine {
  id: string;
  /** Reserved for a match's own side bet (§5.dm, not built); absent today. */
  match?: string;
  leg: PressLeg;
  /** "Press 5–9", or "Re-press 7–9" for a press of a press. */
  label: string;
  /** The side that pressed, and its name. */
  by: string;
  byName: string;
  holes: number[];
  thru: number;
  complete: boolean;
  /** The side ahead in the press (its winner once complete); null = all square. */
  leader: string | null;
  /** "Hogs 2 up", "All square", or "Starts on hole 5" before a hole is played. */
  status: string;
  /** What the press pays, loser to winner, in the caller's unit (per team, or per player). */
  stake: number;
  /** Its leg was voided at close-out, so it pays nothing. */
  voided: boolean;
}

/** A Press button the scorer can tap now: `of` the bet, by the side 2 down. */
export interface PressOfferLine {
  match?: string;
  of: string;
  by: PressSide;
  /** The pressing side's id. */
  side: string;
  fromHole: number;
  /** The last hole the press would run to (the end of the bet it presses). */
  toHole: number;
  /** "Hogs: press the front 9" / "Hogs: press your press (from 5)". */
  label: string;
}

/** The id of the press a tap starts (or, removed, the press it took away): "front.a". */
export function pressIdOf(t: Pick<PressTap, 'of' | 'by'>): string {
  return `${t.of}.${t.by}`;
}

const LEG_WORDS: Record<PressLeg, string> = { front: 'the front 9', back: 'the back 9', overall: 'the overall' };

function span(holes: number[]): string {
  return holes.length === 1 ? `${holes[0]}` : `${holes[0]}–${holes[holes.length - 1]}`;
}

/**
 * Every press in ONE head-to-head match, its money, and (button mode) the Press buttons to show.
 * `results` is the match's hole-by-hole result, 'a' being `sides[0]`. `stakes` is what each leg
 * pays, in the unit the caller settles in. `nineOnly` = a 9-hole game: its one leg is that nine,
 * paid at the overall's stake as every engine pays it. `aNet` is side a's money; b's is −aNet.
 */
export function computePresses(input: {
  holeNumbers: number[];
  results: ReadonlyMap<number, HoleResult>;
  settings: PressSettings;
  taps: PressTap[];
  stakes: Record<PressLeg, number>;
  voided: ReadonlySet<PressLeg>;
  nineOnly: 'front' | 'back' | null;
  sides: [string, string];
  names: [string, string];
  match?: string;
}): { lines: PressLine[]; aNet: number; offers: PressOfferLine[] } {
  const { results, settings, sides, names, match } = input;
  const legs: { key: PressLeg; holes: number[]; stake: number }[] = input.nineOnly
    ? [{ key: input.nineOnly, holes: legHoles('overall', input.holeNumbers), stake: input.stakes.overall }]
    : ([
        { key: 'front', holes: legHoles('front', input.holeNumbers), stake: input.stakes.front },
        { key: 'back', holes: legHoles('back', input.holeNumbers), stake: input.stakes.back },
        ...(settings.overall ? [{ key: 'overall', holes: legHoles('overall', input.holeNumbers), stake: input.stakes.overall }] : []),
      ] as { key: PressLeg; holes: number[]; stake: number }[]).filter((l) => l.holes.length > 0);
  const taps = input.taps.filter((t) => t.match === match);
  const lines: PressLine[] = [];
  const offers: PressOfferLine[] = [];
  let aNet = 0;
  const idx = (s: PressSide) => (s === 'a' ? 0 : 1);
  for (const leg of legs) {
    const bets = settings.mode === 'auto'
      ? autoPresses(leg.key, leg.holes, results, 2, new Set(taps.filter((t) => t.removed).map(pressIdOf)))
      : tappedPresses(leg.key, leg.holes, results, taps);
    const presses = bets.filter((b) => b.parent !== null);
    const voided = input.voided.has(leg.key);
    if (!voided) aNet += betsNet(presses, leg.stake);
    for (const b of presses) {
      const k = b.leader ? idx(b.leader) : null;
      lines.push({
        id: b.id,
        ...(match !== undefined ? { match } : {}),
        leg: leg.key,
        label: `${b.parent === leg.key ? 'Press' : 'Re-press'} ${span(b.holes)}`,
        by: sides[idx(b.pressedBy!)],
        byName: names[idx(b.pressedBy!)],
        holes: b.holes,
        thru: b.thru,
        complete: b.complete,
        leader: k !== null ? sides[k] : null,
        status: b.thru === 0 ? `Starts on hole ${b.holes[0]}` : k !== null ? `${names[k]} ${Math.abs(b.margin)} up` : 'All square',
        stake: leg.stake,
        voided,
      });
    }
    if (settings.mode === 'button' && !voided) {
      for (const o of pressOffers(bets, results)) {
        const parent = bets.find((b) => b.id === o.of)!;
        const what = parent.parent === null ? `press ${LEG_WORDS[leg.key]}` : `press your press (from ${parent.holes[0]})`;
        offers.push({ ...(match !== undefined ? { match } : {}), ...o, toHole: parent.holes[parent.holes.length - 1], side: sides[idx(o.by)], label: `${names[idx(o.by)]}: ${what}` });
      }
    }
  }
  return { lines, aNet, offers };
}
