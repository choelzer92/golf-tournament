// Handicap strokes on one hole — the ONE allocator both engines use (F-098, §5.bv).
//
// A positive playing handicap RECEIVES strokes on the hardest holes: stroke index 1 first, a
// second stroke once the handicap passes the number of holes. A PLUS handicap (better than
// scratch) is the mirror image: it GIVES strokes back on the EASIEST holes, stroke index 18
// first (9 on the USGA 9-hole basis, where the index is re-ranked 1–9). A give-back is a
// negative stroke, so net = gross − strokes comes out one HIGHER on those holes.
//
// Before this, the pool/sides/money engines gave a plus player 0 strokes everywhere, and the
// tournament engine gave them back on the HARDEST holes.
//
// Off-the-low never reaches the negative branch: the field's low (plus or not) is subtracted
// first, so everyone is ≥ 0 and the plus player simply plays off 0.

/** Strokes on a hole with this stroke index. `holeHandicap` runs 1..numHoles (1 = hardest). */
export function strokesOnHole(playingHcap: number, holeHandicap: number, numHoles: number): number {
  const rounded = Math.round(playingHcap);
  if (rounded === 0) return 0;
  const n = Math.abs(rounded);
  // Receiving counts from the hardest hole; giving counts from the easiest.
  const rank = rounded > 0 ? holeHandicap : numHoles + 1 - holeHandicap;
  const sign = rounded > 0 ? 1 : -1;
  // The FULL handicap (F-108, §5.ct): floor(n / holes) on every hole, plus one more on the hardest
  // n mod holes. There used to be a cap at 2 a hole, which silently dropped strokes past CH 36 on
  // 18 (18 on a nine); below that this is the old allocation exactly.
  const k = Math.floor(n / numHoles) + (rank <= n % numHoles ? 1 : 0);
  return k === 0 ? 0 : k * sign;   // never −0
}
