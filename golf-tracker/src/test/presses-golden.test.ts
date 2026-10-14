// PRESSES goldens (DECISIONS.md §5.dj, design note `.claude/plans/presses.md`).
//
// Shown to Craig BEFORE the setting, the Press button and the settle-up lines are wired. Every
// expected value below is worked by hand in the design note; the random sweep checks the module
// against an independent oracle (a hole-by-hole forward simulation, not the module's queue).
import { describe, expect, it } from 'vitest';
import {
  autoPresses,
  betsNet,
  legHoles,
  pressOffers,
  tappedPresses,
  type HoleResult,
  type PressBet,
} from '@/lib/game-modes/presses';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const FRONT = legHoles('front', HOLES);
const BACK = legHoles('back', HOLES);

/** 'A' a wins, 'B' b wins, '-' halved, '.' not played yet; first char is the leg's first hole. */
function res(pattern: string, first = 1): Map<number, HoleResult> {
  const m = new Map<number, HoleResult>();
  [...pattern].forEach((c, i) => {
    m.set(first + i, c === 'A' ? 'a' : c === 'B' ? 'b' : c === '-' ? 'halved' : null);
  });
  return m;
}

const summary = (bets: PressBet[]) =>
  bets.map((b) => `${b.id} ${b.holes[0]}-${b.holes[b.holes.length - 1]} ${b.margin >= 0 ? '+' : ''}${b.margin}`);

describe('presses: the worked examples (§5.dj)', () => {
  it('G1: 2 down after 4, press 5–9, win 5/7/9 → the press 3 up AND the front 1 up', () => {
    const r = res('-B-BA-A-A');
    const bets = autoPresses('front', FRONT, r);
    // And once a goes 2 up in the press (after 7), b is 2 down in it, so auto presses for b on
    // 8–9. Hole 9 wins that too: a wins all three bets. (Craig's example stopped at two bets; the
    // design note asks whether the side that's AHEAD gets pressed against automatically.)
    expect(summary(bets)).toEqual(['front 1-9 +1', 'front.1 5-9 +3', 'front.1.1 8-9 +1']);
    expect(bets.map((b) => b.pressedBy)).toEqual([null, 'a', 'b']);
    expect(betsNet(bets, 10)).toBe(30);
  });

  it('G2: the press won but the leg lost → $0', () => {
    // b wins 1 and 2 (press from 3); halves 3–6; b wins 7 (front 3 down, press 1 down);
    // a wins 8 and 9: the front is lost 1 down, the press won 1 up.
    const bets = autoPresses('front', FRONT, res('BB----BAA'));
    expect(summary(bets)).toEqual(['front 1-9 -1', 'front.1 3-9 +1']);
    expect(betsNet(bets, 10)).toBe(0);
  });

  it('G3: re-presses are unlimited, and either side can be the one pressing', () => {
    // b wins 1–4, a wins 5–9.
    //   front     1–9  a 2 down after 2 → press 3–9 (front.1, for a)
    //   front.1   3–9  a 2 down after 4 → press 5–9 (front.1.1, for a)
    //   front.1.1 5–9  b 2 down after 6 → press 7–9 (front.1.1.1, for b)
    //   front.1.1.1 7–9 b 2 down after 8 → press 9 (for b)
    // The front itself goes 4 down, but it was already pressed once: no second press of it.
    const bets = autoPresses('front', FRONT, res('BBBBAAAAA'));
    expect(summary(bets)).toEqual([
      'front 1-9 +1',
      'front.1 3-9 +3',
      'front.1.1 5-9 +5',
      'front.1.1.1 7-9 +3',
      'front.1.1.1.1 9-9 +1',
    ]);
    expect(bets.map((b) => b.pressedBy)).toEqual([null, 'a', 'a', 'b', 'b']);
    expect(betsNet(bets, 5)).toBe(25); // a wins all five bets
  });

  it('G4: 2 down after 8 presses hole 9 alone; 2 down after 9 presses nothing', () => {
    expect(summary(autoPresses('front', FRONT, res('-------BB')))).toEqual(['front 1-9 -2']);
    expect(summary(autoPresses('front', FRONT, res('------BBA')))).toEqual(['front 1-9 -1', 'front.1 9-9 +1']);
  });

  it('G5: 1 down through 3 is not a press (Craig: "i dont think a press is valid")', () => {
    expect(summary(autoPresses('front', FRONT, res('B--------')))).toEqual(['front 1-9 -1']);
  });

  it('G6: the back nine presses within the back (10–18), never into the front', () => {
    const bets = autoPresses('back', BACK, res('AA-------', 10));
    expect(summary(bets)).toEqual(['back 10-18 +2', 'back.1 12-18 +0']);
    expect(bets[1].pressedBy).toBe('b');
    expect(betsNet(bets, 10)).toBe(10); // back won, its press halved
  });

  it('G7: a front press never touches the overall (each leg presses on its own)', () => {
    const r = res('BB-------' + '---------');
    const overall = autoPresses('overall', HOLES, r);
    // The overall is pressed ONLY if overall presses are allowed (Craig's open question).
    // When they are, it is its own bet, running to 18 — not the front's press.
    expect(summary(overall)).toEqual(['overall 1-18 -2', 'overall.1 3-18 +0']);
    expect(summary(autoPresses('front', FRONT, r))).toEqual(['front 1-9 -2', 'front.1 3-9 +0']);
  });

  it('G8: mid-round, a press counts contested holes only and says so', () => {
    const bets = autoPresses('front', FRONT, res('BBA......'));
    expect(summary(bets)).toEqual(['front 1-9 -1', 'front.1 3-9 +1']);
    expect(bets.map((b) => [b.thru, b.complete])).toEqual([[3, false], [1, false]]);
  });
});

describe('presses: the Press button', () => {
  it('B1: the button is offered to the side 2 down, naming the bet; one tap starts one press', () => {
    const r = res('BB.......');
    const legOnly = tappedPresses('front', FRONT, r, []);
    expect(pressOffers(legOnly, r)).toEqual([{ of: 'front', by: 'a', fromHole: 3 }]);
    const bets = tappedPresses('front', FRONT, r, [{ of: 'front', fromHole: 3, by: 'a' }]);
    expect(summary(bets)).toEqual(['front 1-9 -2', 'front.1 3-9 +0']);
    expect(pressOffers(bets, r)).toEqual([]); // the front is pressed; nothing else is 2 down
  });

  it('B2: not pressing at 2 down leaves the button there at 3 down', () => {
    const r = res('BBB......');
    expect(pressOffers(tappedPresses('front', FRONT, r, []), r)).toEqual([{ of: 'front', by: 'a', fromHole: 4 }]);
  });

  it('B3: a removed press pays nothing, and takes its re-presses with it', () => {
    const r = res('BBBBAAAAA');
    const taps = [
      { of: 'front', fromHole: 3, by: 'a' as const, removed: { note: 'press removed' } },
      { of: 'front.1', fromHole: 5, by: 'a' as const },
    ];
    expect(summary(tappedPresses('front', FRONT, r, taps))).toEqual(['front 1-9 +1']);
  });

  it('B4: a tap stands after a score is corrected (it was a bet made), and a second tap on one bet is ignored', () => {
    // Tapped at 2 down after 2; hole 2 later corrected to a halve, so the front is only 1 down.
    const r = res('B-AAAAAAA');
    const taps = [
      { of: 'front', fromHole: 3, by: 'a' as const },
      { of: 'front', fromHole: 5, by: 'a' as const },
    ];
    expect(summary(tappedPresses('front', FRONT, r, taps))).toEqual(['front 1-9 +6', 'front.1 3-9 +7']);
  });

  it('B5: auto and button agree when every offer is tapped the moment it shows', () => {
    const r = res('BBBBAAAAA');
    let taps: { of: string; fromHole: number; by: 'a' | 'b' }[] = [];
    for (const h of FRONT) {
      const sofar = new Map([...r].filter(([k]) => k <= h));
      const offers = pressOffers(tappedPresses('front', FRONT, sofar, taps), sofar);
      taps = [...taps, ...offers];
    }
    expect(summary(tappedPresses('front', FRONT, r, taps))).toEqual(summary(autoPresses('front', FRONT, r)));
  });
});

// --- independent oracle -------------------------------------------------------------------
// Walks the holes forward, keeping a running margin on every live bet. A bet presses the first
// time it stands 2 down after a hole, if a hole is left. Returns side a's net at `stake`.
function oracleNet(results: Map<number, HoleResult>, holes: number[], stake: number): number {
  type Live = { start: number; m: number; pressed: boolean };
  const live: Live[] = [{ start: holes[0], m: 0, pressed: false }];
  holes.forEach((h, i) => {
    const r = results.get(h) ?? null;
    if (r === null) return;
    const d = r === 'a' ? 1 : r === 'b' ? -1 : 0;
    const born: Live[] = [];
    for (const b of live) {
      if (b.start > h) continue;
      b.m += d;
      if (!b.pressed && Math.abs(b.m) >= 2 && i + 1 < holes.length) {
        b.pressed = true;
        born.push({ start: holes[i + 1], m: 0, pressed: false });
      }
    }
    live.push(...born);
  });
  return live.reduce((s, b) => s + Math.sign(b.m) * stake, 0);
}

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

describe('presses: zero-sum and the oracle, 2000 random nines and rounds', () => {
  it('module == oracle, and every bet pays one side exactly what the other loses', () => {
    const rand = rng(42);
    for (let n = 0; n < 2000; n++) {
      const leg = n % 3 === 0 ? 'overall' : n % 3 === 1 ? 'front' : 'back';
      const holes = legHoles(leg, HOLES);
      const r = new Map<number, HoleResult>();
      const played = Math.floor(rand() * (holes.length + 1));
      holes.forEach((h, i) => {
        const x = rand();
        r.set(h, i >= played ? null : x < 0.35 ? 'a' : x < 0.7 ? 'b' : 'halved');
      });
      const bets = autoPresses(leg, holes, r);
      const a = betsNet(bets, 10);
      expect(a).toBe(oracleNet(r, holes, 10));
      // Zero-sum, counted from b's side independently of betsNet's sign flip.
      const b = bets.reduce((s, x) => s + (x.leader === 'b' ? 10 : x.leader === 'a' ? -10 : 0), 0);
      expect(a + b).toBe(0);
    }
  });
});
