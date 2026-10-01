// A4 (roadmap 2026-10): one money formatter. Winners carry "+", losers U+2212, zero has no sign;
// the game UI never shows cents, and the ledger always does.
import { describe, expect, it } from 'vitest';

import { ledgerMoney, money } from '@/lib/money-format';

describe('money (game UI, whole dollars)', () => {
  it('signs winners and losers, outside the $', () => {
    expect(money(12)).toBe('+$12');
    expect(money(-12)).toBe('−$12');
    expect(money(0)).toBe('$0');
  });
  it('rounds the magnitude, so a zero-sum pair stays mirrored (F-024)', () => {
    expect(money(12.5)).toBe('+$13');
    expect(money(-12.5)).toBe('−$13');
  });
  it('a value that rounds to zero carries no sign', () => {
    expect(money(0.4)).toBe('$0');
    expect(money(-0.4)).toBe('$0');
  });
  it('never shows cents', () => {
    expect(money(33.33)).toBe('+$33');
  });
});

describe('ledgerMoney (the stats/settlement ledger)', () => {
  it('shows cents, with the sign outside the $', () => {
    expect(ledgerMoney(12.5)).toBe('+$12.50');
    expect(ledgerMoney(-12.5)).toBe('−$12.50');
    expect(ledgerMoney(0)).toBe('$0.00');
  });
  it('a float-noise zero carries no sign', () => {
    expect(ledgerMoney(-0.001)).toBe('$0.00');
    expect(ledgerMoney(0.004)).toBe('$0.00');
  });
});
