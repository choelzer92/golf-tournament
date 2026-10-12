// Strokes corpus harness (F-108, §5.ct): every stroke the app gives in every LIVE tournament round
// and pool game, from a local read-only export, written to JSON so an allocator change can be
// diffed before it ships. SKIPPED unless LEDGER_CORPUS points at an export directory, so `npm test`
// never reads live data; nothing touches Supabase (scores aren't needed — strokes come from
// handicaps, tees and stroke indexes only).
//
//   LEDGER_CORPUS=backups/<stamp> STROKES_OUT=.claude/strokes-after.json npx vitest run src/test/strokes-corpus.test.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getHoleDataForRound, getPlayerStrokesForHole } from '@/lib/live-scoring';
import { buildHcapMap, getGameHoles, numHolesForStrokes, playerHoleStrokeIndexForGame, type PoolGame } from '@/lib/pool-game';
import { getMoneyStrokesOnHole } from '@/lib/money-games';
import type { Tournament } from '@/lib/tournament-state';

const dir = process.env.LEDGER_CORPUS ?? '';
const have = !!dir && existsSync(join(dir, 'tournaments.json'));

describe.skipIf(!have)('strokes corpus — every live round and game', () => {
  it('writes every player\'s strokes per hole', () => {
    const out: Record<string, number[]> = {};
    const tours: { id: string; data: Tournament }[] = JSON.parse(readFileSync(join(dir, 'tournaments.json'), 'utf-8'));
    for (const { id, data: t } of tours) {
      t.rounds.forEach((r, ri) => {
        const holes = getHoleDataForRound(r);
        for (const m of r.matchups) {
          for (const pid of m.playerIds) {
            out[`T ${t.name} ${id.slice(0, 6)} R${ri + 1} ${t.players.find((p) => p.id === pid)?.name}`] =
              holes.map((h) => getPlayerStrokesForHole(pid, h.handicap, h.number, m, r, t));
          }
        }
      });
    }
    const pools: { id: string; data: PoolGame }[] = JSON.parse(readFileSync(join(dir, 'pool_games.json'), 'utf-8'));
    for (const { id, data: g } of pools) {
      if (!g.course || !g.players?.length) continue;
      const map = buildHcapMap(g);
      const holes = getGameHoles(g);
      const n = numHolesForStrokes(g);
      for (const p of g.players) {
        out[`P ${g.name} ${id.slice(0, 6)} ${p.name}`] = holes.map((h) =>
          getMoneyStrokesOnHole(map.get(p.id) ?? 0, playerHoleStrokeIndexForGame(g, p, h.number, h.handicap), n));
      }
    }
    writeFileSync(process.env.STROKES_OUT ?? '.claude/strokes-out.json', JSON.stringify(out));
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });
});
