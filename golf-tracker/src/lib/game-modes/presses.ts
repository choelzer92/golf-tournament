// PRESSES: new, separate bets started inside a head-to-head match (DECISIONS.md §5.dj).
//
// A press is a NEW bet for the leg's stake on the remaining holes of that leg's nine, started all
// square. The bet it presses stays live, so a comeback can win both: 2 down after 4, press 5–9,
// win 5, 7 and 9 and the press is 3 up AND the front is 1 up. It is not double or nothing.
//
// DESIGN NOTE: `.claude/plans/presses.md`. Goldens: `src/test/presses-golden.test.ts`.
// NOT WIRED YET: nothing in the engine, the wizard or the settle-up reads this file. Craig sees the
// note and the goldens before the setting, the Press button and the settle-up lines exist.
//
// THE RULES THIS FILE ENCODES
// - The trigger is 2 down, in both modes. Auto starts the press the moment a bet goes 2 down; the
//   Press button is offered to the trailing side from 2 down.
// - Each bet (the leg itself, or a press) can be pressed ONCE, by whichever side is 2+ down in it.
//   Re-presses are unlimited because a press is itself a bet: a press that goes 2 down can be
//   pressed, and so on. "Once per bet" is what stops one bad hole from opening a press on every
//   live bet at the same time.
// - A press runs from the next hole to the END OF ITS BET's holes (the nine for a front/back press;
//   18 for an overall press, if the overall may be pressed at all, which is Craig's call).
// - 2 down after the leg's last hole presses nothing: there's no hole left to play.
// - A press is counted on CONTESTED holes only (both sides posted), like its leg (§5.ai, F-016).
// - A Press tap stands once made, even if a score is corrected later so the bet is no longer 2
//   down: it's a bet that was made. A removed tap is gone (the note is kept for the record).
//
// Pure: no Date.now, no storage. Input is the hole-by-hole result of ONE head-to-head match.

/** Who won a hole in a two-sided match. `null` = not contested yet (a side hasn't posted). */
export type HoleResult = 'a' | 'b' | 'halved' | null;
export type PressSide = 'a' | 'b';
export type PressLeg = 'front' | 'back' | 'overall';

/** A Press tap, stored on the game in button mode. */
export interface PressTap {
  /** The id of the bet being pressed: a leg key ('front') or a press id ('front.1'). */
  of: string;
  /** The press starts on this hole. */
  fromHole: number;
  /** The trailing side, who pressed. */
  by: PressSide;
  /** Set when the scorer removed the press; a removed press pays nothing. */
  removed?: { note: string };
}

export interface PressBet {
  /** 'front' for the leg itself; 'front.1' its press; 'front.1.1' the press of that press. */
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

/**
 * AUTO PRESS: every bet in `leg`, the leg itself first, then each press in the order it started.
 * A bet that reaches 2 down (for either side) after a contested hole starts one press from the next
 * hole of that bet, for the side that's down.
 */
export function autoPresses(
  leg: PressLeg,
  holes: number[],
  results: ReadonlyMap<number, HoleResult>,
  trigger = 2,
): PressBet[] {
  const out: PressBet[] = [];
  const queue: Omit<PressBet, 'margin' | 'thru' | 'complete' | 'leader'>[] = [
    { id: leg, leg, parent: null, pressedBy: null, holes },
  ];
  while (queue.length) {
    const bet = queue.shift()!;
    out.push(scoreBet(bet, results));
    // The first contested hole after which this bet stands `trigger` down.
    let m = 0;
    for (let i = 0; i < bet.holes.length; i++) {
      const r = results.get(bet.holes[i]) ?? null;
      if (r === null) continue;
      if (r === 'a') m++;
      else if (r === 'b') m--;
      if (Math.abs(m) >= trigger) {
        const rest = bet.holes.slice(i + 1);
        if (rest.length) {
          queue.push({ id: `${bet.id}.1`, leg, parent: bet.id, pressedBy: m < 0 ? 'a' : 'b', holes: rest });
        }
        break;
      }
    }
  }
  return out.sort((x, y) => x.holes[0] - y.holes[0] || x.id.length - y.id.length);
}

/**
 * BUTTON PRESS: the leg plus every press tapped (and not removed). A tap on a bet that doesn't
 * exist (its parent was removed) is dropped with it, so removing a press removes its re-presses.
 * One press per bet: a second tap on the same bet is ignored (the earliest stands).
 */
export function tappedPresses(
  leg: PressLeg,
  holes: number[],
  results: ReadonlyMap<number, HoleResult>,
  taps: PressTap[],
): PressBet[] {
  const bets = new Map<string, Omit<PressBet, 'margin' | 'thru' | 'complete' | 'leader'>>();
  bets.set(leg, { id: leg, leg, parent: null, pressedBy: null, holes });
  const live = taps
    .filter((t) => !t.removed && (t.of === leg || t.of.startsWith(`${leg}.`)))
    .sort((x, y) => x.fromHole - y.fromHole);
  for (const t of live) {
    const parent = bets.get(t.of);
    const id = `${t.of}.1`;
    if (!parent || bets.has(id)) continue;
    const rest = parent.holes.filter((h) => h >= t.fromHole);
    if (!rest.length) continue;
    bets.set(id, { id, leg, parent: t.of, pressedBy: t.by, holes: rest });
  }
  return [...bets.values()]
    .map((b) => scoreBet(b, results))
    .sort((x, y) => x.holes[0] - y.holes[0] || x.id.length - y.id.length);
}

/**
 * Where the Press button shows, after the holes posted so far: each bet that is 2+ down and has
 * not been pressed, with at least one hole left. The button names the bet it presses ("Press the
 * front 9", "Press the press"), so one tap never presses two bets.
 */
export function pressOffers(
  bets: PressBet[],
  results: ReadonlyMap<number, HoleResult>,
  trigger = 2,
): { of: string; by: PressSide; fromHole: number }[] {
  const pressed = new Set(bets.map((b) => b.parent).filter(Boolean));
  const offers: { of: string; by: PressSide; fromHole: number }[] = [];
  for (const b of bets) {
    if (pressed.has(b.id)) continue;
    const last = [...b.holes].reverse().find((h) => (results.get(h) ?? null) !== null);
    if (last === undefined) continue;
    const m = marginThrough(b.holes, results, last);
    const next = b.holes.find((h) => h > last);
    if (Math.abs(m) >= trigger && next !== undefined) {
      offers.push({ of: b.id, by: m < 0 ? 'a' : 'b', fromHole: next });
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
