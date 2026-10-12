// Ledger corpus harness (S2 Q3, §5.cs): the money ledger of every LIVE tournament with money games,
// computed from a local read-only export, written to a JSON file so a before/after can be compared.
// SKIPPED unless LEDGER_CORPUS points at an export directory (`node scripts/export-backup.mjs`), so
// `npm test` never reads live data. Nothing here touches Supabase: scores come from the export via
// a mock of the persistence import — no app code changes (AGENTS.md "never change app code to make
// it testable").
//
//   LEDGER_CORPUS=backups/<stamp> LEDGER_OUT=.claude/ledger-before.json npx vitest run src/test/ledger-corpus.test.ts

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { GameScore } from '@/lib/game-state';

const dir = process.env.LEDGER_CORPUS ?? '';
const have = !!dir && existsSync(join(dir, 'tournaments.json'));
const scoreRows: { matchup_id: string; data: GameScore[] }[] = have
  ? JSON.parse(readFileSync(join(dir, 'game_scores.json'), 'utf-8'))
  : [];
const byMatchup = new Map(scoreRows.map((r) => [r.matchup_id, r.data]));

vi.mock('@/lib/tournament-state', async (orig) => ({
  ...(await orig<typeof import('@/lib/tournament-state')>()),
  loadGameScores: (id: string) => byMatchup.get(id) ?? null,
}));

describe.skipIf(!have)('ledger corpus — live tournaments with money games', () => {
  it('computes every ledger and writes it out', async () => {
    const { computeMoneyLedger, computeRoundPlayerDetails } = await import('@/lib/money-games');
    const rows: { id: string; data: import('@/lib/tournament-state').Tournament }[] =
      JSON.parse(readFileSync(join(dir, 'tournaments.json'), 'utf-8'));
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      const t = row.data;
      const ledger = computeMoneyLedger(t);
      if (!ledger) continue;
      out[`${t.name} (${row.id.slice(0, 8)})`] = {
        rounds: t.rounds.map((r) => ({ holes: r.holesPlaying, split: !!r.splitFormat, basis: r.handicapBasis ?? 'course' })),
        players: ledger.players.map((p) => ({ name: p.playerName, nassau: p.nassauResult, skins: p.skinsResult, net: p.netResult, moneyHcap: p.moneyHandicap })),
        rounds_nassau: ledger.nassauDetails,
        skins: ledger.skinsDetails ? { ...ledger.skinsDetails, playerSkins: Object.fromEntries(ledger.skinsDetails.playerSkins) } : null,
        // The ledger's own per-hole strokes, per round, at the Nassau allowance (what the money page shows).
        strokes: t.rounds.map((r) => {
          const d = computeRoundPlayerDetails(r, t, t.moneyGames?.teamNassau?.allowance ?? 100);
          return d ? Object.fromEntries(d.players.map((p) => [p.playerName, { hcap: p.playingHcap, perHole: p.holes.map((h) => h.strokes) }])) : null;
        }),
      };
    }
    writeFileSync(process.env.LEDGER_OUT ?? '.claude/ledger-out.json', JSON.stringify(out, null, 2));
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });
});
