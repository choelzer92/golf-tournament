import type { FormatSetting } from '../formats';
import type { SettingsBag, SettingValue, PlayerStanding, NassauLegLine, GameModeContext, JunkLine } from './types';
import { settleNassau } from './types';

// Read a setting value with the descriptor's default as fallback. Centralizes
// the "stored value or norm default" logic every mode + the editor needs.
export function settingValue(schema: FormatSetting[], bag: SettingsBag, key: string): SettingValue {
  if (key in bag && bag[key] !== undefined && bag[key] !== '') return bag[key];
  const def = schema.find((s) => s.key === key);
  return def ? def.defaultValue : '';
}

export function numberSetting(schema: FormatSetting[], bag: SettingsBag, key: string): number {
  const v = settingValue(schema, bag, key);
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

export function boolSetting(schema: FormatSetting[], bag: SettingsBag, key: string): boolean {
  const v = settingValue(schema, bag, key);
  return v === true || v === 'true';
}

export function stringSetting(schema: FormatSetting[], bag: SettingsBag, key: string): string {
  return String(settingValue(schema, bag, key));
}

// Parse a comma/space-separated point vector like "5,3,1" or "5 3 1" into
// numbers, dropping blanks/NaN. Empty input returns [].
export function parseVector(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => parseFloat(x))
    .filter((n) => !isNaN(n));
}

// Full defaults bag for a descriptor's settings — used when creating a game so
// modeSettings starts populated with the norm values (editable thereafter).
export function defaultSettings(schema: FormatSetting[]): SettingsBag {
  const bag: SettingsBag = {};
  for (const s of schema) bag[s.key] = s.defaultValue;
  return bag;
}

// --- Shared Nassau-pot money settings ---------------------------------------
// Reused across every individual game so "buy-in, split front/back/total" is
// configured identically everywhere. Games spread NASSAU_SETTINGS into their
// SETTINGS after their existing money settings. Inert unless the game's money
// model routes to settleNassau. Amounts are PER PLAYER and independent per
// segment (e.g. 5 / 5 / 20 to make the Total the big prize); everyone antes the
// sum of the segments in play. Total-only ignores the front/back amounts.
// Every Nassau field is gated on moneyModel = 'nassau', so games that offer the
// Nassau option only surface these once it's chosen. Front/Back additionally
// require the 3-way split. `moneyModel` is the shared key each game uses for its
// money select — games that expose Nassau MUST use that key for consistency.
export const NASSAU_SETTINGS: FormatSetting[] = [
  {
    key: 'nassauSplit', label: 'Nassau split', type: 'select',
    options: [
      { value: 'three', label: 'Front / Back / Total (3-way)' },
      { value: 'total', label: 'Total only' },
    ],
    defaultValue: 'three',
    hint: 'Contest three segments (front 9 / back 9 / total) or a single total pot.',
    showIf: { key: 'moneyModel', in: ['nassau'] },
  },
  {
    key: 'nassauFront', label: 'Front 9 ($ / player)', type: 'number', defaultValue: 10,
    hint: '3-way only. Everyone antes this for the front-9 pot; low/high leader takes it.',
    showIf: [{ key: 'moneyModel', in: ['nassau'] }, { key: 'nassauSplit', in: ['three'] }],
  },
  {
    key: 'nassauBack', label: 'Back 9 ($ / player)', type: 'number', defaultValue: 10,
    hint: '3-way only. Ante for the back-9 pot.',
    showIf: [{ key: 'moneyModel', in: ['nassau'] }, { key: 'nassauSplit', in: ['three'] }],
  },
  {
    key: 'nassauTotal', label: 'Total ($ / player)', type: 'number', defaultValue: 10,
    hint: 'Ante for the 18-hole total pot. Used in both split modes.',
    showIf: { key: 'moneyModel', in: ['nassau'] },
  },
];

// Settle a game via the Nassau pot when its money model selected it. Returns the
// segment leg lines (for IndividualResult.nassauLegs) and mutates moneyNet; pass
// the game's own SETTINGS + bag so the amounts read through the same defaults.
// `higherIsBetter` false for lower-is-better games (Low Total). Total-only zeros
// the front/back amounts so only the total pot is contested.
export function settleNassauFromSettings(
  schema: FormatSetting[],
  bag: SettingsBag,
  standings: PlayerStanding[],
  higherIsBetter = true,
): NassauLegLine[] {
  const totalOnly = stringSetting(schema, bag, 'nassauSplit') === 'total';
  const amounts = {
    front: totalOnly ? 0 : numberSetting(schema, bag, 'nassauFront'),
    back: totalOnly ? 0 : numberSetting(schema, bag, 'nassauBack'),
    total: numberSetting(schema, bag, 'nassauTotal'),
  };
  return settleNassau(standings, amounts, higherIsBetter);
}

// --- Shared junk / bonus money -----------------------------------------------
// Birdies, eagles, albatrosses paid as a BONUS on top of whatever the game's own money model
// settles. The classic pool has always had junk, but it was team-scoped and lived entirely in
// pool-game.ts, so none of the game modes could offer it.
//
// ONE VOCABULARY (Phase 3, DECISIONS.md §5.bq, 2026-09-17). Junk is counted in POINTS — birdie 1,
// eagle 2, albatross 5 by default — exactly as the classic pool counts it, and the points are paid
// one of two ways Craig's groups actually play:
//   • `junkPayout: 'per-point'` — every point is worth `junkPerPoint` dollars ("each junk point is
//     worth 5 dollars"). Each earner collects from every other player / side — zero-sum.
//   • `junkPayout: 'pot'`       — a stated `junkPot` is anted equally by everyone in play and goes
//     to whoever has the MOST points; ties split it ("whichever foursome has the most junk points
//     receives the junk pot" — the Warriors).
// Before Phase 3 this layer read `junkBirdie` etc. as DOLLARS per item. Every saved game reads the
// same numbers as points at the default $1 per point, so no settlement moves — pinned by
// phase3-junk-vocabulary.test.ts alongside the older goldens.
//
// Group hug is omitted here — it's a TEAM idea (every player on the side at par or better) and is
// counted by the side settlement, not per player.
//
// Set every value to 0 (the default) and the whole layer is inert — existing games are unchanged.
export const JUNK_SETTINGS: FormatSetting[] = [
  {
    key: 'junkEnabled', label: 'Birdie / eagle bonuses', type: 'toggle', defaultValue: false,
    hint: 'Count junk points for birdies and better, on top of the game money. Pay them per point, or as a junk pot to the most points.',
  },
  {
    key: 'junkBirdie', label: 'Birdie (pts)', type: 'number', defaultValue: 1,
    hint: 'Junk points per birdie (1 under par).',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
  {
    key: 'junkEagle', label: 'Eagle (pts)', type: 'number', defaultValue: 2,
    hint: 'Junk points per eagle (2 under). Replaces the birdie on that hole, not added to it.',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
  {
    key: 'junkAlbatross', label: 'Albatross (pts)', type: 'number', defaultValue: 5,
    hint: 'Junk points per double eagle (3+ under).',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
  {
    key: 'junkCtp', label: 'Closest to the pin (pts)', type: 'number', defaultValue: 0,
    hint: 'Junk points for closest to the pin on each par 3. The scorer picks the winner on the hole. 0 = not played.',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
  {
    key: 'junkPayout', label: 'Junk pays', type: 'select',
    options: [
      { value: 'per-point', label: '$ per point (each earner collects from the others)' },
      { value: 'pot', label: 'Junk pot (most points takes it, ties split)' },
    ],
    defaultValue: 'per-point',
    hint: 'Per point: every junk point is worth a set amount. Pot: everyone antes into one junk pot and the most points wins it.',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
  {
    key: 'junkPerPoint', label: '$ per junk point', type: 'number', defaultValue: 1,
    hint: 'What one junk point is worth, collected from each other player or team.',
    showIf: [{ key: 'junkEnabled', in: ['true'] }, { key: 'junkPayout', in: ['per-point'] }],
  },
  {
    key: 'junkPot', label: 'Junk pot ($)', type: 'number', defaultValue: 20,
    hint: 'The whole junk pot. Everyone in play antes an equal share; the most junk points takes it, ties split.',
    showIf: [{ key: 'junkEnabled', in: ['true'] }, { key: 'junkPayout', in: ['pot'] }],
  },
  {
    key: 'junkBasis', label: 'Bonuses count', type: 'select',
    options: [{ value: 'gross', label: 'Gross score' }, { value: 'net', label: 'Net score' }],
    defaultValue: 'gross',
    hint: 'Gross is the normal way — a birdie is a real birdie. Net counts handicap strokes, so more bonuses get paid.',
    showIf: { key: 'junkEnabled', in: ['true'] },
  },
];

// Count birdies/eagles/albatrosses per player and settle them zero-sum onto
// `standings.moneyNet`. Returns the per-player breakdown, or null when the layer
// is off or every amount is zero (so callers can skip the UI entirely).
//
// Settlement: an earner collects their bonus from EACH other player, so a birdie
// worth $1 in a foursome pays the earner $3 and costs the other three $1 each.
// That keeps it zero-sum and matches how these are actually settled on the card.
export function settleJunkFromSettings(
  schema: FormatSetting[],
  bag: SettingsBag,
  ctx: GameModeContext,
  standings: PlayerStanding[],
): JunkLine[] | null {
  const lines = tallyJunk(schema, bag, ctx);
  if (!lines) return null;
  const byId = new Map(lines.map((l) => [l.playerId, l]));

  if (junkPayout(schema, bag) === 'pot') {
    // JUNK POT: everyone who has played antes an equal share; the most points takes it, ties split.
    const inPlay = standings.filter((s) => s.thru > 0);
    settleJunkPot(
      numberSetting(schema, bag, 'junkPot'),
      inPlay.map((s) => ({ points: byId.get(s.playerId)?.points ?? 0, pay: (d) => { s.moneyNet += d; } })),
    );
    return lines;
  }

  // $ PER POINT, zero-sum: each earner collects from every other player.
  const n = lines.length;
  if (n > 1) {
    const totalPaidOut = lines.reduce((s, l) => s + l.dollars, 0);
    for (const st of standings) {
      const mine = byId.get(st.playerId)?.dollars ?? 0;
      // Collect `mine` from each of the (n-1) others, and pay each other
      // player's bonus once: mine*(n-1) - (everyone else's total).
      st.moneyNet += mine * (n - 1) - (totalPaidOut - mine);
    }
  }
  return lines;
}

export function junkPayout(schema: FormatSetting[], bag: SettingsBag): 'per-point' | 'pot' {
  return stringSetting(schema, bag, 'junkPayout') === 'pot' ? 'pot' : 'per-point';
}

// The junk POT rule, shared by the individual and side settlements: `pot` dollars, anted equally by
// every participant in play, paid to the participant(s) with the most points — a tie splits the pot.
// All-zero points = everyone tied = everyone gets their ante back (nothing moves). Zero-sum by
// construction: antes in = pot out.
function settleJunkPot(pot: number, participants: { points: number; pay: (dollars: number) => void }[]): void {
  const n = participants.length;
  if (pot <= 0 || n < 2) return;
  const top = Math.max(...participants.map((p) => p.points));
  const winners = participants.filter((p) => p.points === top);
  const ante = pot / n;
  const share = pot / winners.length;
  for (const p of participants) p.pay((p.points === top ? share : 0) - ante);
}

// SIDE variant: junk is earned by INDIVIDUALS but settled between SIDES, because a side game's
// money is between sides, not a free-for-all among four players. Returns the same per-player
// breakdown for the leaderboard.
//
// THE RULE, at N sides: each side COLLECTS ITS OWN JUNK FROM EVERY OTHER SIDE, and pays each
// other side theirs — `mine × (N−1) − (everyone else's total)`. Craig's call, DECISIONS.md §5.ad.
//
// At two sides that reduces to exactly the old straight differential (`mine − theirs`), so no
// existing 2v2 game moves a cent — pinned by two-side-golden.test.ts. FINDINGS.md F-006 had
// proposed a field-average settlement here instead; that HALVES the two-side payout ($1 where
// the shipped tests assert $2), which is why it was rejected. It's also the same shape as
// settleJunkFromSettings, so the individual and side paths now settle bonuses identically.
export function settleJunkForSides(
  schema: FormatSetting[],
  bag: SettingsBag,
  ctx: GameModeContext,
  standings: PlayerStanding[],
  sides: { id: string; playerIds: string[] }[],
  // Phase 3 step 4: under a BUY-IN pot the junk pot is a SLICE of that pot (§5.bq Q-E), settled by
  // the game's pot code with antes already in the buy-in. The caller says so, and this function then
  // only tallies — it must not also collect a separate `junkPot` ante.
  opts: { junkPotInBuyIn?: boolean } = {},
): { lines: JunkLine[]; sides: SideJunk[] } | null {
  const tally = tallyJunkForSides(schema, bag, ctx, sides);
  if (!tally) return null;
  const { lines, sides: sideJunk } = tally;
  const n = sides.length;
  const perPoint = junkPayout(schema, bag) === 'pot' ? 0 : numberSetting(schema, bag, 'junkPerPoint');
  if (n < 2) return tally;

  // Standings for a side game are the SIDES, keyed by the side id uppercased ('A','B','C').
  const standingOf = (side: { id: string }) => standings.find((s) => s.playerId === side.id.toUpperCase());

  if (junkPayout(schema, bag) === 'pot') {
    if (opts.junkPotInBuyIn) return tally;
    // JUNK POT between sides (§5.bq): every side that has played antes an equal share; the side
    // with the most junk points takes the pot, ties split it.
    const inPlay = sides.map((side, idx) => ({ st: standingOf(side), points: sideJunk[idx].points })).filter((x) => x.st && x.st.thru > 0);
    settleJunkPot(
      numberSetting(schema, bag, 'junkPot'),
      inPlay.map(({ st, points }) => ({ points, pay: (d) => { st!.moneyNet += d; } })),
    );
    return { lines, sides: sideJunk };
  }

  // $ PER POINT: each side collects its own junk dollars from every other side (§5.ad).
  const earned = sideJunk.map((s) => s.points * perPoint);
  const total = earned.reduce((s, v) => s + v, 0);
  sides.forEach((side, idx) => {
    const st = standingOf(side);
    if (!st) return;
    st.moneyNet += earned[idx] * (n - 1) - (total - earned[idx]);
  });
  return { lines, sides: sideJunk };
}

export interface SideJunk { id: string; points: number; groupHugs: number }

// Each side's junk POINTS without settling anything: its members' lines summed plus its group-hug
// points (Phase 3 step 2). Null when the junk layer is off. The team engine's pot reads this to
// rank the junk SLICE (Phase 3 step 4); `settleJunkForSides` reads it to pay per point or a pot.
export function tallyJunkForSides(
  schema: FormatSetting[],
  bag: SettingsBag,
  ctx: GameModeContext,
  sides: { id: string; playerIds: string[] }[],
): { lines: JunkLine[]; sides: SideJunk[] } | null {
  const lines = tallyJunk(schema, bag, ctx);
  if (!lines) return null;
  const hugPts = numberSetting(schema, bag, 'junkGroupHug');
  const sum = (ids: string[]) => ids.reduce((s, id) => s + (lines.find((l) => l.playerId === id)?.points ?? 0), 0);
  const sideJunk: SideJunk[] = sides.map((side) => {
    const groupHugs = hugPts > 0 ? countGroupHugs(ctx, side.playerIds) : 0;
    return { id: side.id, points: sum(side.playerIds) + groupHugs * hugPts, groupHugs };
  });
  return { lines, sides: sideJunk };
}

// Count each player's birdies/eagles/albatrosses and their gross bonus dollars,
// WITHOUT settling. Shared by the individual and 2v2 settlements above; null when
// the layer is off or every amount is zero.
export function tallyJunk(
  schema: FormatSetting[],
  bag: SettingsBag,
  ctx: GameModeContext,
): JunkLine[] | null {
  if (!boolSetting(schema, bag, 'junkEnabled')) return null;
  const amt = {
    birdie: numberSetting(schema, bag, 'junkBirdie'),
    eagle: numberSetting(schema, bag, 'junkEagle'),
    albatross: numberSetting(schema, bag, 'junkAlbatross'),
  };
  const ctpPts = numberSetting(schema, bag, 'junkCtp');
  const hugPts = numberSetting(schema, bag, 'junkGroupHug');   // 0 for schemas without it
  const customDefs = ctx.customBonuses ?? [];
  if (amt.birdie === 0 && amt.eagle === 0 && amt.albatross === 0 && ctpPts === 0 && hugPts === 0 && customDefs.length === 0) return null;
  const useNet = stringSetting(schema, bag, 'junkBasis') === 'net';
  // Points → dollars at the game's rate. Under a junk POT no point has a price of its own.
  const perPoint = junkPayout(schema, bag) === 'pot' ? 0 : numberSetting(schema, bag, 'junkPerPoint');
  const customPointsById = new Map(customDefs.map((b) => [b.id, b.points]));

  return ctx.players.map((p) => {
    let birdies = 0, eagles = 0, albatrosses = 0, ctps = 0, custom = 0;
    for (const hole of ctx.holes) {
      // Closest to the pin: the hole's named winner, par 3s only (a pick recorded on any other
      // hole is ignored, as the classic pool ignores it).
      if (ctpPts > 0 && hole.par === 3 && ctx.ctpWinners?.[hole.number] === p.id) ctps++;
      // Hand-tracked bonuses marked for this player on this hole, at the game's point values.
      for (const id of ctx.bonusMarks?.[hole.number]?.[p.id] ?? []) custom += customPointsById.get(id) ?? 0;
      const score = useNet ? ctx.netOnHole(p.id, hole) : ctx.grossOnHole(p.id, hole);
      if (score === null) continue;
      const diff = score - hole.par;
      if (diff <= -3) albatrosses++;
      else if (diff === -2) eagles++;
      else if (diff === -1) birdies++;
    }
    const points = birdies * amt.birdie + eagles * amt.eagle + albatrosses * amt.albatross + ctps * ctpPts + custom;
    return { playerId: p.id, playerName: p.name, birdies, eagles, albatrosses, ctps, custom, points, dollars: points * perPoint };
  });
}

// GROUP HUG (the classic pool's "all par"): a hole where EVERY member of the side has scored and
// nobody is over par (gross, as the classic pool counts it) earns the SIDE a point. Counted here
// rather than per player because no one player earns it.
export function countGroupHugs(ctx: GameModeContext, playerIds: string[]): number {
  if (playerIds.length === 0) return 0;
  let hugs = 0;
  for (const hole of ctx.holes) {
    let all = true;
    for (const pid of playerIds) {
      const g = ctx.grossOnHole(pid, hole);
      if (g === null || g > hole.par) { all = false; break; }
    }
    if (all) hugs++;
  }
  return hugs;
}
