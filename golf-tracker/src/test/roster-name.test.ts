// F-027 — blank names on the my-groups page traced to empty-`name` roster rows
// written by untrimmed GHIN-add paths. These pin the two pure guards in
// roster.ts: the render fallback and the upsert don't-blank-a-name rule.
// (setup.ts stubs @/lib/supabase, so importing roster.ts touches no persistence.)

import { describe, it, expect } from 'vitest';
import { rosterDisplayName, resolveUpsertName } from '@/lib/roster';

describe('F-027: rosterDisplayName never renders blank', () => {
  it('returns the name when present', () => {
    expect(rosterDisplayName({ name: 'Craig Hoelzer', ghinNumber: 1234567 })).toBe('Craig Hoelzer');
  });

  it('falls back to GHIN # for an empty name', () => {
    expect(rosterDisplayName({ name: '', ghinNumber: 1234567 })).toBe('GHIN #1234567');
  });

  it('treats whitespace-only as blank (the untrimmed-writer shape)', () => {
    expect(rosterDisplayName({ name: '  ', ghinNumber: 1234567 })).toBe('GHIN #1234567');
  });

  it('has a label even with no GHIN number', () => {
    expect(rosterDisplayName({ name: '', ghinNumber: null })).toBe('Unnamed player');
  });

  it('trims surrounding whitespace off a real name', () => {
    expect(rosterDisplayName({ name: ' Ann Chen ', ghinNumber: null })).toBe('Ann Chen');
  });
});

describe('F-027: resolveUpsertName refuses to blank a stored name', () => {
  it('keeps the incoming name when non-empty', () => {
    expect(resolveUpsertName('Ann Chen', 'Old Name', 55)).toBe('Ann Chen');
  });

  it('trims the incoming name', () => {
    expect(resolveUpsertName(' Ann Chen ', undefined, null)).toBe('Ann Chen');
  });

  it('preserves the existing name when the update supplies an empty one', () => {
    expect(resolveUpsertName('', 'Ann Chen', 55)).toBe('Ann Chen');
  });

  it('preserves the existing name against whitespace-only (the 24h-refresh re-upsert shape)', () => {
    expect(resolveUpsertName('   ', 'Ann Chen', 55)).toBe('Ann Chen');
  });

  it('falls back to GHIN # when both are blank', () => {
    expect(resolveUpsertName('', '', 1234567)).toBe('GHIN #1234567');
  });

  it('falls back to GHIN # when there is no existing row', () => {
    expect(resolveUpsertName(' ', undefined, 1234567)).toBe('GHIN #1234567');
  });
});
