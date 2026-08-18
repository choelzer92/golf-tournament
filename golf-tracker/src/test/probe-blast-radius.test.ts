// THROWAWAY PROBE for Craig's question: does changing the side game's `legs` tie rule
// touch (a) pot mode, or (b) a classic pool of 4 foursomes?
//
// Pins what those two produce TODAY. If the F-017 change is confined to payLeg, these
// numbers must be identical before and after it.
import { describe, expect, it } from 'vitest';
import { getGameMode } from '@/lib/game-modes';
import { buildGameModeContext } from '@/lib/game-modes/context';
import { computePoolResult } from '@/lib/pool-game';
import { makeGame, makeTeam, scoresFor, scoreMap, singleMatchup, TEST_PARS } from './fixtures';

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
const par = HOLES.map((h) => TEST_PARS[h - 1]);
const over = (n: number) => HOLES.map((h) => TEST_PARS[h - 1] + n);

describe('PROBE: blast radius of an F-017 change to payLeg', () => {
  it('SIDE GAME in POT mode — three sides, top two tied (does NOT use payLeg)', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1', 'p2'] },
        { id: 'b', playerIds: ['p3', 'p4'] },
        { id: 'c', playerIds: ['p5', 'p6'] },
      ],
      modeSettings: {
        format: 'best-ball', scoring: 'stroke', result: 'total',
        moneyModel: 'pot', sideBuyIn: 20, potSplit: '100',
      },
    });
    const r = getGameMode('team-2v2')!.compute(buildGameModeContext(g, singleMatchup([
      ...scoresFor('p1', par), ...scoresFor('p2', par),
      ...scoresFor('p3', par), ...scoresFor('p4', par),
      ...scoresFor('p5', over(1)), ...scoresFor('p6', over(1)),
    ])));
    const money = Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]));
    console.log('POT, tied leaders:', JSON.stringify(money));
    // A and B tie for 1st and SPLIT the pot; C is last and loses its ante.
    expect(money).toEqual({ A: 10, B: 10, C: -20 });
    expect(r.standings.reduce((t, s) => t + s.moneyNet, 0)).toBeCloseTo(0, 6);
  });

  it('CLASSIC POOL, 4 foursomes, pot — a different function entirely', () => {
    const g = makeGame({
      indexes: [0, 0, 0, 0, 0, 0, 0, 0],
      entryPerPlayer: 25,
      positionSplit: [70, 30],
      teams: [
        makeTeam(1, ['p1', 'p2'], { matchupId: 'm1' }),
        makeTeam(2, ['p3', 'p4'], { matchupId: 'm2' }),
        makeTeam(3, ['p5', 'p6'], { matchupId: 'm3' }),
        makeTeam(4, ['p7', 'p8'], { matchupId: 'm4' }),
      ],
    });
    const r = computePoolResult(g, scoreMap(
      ['m1', [...scoresFor('p1', over(-1)), ...scoresFor('p2', over(-1))]],
      ['m2', [...scoresFor('p3', par), ...scoresFor('p4', par)]],
      ['m3', [...scoresFor('p5', over(1)), ...scoresFor('p6', over(1))]],
      ['m4', [...scoresFor('p7', over(2)), ...scoresFor('p8', over(2))]],
    ));
    console.log('CLASSIC POOL 4 foursomes, payouts:', JSON.stringify(r.payouts));
    console.log('pot:', r.pot, 'legs:', JSON.stringify(r.legs.map((l) => [l.label, l.amount])));
    // Pinned as-is. These must not move when payLeg changes.
    expect(r.payouts.length).toBeGreaterThan(0);
  });

  it('SIDE GAME in legs mode is the ONLY thing that should move', () => {
    const g = makeGame({
      gameMode: 'team-2v2', indexes: [0, 0, 0, 0, 0, 0],
      sides: [
        { id: 'a', playerIds: ['p1', 'p2'] },
        { id: 'b', playerIds: ['p3', 'p4'] },
        { id: 'c', playerIds: ['p5', 'p6'] },
      ],
      modeSettings: {
        format: 'best-ball', scoring: 'stroke', result: 'total',
        moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 10,
      },
    });
    const r = getGameMode('team-2v2')!.compute(buildGameModeContext(g, singleMatchup([
      ...scoresFor('p1', par), ...scoresFor('p2', par),
      ...scoresFor('p3', par), ...scoresFor('p4', par),
      ...scoresFor('p5', over(1)), ...scoresFor('p6', over(1)),
    ])));
    console.log('LEGS, tied leaders (TODAY):', JSON.stringify(
      Object.fromEntries(r.standings.map((s) => [s.playerId, s.moneyNet]))));
    console.log('LEGS statuses:', JSON.stringify(r.teamLegs?.map((l) => [l.label, l.status, l.winner])));
  });
});
