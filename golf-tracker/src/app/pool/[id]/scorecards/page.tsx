'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import type { PoolGame, PoolTeamDetail } from '@/lib/pool-game';
import { loadPoolGame, fetchPoolGame, savePoolGame, computePoolPlayerDetails } from '@/lib/pool-game';

// The real Spring Creek scorecard. We render the ORIGINAL vector PDF to a
// high-res canvas (crisp at any print size) and overlay names + stroke dots on
// top. Positions are % of the card so they scale and print consistently;
// calibrated once per course and saved to localStorage.
const CARD_PDF = '/spring-creek-scorecard.pdf';
const CARD_ASPECT = 792 / 612; // PDF MediaBox (landscape US Letter)
const RENDER_SCALE = 2.5;       // supersample for a sharp background

interface Calib {
  front1X: number;  // % X, center of hole 1 column
  frontStep: number; // % X per hole across the front nine
  back1X: number;    // % X, center of hole 10 column
  backStep: number;  // % X per hole across the back nine
  nameX: number;     // % X where player names print
  row1Y: number;     // % Y, center of the first player row
  rowStep: number;   // % Y per player row
}

// Defaults measured from the scorecard PDF by pixel-detecting its grid lines
// (hole-column and player-row boundaries), so cards align out of the box. The
// Align panel can still fine-tune per course if a printer shifts things.
const DEFAULT_CALIB: Calib = {
  front1X: 16.0, frontStep: 3.5,
  back1X: 54.23, backStep: 3.51,
  nameX: 4.0, row1Y: 53.27, rowStep: 2.69,
};

function calibKey(courseId: number | undefined) {
  return `poolcard_calib_${courseId ?? 'default'}`;
}

// Render the vector PDF to a PNG data URL ONCE, then share it across all cards.
let cardImagePromise: Promise<string> | null = null;
async function renderCardImage(): Promise<string> {
  if (cardImagePromise) return cardImagePromise;
  cardImagePromise = (async () => {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ url: CARD_PDF }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  })();
  return cardImagePromise;
}

// Background = the crisp PDF render (shared across every foursome card).
function PdfBackground({ className }: { className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    renderCardImage().then((s) => { if (alive) setSrc(s); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!src) return <div className={`${className ?? ''} bg-gray-50 animate-pulse`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Spring Creek scorecard" className={`${className ?? ''} object-contain`} />;
}

export default function PoolScorecardsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [game, setGame] = useState<PoolGame | null>(null);
  const [calib, setCalib] = useState<Calib>(DEFAULT_CALIB);
  const [showCalib, setShowCalib] = useState(false);

  useEffect(() => {
    const cached = loadPoolGame(id);
    if (cached) setGame(cached);
    fetchPoolGame(id).then((g) => {
      if (g) setGame(g);
      else if (!cached) router.push('/dashboard');
    });
  }, [id, router]);

  // Load saved alignment: prefer the game's (shared across devices via the DB),
  // then a per-device localStorage value, else defaults.
  useEffect(() => {
    if (!game) return;
    if (game.scorecardCalib) {
      setCalib({ ...DEFAULT_CALIB, ...game.scorecardCalib });
      return;
    }
    try {
      const saved = localStorage.getItem(calibKey(game.course?.courseId));
      if (saved) setCalib({ ...DEFAULT_CALIB, ...JSON.parse(saved) });
    } catch { /* ignore */ }
  }, [game]);

  const details = useMemo(() => (game ? computePoolPlayerDetails(game, new Map()) : []), [game]);

  if (!game) return null;

  function saveCalib() {
    // Persist to the game so the alignment syncs to every device (his phone,
    // your computer). Also keep a local copy as a courtesy fallback.
    savePoolGame({ ...game!, scorecardCalib: { ...calib } });
    setGame({ ...game!, scorecardCalib: { ...calib } });
    try { localStorage.setItem(calibKey(game!.course?.courseId), JSON.stringify(calib)); } catch { /* ignore */ }
    setShowCalib(false);
  }
  function resetCalib() { setCalib(DEFAULT_CALIB); }

  return (
    <div className="min-h-full bg-gray-200">
      {/* Landscape print + hide chrome on print */}
      <style>{`@media print { @page { size: landscape; margin: 0; } body { background: white; } }`}</style>

      {/* Toolbar (hidden on print) */}
      <div className="print:hidden bg-green-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{game.name} — Scorecards</h1>
            <p className="text-xs text-green-200">{game.teams.length} foursome{game.teams.length === 1 ? '' : 's'} · one card per page</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowCalib((s) => !s)} className="text-sm text-green-200 hover:text-white">
              {showCalib ? 'Hide align' : 'Align'}
            </button>
            <button onClick={() => window.print()} className="rounded-md bg-white text-green-800 px-4 py-1.5 text-sm font-semibold hover:bg-green-50">Print</button>
            <button onClick={() => router.push(`/pool/${id}`)} className="text-sm text-green-200 hover:text-white">Back</button>
          </div>
        </div>
        {showCalib && <CalibPanel calib={calib} setCalib={setCalib} onSave={saveCalib} onReset={resetCalib} />}
      </div>

      <div className="max-w-6xl mx-auto p-3 space-y-4 print:p-0 print:space-y-0 print:max-w-none">
        {details.map((team, idx) => (
          <div key={team.teamId} className={idx > 0 ? 'print:break-before-page' : ''}>
            <ScorecardOverlay game={game} team={team} calib={calib} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScorecardOverlay({ game, team, calib }: { game: PoolGame; team: PoolTeamDetail; calib: Calib }) {
  const holeX = (n: number) => (n <= 9 ? calib.front1X + (n - 1) * calib.frontStep : calib.back1X + (n - 10) * calib.backStep);
  const rowY = (i: number) => calib.row1Y + i * calib.rowStep;
  const strokesOn = (holes: PoolTeamDetail['players'][number]['holes'], n: number) =>
    holes.find((h) => h.holeNumber === n)?.strokes ?? 0;

  const poolTeam = game.teams.find((t) => t.id === team.teamId);

  return (
    // `container-type: size` makes cqw/cqh units resolve against THIS card, so
    // the overlay text scales with the card — identical on phone, desktop, print.
    <div
      className="relative w-full bg-white shadow print:shadow-none"
      style={{ aspectRatio: String(CARD_ASPECT), containerType: 'size' }}
    >
      <PdfBackground className="absolute inset-0 w-full h-full" />

      {/* Group label (top area, over blank space near the logo) */}
      <div className="absolute" style={{ left: '3%', top: '46.5%' }}>
        <span className="font-bold text-gray-800" style={{ fontSize: '1.7cqw' }}>
          {poolTeam?.name}{poolTeam?.teeTime ? ` · ${poolTeam.teeTime}` : ''}
        </span>
      </div>

      {team.players.map((pl, i) => {
        const y = rowY(i);
        return (
          <div key={pl.playerId}>
            {/* Player name in the row's left cell */}
            <div className="absolute -translate-y-1/2 whitespace-nowrap" style={{ left: `${calib.nameX}%`, top: `${y}%` }}>
              <span className="font-semibold text-gray-900" style={{ fontSize: '1.25cqw' }}>{pl.playerName}</span>
            </div>
            {/* Stroke dots — upper-right of each hole box */}
            {Array.from({ length: 18 }, (_, k) => k + 1).map((n) => {
              const s = strokesOn(pl.holes, n);
              if (s <= 0) return null;
              return (
                <div
                  key={n}
                  className="absolute -translate-y-1/2 text-green-700"
                  style={{
                    left: `${holeX(n) + calib.frontStep * 0.32}%`, // nudge toward right of the box
                    top: `${y - calib.rowStep * 0.34}%`,           // nudge toward top of the box
                    lineHeight: 1,
                  }}
                >
                  <span className="font-bold" style={{ fontSize: '1cqw' }}>{'•'.repeat(s)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function CalibPanel({ calib, setCalib, onSave, onReset }: {
  calib: Calib; setCalib: (c: Calib) => void; onSave: () => void; onReset: () => void;
}) {
  const fields: { key: keyof Calib; label: string; step: number }[] = [
    { key: 'nameX', label: 'Name X', step: 0.2 },
    { key: 'row1Y', label: 'Row 1 Y', step: 0.2 },
    { key: 'rowStep', label: 'Row gap', step: 0.05 },
    { key: 'front1X', label: 'Hole 1 X', step: 0.2 },
    { key: 'frontStep', label: 'Front gap', step: 0.05 },
    { key: 'back1X', label: 'Hole 10 X', step: 0.2 },
    { key: 'backStep', label: 'Back gap', step: 0.05 },
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 pb-3">
      <p className="text-xs text-green-100 mb-2">Nudge until names sit in the blank rows and dots land in the hole boxes, then Save. (Saved per course.)</p>
      <div className="flex flex-wrap gap-3 items-end">
        {fields.map(({ key, label, step }) => (
          <label key={key} className="text-[11px] text-green-100">
            <span className="block mb-0.5">{label}</span>
            <input
              type="number" step={step} value={calib[key]}
              onChange={(e) => setCalib({ ...calib, [key]: parseFloat(e.target.value) || 0 })}
              className="w-20 rounded border border-green-600 bg-green-900 px-1.5 py-1 text-white text-xs"
            />
          </label>
        ))}
        <button onClick={onSave} className="rounded-md bg-white text-green-800 px-3 py-1.5 text-xs font-semibold">Save alignment</button>
        <button onClick={onReset} className="text-xs text-green-200 underline">Reset</button>
      </div>
    </div>
  );
}
