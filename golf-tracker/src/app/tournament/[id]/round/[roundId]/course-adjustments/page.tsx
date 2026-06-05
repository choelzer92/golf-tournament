'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { Tournament, TournamentRound } from '@/lib/tournament-state';
import { loadTournament, saveTournament, fetchTournament } from '@/lib/tournament-state';

export default function CourseAdjustmentsPage() {
  const router = useRouter();
  const params = useParams();
  const tournamentId = params.id as string;
  const roundId = params.roundId as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [round, setRound] = useState<TournamentRound | null>(null);

  useEffect(() => {
    const cached = loadTournament(tournamentId);
    if (cached) {
      setTournament(cached);
      setRound(cached.rounds.find((r) => r.id === roundId) || null);
    }
    fetchTournament(tournamentId).then((t) => {
      if (!t) return;
      setTournament(t);
      setRound(t.rounds.find((r) => r.id === roundId) || null);
    });
  }, [tournamentId, roundId]);

  if (!tournament || !round || !round.course) {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">No course configured for this round.</p>
      </div>
    );
  }

  const tee = round.course.teeSets.find((t) => t.id === round.defaultTeeId) || round.course.teeSets[0];
  if (!tee) return null;

  const holes = [...tee.holes].sort((a, b) => a.number - b.number);
  const totalRating = tee.ratings?.find((r) => r.type === 'Total');
  const frontRating = tee.ratings?.find((r) => r.type === 'Front');
  const backRating = tee.ratings?.find((r) => r.type === 'Back');

  function saveChanges(updatedHoles: typeof holes, updatedRatings?: { total?: { courseRating: number; slopeRating: number }; front?: { courseRating: number; slopeRating: number }; back?: { courseRating: number; slopeRating: number } }) {
    const updatedTeeSets = round!.course!.teeSets.map((ts) => {
      if (ts.id !== (round!.defaultTeeId || round!.course!.teeSets[0]?.id)) return ts;
      const newRatings = ts.ratings ? [...ts.ratings] : [];
      if (updatedRatings) {
        for (const r of newRatings) {
          if (r.type === 'Total' && updatedRatings.total) {
            r.courseRating = updatedRatings.total.courseRating;
            r.slopeRating = updatedRatings.total.slopeRating;
          }
          if (r.type === 'Front' && updatedRatings.front) {
            r.courseRating = updatedRatings.front.courseRating;
            r.slopeRating = updatedRatings.front.slopeRating;
          }
          if (r.type === 'Back' && updatedRatings.back) {
            r.courseRating = updatedRatings.back.courseRating;
            r.slopeRating = updatedRatings.back.slopeRating;
          }
        }
      }
      return { ...ts, holes: updatedHoles, ratings: newRatings };
    });
    const updatedCourse = { ...round!.course!, teeSets: updatedTeeSets };
    const updatedRound = { ...round!, course: updatedCourse };
    const updatedTournament = {
      ...tournament!,
      rounds: tournament!.rounds.map((r) => r.id === roundId ? updatedRound : r),
    };
    setTournament(updatedTournament);
    setRound(updatedRound);
    saveTournament(updatedTournament);
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Course Adjustments</h1>
            <p className="text-xs text-green-200">{round.course.courseName} — {tee.name}</p>
          </div>
          <button
            onClick={() => router.push(`/tournament/${tournamentId}/round/${roundId}`)}
            className="text-sm text-green-200 hover:text-white"
          >
            Back
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <p className="text-sm text-gray-600">
          Override GHIN data to match the actual scorecard. Changes apply to this round only.
        </p>

        {/* Ratings */}
        <RatingsEditor
          totalRating={totalRating}
          frontRating={frontRating}
          backRating={backRating}
          onSave={(ratings) => saveChanges(holes, ratings)}
        />

        {/* Hole-by-hole editor */}
        <HoleEditor
          holes={holes}
          onSave={(updatedHoles) => saveChanges(updatedHoles)}
        />
      </main>
    </div>
  );
}

function RatingsEditor({
  totalRating,
  frontRating,
  backRating,
  onSave,
}: {
  totalRating?: { courseRating: number; slopeRating: number };
  frontRating?: { courseRating: number; slopeRating: number };
  backRating?: { courseRating: number; slopeRating: number };
  onSave: (ratings: { total?: { courseRating: number; slopeRating: number }; front?: { courseRating: number; slopeRating: number }; back?: { courseRating: number; slopeRating: number } }) => void;
}) {
  const [totalCR, setTotalCR] = useState(totalRating?.courseRating ?? 0);
  const [totalSlope, setTotalSlope] = useState(totalRating?.slopeRating ?? 113);
  const [frontCR, setFrontCR] = useState(frontRating?.courseRating ?? 0);
  const [frontSlope, setFrontSlope] = useState(frontRating?.slopeRating ?? 113);
  const [backCR, setBackCR] = useState(backRating?.courseRating ?? 0);
  const [backSlope, setBackSlope] = useState(backRating?.slopeRating ?? 113);
  const [editing, setEditing] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Course & Slope Ratings</h3>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-green-700 hover:text-green-900 font-medium">
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center">
            <p className="text-xs text-gray-500">Total</p>
            <p className="font-medium text-gray-900">CR: {totalCR} / Slope: {totalSlope}</p>
          </div>
          {frontCR > 0 && (
            <div className="text-center">
              <p className="text-xs text-gray-500">Front</p>
              <p className="font-medium text-gray-900">CR: {frontCR} / Slope: {frontSlope}</p>
            </div>
          )}
          {backCR > 0 && (
            <div className="text-center">
              <p className="text-xs text-gray-500">Back</p>
              <p className="font-medium text-gray-900">CR: {backCR} / Slope: {backSlope}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total CR</label>
              <input type="number" step="0.1" value={totalCR} onChange={(e) => setTotalCR(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Total Slope</label>
              <input type="number" value={totalSlope} onChange={(e) => setTotalSlope(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Front CR</label>
              <input type="number" step="0.1" value={frontCR} onChange={(e) => setFrontCR(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Front Slope</label>
              <input type="number" value={frontSlope} onChange={(e) => setFrontSlope(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Back CR</label>
              <input type="number" step="0.1" value={backCR} onChange={(e) => setBackCR(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Back Slope</label>
              <input type="number" value={backSlope} onChange={(e) => setBackSlope(Number(e.target.value))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onSave({
                  total: { courseRating: totalCR, slopeRating: totalSlope },
                  front: frontCR > 0 ? { courseRating: frontCR, slopeRating: frontSlope } : undefined,
                  back: backCR > 0 ? { courseRating: backCR, slopeRating: backSlope } : undefined,
                });
                setEditing(false);
              }}
              className="flex-1 rounded-md bg-green-700 px-4 py-2 text-white text-sm font-medium hover:bg-green-800"
            >
              Save Ratings
            </button>
            <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function HoleEditor({
  holes,
  onSave,
}: {
  holes: { number: number; par: number; yardage: number; handicap: number }[];
  onSave: (holes: { number: number; par: number; yardage: number; handicap: number }[]) => void;
}) {
  const [editedHoles, setEditedHoles] = useState(holes.map((h) => ({ ...h })));
  const [dirty, setDirty] = useState(false);

  function updateHole(idx: number, field: 'par' | 'handicap' | 'yardage', value: number) {
    const updated = [...editedHoles];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditedHoles(updated);
    setDirty(true);
  }

  function resetAll() {
    setEditedHoles(holes.map((h) => ({ ...h })));
    setDirty(false);
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Hole Data</h3>
        {dirty && (
          <div className="flex gap-2">
            <button onClick={resetAll} className="text-xs text-gray-500 hover:text-gray-700">Reset</button>
            <button
              onClick={() => { onSave(editedHoles); setDirty(false); }}
              className="text-xs bg-green-700 text-white px-3 py-1 rounded-md hover:bg-green-800 font-medium"
            >
              Save Changes
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Hole</th>
              {editedHoles.map((h) => (
                <th key={h.number} className="px-1 py-1.5 text-center text-gray-500 font-medium min-w-[36px]">{h.number}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-gray-100">
              <td className="px-2 py-1.5 text-gray-600 font-medium">Par</td>
              {editedHoles.map((h, i) => (
                <td key={h.number} className="px-0.5 py-1">
                  <input
                    type="number"
                    value={h.par}
                    onChange={(e) => updateHole(i, 'par', Number(e.target.value))}
                    className="w-full text-center rounded border border-gray-200 px-1 py-0.5 text-xs focus:border-green-500 focus:outline-none"
                    min={3}
                    max={6}
                  />
                </td>
              ))}
            </tr>
            <tr className="border-t border-gray-100">
              <td className="px-2 py-1.5 text-gray-600 font-medium">Hcp</td>
              {editedHoles.map((h, i) => (
                <td key={h.number} className="px-0.5 py-1">
                  <input
                    type="number"
                    value={h.handicap}
                    onChange={(e) => updateHole(i, 'handicap', Number(e.target.value))}
                    className="w-full text-center rounded border border-gray-200 px-1 py-0.5 text-xs focus:border-green-500 focus:outline-none"
                    min={1}
                    max={18}
                  />
                </td>
              ))}
            </tr>
            <tr className="border-t border-gray-100">
              <td className="px-2 py-1.5 text-gray-600 font-medium">Yds</td>
              {editedHoles.map((h, i) => (
                <td key={h.number} className="px-0.5 py-1">
                  <input
                    type="number"
                    value={h.yardage}
                    onChange={(e) => updateHole(i, 'yardage', Number(e.target.value))}
                    className="w-full text-center rounded border border-gray-200 px-1 py-0.5 text-xs focus:border-green-500 focus:outline-none"
                    min={50}
                    max={700}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[10px] text-gray-400">
        Hcp = hole difficulty ranking (1 = hardest, 18 = easiest). Determines where handicap strokes are given.
      </p>
    </div>
  );
}
