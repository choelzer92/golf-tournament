// The one money formatter (UI_CONVENTIONS §1). Pure. Sign outside the $, a U+2212 minus, and the
// MAGNITUDE rounded, never the signed value (F-024: Math.round(±12.5) rounds the two signs apart).

/** Game UI: whole dollars. +$12, −$12, $0. */
export function money(n: number): string {
  const whole = Math.round(Math.abs(n));
  if (whole === 0) return '$0';
  return `${n > 0 ? '+' : '−'}$${whole}`;
}

/** The stats/settlement ledger, the one accounting surface that shows cents. +$12.50, −$12.50, $0.00. */
export function ledgerMoney(n: number): string {
  const cents = Math.abs(n).toFixed(2);
  if (cents === '0.00') return '$0.00';
  return `${n > 0 ? '+' : '−'}$${cents}`;
}
