// MONEY IS SHOWN PER PLAYER (DECISIONS §5.dd, F-121). Display only, no settlement change.
//
// The team engine stores its stakes per TEAM: a leg, $/hole, $/point, the junk rate and the junk pot
// are won or lost by the team, then split evenly across its players (`perPlayerNets`); a pot's buy-in
// is per team. Craig: "the money amount should be per player unless its showing the size of the
// overall pot." When every team is the same size the two are one number apart, so the money step
// asks per player and stores × team size. Every saved game, the engine and every payout stay as they
// were. Uneven teams have no single per-player figure, so they keep asking per team until the uneven
// payout rule (§5.dd, later) is built.

import type { FormatSetting } from '../formats';

/** The team engine's settings that hold a per-team dollar amount. */
export const TEAM_STAKE_KEYS: ReadonlySet<string> = new Set([
  'legFront', 'legBack', 'legOverall', 'dollarsPerHole', 'dollarsPerPoint', 'sideBuyIn', 'junkPerPoint', 'junkPot',
]);

/** The players on every team, when all teams are the same size (and bigger than one); else null. */
export function evenTeamSize(sizes: number[]): number | null {
  if (sizes.length < 2 || sizes.some((k) => k !== sizes[0])) return null;
  return sizes[0] > 1 ? sizes[0] : null;
}

/** A stored per-team amount as one player's share: cents only when it doesn't divide evenly. */
export function perPlayerAmount(perTeam: number, teamSize: number): number {
  return Math.round((perTeam / teamSize) * 100) / 100;
}

/** One player's amount back to the per-team value the engine stores. */
export function perTeamAmount(perPlayer: number, teamSize: number): number {
  return Math.round(perPlayer * teamSize * 100) / 100;
}

/** The field as it's asked per player: its label, and its default as one player's share (a cleared
 *  field falls back to the default, which must be in the same unit as what's typed). */
export function perPlayerField(s: FormatSetting, teamSize: number): FormatSetting {
  const defaultValue = perPlayerAmount(Number(s.defaultValue) || 0, teamSize);
  if (s.key === 'sideBuyIn') {
    return { ...s, defaultValue, label: 'Entry ($ / player)', hint: 'Each player puts this in; the pot is everyone’s entry. The best team takes it — or each slice of it; ties split.' };
  }
  const label = s.label.includes('($)') ? s.label.replace('($)', '($ / player)') : `${s.label} (per player)`;
  return { ...s, defaultValue, label };
}
