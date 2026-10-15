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
    // b is 2 down in a's press after 7, but only the side that made a press can press it (§5.dk):
    // two bets, exactly Craig's $20.
    expect(summary(bets)).toEqual(['front 1-9 +1', 'front.a 5-9 +3']);
    expect(bets[1].pressedBy).toBe('a');
    expect(betsNet(bets, 10)).toBe(20);
  });

  it('G2: the press won but the leg lost → $0', () => {
    // b wins 1 and 2 (press from 3); halves 3–6; b wins 7 (front 3 down, press 1 down);
    // a wins 8 and 9: the front is lost 1 down, the press won 1 up.
    const bets = autoPresses('front', FRONT, res('BB----BAA'));
    expect(summary(bets)).toEqual(['front 1-9 -1', 'front.a 3-9 +1']);
    expect(betsNet(bets, 10)).toBe(0);
  });

  it("G3: the side that's losing re-presses its own press when 2 down in it; the leader never presses a press", () => {
    // b wins 1–4, a wins 5–9.
    //   front     1–9  a 2 down after 2 → a presses 3–9 (front.a)
    //   front.a   3–9  a 2 down after 4 → a presses its press, 5–9 (front.a.a)
    //   front.a.a 5–9  b goes 2 down in it after 6, but it's a's press: b can't press it.
    // The front itself goes 4 down, but a already pressed it once: no second press of it.
    const bets = autoPresses('front', FRONT, res('BBBBAAAAA'));
    expect(summary(bets)).toEqual(['front 1-9 +1', 'front.a 3-9 +3', 'front.a.a 5-9 +5']);
    expect(bets.map((b) => b.pressedBy)).toEqual([null, 'a', 'a']);
    expect(betsNet(bets, 5)).toBe(15); // a wins all three bets
  });

  it('G3b: a leader who collapses to 2 down in the front itself is now losing it, and presses it', () => {
    // a wins 1 and 2 (b presses 3–9); halves 3–4; b wins 5–8: the front is a 2 down after 8,
    // so a presses hole 9 (halved). b's press 3–9 is b 4 up.
    const bets = autoPresses('front', FRONT, res('AA--BBBB-'));
    expect(summary(bets)).toEqual(['front 1-9 -2', 'front.b 3-9 -4', 'front.a 9-9 +0']);
    expect(betsNet(bets, 10)).toBe(-20);
  });

  it('G4: 2 down after 8 presses hole 9 alone; 2 down after 9 presses nothing', () => {
    expect(summary(autoPresses('front', FRONT, res('-------BB')))).toEqual(['front 1-9 -2']);
    expect(summary(autoPresses('front', FRONT, res('------BBA')))).toEqual(['front 1-9 -1', 'front.a 9-9 +1']);
  });

  it('G5: 1 down through 3 is not a press (Craig: "i dont think a press is valid")', () => {
    expect(summary(autoPresses('front', FRONT, res('B--------')))).toEqual(['front 1-9 -1']);
  });

  it('G6: the back nine presses within the back (10–18), never into the front', () => {
    const bets = autoPresses('back', BACK, res('AA-------', 10));
    expect(summary(bets)).toEqual(['back 10-18 +2', 'back.b 12-18 +0']);
    expect(bets[1].pressedBy).toBe('b');
    expect(betsNet(bets, 10)).toBe(10); // back won, its press halved
  });

  it('G7: a front press never touches the overall (each leg presses on its own)', () => {
    const r = res('BB-------' + '---------');
    const overall = autoPresses('overall', HOLES, r);
    // The overall is pressed ONLY if overall presses are allowed (Craig's open question).
    // When they are, it is its own bet, running to 18 — not the front's press.
    expect(summary(overall)).toEqual(['overall 1-18 -2', 'overall.a 3-18 +0']);
    expect(summary(autoPresses('front', FRONT, r))).toEqual(['front 1-9 -2', 'front.a 3-9 +0']);
  });

  it('G8: mid-round, a press counts contested holes only and says so', () => {
    const bets = autoPresses('front', FRONT, res('BBA......'));
    expect(summary(bets)).toEqual(['front 1-9 -1', 'front.a 3-9 +1']);
    expect(bets.map((b) => [b.thru, b.complete])).toEqual([[3, false], [1, false]]);
  });
});

describe('presses: the Press button', () => {
  it('B1: the button is offered to the side 2 down, naming the bet; one tap starts one press', () => {
    const r = res('BB.......');
    const legOnly = tappedPresses('front', FRONT, r, []);
    expect(pressOffers(legOnly, r)).toEqual([{ of: 'front', by: 'a', fromHole: 3 }]);
    const bets = tappedPresses('front', FRONT, r, [{ of: 'front', fromHole: 3, by: 'a' }]);
    expect(summary(bets)).toEqual(['front 1-9 -2', 'front.a 3-9 +0']);
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
      { of: 'front.a', fromHole: 5, by: 'a' as const },
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
    expect(summary(tappedPresses('front', FRONT, r, taps))).toEqual(['front 1-9 +6', 'front.a 3-9 +7']);
  });

  it("B4b: the leader's tap on the other side's press is ignored (only its presser may press it)", () => {
    const r = res('BBAAAA...');
    const taps = [
      { of: 'front', fromHole: 3, by: 'a' as const },
      { of: 'front.a', fromHole: 7, by: 'b' as const },
    ];
    const bets = tappedPresses('front', FRONT, r, taps);
    expect(summary(bets)).toEqual(['front 1-9 +2', 'front.a 3-9 +4']);
    // b is offered a press of the FRONT (b is 2 down in it), never of a's press.
    expect(pressOffers(bets, r)).toEqual([{ of: 'front', by: 'b', fromHole: 7 }]);
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
// Walks the holes forward, keeping a running margin on every live bet. A side that may press a bet
// (either side on the leg, only its presser on a press) presses it the first time it stands 2
// down after a hole, if a hole is left. Returns side a's net at `stake`.
function oracleNet(results: Map<number, HoleResult>, holes: number[], stake: number): number {
  type Live = { start: number; m: number; by: 'a' | 'b' | null; done: Set<string> };
  const live: Live[] = [{ start: holes[0], m: 0, by: null, done: new Set() }];
  holes.forEach((h, i) => {
    const r = results.get(h) ?? null;
    if (r === null) return;
    const d = r === 'a' ? 1 : r === 'b' ? -1 : 0;
    const born: Live[] = [];
    for (const b of live) {
      if (b.start > h) continue;
      b.m += d;
      for (const side of b.by ? [b.by] : (['a', 'b'] as const)) {
        const down = side === 'a' ? -b.m : b.m;
        if (!b.done.has(side) && down >= 2 && i + 1 < holes.length) {
          b.done.add(side);
          born.push({ start: holes[i + 1], m: 0, by: side, done: new Set() });
        }
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
