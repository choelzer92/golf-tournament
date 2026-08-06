'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchSoloRound,
  loadRoundLocal,
  newerRound,
  roundHoleNumbers,
  type SoloRound,
  type HoleLog,
} from '@/lib/solo-round';
import {
  clubDistanceStats,
  outcomeCounts,
  strokesForHole,
  holeStarted,
  roundToPar,
  ACCURACY_LIMIT_M,
  type ClubStat,
} from '@/lib/shot-distance';
import { clubLabel, OUTCOME_LABEL, type OutcomeTag } from '@/lib/clubs';

// Post-round summary: a scorecard built from shot counts + the first taste of
// the trainer payoff — your real measured distance per club this round. The
// persistent cross-round dashboard is a later layer.

export default function SoloSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [round, setRound] = useState<SoloRound | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const local = loadRoundLocal(id);
    if (local) setRound(local);
    fetchSoloRound(id).then((server) => {
      const best = newerRound(local, server);
      if (!best) { if (!local) setNotFound(true); return; }
      setRound(best);
    });
  }, [id]);

  if (notFound) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-500 py-16">
          Round not found. <button onClick={() => router.push('/solo')} className="text-green-700 underline">Back to solo</button>
        </p>
      </div>
    );
  }
  if (!round) {
    return (
      <div className="min-h-full bg-gray-50">
        <p className="text-center text-gray-400 py-16">Loading…</p>
      </div>
    );
  }

  const played = round.holes.filter(holeStarted);
  const totalStrokes = played.reduce((s, h) => s + strokesForHole(h), 0);
  const totalPar = played.reduce((s, h) => s + h.par, 0);
  const toPar = roundToPar(round);
  const stats = clubDistanceStats(round).filter((s) => s.n > 0).sort((a, b) => b.meanYds - a.meanYds);
  const droppedOnly = clubDistanceStats(round).filter((s) => s.n === 0 && s.dropped > 0);

  return (
    <div className="min-h-full bg-gray-50 pb-16">
      <header className="bg-green-800 text-white shadow">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Round summary</h1>
            <p className="text-sm text-green-200 truncate">{round.course.courseName}</p>
          </div>
          <button onClick={() => router.push('/solo')} className="text-sm text-green-200 hover:text-white">
            Done
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Score summary */}
        <section className="bg-white rounded-lg shadow p-4 flex items-center justify-around text-center">
          <div>
            <p className="text-3xl font-bold text-gray-900">{totalStrokes}</p>
            <p className="text-xs text-gray-500">Strokes</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">
              {toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
            </p>
            <p className="text-xs text-gray-500">To par ({totalPar})</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{played.length}</p>
            <p className="text-xs text-gray-500">Holes</p>
          </div>
        </section>

        {/* Scorecard */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Scorecard</h2>
          <Scorecard round={round} />
        </section>

        {/* Distances */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Your distances this round</h2>
          <p className="text-xs text-gray-500 mb-3">
            Measured from GPS between shots (total distance, roll included). Phone GPS is ~3–5m, so a
            single shot is approximate — the average tightens as you log more rounds.
          </p>
          {stats.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white rounded-lg shadow p-4">
              No measured full-swing distances yet. A shot&rsquo;s distance comes from the GPS of the
              next shot, so you need at least two positioned shots on a hole.
            </p>
          ) : (
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {stats.map((s) => (
                <DistanceRow key={s.club} stat={s} />
              ))}
            </div>
          )}
          {droppedOnly.length > 0 && (
            <p className="text-xs text-amber-700 mt-2">
              Excluded from averages (weak GPS, worse than ±{ACCURACY_LIMIT_M}m):{' '}
              {droppedOnly.map((s) => `${clubLabel(s.club)} (${s.dropped})`).join(', ')}.
            </p>
          )}
          <div className="mt-2">
            <ScoreGapNote round={round} />
          </div>
        </section>

        <OutcomePanel round={round} />

        {/* Voice log export — for offline grammar tuning (no runtime AI). */}
        {(round.voiceLog?.length ?? 0) > 0 && <VoiceLogExport round={round} />}
      </main>
    </div>
  );
}

// Lets you copy every raw voice transcript + how the local parser read it, so
// the phrasings can be analyzed offline (paste to Claude between sessions) to
// hand-tune the free, on-device grammar in shot-voice.ts. No AI runs in the app.
function VoiceLogExport({ round }: { round: SoloRound }) {
  const [copied, setCopied] = useState(false);
  const log = round.voiceLog ?? [];

  const corrections = log.filter((e) => e.corrected);

  function text(): string {
    const header =
      `Solo round voice log — ${round.course.courseName} — ${new Date(round.startedAt).toLocaleString()}\n` +
      `${log.length} utterances, ${corrections.length} hand-corrected\n`;
    // A corrected line carries the ground truth, so mark it clearly — those are
    // the entries worth tuning the grammar against.
    const lines = log.map((e) =>
      e.corrected
        ? `[H${e.hole}] FIXED "${e.transcript}"\n         heard  → ${e.parsed}\n         should → ${e.corrected}`
        : `[H${e.hole}] "${e.transcript}"  →  ${e.parsed}`,
    );
    return `${header}\n${lines.join('\n')}\n`;
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the textarea below is the fallback */
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Voice log</h2>
      <p className="text-xs text-gray-500 mb-2">
        {log.length} thing{log.length !== 1 ? 's' : ''} you said this round
        {corrections.length > 0 && (
          <>
            , <span className="font-medium text-green-700">{corrections.length} you corrected by hand</span>
          </>
        )}
        . Copy and share it so the voice recognition can be tuned to how you actually talk
        {corrections.length > 0 ? ' — the corrections are the most useful part' : ''}.
      </p>
      <button
        onClick={copy}
        className="rounded-md border border-green-700 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
      >
        {copied ? '✓ Copied' : 'Copy voice log'}
      </button>
      <textarea
        readOnly
        value={text()}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full h-40 rounded-md border border-gray-300 p-2 text-xs font-mono text-gray-700"
      />
    </section>
  );
}

function DistanceRow({ stat }: { stat: ClubStat }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="font-medium text-gray-900">{clubLabel(stat.club)}</p>
        <p className="text-xs text-gray-500">
          {stat.n} shot{stat.n !== 1 ? 's' : ''} · range {Math.round(stat.minYds)}–{Math.round(stat.maxYds)} yds
          {stat.dropped > 0 ? ` · ${stat.dropped} weak-GPS excluded` : ''}
          {stat.mishits > 0 ? ` · ${stat.mishits} mishit${stat.mishits !== 1 ? 's' : ''} excluded` : ''}
        </p>
        {/* Median is the number to trust for club selection — one topped shot
            drags the mean but barely moves the median. Only worth showing when
            they actually disagree. */}
        {stat.n > 2 && Math.abs(stat.medianYds - stat.meanYds) >= 3 && (
          <p className="text-xs text-gray-500">typical {Math.round(stat.medianYds)} yds (median)</p>
        )}
      </div>
      <div className="text-right">
        <p className="text-2xl font-bold text-gray-900">{Math.round(stat.meanYds)}</p>
        <p className="text-xs text-gray-500">± {Math.round(stat.stdYds)} yds</p>
      </div>
    </div>
  );
}

// Where you missed, across the round. Only counts shots you reported on, so the
// denominator is stated explicitly — a tendency drawn from 6 of 40 shots
// shouldn't read like it covers the round.
function OutcomePanel({ round }: { round: SoloRound }) {
  const { directions, strikes, reported, total } = outcomeCounts(round);
  if (reported === 0) return null;

  const rows = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Where it went</h2>
      <p className="text-xs text-gray-500 mb-3">
        From the {reported} of {total} shot{total !== 1 ? 's' : ''} you called out. GPS can&rsquo;t see
        curve or contact, so this is only what you said.
      </p>
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        {directions.size > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Direction</p>
            <div className="flex flex-wrap gap-1.5">
              {rows(directions).map(([tag, n]) => (
                <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                  {OUTCOME_LABEL[tag as OutcomeTag] ?? tag} · {n}
                </span>
              ))}
            </div>
          </div>
        )}
        {strikes.size > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Contact</p>
            <div className="flex flex-wrap gap-1.5">
              {rows(strikes).map(([tag, n]) => (
                <span key={tag} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                  {OUTCOME_LABEL[tag as OutcomeTag] ?? tag} · {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// Holes where the announced score didn't match the shots logged. The score is
// kept as authoritative (so the card is right), but the gap became putts — which
// would quietly distort putting stats if it weren't surfaced.
function ScoreGapNote({ round }: { round: SoloRound }) {
  const gaps = round.holes.filter((h) => {
    if (h.scoreSaid == null) return false;
    // A normal hole: shots logged + putts == announced score, with putts
    // plausible (<= 4). A large derived putt count means shots went unlogged.
    return h.putts > 4 || h.shots.length === 0;
  });
  if (gaps.length === 0) return null;

  return (
    <p className="text-xs text-amber-700">
      Heads up: hole{gaps.length !== 1 ? 's' : ''} {gaps.map((h) => h.hole).join(', ')} ended with more
      derived putts than expected — the score you called out was kept, but some shots probably
      weren&rsquo;t logged, so putting numbers on those holes are off.
    </p>
  );
}

// A compact scorecard: hole numbers across the top, par, and score (with the
// familiar OUT/IN/TOTAL splits when 18 holes were played).
function Scorecard({ round }: { round: SoloRound }) {
  const nums = roundHoleNumbers(round.holesPlaying);
  const byNumber = new Map<number, HoleLog>(round.holes.map((h) => [h.hole, h]));

  const front = nums.filter((n) => n <= 9);
  const back = nums.filter((n) => n >= 10);

  const sumStrokes = (holes: number[]) =>
    holes.reduce((s, n) => {
      const h = byNumber.get(n);
      return h && holeStarted(h) ? s + strokesForHole(h) : s;
    }, 0);
  const sumPar = (holes: number[]) =>
    holes.reduce((s, n) => s + (byNumber.get(n)?.par ?? 0), 0);

  const renderNine = (holes: number[], label: string) => {
    if (holes.length === 0) return null;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-green-800 text-white">
              <th className="px-2 py-1.5 text-left font-medium">Hole</th>
              {holes.map((n) => (
                <th key={n} className="px-2 py-1.5 text-center font-medium w-8">{n}</th>
              ))}
              <th className="px-2 py-1.5 text-center font-medium">{label}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="px-2 py-1.5 text-gray-500">Par</td>
              {holes.map((n) => (
                <td key={n} className="px-2 py-1.5 text-center text-gray-500">{byNumber.get(n)?.par ?? '–'}</td>
              ))}
              <td className="px-2 py-1.5 text-center text-gray-500 font-medium">{sumPar(holes)}</td>
            </tr>
            <tr>
              <td className="px-2 py-1.5 font-medium text-gray-800">Score</td>
              {holes.map((n) => {
                const h = byNumber.get(n);
                const started = h && holeStarted(h);
                const strokes = started ? strokesForHole(h) : null;
                const par = h?.par ?? 0;
                const rel = strokes != null ? strokes - par : 0;
                return (
                  <td
                    key={n}
                    className={`px-2 py-1.5 text-center font-semibold ${strokes == null ? 'text-gray-300' : rel < 0 ? 'text-red-600' : rel > 0 ? 'text-gray-900' : 'text-green-700'}`}
                  >
                    {strokes ?? '–'}
                  </td>
                );
              })}
              <td className="px-2 py-1.5 text-center font-bold text-gray-900">{sumStrokes(holes)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const total = sumStrokes(nums);
  const totalPar = sumPar(nums);

  return (
    <div className="bg-white rounded-lg shadow p-3 space-y-3">
      {renderNine(front, 'OUT')}
      {renderNine(back, 'IN')}
      {front.length > 0 && back.length > 0 && (
        <p className="text-right text-sm font-semibold text-gray-900 pr-2">
          Total: {total} ({total - totalPar === 0 ? 'E' : total - totalPar > 0 ? `+${total - totalPar}` : total - totalPar})
        </p>
      )}
    </div>
  );
}
