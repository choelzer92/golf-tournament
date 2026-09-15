'use client';

import { useState, useEffect, useMemo } from 'react';
import { type PoolGame, DEFAULT_MATCH_CONFIG, isPoolGameFullyScored } from '@/lib/pool-game';
import { incompleteLegsForCloseOut, persistedSides, type IncompleteLeg } from '@/lib/game-modes/sides';
import { type GameScore } from '@/lib/game-state';
import { fetchGameScores } from '@/lib/tournament-state';
import { getGameMode, buildGameModeContext, settingValue } from '@/lib/game-modes';
import { gameRollups, settleUp } from '@/lib/stats-ledger';

export function MoneySummary({ game, pot }: { game: PoolGame; pot: number }) {
  const indMode = getGameMode(game.gameMode);
  if (indMode && (indMode.category === 'individual' || indMode.category === 'team-within-group')) {
    const settings = game.modeSettings ?? {};
    // Show the mode's chosen option values as a compact read-only summary.
    // Honor each setting's showIf so only relevant options appear (e.g. "$ per
    // point" only in the per-point money model, alt-shot % only for alt-shot) —
    // same predicate the editor uses, so create and view stay consistent.
    const rows = indMode.settings.filter((s) => {
      if (!s.showIf) return true;
      const conds = Array.isArray(s.showIf) ? s.showIf : [s.showIf];
      return conds.every((c) => c.in.includes(String(settingValue(indMode.settings, settings, c.key))));
    }).map((s) => {
      const raw = (s.key in settings ? settings[s.key] : s.defaultValue);
      let display: string;
      if (s.type === 'toggle') display = raw === true || raw === 'true' ? 'On' : 'Off';
      else if (s.type === 'select') display = s.options?.find((o) => o.value === String(raw))?.label ?? String(raw);
      else display = String(raw);
      return { label: s.label, display };
    // A READ-ONLY row with no value says nothing. This panel is what every player sees without
    // tapping Edit, and on a plain 2v2 six of its eleven rows were empty "Side A name".."Side F
    // name" labels (F-015) — four for sides that don't exist, two for sides that were never
    // named. A named side still shows ("Side A · The Hogs").
    //
    // Done GENERICALLY rather than by hiding side-name keys here, because that trap has now been
    // sprung on three surfaces: the editor remembered `unusedSideNameKeys`, the wizard remembered,
    // this panel didn't. A rule about empty VALUES can't be forgotten by the next setting added.
    }).filter((r) => r.display.trim() !== '');
    return (
      <section>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 bg-gray-100 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{indMode.name}</h2>
            <span className="text-sm text-gray-600">{game.players.length} players · {game.handicapAllowance}% hcap</span>
          </div>
          <p className="px-4 pt-2 text-xs text-gray-500">{indMode.description}</p>
          <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{r.label}</span>
                <span className="font-medium text-gray-800">{r.display}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (game.moneyMode === 'match') {
    const cfg = game.matchConfig ?? DEFAULT_MATCH_CONFIG;
    const rows = [
      { label: 'Front 9', amount: cfg.legDollars.front },
      { label: 'Back 9', amount: cfg.legDollars.back },
      { label: 'Overall 18', amount: cfg.legDollars.overall },
      { label: 'Junk / pt', amount: cfg.junkPerPoint },
    ];
    const twoTeams = game.teams.length === 2;
    return (
      <section>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 bg-gray-100 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Head-to-Head Match</h2>
            <span className="text-sm text-gray-600">$ / player</span>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-100">
            {rows.map((r) => (
              <div key={r.label} className="px-2 py-3 text-center">
                <p className="text-xs font-medium text-gray-500 uppercase">{r.label}</p>
                <p className="text-lg font-bold text-green-700">${r.amount}</p>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 text-xs text-gray-400 border-t">
            {twoTeams
              ? <>Each leg is head-to-head · loser pays the junk difference · {game.handicapAllowance}% handicap</>
              : <span className="text-amber-600">Head-to-head needs exactly two foursomes — this game has {game.teams.length}. Payouts show $0 until it&apos;s two teams.</span>}
          </div>
        </div>
      </section>
    );
  }

  const rows: { label: string; amount: number }[] = [
    { label: 'Front 9', amount: pot * game.potSplit.front },
    { label: 'Back 9', amount: pot * game.potSplit.back },
    { label: 'Overall 18', amount: pot * game.potSplit.overall },
    // F-045: a junk-off game folded this quarter into Overall at setup — don't
    // show a $0 leg nobody can win.
    ...(game.potSplit.junk > 0 ? [{ label: 'Junk', amount: pot * game.potSplit.junk }] : []),
  ];

  return (
    <section>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 bg-gray-100 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Pot</h2>
          <span className="text-sm text-gray-600">
            {game.players.length} × ${game.entryPerPlayer} = <span className="font-bold text-gray-900">${Math.round(pot)}</span>
          </span>
        </div>
        <div className={`grid ${rows.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} divide-x divide-gray-100`}>
          {rows.map((r) => (
            <div key={r.label} className="px-2 py-3 text-center">
              <p className="text-xs font-medium text-gray-500 uppercase">{r.label}</p>
              <p className="text-lg font-bold text-green-700">${Math.round(r.amount)}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 text-xs text-gray-400 border-t">
          Winner-take-all per pot · lowest team total wins · {game.handicapAllowance}% handicap
        </div>
      </div>
    </section>
  );
}

// F-032: who pays whom, for ONE completed game. "Need a 'summary' type view after
// you click finish — player A owes player C x. No Venmo, nothing crazy." The
// leaderboard shows each player's net; the parking-lot question is who HANDS whom
// what. settleUp() over this game's nets (gameRollups mirrors the stats ledger's
// per-team split), rendered the moment the game closes AND on any later view of the
// completed game. framed=true draws its own section (the guest view has no close-out
// panel to live in); framed=false sits inside the organizer's panel.
export function SettleUpList({ game, scoresByMatchup, framed }: {
  game: PoolGame;
  scoresByMatchup: Map<string, GameScore[]>;
  framed: boolean;
}) {
  const transfers = useMemo(
    () => settleUp(gameRollups(game, scoresByMatchup)),
    [game, scoresByMatchup],
  );
  if (transfers.length === 0) return null;
  const list = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-green-900">Who pays whom</p>
      <ul className="mt-1.5 space-y-1">
        {transfers.map((t, i) => (
          <li key={i} className="text-sm text-gray-800">
            <span className="font-medium">{t.fromName.split(' ')[0]}</span>
            {' pays '}
            <span className="font-medium">{t.toName.split(' ')[0]}</span>
            {' '}
            <span className="font-semibold text-green-700">${Math.round(t.amount)}</span>
          </li>
        ))}
      </ul>
    </>
  );
  return framed
    ? <section className="bg-green-50 rounded-lg shadow px-4 py-3">{list}</section>
    : <div className="px-4 py-3 border-b bg-green-50">{list}</div>;
}

// The guest view has no GameCloseOut (organizer-only), so it fetches this game's
// scores itself — the same fetch the panel does — and shows the same recap.
export function GuestSettleUp({ game }: { game: PoolGame }) {
  const [scoresByMatchup, setScoresByMatchup] = useState<Map<string, GameScore[]> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(game.teams.map((t) => t.matchupId)));
    Promise.all(ids.map(async (mid) => [mid, await fetchGameScores(mid)] as const)).then((pairs) => {
      if (cancelled) return;
      const byMatchup = new Map<string, GameScore[]>();
      for (const [mid, s] of pairs) if (s && Array.isArray(s)) byMatchup.set(mid, s as GameScore[]);
      setScoresByMatchup(byMatchup);
    });
    return () => { cancelled = true; };
  }, [game]);
  if (!scoresByMatchup) return null;
  return <SettleUpList game={game} scoresByMatchup={scoresByMatchup} framed />;
}

// Close out / reopen a game — the explicit lifecycle control.
//
// status:'completed' is what the stats & money ledger selects on, and until now
// nothing ever set it, so no game ever reached Stats & money. Finish Game now
// auto-completes when the LAST foursome finishes, but that only fires if someone
// taps it on the final card — the organizer needs a way to close the game out
// regardless (and to reopen it if a score needs fixing).
export function GameCloseOut({ game, onSave }: { game: PoolGame; onSave: (g: PoolGame) => void }) {
  const [fullyScored, setFullyScored] = useState<boolean | null>(null);
  // F-032: the fetched scores, kept so the who-pays-whom recap can settle this game.
  const [scoresByMatchup, setScoresByMatchup] = useState<Map<string, GameScore[]> | null>(null);
  // Legs not every side finished (F-016b). Empty unless this game settles per leg.
  const [shortLegs, setShortLegs] = useState<IncompleteLeg[]>([]);
  // The confirmation step. null = not asking; otherwise the leg keys the organizer has marked
  // as paying nothing. Starts with EVERY short leg voided, because that's the answer a group
  // reaching for this is most likely to want — but each one is individually togglable.
  const [asking, setAsking] = useState<('front' | 'back' | 'overall')[] | null>(null);

  // Fetch every foursome's scores to report whether the game is fully scored, and to ask the
  // engine which legs are short. The engine is the only thing that knows how a leg is scored,
  // so the prompt reads its answer rather than recomputing hole counts here (§5.aa: one source
  // of truth for anything the money depends on).
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(game.teams.map((t) => t.matchupId)));
    Promise.all(ids.map(async (mid) => [mid, await fetchGameScores(mid)] as const)).then((pairs) => {
      if (cancelled) return;
      const byMatchup = new Map<string, GameScore[]>();
      for (const [mid, s] of pairs) if (s && Array.isArray(s)) byMatchup.set(mid, s as GameScore[]);
      setFullyScored(isPoolGameFullyScored(game, byMatchup));
      setScoresByMatchup(byMatchup);

      const mode = getGameMode(game.gameMode);
      if (mode?.category !== 'team-within-group') { setShortLegs([]); return; }
      const result = mode.compute(buildGameModeContext(game, byMatchup));
      const s = game.modeSettings ?? {};
      setShortLegs(incompleteLegsForCloseOut(
        result.teamLegs ?? [],
        String(s.moneyModel ?? 'legs'),
        {
          front: Number(s.legFront ?? 10),
          back: Number(s.legBack ?? 10),
          overall: Number(s.legOverall ?? 10),
        },
      ));
    });
    return () => { cancelled = true; };
  }, [game]);

  const isDone = game.status === 'completed';

  function closeOut(voidedLegs?: ('front' | 'back' | 'overall')[]) {
    // Only WRITE the field when something is voided, so an ordinary game's saved shape is
    // untouched — same principle as persistedSides keeping the legacy two-side shape.
    const next: PoolGame = { ...game, status: 'completed' };
    if (voidedLegs && voidedLegs.length > 0) next.voidedLegs = voidedLegs;
    else delete next.voidedLegs;
    onSave(next);
    setAsking(null);
  }

  function onCloseOutTapped() {
    // Nothing short, or nothing at stake → close out immediately, exactly as before.
    if (shortLegs.length === 0) { closeOut(); return; }
    setAsking(shortLegs.map((l) => l.key));
  }

  return (
    <section className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-4 py-3 bg-gray-100 border-b">
        <h2 className="font-semibold text-gray-900">{isDone ? 'Game closed out' : 'Close out game'}</h2>
        <p className="text-xs text-gray-500">
          {isDone
            ? 'Final — this game now counts in Stats & money. Reopen it if a score needs fixing.'
            : 'Marks the game final and includes it in Stats & money. Scores stay editable if you reopen it.'}
        </p>
        {/* Say it on the page. Without this, a closed-out game whose back nine paid nothing looks
            like a money bug to anyone who wasn't there when the choice was made. */}
        {isDone && (game.voidedLegs?.length ?? 0) > 0 && (
          <p className="text-xs text-amber-700 mt-1">
            {game.voidedLegs!.length === 1 ? 'One leg pays' : `${game.voidedLegs!.length} legs pay`} nothing —
            not every side finished {game.voidedLegs!.length === 1 ? 'it' : 'them'}.
          </p>
        )}
      </div>

      {/* F-032: the settle-up moment, the instant the game closes. */}
      {isDone && scoresByMatchup && (
        <SettleUpList game={game} scoresByMatchup={scoresByMatchup} framed={false} />
      )}

      {/* THE PROMPT (F-016b, DECISIONS.md §5.ai). Craig: "if someone clicks finish game, and all
          legs are not complete, it should prompt the user." Asked here, at close-out, rather than
          pre-declared in settings — the person tapping this knows whose knee gave out, and a
          default nobody chose is worse than a question asked once.

          PER LEG, so a completed front still pays while a short back nine can be written off. */}
      {asking !== null && !isDone && (
        <div className="p-4 border-b bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">
            {shortLegs.length === 1
              ? 'One leg wasn’t finished by every side.'
              : 'Some legs weren’t finished by every side.'}
          </p>
          <p className="text-xs text-amber-800 mt-1">
            Untick a leg to pay it on the holes everyone played. Leave it ticked and it pays nothing.
          </p>
          <div className="mt-3 space-y-2">
            {shortLegs.map((leg) => {
              const off = asking.includes(leg.key);
              return (
                <label key={leg.key} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={off}
                    onChange={(e) => setAsking(
                      e.target.checked
                        ? [...asking, leg.key]
                        : asking.filter((k) => k !== leg.key),
                    )}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">
                      {leg.label} — ${Math.round(leg.dollars)} pays nothing
                    </span>
                    <span className="block text-xs text-gray-600">
                      {leg.thru} of {leg.holes} holes played by every side
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => closeOut(asking)}
              className="text-sm font-semibold rounded-md px-4 py-2 bg-green-700 text-white hover:bg-green-800"
            >
              Close out game
            </button>
            <button
              onClick={() => setAsking(null)}
              className="text-sm font-medium rounded-md px-3 py-2 text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Hidden while the prompt is open, so there is only ever ONE "Close out game" button on
          screen. Two would leave the second one looking like a way to skip the question. */}
      {asking === null && (
        <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-600">
            {fullyScored === null
              ? 'Checking scores…'
              : fullyScored
                ? 'Every player is scored on every hole.'
                : 'Some holes are still missing scores — you can close out anyway.'}
          </p>
          <button
            onClick={() => (isDone ? onSave({ ...game, status: 'active' }) : onCloseOutTapped())}
            className={`text-sm font-semibold rounded-md px-4 py-2 ${
              isDone
                ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                : 'bg-green-700 text-white hover:bg-green-800'
            }`}
          >
            {isDone ? 'Reopen game' : 'Close out game'}
          </button>
        </div>
      )}
    </section>
  );
}
