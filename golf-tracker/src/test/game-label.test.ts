// F-115 (§5.da / §5.db): the game label — total risked (split beside it) · teams · format · match or
// stroke play · how a pot pays. One case per money model × format, plus the per-player stake checked
// against what the engine actually settles (§5.z: an independent oracle, not the label's own math).
import { describe, expect, it } from 'vitest';
import { gameLabel, gameTypeName, legsBetLabel, potPaysLabel, stakeTeamSizeOf, teamsWord } from '@/lib/game-label';
import { evenTeamSize, perPlayerAmount, perPlayerField, perTeamAmount } from '@/lib/game-modes/stake-unit';
import { perPlayerNets } from '@/lib/stats-ledger';
import type { PoolGame } from '@/lib/pool-game';
import { makeGame, scoresFor, TEST_PARS } from './fixtures';

const eight = [0, 0, 0, 0, 0, 0, 0, 0];

/** A classic two-foursome head-to-head match (per-player legs). */
function classicMatch(over: Partial<PoolGame> = {}): PoolGame {
  return makeGame({
    indexes: eight, teamCount: 2, moneyMode: 'match',
    matchConfig: { legDollars: { front: 10, back: 10, overall: 10 }, junkPerPoint: 0, scoring: 'holes' },
    ...over,
  });
}

/** A team game (sides engine). `sides` default: a 2v2 inside one foursome. */
function teamGame(settings: Record<string, unknown>, over: Partial<PoolGame> & { indexes?: number[]; teamCount?: number } = {}): PoolGame {
  const g = makeGame({ indexes: [0, 0, 0, 0], gameMode: 'team-2v2', ...over });
  const ids = g.players.map((p) => p.id);
  const half = ids.length / 2;
  return {
    ...g,
    sides: over.sides ?? [{ id: 'a', playerIds: ids.slice(0, half) }, { id: 'b', playerIds: ids.slice(half) }],
    modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 10, ...settings },
  };
}

describe('legsBetLabel — every partial bet follows "$40 front & back ($20/$20)"', () => {
  it.each([
    [{ front: 10, back: 10, overall: 10 }, '$30 Nassau ($10/$10/$10)'],
    [{ front: 0, back: 0, overall: 20 }, '$20 for 18 holes'],
    [{ front: 20, back: 20, overall: 0 }, '$40 front & back ($20/$20)'],
    [{ front: 10, back: 0, overall: 0 }, '$10 front 9'],
    [{ front: 0, back: 10, overall: 0 }, '$10 back 9'],
    [{ front: 5, back: 0, overall: 10 }, '$15 front & overall ($5/$10)'],
    [{ front: 0, back: 0, overall: 0 }, null],
  ])('%j → %s', (legs, want) => {
    expect(legsBetLabel(legs, '18')).toBe(want);
  });

  it('a nine plays one leg at the overall rate, named for the nine', () => {
    expect(legsBetLabel({ front: 10, back: 10, overall: 15 }, 'front9')).toBe('$15 front 9');
    expect(legsBetLabel({ front: 10, back: 10, overall: 15 }, 'back9')).toBe('$15 back 9');
  });

  it('cents show only when a stake splits unevenly', () => {
    expect(legsBetLabel({ front: 2.5, back: 2.5, overall: 2.5 }, '18')).toBe('$7.50 Nassau ($2.50/$2.50/$2.50)');
  });
});

describe('teamsWord (§5.db)', () => {
  it.each([
    [[2, 2], '2v2'], [[4, 4], '4v4'], [[1, 1], '1v1'], [[4, 4, 4], '3 teams of 4'], [[2, 2, 2, 2], '4 pairs'],
  ])('%j → %s', (sizes, want) => expect(teamsWord(sizes)).toBe(want));
});

describe('potPaysLabel', () => {
  it('equal slices → "(25% each)"', () => {
    expect(potPaysLabel({ front: 0.25, back: 0.25, overall: 0.25, junk: 0.25 }, [100]))
      .toBe('Pays front / back / overall / junk (25% each)');
  });
  it('one slice, one place → "Winner takes all"', () => {
    expect(potPaysLabel({ front: 0, back: 0, overall: 1, junk: 0 }, [100])).toBe('Winner takes all');
  });
  it('unequal slices name each share; places paid follow', () => {
    expect(potPaysLabel({ front: 25, back: 25, overall: 50, junk: 0 }, [70, 30]))
      .toBe('Pays front 25% / back 25% / overall 50%, top 2 paid (70/30)');
    expect(potPaysLabel({ front: 0, back: 0, overall: 1, junk: 0 }, [70, 30])).toBe('Pays top 2 paid (70/30)');
  });
});

describe('gameLabel — classic pool', () => {
  it('pot: the whole pot, the entry, how it pays (§5.da example)', () => {
    const g = makeGame({ indexes: eight, teamCount: 2, entryPerPlayer: 25 });
    expect(gameLabel(g)).toBe('$200 pot ($25 each) · 4v4 · best net & best gross · stroke play · Pays front / back / overall / junk (25% each)');
  });

  it('pot on a nine folds front and back into the overall', () => {
    const g = makeGame({ indexes: eight, teamCount: 2, entryPerPlayer: 25, holesPlaying: 'front9', potSplit: { front: 0.25, back: 0.25, overall: 0.5, junk: 0 } });
    expect(gameLabel(g)).toBe('$200 pot ($25 each) · 4v4 · best net & best gross · stroke play · Winner takes all');
  });

  it('match play, legs per player, junk per point', () => {
    const g = classicMatch({ matchConfig: { legDollars: { front: 10, back: 10, overall: 10 }, junkPerPoint: 5, scoring: 'holes' } });
    expect(gameLabel(g)).toBe('$30 Nassau ($10/$10/$10) · 4v4 · best net & best gross · match play · + $5 a junk point');
  });

  it('stroke-play legs, two best net, front & back only', () => {
    const g = classicMatch({ ballSelection: '2-best-net', matchConfig: { legDollars: { front: 20, back: 20, overall: 0 }, junkPerPoint: 0, scoring: 'stroke' } });
    expect(gameLabel(g)).toBe('$40 front & back ($20/$20) · 4v4 · two best net · stroke play');
  });

  it('a generalized classic pool names its teamFormat and Stableford', () => {
    const g = makeGame({ indexes: eight, teamCount: 2, entryPerPlayer: 10, teamFormat: 'scramble', teamScoreBasis: 'stableford', potSplit: { front: 0, back: 0, overall: 1, junk: 0 } });
    expect(gameLabel(g)).toBe('$80 pot ($10 each) · 4v4 · scramble · Stableford stroke play · Winner takes all');
  });

  it('no money: the label still says what is played', () => {
    const g = makeGame({ indexes: eight, teamCount: 2, entryPerPlayer: 0 });
    expect(gameLabel(g)).toBe('4v4 · best net & best gross · stroke play');
  });
});

describe('gameLabel — team game (stakes per team, shown per player)', () => {
  it('2v2 legs: $10 a team leg is $5 a player (§5.db)', () => {
    expect(gameLabel(teamGame({}))).toBe('$15 Nassau ($5/$5/$5) · 2v2 · best ball · match play');
  });

  it('format is named ALWAYS, Stableford either way', () => {
    expect(gameLabel(teamGame({ format: 'net-and-gross', scoring: 'stableford', result: 'total' })))
      .toBe('$15 Nassau ($5/$5/$5) · 2v2 · best net & best gross · Stableford stroke play');
    expect(gameLabel(teamGame({ format: 'alternate-shot', scoring: 'stableford' })))
      .toBe('$15 Nassau ($5/$5/$5) · 2v2 · alternate shot · Stableford match play');
  });

  it('overall only', () => {
    expect(gameLabel(teamGame({ legFront: 0, legBack: 0, legOverall: 40 }))).toBe('$20 for 18 holes · 2v2 · best ball · match play');
  });

  it('$/hole and $/point, per player', () => {
    expect(gameLabel(teamGame({ moneyModel: 'per-hole', dollarsPerHole: 2 }))).toBe('$1 a hole · 2v2 · best ball · match play');
    expect(gameLabel(teamGame({ moneyModel: 'per-point', dollarsPerPoint: 4, result: 'total' }))).toBe('$2 a point · 2v2 · best ball · stroke play');
  });

  it('pot: buy-in per team → whole pot + each player\'s share', () => {
    expect(gameLabel(teamGame({ moneyModel: 'pot', sideBuyIn: 20, potFront: 0, potBack: 0, potOverall: 100, potSplit: '100' })))
      .toBe('$40 pot ($10 each) · 2v2 · best ball · match play · Winner takes all');
    expect(gameLabel(teamGame({ moneyModel: 'pot', sideBuyIn: 20, potFront: 25, potBack: 25, potOverall: 50, potSplit: '100' })))
      .toBe('$40 pot ($10 each) · 2v2 · best ball · match play · Pays front 25% / back 25% / overall 50%');
  });

  it('uneven teams state the team\'s stake and say so', () => {
    const g = makeGame({ indexes: [0, 0, 0, 0, 0], gameMode: 'team-2v2' });
    const ids = g.players.map((p) => p.id);
    const game = { ...teamGame({}), players: g.players, teams: g.teams, sides: [{ id: 'a', playerIds: ids.slice(0, 3) }, { id: 'b', playerIds: ids.slice(3) }] };
    const label = gameLabel(game);
    expect(label.startsWith('$30 Nassau a team ($10/$10/$10) · ')).toBe(true);
    expect(label.endsWith(' · best ball · match play')).toBe(true);
  });

  it('junk under a non-pot model is flagged', () => {
    expect(gameLabel(teamGame({ junkEnabled: true }))).toBe('$15 Nassau ($5/$5/$5) · 2v2 · best ball · match play · + junk');
  });

  it('three teams of 4', () => {
    const g = makeGame({ indexes: [...eight, 0, 0, 0, 0], teamCount: 3, gameMode: 'team-2v2' });
    const game = { ...g, sides: g.teams.map((t, i) => ({ id: 'abc'[i], playerIds: t.playerIds })), modeSettings: { format: 'two-best-net', scoring: 'stroke', result: 'total', moneyModel: 'legs', legFront: 0, legBack: 0, legOverall: 40 } };
    expect(gameLabel(game)).toBe('$10 for 18 holes · 3 teams of 4 · two best net · stroke play');
  });

  it('a 9-hole team game plays one leg at the overall rate', () => {
    expect(gameLabel(teamGame({}, { holesPlaying: 'back9' }))).toBe('$5 back 9 · 2v2 · best ball · match play');
  });
});

describe('gameLabel — the stake is what one player actually wins (oracle: perPlayerNets)', () => {
  // Side A birdies every hole, side B pars: A sweeps every leg. Each winner's net must equal the
  // label's total — whichever engine stores the stake, and however it divides it.
  const sweep = (game: PoolGame, winners: string[]) => {
    const rows = game.players.flatMap((p) => scoresFor(p.id, TEST_PARS.map((par) => (winners.includes(p.id) ? par - 1 : par))));
    const byMatchup = new Map<string, typeof rows>();
    for (const t of game.teams) byMatchup.set(t.matchupId, rows.filter((r) => t.playerIds.includes(r.playerId)));
    return perPlayerNets(game, byMatchup);
  };
  const totalOf = (label: string) => parseFloat(label.slice(1));

  it('classic 4v4: legs are per player', () => {
    const g = classicMatch();
    const nets = sweep(g, g.teams[0].playerIds);
    const winner = nets.find((n) => n.playerId === g.teams[0].playerIds[0])!;
    expect(winner.net).toBe(totalOf(gameLabel(g)));
    expect(nets.reduce((s, n) => s + n.net, 0)).toBe(0);
  });

  it('team-game 2v2: legs are per team, so the label halves them', () => {
    const g = teamGame({});
    const nets = sweep(g, g.sides![0].playerIds);
    const winner = nets.find((n) => n.playerId === g.sides![0].playerIds[0])!;
    expect(winner.net).toBe(totalOf(gameLabel(g)));
    expect(nets.reduce((s, n) => s + n.net, 0)).toBe(0);
  });
});

describe('gameTypeName — the short name for an unnamed event or round', () => {
  it('teams + format', () => {
    expect(gameTypeName(makeGame({ indexes: eight, teamCount: 2 }))).toBe('4v4 best net & best gross');
    expect(gameTypeName(teamGame({}))).toBe('2v2 best ball');
  });
});

describe('§5.dd: stakes per player (display only)', () => {
  it('a one-foursome team game with no stored sides reads as the 2v2 the engine plays', () => {
    const g = { ...makeGame({ indexes: [0, 6, 12, 18], gameMode: 'team-2v2' }), modeSettings: { format: 'best-ball', scoring: 'stroke', result: 'match', moneyModel: 'legs', legFront: 10, legBack: 10, legOverall: 10 } };
    expect(gameLabel(g)).toBe('$15 Nassau ($5/$5/$5) · 2v2 · best ball · match play');
    expect(stakeTeamSizeOf(g)).toBe(2);
  });

  it('team size: even teams only, never a team of one, never a classic pool', () => {
    expect(evenTeamSize([2, 2])).toBe(2);
    expect(evenTeamSize([4, 4, 4])).toBe(4);
    expect(evenTeamSize([3, 2])).toBeNull();
    expect(evenTeamSize([1, 1])).toBeNull();
    expect(stakeTeamSizeOf(classicMatch())).toBeNull();
  });

  it('per player ↔ per team round-trips, so editing a stake never drifts', () => {
    for (const k of [2, 4]) for (const v of [0, 5, 7.5, 10, 25]) expect(perTeamAmount(perPlayerAmount(v * k, k), k)).toBe(v * k);
  });

  it('the field reads per player, and a cleared field falls back to the per-player default', () => {
    const f = perPlayerField({ key: 'legFront', label: 'Front 9 ($)', type: 'number', defaultValue: 10 }, 2);
    expect([f.label, f.defaultValue]).toEqual(['Front 9 ($ / player)', 5]);
    expect(perPlayerField({ key: 'dollarsPerHole', label: '$ per hole won', type: 'number', defaultValue: 2 }, 2).label).toBe('$ per hole won (per player)');
    expect(perPlayerField({ key: 'sideBuyIn', label: 'Buy-in ($ / team)', type: 'number', defaultValue: 20 }, 4).label).toBe('Entry ($ / player)');
  });
});
