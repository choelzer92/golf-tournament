// Net | Gross (§5.by). Gross is not a format: it's a 0% allowance, which the engine already reads
// as nobody receiving strokes, so ANY format plays gross (best ball, two best, scramble, match or
// stroke play, Stableford). The switch only hides the settings that decide how many strokes someone
// gets; everything that decides the scoring stays.

/** A game is gross when its allowance is 0. */
export function isGross(allowance: number): boolean {
  return allowance === 0;
}

/** A mode's own net/gross choices (F-102 k, §5.bz). Under Gross they can only mean gross, so they
 *  are hidden; on Net they stay, so "net handicaps, gross skins" is still possible. */
export const GROSS_HIDES: string[] = ['scoreBasis', 'junkBasis'];

/** The allowance Net goes back to: the last net percentage, or full handicap. */
export function netAllowance(lastNet: number | null | undefined): number {
  return lastNet && lastNet > 0 ? lastNet : 100;
}

/** An allowance box's text as a percentage: a typed 0 is gross, a blank or unreadable box is 100. */
export function parseAllowance(raw: string): number {
  const n = parseFloat(raw);
  return Number.isNaN(n) ? 100 : n;
}

export function NetGrossSwitch({ gross, onChange }: { gross: boolean; onChange: (gross: boolean) => void }) {
  // D5: the same solid selected style as the wizard's other toggles (scoring-step `toggle`).
  const btn = (on: boolean) => `flex-1 min-h-[44px] rounded-md border px-3 py-2.5 text-sm font-medium ${
    on ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400'
  }`;
  return (
    <div>
      <div className="flex gap-2" role="radiogroup" aria-label="Net or gross">
        <button type="button" role="radio" aria-checked={!gross} onClick={() => gross && onChange(false)} className={btn(!gross)}>
          Net
        </button>
        <button type="button" role="radio" aria-checked={gross} onClick={() => !gross && onChange(true)} className={btn(gross)}>
          Gross
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {gross
          ? 'Nobody gets strokes: every score counts as played. The format, match or stroke play, and Stableford work as usual.'
          : 'Handicaps count: strokes are given as set below.'}
      </p>
    </div>
  );
}
