// F-069 (§5.bw): every team format the wizard or the hub offers is actually computed. The engine's
// switch ends in `case 'best-ball': default:`, so a format the UI offers but the engine doesn't
// know would silently score as best ball: a real game paid on the wrong rule, with no error.
//
// The wizard and the classic hub read TEAM_FORMAT_OPTIONS; the hub for team games reads the
// team-game mode's own `format` setting. Both lists must be the same set, and each format must
// reach its own arm: on a probe hole where every format scores differently, none may equal best ball.

import { describe, expect, it } from 'vitest';
import { GAME_MODES } from '@/lib/game-modes';
import { TEAM_FORMAT_OPTIONS, teamNetOnHole, teamValueOnHole, type TeamFormat } from '@/lib/game-modes/team-scoring';

const hole = { number: 1, par: 4, handicap: 1 };
// Grosses 4/6/5, nets 3/4/5: best ball 3, two best net 7, two best gross 9, net + gross 8,
// combined 12, one ball 4 (the low gross, no team strokes).
const gross: Record<string, number> = { p1: 4, p2: 6, p3: 5 };
const net: Record<string, number> = { p1: 3, p2: 4, p3: 5 };
const input = (format: TeamFormat) => ({
  playerIds: ['p1', 'p2', 'p3'], hole, format,
  grossOnHole: (id: string) => gross[id], netOnHole: (id: string) => net[id],
  teamHandicap: 0, numHoles: 18,
});

describe('F-069: every format offered is computed', () => {
  it('the team-game hub offers exactly the formats the wizard offers', () => {
    const teamGame = GAME_MODES.find((m) => m.id === 'team-2v2')!;
    const setting = teamGame.settings.find((s) => s.key === 'format')!;
    const hub = (setting.options ?? []).map((o) => o.value).sort();
    expect(hub).toEqual(TEAM_FORMAT_OPTIONS.map((o) => o.format).sort());
  });

  it('each format reaches its own rule, not the best-ball fallback', () => {
    const want: Record<TeamFormat, number> = {
      'best-ball': 3, 'two-best-net': 7, 'two-best-gross': 9, 'net-and-gross': 8,
      combined: 12, scramble: 4, 'alternate-shot': 4,
    };
    for (const o of TEAM_FORMAT_OPTIONS) expect(teamNetOnHole(input(o.format)), o.format).toBe(want[o.format]);
  });

  it('every format scores under Stableford too', () => {
    // Distinctness is the stroke test's job: points bunch up (gross 4 + 5 on a par 4 is 2 + 1,
    // the same 3 points as one net birdie), so a Stableford probe can't tell arms apart.
    for (const o of TEAM_FORMAT_OPTIONS) expect(teamValueOnHole(input(o.format), 'stableford'), o.format).not.toBeNull();
  });
});
