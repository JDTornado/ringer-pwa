import { describe, expect, it } from 'vitest';
import {
  allowedConfigs,
  applyPoints,
  applyRingerTap,
  applySide,
  defaultConfig,
  draftFromFrame,
  draftToFrame,
  isDraftComplete,
  optionStates,
  validateFrame,
  type FrameDraft,
} from './ringerRules';
import type { Side } from './types';

// ---------------------------------------------------------------------------
// EXPECTED: written out by hand from docs/data-model.md, "Ringer entry
// validation". Each entry lists the allowed "scorer-opponent" ringer pairs.
// Every pair not listed must be rejected. Deliberately NOT derived from
// RINGER_TABLE, so a wrong table edit fails here.
// ---------------------------------------------------------------------------
const EXPECTED: Record<string, string[]> = {
  none: ['0-0', '1-1', '2-2'], // must equal each other; all dead
  '1': ['0-0', '1-1'], //         no live ringer
  '2': ['0-0'], //                two closes
  '3': ['1-0', '2-1'], //         exactly one live ringer, no close
  '4': ['1-0'], //                one live + one close
  '5': [], //                     impossible
  '6': ['2-0'], //                two live
};
const EXPECTED_DEFAULT: Record<string, string | null> = {
  none: '0-0',
  '1': '0-0',
  '2': '0-0',
  '3': '1-0',
  '4': '1-0',
  '5': null,
  '6': '2-0',
};

const SCORES: Array<{ label: string; points: number | null }> = [
  { label: 'none', points: null },
  { label: '1', points: 1 },
  { label: '2', points: 2 },
  { label: '3', points: 3 },
  { label: '4', points: 4 },
  { label: '5', points: 5 },
  { label: '6', points: 6 },
];
const PAIRS = [0, 1, 2].flatMap((s) => [0, 1, 2].map((o) => [s, o] as const));
const key = (s: number, o: number) => `${s}-${o}`;

describe('ringer table: every score x every (scorer, opponent) pair', () => {
  for (const { label, points } of SCORES) {
    const expected = EXPECTED[label] ?? [];
    for (const [s, o] of PAIRS) {
      const allowed = expected.includes(key(s, o));
      it(`score ${label}: scorer ${s}, opponent ${o} -> ${allowed ? 'allowed' : 'rejected'}`, () => {
        const got = allowedConfigs(points).map(([a, b]) => key(a, b));
        expect(got.includes(key(s, o))).toBe(allowed);

        // validateFrame agrees, with the scorer on either side.
        for (const side of ['a', 'b'] as Side[]) {
          const scoringSide = label === 'none' ? null : side;
          const frame = {
            scoringSide,
            points: points ?? 0,
            ringersA: side === 'a' ? s : o,
            ringersB: side === 'a' ? o : s,
          };
          expect(validateFrame(frame).length === 0).toBe(allowed);
        }
      });
    }
  }

  it('allowedConfigs(0) is the same as allowedConfigs(null) (nobody scored)', () => {
    expect(allowedConfigs(0)).toEqual(allowedConfigs(null));
  });

  it('out-of-range points have no configs', () => {
    for (const p of [-1, 7, 2.5]) expect(allowedConfigs(p)).toEqual([]);
  });

  for (const { label, points } of SCORES) {
    it(`default for ${label} is ${EXPECTED_DEFAULT[label]}`, () => {
      const d = defaultConfig(points);
      expect(d === null ? null : key(d[0], d[1])).toBe(EXPECTED_DEFAULT[label]);
    });
  }
});

describe('validateFrame problems', () => {
  const codes = (f: Parameters<typeof validateFrame>[0]) => validateFrame(f).map((p) => p.code);

  it('rejects 5 points', () => {
    expect(codes({ scoringSide: 'a', points: 5, ringersA: 1, ringersB: 0 })).toContain('points-five');
  });
  it('rejects points out of range', () => {
    expect(codes({ scoringSide: 'a', points: 7, ringersA: 2, ringersB: 0 })).toContain('points-out-of-range');
    expect(codes({ scoringSide: 'a', points: -1, ringersA: 0, ringersB: 0 })).toContain('points-out-of-range');
  });
  it('rejects points with nobody scoring, and a scorer with 0 points', () => {
    expect(codes({ scoringSide: null, points: 2, ringersA: 0, ringersB: 0 })).toContain('no-score-with-points');
    expect(codes({ scoringSide: 'b', points: 0, ringersA: 0, ringersB: 0 })).toContain('score-without-points');
  });
  it('rejects ringer counts out of range', () => {
    expect(codes({ scoringSide: 'a', points: 6, ringersA: 3, ringersB: 0 })).toContain('ringers-out-of-range');
  });
  it('rejects the same player as both throwers', () => {
    expect(
      codes({ scoringSide: 'a', points: 1, ringersA: 0, ringersB: 0, throwerA: 'x', throwerB: 'x' }),
    ).toContain('same-thrower');
  });
  it('a valid frame has no problems', () => {
    expect(validateFrame({ scoringSide: 'b', points: 3, ringersA: 1, ringersB: 2 })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Draft interactions: couplings (scorer = side A unless stated)
// ---------------------------------------------------------------------------
const pair = (d: FrameDraft) => `${d.ringersA}-${d.ringersB}`;
const scored = (points: number, side: Side = 'a') => applyPoints(applySide(side), points);

describe('applySide / applyPoints', () => {
  it('choosing a side leaves points pending and ringers at 0', () => {
    expect(applySide('b')).toEqual({ scoringSide: 'b', points: null, ringersA: 0, ringersB: 0 });
  });
  it('choosing No score sets 0 points and (0,0)', () => {
    expect(applySide(null)).toEqual({ scoringSide: null, points: 0, ringersA: 0, ringersB: 0 });
  });
  it('choosing points resets ringers to that score default, oriented to the scorer', () => {
    expect(pair(scored(6, 'a'))).toBe('2-0');
    expect(pair(scored(6, 'b'))).toBe('0-2');
    const changed = applyPoints(applyRingerTap(scored(3), 'a', 2), 4);
    expect(pair(changed)).toBe('1-0');
  });
  it('5 is never accepted', () => {
    const d = applySide('a');
    expect(applyPoints(d, 5)).toBe(d);
  });
  it('points cannot be set on a No score draft', () => {
    const d = applySide(null);
    expect(applyPoints(d, 3)).toBe(d);
  });
  it('isDraftComplete: pending points is incomplete, a valid verdict is complete', () => {
    expect(isDraftComplete(applySide('a'))).toBe(false);
    expect(isDraftComplete(scored(4))).toBe(true);
    expect(isDraftComplete(applySide(null))).toBe(true);
  });
});

describe('applyRingerTap couplings', () => {
  it('none: either thrower moves both (all ringers cancel)', () => {
    const d = applySide(null);
    expect(pair(applyRingerTap(d, 'a', 2))).toBe('2-2');
    expect(pair(applyRingerTap(d, 'b', 1))).toBe('1-1');
    expect(pair(applyRingerTap(applyRingerTap(d, 'a', 2), 'b', 0))).toBe('0-0');
  });

  it('1: taps move both throwers together; 2 is a no-op', () => {
    expect(pair(applyRingerTap(scored(1), 'a', 1))).toBe('1-1');
    expect(pair(applyRingerTap(scored(1), 'b', 1))).toBe('1-1');
    expect(pair(applyRingerTap(applyRingerTap(scored(1), 'a', 1), 'b', 0))).toBe('0-0');
    const d = scored(1);
    expect(applyRingerTap(d, 'a', 2)).toBe(d);
    expect(applyRingerTap(d, 'b', 2)).toBe(d);
  });

  it('3: scorer 2 pulls opponent to 1; scorer 1 drops opponent to 0; scorer 0 is a no-op', () => {
    const d = scored(3);
    expect(pair(d)).toBe('1-0');
    const two = applyRingerTap(d, 'a', 2);
    expect(pair(two)).toBe('2-1');
    expect(pair(applyRingerTap(two, 'a', 1))).toBe('1-0');
    expect(applyRingerTap(d, 'a', 0)).toBe(d);
  });

  it('3: opponent taps jump to the matching config; opponent 2 is a no-op', () => {
    const d = scored(3);
    expect(pair(applyRingerTap(d, 'b', 1))).toBe('2-1');
    expect(pair(applyRingerTap(applyRingerTap(d, 'b', 1), 'b', 0))).toBe('1-0');
    expect(applyRingerTap(d, 'b', 2)).toBe(d);
  });

  it('3 with side B scoring mirrors side A', () => {
    const d = scored(3, 'b');
    expect(pair(d)).toBe('0-1');
    expect(pair(applyRingerTap(d, 'b', 2))).toBe('1-2');
  });

  it('4: locked at (1,0); every other tap is a no-op', () => {
    const d = scored(4);
    for (const side of ['a', 'b'] as Side[]) {
      for (const v of [0, 1, 2]) {
        const after = applyRingerTap(d, side, v);
        expect(pair(after)).toBe('1-0');
      }
    }
  });

  it('6: locked at (2,0); every other tap is a no-op', () => {
    const d = scored(6, 'b');
    for (const side of ['a', 'b'] as Side[]) {
      for (const v of [0, 1, 2]) expect(pair(applyRingerTap(d, side, v))).toBe('0-2');
    }
  });

  it('points pending: ringers are unconstrained until a score is chosen', () => {
    const d = applyRingerTap(applyRingerTap(applySide('a'), 'a', 2), 'b', 1);
    expect(pair(d)).toBe('2-1');
  });
});

describe('optionStates', () => {
  const states = (d: FrameDraft) => {
    const o = optionStates(d);
    const fmt = (e: boolean[]) => e.map((x, v) => (x ? v : '')).join('');
    return `A:${fmt(o.a)} B:${fmt(o.b)}`;
  };
  it('enables only values that some allowed config uses', () => {
    expect(states(applySide(null))).toBe('A:012 B:012');
    expect(states(scored(1))).toBe('A:01 B:01');
    expect(states(scored(2))).toBe('A:0 B:0');
    expect(states(scored(3))).toBe('A:12 B:01');
    expect(states(scored(4))).toBe('A:1 B:0');
    expect(states(scored(6))).toBe('A:2 B:0');
    expect(states(scored(6, 'b'))).toBe('A:0 B:2');
    expect(states(applySide('a'))).toBe('A:012 B:012');
  });
});

describe('draftToFrame / draftFromFrame', () => {
  const slot = { inning: 3, end: 'north' as const };
  const throwers = { throwerA: 'pa', throwerB: 'pb' };

  it('builds a frame from a complete draft', () => {
    const d = applyRingerTap(scored(3, 'b'), 'b', 2); // b scores 3 with 2 vs 1
    expect(draftToFrame(d, slot, throwers, 'f1')).toEqual({
      id: 'f1', inning: 3, end: 'north', throwerA: 'pa', throwerB: 'pb',
      scoringSide: 'b', points: 3, ringersA: 1, ringersB: 2,
    });
  });

  it('a No score draft becomes a 0-point frame', () => {
    const f = draftToFrame(applyRingerTap(applySide(null), 'a', 1), slot, throwers, 'f2');
    expect(f).toMatchObject({ scoringSide: null, points: 0, ringersA: 1, ringersB: 1 });
  });

  it('an incomplete draft (points pending) gives null', () => {
    expect(draftToFrame(applySide('a'), slot, throwers, 'f3')).toBeNull();
  });

  it('draftFromFrame round-trips', () => {
    const d = applyRingerTap(scored(3), 'a', 2);
    const f = draftToFrame(d, slot, throwers, 'f4');
    expect(f).not.toBeNull();
    if (f) expect(draftFromFrame(f)).toEqual(d);
  });
});
