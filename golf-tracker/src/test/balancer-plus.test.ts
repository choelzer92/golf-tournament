// F-102 c (§5.bx): the Optimal balancer must find the most even split when a handicap is
// negative — a plus player, or a scratch playing off an easy tee. Its branch-and-bound pruned on
// "a team's sum only grows", which a plus player placed later breaks; and its symmetry prune
// treated two empty teams as interchangeable when one had an extra seat (an odd field), plus
// players or not. The oracle is brute force over every assignment with the same team sizes.

import { describe, expect, it } from 'vitest';
import { balanceTeamsByHandicap } from '@/lib/pool-game';
import { makePlayers } from './fixtures';

function bruteSpread(hs: number[], nt: number): number {
  const n = hs.length;
  const caps = Array.from({ length: nt }, (_, i) => Math.floor(n / nt) + (i < n % nt ? 1 : 0));
  let best = Infinity;
  const sums = new Array(nt).fill(0), seats = new Array(nt).fill(0);
  const rec = (i: number) => {
    if (i === n) { best = Math.min(best, Math.max(...sums) - Math.min(...sums)); return; }
    for (let t = 0; t < nt; t++) {
      if (seats[t] >= caps[t]) continue;
      sums[t] += hs[i]; seats[t]++; rec(i + 1); sums[t] -= hs[i]; seats[t]--;
    }
  };
  rec(0);
  return best;
}

// Deterministic pseudo-random fields (no Math.random in tests that must reproduce).
function lcg(seed: number) { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; }

function missesAgainstBrute(seed: number, low: number, plus: boolean): string[] {
  const rnd = lcg(seed);
  const misses: string[] = [];
  for (let k = 0; k < 400; k++) {
    const n = 6 + Math.floor(rnd() * 4);
    const nt = 2 + Math.floor(rnd() * 2);
    const hs = Array.from({ length: n }, () => Math.round((rnd() * 30 + low) * 10) / 10);
    if (plus && !hs.some((h) => h < 0)) hs[0] = -3.4;
    const players = makePlayers(hs);
    const teams = balanceTeamsByHandicap(players, nt, (p) => p.handicapIndex ?? 0);
    const byId = new Map(players.map((p) => [p.id, p.handicapIndex ?? 0]));
    const sums = teams.map((t) => t.reduce((s, id) => s + byId.get(id)!, 0));
    const got = Math.max(...sums) - Math.min(...sums);
    const want = bruteSpread(hs, nt);
    if (got > want + 1e-9) misses.push(`[${hs.join(', ')}] into ${nt}: ${got.toFixed(1)} vs ${want.toFixed(1)}`);
  }
  return misses;
}

describe('F-102 c: the Optimal balancer is optimal', () => {
  it('matches brute force on 400 small fields with plus players (2–3 teams, 6–9 players)', () => {
    expect(missesAgainstBrute(7, -6, true)).toEqual([]);
  });

  it('matches brute force on 400 all-positive fields, odd sizes included', () => {
    expect(missesAgainstBrute(11, 0, false)).toEqual([]);
  });
});
