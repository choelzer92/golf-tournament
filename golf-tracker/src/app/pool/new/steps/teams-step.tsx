'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { CourseSelection, Player } from '@/lib/game-state';
import {
  type PoolGame,
  type PoolTeam,
  captainsDealTeams,
  pickCaptains,
  sortPlayerIdsByHcap,
  orderPlayerIdsWithCaptain,
} from '@/lib/pool-game';
import { PairingLocks } from '@/components/pairing-locks';
import { CaptainsPanel } from '@/components/captains-panel';
import { dealBalancedTeams } from '@/lib/match-cards';

function makeTeam(index: number, playerIds: string[], captainId?: string, blankName = false): PoolTeam {
  return {
    id: crypto.randomUUID(),
    // Money teams that share foursomes (F-071) start unnamed: the board names them after their
    // players ("Craig & Jym") unless the organizer types a name, exactly as the sides always did.
    name: blankName ? '' : `Team ${index + 1}`,
    playerIds,
    matchupId: crypto.randomUUID(),
    teeTime: '',
    captainId,
  };
}

// F-019: the proposed TEE SHEET for a side game — who walks with whom, before anyone says a word
// about money. `groupShapesFor` supplies the shape (8 → 4+4, 7 → 4+3, 5 → 3+2, and never a group
// of five), and the field is dealt into it low→high so the groups are balanced by handicap. §5.ao:
// the app proposes, the organizer adjusts.
//
// Named "Group N" rather than "Team N" because on this axis they are not teams — the money teams
// are the sides, and calling both "team" is exactly the conflation F-019 is about (§5.al).
//
// F-071 (one teams step for every split): the SAME step now builds teams that share foursomes —
// pairs, triples, the 2v2 in one group. `mode: 'money-teams'` drops what belongs to the tee
// sheet (tee times, send-out order — the groups step owns those) and requires every team to have
// someone on it; the caller derives the sides and lays the tee sheet on leaving.
export function TeamsStep({
  course, players, teams, setTeams, lockedGroups, setLockedGroups, captainIds, setCaptainIds,
  excludeCaptains, setExcludeCaptains, useCaptains, setUseCaptains, teamBuild, setTeamBuild, teamSizes, handicapAllowance, handicapBasis, nine, onNext, onBack,
  mode = 'tee-groups', subtitle, nextLabel = 'Next: Review & Create', cards,
}: {
  course: CourseSelection | null;
  players: Player[];
  teams: PoolTeam[]; setTeams: (t: PoolTeam[]) => void;
  lockedGroups: string[][]; setLockedGroups: (g: string[][]) => void;
  captainIds: string[]; setCaptainIds: (ids: string[]) => void;
  excludeCaptains: boolean; setExcludeCaptains: (v: boolean) => void;
  useCaptains: boolean; setUseCaptains: (v: boolean) => void;
  teamBuild: PoolGame['teamBuild']; setTeamBuild: (b: PoolGame['teamBuild']) => void;
  /** The structure's team sizes (§5.bk): [4, 4], [3, 3, 2], [3, 2]. Empty = foursomes (legacy). */
  teamSizes: number[];
  handicapAllowance: number;
  handicapBasis: 'course' | 'index';
  nine: 'front9' | 'back9' | null;
  onNext: () => void; onBack: () => void;
  /** 'tee-groups' (default): each team is its own tee group — tee times and send-out order live here.
   *  'money-teams': teams share foursomes; the tee sheet is the next step's question. */
  mode?: 'tee-groups' | 'money-teams';
  /** One line under the heading: the structure in words ("Four pairs — partners share a foursome"). */
  subtitle?: string;
  nextLabel?: string;
  /** §5.de / §5.dg: the match cards — who plays whom, tap two players to swap — atop the step. */
  cards?: ReactNode;
}) {
  const moneyTeams = mode === 'money-teams';
  const mk = (index: number, playerIds: string[], captainId?: string) => makeTeam(index, playerIds, captainId, moneyTeams);


  // The team count comes from the STRUCTURE (§5.bk) — two teams of 4, three of 3 + 3 + 2 — and the
  // balancers deal the field evenly into that many, which is exactly the shape groupShapesFor
  // produced (sizes never differ by more than one). Falls back to foursomes with no structure.
  const sizes = teamSizes.length > 0 ? teamSizes : Array.from({ length: Math.max(1, Math.ceil(players.length / 4)) }, () => 4);
  const numTeams = sizes.length;

  // Auto-pick captains (lowest course handicaps, honoring locks) whenever the
  // field or team count changes and no captains have been set yet. Prunes any
  // captain who left the field. The organizer can still reassign any slot.
  useEffect(() => {
    if (!useCaptains) return; // no captains this game — skip auto-pick entirely
    const present = new Set(players.map((p) => p.id));
    const kept = captainIds.filter((id) => id && present.has(id));
    const needsAutopick = kept.length === 0 && players.length >= numTeams;
    if (needsAutopick) {
      const picks = pickCaptains(players, course, handicapAllowance, numTeams, lockedGroups, handicapBasis);
      setCaptainIds(Array.from({ length: numTeams }, (_, i) => picks[i] ?? ''));
    } else if (kept.length !== captainIds.length || captainIds.length !== numTeams) {
      // Trim/pad to numTeams and drop departed players, preserving existing picks.
      const deduped: string[] = [];
      for (const id of kept) if (!deduped.includes(id)) deduped.push(id);
      setCaptainIds(Array.from({ length: numTeams }, (_, i) => deduped[i] ?? ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, numTeams]);

  // Auto-generate: sequential teams in the structure's sizes, each sorted low->high, lowest = captain.
  function autoGenerate() {
    const groups: string[][] = [];
    let at = 0;
    for (const size of sizes) {
      groups.push(players.slice(at, at + size).map((p) => p.id));
      at += size;
    }
    // Anyone past the shape (the field grew after the split was chosen) still gets a team.
    if (at < players.length) groups.push(players.slice(at).map((p) => p.id));
    setTeams(groups.map((ids, i) => {
      const sorted = sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis);
      return mk(i, sorted, useCaptains ? sorted[0] : undefined);
    }));
    setTeamBuild({ method: 'sequential', adjustedAfter: false });
  }

  // Auto-balance the field into even-handicap teams, honoring pairing locks.
  // With captains ON: each captain anchors a slot and the rest balance around
  // them (captain-first ordering). With captains OFF: plain even balance, no
  // captain role at all — each team just listed low->high.
  // Captains' deal (§5.ay) — kept separate from autoBalance() rather than folded in
  // behind a flag, because the two answer different questions: autoBalance minimizes
  // team-handicap spread (exact branch-and-bound), while this deals positionally so an
  // organizer can explain and verify it. Both are legitimate; neither replaces the other.
  function autoCaptainsDeal() {
    const captainByTeam = Array.from({ length: numTeams }, (_, i) =>
      useCaptains ? (captainIds[i] || undefined) : undefined);
    const groups = captainsDealTeams(players, numTeams, course, handicapAllowance, captainByTeam, lockedGroups, handicapBasis, nine);
    setTeams(groups.map((ids, i) => {
      const capId = captainByTeam[i] && ids.includes(captainByTeam[i]!) ? captainByTeam[i] : undefined;
      // Display lowest-to-highest handicap, same as every other build method. I'd first
      // kept the raw deal order to make it verifiable, but being the one team
      // list in the app that reads differently is more confusing than that is useful.
      const ordered = capId
        ? orderPlayerIdsWithCaptain(ids, capId, players, course, handicapAllowance, handicapBasis)
        : sortPlayerIdsByHcap(ids, players, course, handicapAllowance, handicapBasis);
      return mk(i, ordered, capId);
    }));
    setTeamBuild({
      method: 'serpentine',
      excludeCaptains: false,
      hadCaptains: useCaptains,
      hadLocks: lockedGroups.some((g) => g.length >= 2),
      adjustedAfter: false,
    });
  }

  // The same deal the match cards make on step 2 (§5.df), on the real playing handicaps here.
  function autoBalance() {
    const dealt = dealBalancedTeams(players, numTeams, {
      course, allowance: handicapAllowance, basis: handicapBasis, nine,
      captains: useCaptains, captainByTeam: captainIds, excludeCaptains, locks: lockedGroups,
    });
    setTeams(dealt.map((d, i) => mk(i, d.playerIds, d.captainId)));
    // Snapshot the settings used, so the read-only summary reflects the actual
    // build rather than the live toggle later.
    setTeamBuild({
      method: 'balanced',
      excludeCaptains: useCaptains ? excludeCaptains : false,
      hadCaptains: dealt.some((d) => !!d.captainId),
      hadLocks: lockedGroups.some((g) => g.length >= 2),
      adjustedAfter: false,
    });
  }

  const assignedIds = new Set(teams.flatMap((t) => t.playerIds));
  const unassigned = players.filter((p) => !assignedIds.has(p.id));

  // F-060: on a phone the built teams render below the fold, so a method tap looked
  // like it did nothing (Craig: "when i click the boxes nothing happens"). Every
  // method now scrolls to its result, and the used card wears a ✓ (from
  // teamBuild.method, which already records how the teams were built).
  const builtTeamsRef = useRef<HTMLDivElement>(null);
  function runAndShow(run: () => void) {
    run();
    requestAnimationFrame(() => builtTeamsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  const methodOfBuild: Record<string, string> = { balanced: 'optimal', serpentine: 'deal', sequential: 'sequential' };
  const builtWith = teams.length > 0 && teamBuild ? methodOfBuild[teamBuild.method] : undefined;

  // A money team with nobody on it would be a side the engine can't settle (the old sides editor
  // refused the same way); an empty tee group is merely an unused slot.
  const emptyTeams = teams.filter((t) => t.playerIds.length === 0);
  const canProceed = teams.length > 0 && teams.some((t) => t.playerIds.length > 0) && unassigned.length === 0
    && (!moneyTeams || emptyTeams.length === 0);

  return (
    <div>
      <button onClick={onBack} className="text-sm text-green-700 hover:underline mb-4">&larr; Back</button>
      <h2 className={`text-lg font-semibold text-gray-900 ${subtitle ? 'mb-1' : 'mb-4'}`}>Set Teams</h2>
      {subtitle && <p className="text-sm text-gray-500 mb-4">{subtitle}</p>}

      {/* §5.de / §5.dg / §5.dh: THE team editor — who plays whom, on the game's own handicaps; tap two
          players to swap. Team sizes are step 2's; names are typed on the cards. */}
      <div ref={builtTeamsRef} className="bg-white rounded-lg shadow p-4 mb-4">
        {cards && teams.length > 0
          ? cards
          : <p className="text-sm text-center text-gray-500">No teams yet. Use a button below to build them.</p>}
      </div>

      {/* Team-building style: captains (default) vs plain balance by handicap. */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-semibold text-gray-800 mb-2">Team Building</p>
        <div className="flex gap-2">
          {([
            { v: true, label: 'Use captains' },
            { v: false, label: 'No captains' },
          ] as const).map(({ v, label }) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setUseCaptains(v)}
              className={`flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
                useCaptains === v
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {useCaptains
            ? 'Each team gets a captain (lowest handicaps by default); the rest balance around them.'
            : 'Teams are balanced by handicap with no captain role.'}
        </p>
      </div>

      {/* Captains — the primary way to build teams. One captain per team (lowest
          course handicaps by default), each anchoring an even balance around
          them. The apply button lives in the panel. */}
      {useCaptains && (
      <div className="mb-4">
        <CaptainsPanel
          players={players}
          course={course}
          handicapAllowance={handicapAllowance}
          handicapBasis={handicapBasis}
          nine={nine}
          numTeams={numTeams}
          captainIds={captainIds}
          setCaptainIdsAction={setCaptainIds}
          excludeCaptains={excludeCaptains}
          setExcludeCaptainsAction={setExcludeCaptains}
        />
      </div>
      )}

      {/* Pairing locks — keep chosen players on the same team through balancing.
          Applying the lock IS auto-balance (around captains), wired right into
          the box so it's one obvious action. F-086 (opt A): hidden when every team is a pair
          or smaller — a lock can only ever be one whole team there, which the cards below
          already say. Locks still earn their place on triples and foursomes. */}
      {sizes.some((k) => k > 2) && (
      <div className="mb-4">
        <PairingLocks
          players={players}
          lockedGroups={lockedGroups}
          setLockedGroupsAction={setLockedGroups}
          onApplyAction={autoBalance}
        />
      </div>
      )}

      {/* ONE QUESTION, not three rival buttons. Each method is a different GOAL, so the
          consequence is spelled out rather than the mechanism — "evens out the totals"
          vs "you can check it by eye". The captains toggle stays separate above: it's
          orthogonal (any method runs with or without captains), and folding it in would
          multiply the options. */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-sm font-medium text-gray-800 mb-1">How should teams be built?</p>
        <p className="text-xs text-gray-500 mb-3">Pick one to build them now — you can still move anyone by hand afterwards.</p>
        <div className="space-y-2">
          {([
            {
              key: 'optimal',
              label: useCaptains ? 'Even them out around the captains' : 'Even them out by handicap',
              detail: 'Searches for the closest possible team totals. The fairest result, but the assignment is hard to explain.',
              run: autoBalance,
            },
            {
              key: 'deal',
              label: 'Captains’ deal',
              detail: 'Each round the best captain takes the worst remaining player, down to the worst captain taking the best. Slightly less even, but your group can watch it happen.',
              run: autoCaptainsDeal,
            },
            {
              key: 'sequential',
              label: 'Straight down the list',
              detail: `${moneyTeams ? 'Teams' : 'Foursomes'} in the order players were added. No balancing at all — for when the ${moneyTeams ? 'teams' : 'groups'} are already decided.`,
              run: autoGenerate,
            },
          ] as const).map(({ key, label, detail, run }) => (
            <button
              key={key}
              type="button"
              onClick={() => runAndShow(run)}
              className={`w-full min-h-[44px] rounded-lg border px-3 py-2.5 text-left active:bg-green-50 active:border-green-600 ${
                builtWith === key ? 'border-green-600 bg-green-50' : 'border-gray-300 bg-white hover:border-green-400'
              }`}
            >
              <span className="block text-sm font-medium text-gray-800">
                {label}
                {builtWith === key && (
                  <span className="ml-2 text-xs font-semibold text-green-700">
                    ✓ Built these teams{teamBuild?.adjustedAfter ? ' (hand-adjusted since)' : ''}
                  </span>
                )}
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">{detail}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Then tap two players on the cards above to swap them.
        </p>
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-1">
            Unassigned ({unassigned.length}) — generate teams or add them below
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <span key={p.id} className="rounded-full bg-white border border-amber-300 px-2 py-0.5 text-xs text-amber-800">
                {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {moneyTeams && emptyTeams.length > 0 && unassigned.length === 0 && (
        <p className="text-xs text-amber-700 mb-2">
          Every team needs someone on it — move a player in or remove the empty team.
        </p>
      )}

      <button
        onClick={onNext}
        disabled={!canProceed}
        className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {nextLabel}
      </button>
    </div>
  );
}
