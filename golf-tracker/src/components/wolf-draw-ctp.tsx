'use client';

import { useEffect, useRef, useState } from 'react';

// "Closest to the pin" Wolf draw — a pass-the-phone mini-game that sets the Wolf
// rotation. Each player takes a turn: an AIM meter sweeps left↔right (tap to lock
// the line), then a POWER meter sweeps low↔high (tap to lock the distance). The
// shot lands off the pin by how far aim + power missed their targets; closest to
// the pin ranks first and becomes hole 1's Wolf. After all players shoot, the
// ranked order is returned via onComplete.
//
// Deliberately simple: one device, one player at a time (matches how a foursome
// already shares a scoring phone). True per-phone play can layer on later.

export interface WolfDrawPlayer {
  id: string;
  name: string;
}

interface Shot {
  playerId: string;
  distance: number; // distance from pin (0 = dead center); lower is better
}

// Meter sweep speed (fraction of the bar per animation frame ~16ms). Tuned so a
// full sweep takes a bit over a second — enough to require timing, not luck.
const AIM_SPEED = 0.018;
const POWER_SPEED = 0.022;

// The perfect targets (center of each bar). Distance from pin combines both
// misses so a great aim + great power = near zero.
const AIM_TARGET = 0.5;   // center line
const POWER_TARGET = 0.5; // "pin distance" sweet spot

export function WolfDrawCtp({
  players, onCompleteAction, onCancelAction,
}: {
  players: WolfDrawPlayer[];
  onCompleteAction: (orderedIds: string[]) => void;
  onCancelAction: () => void;
}) {
  const [turnIdx, setTurnIdx] = useState(0);
  const [phase, setPhase] = useState<'aim' | 'power' | 'result'>('aim');
  const [aim, setAim] = useState(0);        // locked aim position 0..1
  const [pos, setPos] = useState(0);        // live meter position 0..1
  const [shots, setShots] = useState<Shot[]>([]);
  const [lastDist, setLastDist] = useState<number | null>(null);

  const rafRef = useRef<number | null>(null);
  const posRef = useRef(0);
  const dirRef = useRef(1);

  const current = players[turnIdx];
  const done = turnIdx >= players.length;

  // Drive the sweeping meter while aiming or powering.
  useEffect(() => {
    if (phase !== 'aim' && phase !== 'power') return;
    const speed = phase === 'aim' ? AIM_SPEED : POWER_SPEED;
    posRef.current = 0;
    dirRef.current = 1;
    setPos(0);
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      let p = posRef.current + dirRef.current * speed;
      if (p >= 1) { p = 1; dirRef.current = -1; }
      else if (p <= 0) { p = 0; dirRef.current = 1; }
      posRef.current = p;
      setPos(p);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { mounted = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase, turnIdx]);

  function lock() {
    if (phase === 'aim') {
      setAim(posRef.current);
      setPhase('power');
    } else if (phase === 'power') {
      const power = posRef.current;
      // Distance from pin: weighted miss of aim + power, scaled to yards-ish (0..~50).
      const aimMiss = Math.abs(aim - AIM_TARGET);
      const powerMiss = Math.abs(power - POWER_TARGET);
      const distance = Math.round((aimMiss * 60 + powerMiss * 40) * 10) / 10;
      setLastDist(distance);
      setShots((prev) => [...prev, { playerId: current.id, distance }]);
      setPhase('result');
    }
  }

  function next() {
    setLastDist(null);
    setAim(0);
    setPhase('aim');
    setTurnIdx((i) => i + 1);
  }

  // All players have shot: rank closest-first and hand back the order.
  const ranked = [...shots].sort((a, b) => a.distance - b.distance);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name.split(' ')[0] ?? '—';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancelAction}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-gray-900">🎯 Closest to the Pin</h2>
          <button onClick={onCancelAction} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Pass the phone. Each player hits — closest to the pin is the Wolf on hole 1.</p>

        {!done && phase !== 'result' && (
          <>
            <p className="text-center text-sm font-medium text-gray-800 mb-1">
              {current.name}&apos;s shot <span className="text-gray-400">({turnIdx + 1} of {players.length})</span>
            </p>
            <p className="text-center text-xs text-gray-500 mb-3">
              {phase === 'aim' ? 'Tap to set your AIM (center = straight)' : 'Tap to set your POWER (middle = pin distance)'}
            </p>

            {phase === 'aim' ? (
              // Horizontal aim bar with a green target zone in the middle.
              <div className="relative h-10 rounded-full bg-gray-200 overflow-hidden mb-4">
                <div className="absolute inset-y-0 bg-green-300/60" style={{ left: '44%', right: '44%' }} />
                <div className="absolute inset-y-0 w-1.5 bg-green-700" style={{ left: '50%', transform: 'translateX(-50%)' }} />
                <div className="absolute inset-y-0 w-2 bg-gray-900 rounded" style={{ left: `${pos * 100}%`, transform: 'translateX(-50%)' }} />
              </div>
            ) : (
              // Vertical power bar with a green sweet-spot band.
              <div className="relative mx-auto h-40 w-12 rounded-full bg-gray-200 overflow-hidden mb-4">
                <div className="absolute inset-x-0 bg-green-300/60" style={{ top: '44%', bottom: '44%' }} />
                <div className="absolute inset-x-0 h-1.5 bg-green-700" style={{ top: '50%', transform: 'translateY(-50%)' }} />
                <div className="absolute inset-x-0 h-2 bg-gray-900 rounded" style={{ bottom: `${pos * 100}%`, transform: 'translateY(50%)' }} />
              </div>
            )}

            <button onClick={lock} className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-semibold hover:bg-green-800">
              {phase === 'aim' ? 'Lock aim' : 'Hit!'}
            </button>
          </>
        )}

        {!done && phase === 'result' && lastDist !== null && (
          <div className="text-center py-2">
            <p className="text-sm text-gray-600 mb-1">{current.name} is</p>
            <p className="text-4xl font-bold text-gray-900 mb-1">{lastDist} <span className="text-lg font-medium text-gray-500">ft</span></p>
            <p className="text-xs text-gray-400 mb-4">{lastDist < 5 ? 'Stiff! 🔥' : lastDist < 15 ? 'Nice shot' : lastDist < 30 ? 'On the green' : 'Room to work'}</p>
            <button onClick={next} className="w-full rounded-md bg-green-700 px-4 py-3 text-white font-semibold hover:bg-green-800">
              {turnIdx + 1 >= players.length ? 'See the draw' : `Next: ${players[turnIdx + 1].name.split(' ')[0]}`}
            </button>
          </div>
        )}

        {done && (
          <div>
            <p className="text-center text-sm font-medium text-gray-800 mb-3">The draw — Wolf rotation</p>
            <div className="space-y-1.5 mb-4">
              {ranked.map((s, i) => (
                <div key={s.playerId} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-12">Hole {i + 1}</span>
                    <span className="font-medium text-gray-900">{nameOf(s.playerId)}</span>
                  </span>
                  <span className="text-sm text-gray-500">{s.distance} ft</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onCompleteAction(ranked.map((s) => s.playerId))}
                className="flex-1 rounded-md bg-green-700 px-4 py-2.5 text-white font-semibold hover:bg-green-800"
              >
                Use this order
              </button>
              <button
                onClick={() => { setShots([]); setTurnIdx(0); setPhase('aim'); setLastDist(null); }}
                className="rounded-md border border-gray-300 px-4 py-2.5 text-gray-600 font-medium hover:border-gray-400"
              >
                Redo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
