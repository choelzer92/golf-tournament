// F-100 / F-102 b (§5.bx): a plus index is stored negative and only WRITTEN with a "+". The seam
// is text ⇄ number, so it gets two guards: the "+" chip's sign flip, and a source scan that no
// handicap text is read with plain parseFloat/Number (both read "+2.1" as 2.1, a plus golfer
// turned into a 2 who receives strokes).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isPlusText, toggleIndexSign } from '@/components/handicap-index-input';
import { formatHandicap, formatHandicapIndex, parseGhinIndex } from '@/lib/game-state';
import { explainPlayingHandicap } from '@/lib/pool-game';
import { makeCourse, makePlayer } from './fixtures';

describe('F-100: the "+" chip beside the handicap box', () => {
  it('flips the sign of what is typed, and reads back as a plus index', () => {
    expect(toggleIndexSign('2.1')).toBe('+2.1');
    expect(toggleIndexSign('+2.1')).toBe('2.1');
    expect(toggleIndexSign(' -2.1 ')).toBe('2.1');
    expect(parseGhinIndex(toggleIndexSign('2.1'))).toBe(-2.1);
    expect(parseGhinIndex(toggleIndexSign(toggleIndexSign('2.1')))).toBe(2.1);
  });

  it('an empty box toggles to "+" and back, and "+" alone is no index yet', () => {
    expect(toggleIndexSign('')).toBe('+');
    expect(toggleIndexSign('+')).toBe('');
    expect(parseGhinIndex('+')).toBeNull();
  });

  it('lights the chip for a plus index, and for a bare "+" waiting for its number', () => {
    for (const t of ['+2.1', '-2.1', '+0.4', '+']) expect(isPlusText(t), t).toBe(true);
    for (const t of ['2.1', '0', '', '-']) expect(isPlusText(t), t).toBe(false);
  });

  it('a stored plus index pre-fills as "+2.1" and saves back unchanged', () => {
    expect(parseGhinIndex(formatHandicapIndex(-2.1, ''))).toBe(-2.1);
    expect(isPlusText(formatHandicapIndex(-2.1, ''))).toBe(true);
  });
});

describe('F-102 d: every handicap on screen is written "+N", never "-N"', () => {
  it('formatHandicap spells course and playing handicaps the way golfers write them', () => {
    expect(formatHandicap(-2)).toBe('+2');
    expect(formatHandicap(14)).toBe('14');
    expect(formatHandicap(0)).toBe('0');
    expect(formatHandicap(-1.849, 1)).toBe('+1.8');
    expect(formatHandicap(-0.001, 2)).toBe('0.00');   // rounds to scratch: no sign
    expect(formatHandicap(3.456, 2)).toBe('3.46');
  });

  it('the "how this number is calculated" chain shows a plus player with "+" on every line', () => {
    for (const allowance of [100, 90]) {
      for (const nine of [null, 'front9'] as const) {
        const chain = explainPlayingHandicap(makePlayer(1, -2.1), makeCourse(), allowance, 'course', nine);
        for (const step of chain.steps) expect(step.value, step.label).not.toMatch(/-/);
        expect(chain.steps[0].value).toBe('+2.1');
      }
    }
  });
});

describe('F-102 b: no handicap text is parsed without its sign', () => {
  const root = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { if (e !== 'test') walk(p); }
      else if (/\.(ts|tsx)$/.test(e)) files.push(p);
    }
  };
  walk(root);

  it('every parseFloat/Number on a handicap or index value is the allowance percentage, never an index', () => {
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const m = line.match(/(parseFloat|Number)\(([^)]*)\)/g) ?? [];
        for (const call of m) {
          if (/handicap|hcap|index|\bHI\b/i.test(call) && !/allowance/i.test(call)) {
            offenders.push(`${relative(root, f)}:${i + 1}  ${call}`);
          }
        }
      });
    }
    expect(offenders, 'read a typed handicap with parseGhinIndex').toEqual([]);
  });
});
