// F-101 d (§5.bw 5, §5.ca): individual modes take a whole field across tee groups. Skins,
// Stableford, low total and quota are uncapped; Wolf and Nines keep four. The field is 32 players
// in 8 foursomes and 144 (a member-guest, §5.bw 8) in 36, and every money model, with junk paid
// either way, stays zero-sum exactly as it does at four.
//
// Skins across groups (§5.ca): a hole is decided once EVERY tee group has posted it, so group 1
// isn't handed skins a later group takes back; a closed game decides on what was posted.

import { describe, expect, it } from 'vitest';
import { defaultSettingsForField, getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import type { IndividualResult } from '@/lib/game-modes/types';
import type { PoolGame } from '@/lib/pool-game';
import type { GameScore } from '@/lib/game-state';
import { makeGame, scoresFor, TEST_PARS } from './fixtures';

const MODELS: Record<string, string[]> = {
  skins: ['per-skin', 'pot', 'nassau'],
  'stableford-ind': ['per-point', 'nassau'],
  'low-total': ['pot', 'per-stroke', 'nassau'],
  quota: ['per-point', 'nassau'],
};
const JUNK: Record<string, string | boolean>[] = [{}, { junkEnabled: true, junkPayout: 'per-point' }, { junkEnabled: true, junkPayout: 'pot' }];

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
// Mod 7 so 144 players don't collapse onto a handful of identical cards (skins would tie out).
const card = (i: number) => TEST_PARS.map((par, h) => par + ((i * 3 + h * 5 + (i % 11) * h) % 7) - 3);

function fieldGame(n: number, gameMode: string, settings: Record<string, string | number | boolean>, status: PoolGame['status'] = 'active'): PoolGame {
  return makeGame({
    gameMode, status,
    indexes: ids(n).map((_, i) => (i * 7) % 29),
    teamCount: n / 4,          // foursomes: p1–p4 are m1, p5–p8 m2, …
    modeSettings: { ...settings },
  });
}

/** `holesFor(group)` = how many holes that tee group has played. */
function scores(n: number, holesFor: (group: number) => number = () => 18): Map<string, GameScore[]> {
  const m = new Map<string, GameScore[]>();
  ids(n).forEach((id, i) => {
    const g = Math.floor(i / 4);
    const rows = scoresFor(id, card(i)).filter((s) => s.hole <= holesFor(g));
    m.set(`m${g + 1}`, [...(m.get(`m${g + 1}`) ?? []), ...rows]);
  });
  return m;
}

function run(game: PoolGame, s: Map<string, GameScore[]>): IndividualResult {
  return getGameMode(game.gameMode!)!.compute(buildGameModeContext(game, s));
}
const net = (r: IndividualResult) => r.standings.reduce((sum, x) => sum + x.moneyNet, 0);

describe('F-101 d: the caps', () => {
  it('skins, Stableford, low total and quota take any field; Wolf and Nines keep four', () => {
    for (const id of Object.keys(MODELS)) expect(getGameMode(id)!.playersMax).toBe(Number.POSITIVE_INFINITY);
    expect(getGameMode('wolf')!.playersMax).toBe(4);
    expect(getGameMode('nines')!.playersMax).toBe(4);
  });
});

for (const n of [32, 144]) {
  describe(`F-101 d: ${n} players, ${n / 4} tee groups`, () => {
    for (const [mode, models] of Object.entries(MODELS)) {
      for (const moneyModel of models) {
        for (const junk of JUNK) {
          const label = `${mode} / ${moneyModel}${junk.junkPayout ? ` / junk ${junk.junkPayout}` : ''}`;
          it(`${label}: every player, every group read, zero-sum, money moves`, () => {
            const game = fieldGame(n, mode, { moneyModel, ...junk });
            const r = run(game, scores(n));
            expect(r.standings).toHaveLength(n);
            expect(r.standings.every((s) => s.thru === 18)).toBe(true);
            expect(net(r)).toBeCloseTo(0, 6);
            expect(r.standings.some((s) => Math.abs(s.moneyNet) > 0.001)).toBe(true);
            // The last group counts: without it the result moves.
            const lessOne = run(game, scores(n, (g) => (g === n / 4 - 1 ? 0 : 18)));
            expect(lessOne.standings.filter((s) => s.thru > 0)).toHaveLength(n - 4);
            expect(net(lessOne)).toBeCloseTo(0, 6);
          });

          it(`${label}: staggered mid-round is zero-sum`, () => {
            const game = fieldGame(n, mode, { moneyModel, ...junk });
            const r = run(game, scores(n, (g) => Math.max(0, 18 - (g % 9) * 2)));
            expect(net(r)).toBeCloseTo(0, 6);
          });
        }
      }
    }
  });
}

describe('§5.ca: a skin is decided once every tee group has posted the hole', () => {
  // Eight players, two groups. Group 1 (p1–p4) is thru 12, group 2 (p5–p8) thru 6.
  const staggered = (g: number) => (g === 0 ? 12 : 6);

  it('holes only group 1 has played are open: unpaid, listed live with who is low so far', () => {
    const game = fieldGame(8, 'skins', { moneyModel: 'per-skin', skinValue: 5 });
    const r = run(game, scores(8, staggered));
    const open = (r.openSkins ?? []).map((o) => o.hole);
    expect(open).toEqual([7, 8, 9, 10, 11, 12]);
    // Decided skins all come from holes 1–6.
    const won = r.standings.flatMap((s) => s.perHole.map((v, h) => (v && v > 0 ? h + 1 : 0))).filter(Boolean);
    expect(won.every((h) => h <= 6)).toBe(true);
    // The live leader on an open hole is group 1's low (group 2 hasn't played it).
    for (const o of r.openSkins!) expect(o.leaders.every((id) => ['p1', 'p2', 'p3', 'p4'].includes(id))).toBe(true);
    expect(net(r)).toBeCloseTo(0, 6);
  });

  it('a closed game decides on what was posted', () => {
    const game = fieldGame(8, 'skins', { moneyModel: 'per-skin', skinValue: 5 }, 'completed');
    const r = run(game, scores(8, staggered));
    expect(r.openSkins).toBeUndefined();
    expect(net(r)).toBeCloseTo(0, 6);
  });

  it('with carryover off, a hole every group posted is decided even after an open one', () => {
    const game = fieldGame(8, 'skins', { moneyModel: 'per-skin', carryover: false });
    // Group 2 skipped hole 3 (nobody posted it) but played 1–6.
    const s = scores(8, staggered);
    s.set('m2', s.get('m2')!.filter((row) => row.hole !== 3));
    const r = run(game, s);
    expect((r.openSkins ?? []).map((o) => o.hole)).toEqual([3, 7, 8, 9, 10, 11, 12]);
  });

  it('one group is the old rule exactly: a hole anyone posted is decided', () => {
    const game = makeGame({ gameMode: 'skins', indexes: [0, 6, 12, 18], modeSettings: { moneyModel: 'per-skin' } });
    // p4 hasn't posted 10–18: the hole is still decided among the three who did.
    const rows = ids(4).flatMap((id, i) => scoresFor(id, card(i)).filter((x) => i < 3 || x.hole <= 9));
    const r = run(game, new Map([['m1', rows]]));
    expect(r.openSkins).toBeUndefined();
  });
});

describe('§5.ca: the skins pot', () => {
  it('everyone antes; the pot splits by skins won', () => {
    const game = fieldGame(32, 'skins', { moneyModel: 'pot', entryPerPlayer: 10 });
    const r = run(game, scores(32));
    expect(r.pot).toBe(320);
    expect(r.moneyModel).toBe('pot');
    const total = r.standings.reduce((s, x) => s + x.points, 0);
    expect(total).toBeGreaterThan(0);
    for (const s of r.standings) expect(s.moneyNet).toBeCloseTo((320 * s.points) / total - 10, 6);
    expect(net(r)).toBeCloseTo(0, 6);
  });

  it('no skin won yet: nobody is out anything', () => {
    const game = makeGame({ gameMode: 'skins', indexes: [0, 0, 0, 0], modeSettings: { moneyModel: 'pot', entryPerPlayer: 10 } });
    const flat = new Map([['m1', ids(4).flatMap((id) => scoresFor(id, TEST_PARS))]]);
    const r = run(game, flat);
    expect(r.standings.every((s) => s.moneyNet === 0)).toBe(true);
  });
});

describe('§5.ca: a field past four starts on the pots', () => {
  const skins = getGameMode('skins')!;
  it('skins: $ per skin to four, the skins pot past; junk pays as a pot past four', () => {
    expect(defaultSettingsForField(skins, 4).moneyModel).toBe('per-skin');
    expect(defaultSettingsForField(skins, 4).junkPayout).toBe('per-point');
    expect(defaultSettingsForField(skins, 5).moneyModel).toBe('pot');
    expect(defaultSettingsForField(skins, 5).junkPayout).toBe('pot');
  });

  it('other individual modes keep their own money default; only junk moves', () => {
    for (const id of ['stableford-ind', 'low-total', 'quota']) {
      const mode = getGameMode(id)!;
      const small = defaultSettingsForField(mode, 4);
      const big = defaultSettingsForField(mode, 32);
      expect(big.moneyModel).toBe(small.moneyModel);
      expect(big.junkPayout).toBe('pot');
    }
  });

  it('a team game is not touched', () => {
    const team = getGameMode('team-2v2')!;
    expect(defaultSettingsForField(team, 32)).toEqual(defaultSettingsForField(team, 4));
  });
});

describe('§5.cc: an open skin says who is low, how many of the field have played it, and the carry', () => {
  it('posted counts players (not groups); field is everyone', () => {
    const game = fieldGame(8, 'skins', { moneyModel: 'pot', entryPerPlayer: 10 });
    const r = run(game, scores(8, (g) => (g === 0 ? 12 : 6)));
    for (const o of r.openSkins!) {
      expect(o.posted).toBe(4);
      expect(o.field).toBe(8);
      expect(Number.isFinite(o.low)).toBe(true);
    }
  });

  it('with carryover, the first open hole carries the skins tied before it; later ones do not say', () => {
    // Eight scratch players all making par: holes 1–6 tie, so 6 skins ride into hole 7.
    const game = makeGame({ gameMode: 'skins', indexes: Array(8).fill(0), teamCount: 2, modeSettings: { moneyModel: 'pot', entryPerPlayer: 10 } });
    const m = new Map<string, GameScore[]>();
    ids(8).forEach((id, i) => {
      const g = i < 4 ? 'm1' : 'm2';
      m.set(g, [...(m.get(g) ?? []), ...scoresFor(id, TEST_PARS).filter((s) => s.hole <= (i < 4 ? 12 : 6))]);
    });
    const r = run(game, m);
    expect(r.openSkins![0]).toMatchObject({ hole: 7, leaders: [], carriedIn: 6, posted: 4, field: 8, low: TEST_PARS[6] });
    expect(r.openSkins!.slice(1).every((o) => o.carriedIn === undefined)).toBe(true);
  });
});
