'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { GameSetup, GameScore, Player } from '@/lib/game-state';
import { calcCourseHandicap } from '@/lib/game-state';

export default function PlayGamePage() {
  const router = useRouter();
  const [setup, setSetup] = useState<GameSetup | null>(null);
  const [scores, setScores] = useState<GameScore[]>([]);
  const [currentHole, setCurrentHole] = useState(1);

  useEffect(() => {
    const data = sessionStorage.getItem('game_setup');
    if (!data) {
      router.push('/game/new');
      return;
    }
    const parsed = JSON.parse(data) as GameSetup;
    setSetup(parsed);

    const startHole = parsed.holesPlaying === 'back9' ? 10 : 1;
    setCurrentHole(startHole);
  }, [router]);

  if (!setup) return null;

  const tee = setup.course?.teeSets.find((t) => t.id === (setup.course?.selectedTeeId || setup.course?.teeSets[0]?.id));
  const holes = getHolesForSetup(setup);

  function getHolesForSetup(s: GameSetup) {
    const allHoles = tee?.holes.sort((a, b) => a.number - b.number) || Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yardage: 0, handicap: i + 1 }));
    if (s.holesPlaying === 'front9') return allHoles.filter((h) => h.number <= 9);
    if (s.holesPlaying === 'back9') return allHoles.filter((h) => h.number > 9);
    return allHoles;
  }

  function getPlayerEffectiveHcap(player: Player): number {
    if (!player.handicapIndex) return 0;

    if (setup!.handicapBasis === 'index') {
      // Use raw index, apply allowance
      return Math.round(player.handicapIndex * (setup!.handicapAllowance / 100));
    }

    // Course handicap: adjusted for tee difficulty
    if (!tee) return 0;
    const totalRating = tee.ratings.find((r) => r.type === 'Total');
    if (!totalRating) return 0;
    return Math.round(
      calcCourseHandicap(player.handicapIndex, totalRating.slopeRating, totalRating.courseRating, tee.totalPar)
      * (setup!.handicapAllowance / 100)
    );
  }

  function getPlayingHandicap(player: Player): number {
    const hcap = getPlayerEffectiveHcap(player);
    if (setup!.strokeMethod === 'full') return hcap;

    // Off the low: subtract lowest
    const allHcaps = setup!.players.map((p) => getPlayerEffectiveHcap(p));
    const lowest = Math.min(...allHcaps);
    return hcap - lowest;
  }

  function getPlayerStrokesOnHole(player: Player, holeHandicap: number): number {
    const playingHcap = getPlayingHandicap(player);

    if (playingHcap <= 0) return 0;
    if (playingHcap >= 36) return 2;
    if (holeHandicap <= playingHcap) return 1;
    if (playingHcap > 18 && holeHandicap <= playingHcap - 18) return 2;
    return 0;
  }

  function getScore(playerId: string, hole: number): number | null {
    const s = scores.find((sc) => sc.playerId === playerId && sc.hole === hole);
    return s ? s.grossScore : null;
  }

  function setScore(playerId: string, hole: number, gross: number) {
    setScores((prev) => {
      const filtered = prev.filter((s) => !(s.playerId === playerId && s.hole === hole));
      return [...filtered, { playerId, hole, grossScore: gross }];
    });
  }

  function incrementScore(playerId: string, hole: number) {
    const current = getScore(playerId, hole);
    const holePar = holes.find((h) => h.number === hole)?.par || 4;
    const newScore = current ? current + 1 : holePar;
    setScore(playerId, hole, newScore);
  }

  function decrementScore(playerId: string, hole: number) {
    const current = getScore(playerId, hole);
    if (current && current > 1) {
      setScore(playerId, hole, current - 1);
    }
  }

  const currentHoleData = holes.find((h) => h.number === currentHole);
  const isFirstHole = currentHole === holes[0]?.number;
  const isLastHole = currentHole === holes[holes.length - 1]?.number;

  function nextHole() {
    const idx = holes.findIndex((h) => h.number === currentHole);
    if (idx < holes.length - 1) setCurrentHole(holes[idx + 1].number);
  }

  function prevHole() {
    const idx = holes.findIndex((h) => h.number === currentHole);
    if (idx > 0) setCurrentHole(holes[idx - 1].number);
  }

  function getTotalScore(playerId: string): number {
    return scores.filter((s) => s.playerId === playerId).reduce((sum, s) => sum + s.grossScore, 0);
  }

  function getTotalNet(playerId: string): number {
    let total = 0;
    for (const hole of holes) {
      const gross = getScore(playerId, hole.number);
      if (gross) {
        const player = setup!.players.find((p) => p.id === playerId)!;
        const strokes = getPlayerStrokesOnHole(player, hole.handicap);
        total += gross - strokes;
      }
    }
    return total;
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{setup.course?.courseName || 'Game'}</h1>
            <p className="text-xs text-green-200">{setup.formatId.replace('-', ' ').toUpperCase()}</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-green-200 hover:text-white"
          >
            End
          </button>
        </div>
      </header>

      <div className="bg-green-900 text-green-200 text-xs text-center py-1.5">
        {setup.strokeMethod === 'off-the-low' ? 'Strokes: Off the Low' : 'Strokes: Full Handicap'}
        {' · '}
        {setup.players.map((p) => `${p.name.split(' ')[0]}: ${getPlayingHandicap(p)}`).join(' · ')}
      </div>

      <main className="max-w-lg mx-auto px-4 py-4">
        {/* Hole navigation */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevHole} disabled={isFirstHole} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-30 font-medium">
            ←
          </button>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">Hole {currentHole}</p>
            <p className="text-sm text-gray-500">
              Par {currentHoleData?.par} · {currentHoleData?.yardage} yds · Hdcp {currentHoleData?.handicap}
            </p>
          </div>
          <button onClick={nextHole} disabled={isLastHole} className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-30 font-medium">
            →
          </button>
        </div>

        {/* Score entry */}
        <div className="space-y-3 mb-6">
          {setup.players.map((player) => {
            const gross = getScore(player.id, currentHole);
            const strokes = currentHoleData ? getPlayerStrokesOnHole(player, currentHoleData.handicap) : 0;
            const net = gross ? gross - strokes : null;
            const par = currentHoleData?.par || 4;
            const scoreToPar = net !== null ? net - par : null;

            const scoreOptions = Array.from({ length: 8 }, (_, i) => par - 2 + i).filter((s) => s >= 1);

            return (
              <div key={player.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-gray-900">
                    {player.name}
                    {strokes > 0 && (
                      <span className="ml-1 text-xs text-orange-600">
                        {'●'.repeat(strokes)}
                      </span>
                    )}
                  </p>
                  {net !== null && (
                    <p className={`text-xs font-medium ${scoreToPar! < 0 ? 'text-red-600' : scoreToPar! > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                      Net: {net} ({scoreToPar! > 0 ? '+' : ''}{scoreToPar})
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {scoreOptions.map((score) => (
                    <button
                      key={score}
                      onClick={() => setScore(player.id, currentHole, score)}
                      className={`w-9 h-9 rounded-full text-sm font-bold transition ${
                        gross === score
                          ? 'bg-green-700 text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Scoreboard summary */}
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Totals</h3>
          <div className="space-y-1">
            {setup.players.map((player) => (
              <div key={player.id} className="flex justify-between text-sm">
                <span className="text-gray-700">{player.name}</span>
                <span className="font-medium text-gray-900">
                  Gross: {getTotalScore(player.id) || '–'}
                  <span className="ml-2 text-green-700">Net: {getTotalNet(player.id) || '–'}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Hole dots */}
        <div className="mt-4 flex flex-wrap gap-1 justify-center">
          {holes.map((hole) => {
            const allScored = setup.players.every((p) => getScore(p.id, hole.number) !== null);
            const isCurrent = hole.number === currentHole;
            return (
              <button
                key={hole.number}
                onClick={() => setCurrentHole(hole.number)}
                className={`w-7 h-7 rounded-full text-xs font-medium ${
                  isCurrent
                    ? 'bg-green-700 text-white'
                    : allScored
                    ? 'bg-green-200 text-green-800'
                    : 'bg-gray-200 text-gray-600'
                }`}
              >
                {hole.number}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
