import { describe, expect, it } from 'vitest';
import {
  checkEdit,
  currentTotals,
  gameStatus,
  inningProgress,
  inningsPlayed,
  ringerSplit,
  throwersAt,
  inningPhase,
  nextSlot,
  playerStats,
  reviewRows,
  runningTotals,
  teamStats,
} from './derive';
import type { End, Frame, Participant, Side } from './types';
import { DEFAULT_RULES } from './types';

// ---------------------------------------------------------------------------
// Helpers: build frames in play order from compact rows.
// Row: [scoringSide, points, ringersA, ringersB]
// ---------------------------------------------------------------------------
type Row = [Side | null, number, number, number];

const PARTICIPANTS: Participant[] = [
  { id: 'aS', name: 'Alice', side: 'a', end: 'south' },
  { id: 'aN', name: 'Rick', side: 'a', end: 'north' },
  { id: 'bS', name: 'Gus', side: 'b', end: 'south' },
  { id: 'bN', name: 'Bob', side: 'b', end: 'north' },
];

function framesFrom(rows: Row[]): Frame[] {
  return rows.map(([scoringSide, points, ringersA, ringersB], i) => {
    const end: End = i % 2 === 0 ? 'south' : 'north';
    return {
      id: `f${i}`,
      inning: Math.floor(i / 2) + 1,
      end,
      throwerA: end === 'south' ? 'aS' : 'aN',
      throwerB: end === 'south' ? 'bS' : 'bN',
      scoringSide,
      points,
      ringersA,
      ringersB,
    };
  });
}

const NONE: Row = [null, 0, 0, 0];
const A1: Row = ['a', 1, 0, 0];
const B1: Row = ['b', 1, 0, 0];
const repeat = <T>(n: number, x: T): T[] => Array.from({ length: n }, () => x);

// ---------------------------------------------------------------------------
// The seed game (supabase/seed.sql, game 1), frame for frame.
// ---------------------------------------------------------------------------
const SEED_ROWS: Row[] = [
  ['a', 3, 1, 0], ['b', 1, 0, 0], //   1:  3-0,  3-1
  [null, 0, 1, 1], ['a', 2, 0, 0], //  2:  3-1,  5-1
  ['b', 3, 0, 1], ['a', 1, 1, 1], //   3:  5-4,  6-4
  ['b', 4, 0, 1], ['a', 6, 2, 0], //   4:  6-8, 12-8
  [null, 0, 0, 0], ['b', 3, 1, 2], //  5: 12-8, 12-11
  ['a', 1, 0, 0], ['b', 2, 0, 0], //   6: 13-11, 13-13
  ['a', 3, 1, 0], [null, 0, 2, 2], //  7: 16-13, 16-13
  ['b', 1, 0, 0], ['a', 4, 1, 0], //   8: 16-14, 20-14
  ['b', 3, 0, 1], ['a', 2, 0, 0], //   9: 20-17, 22-17
];

describe('seed game replay (supabase/seed.sql game 1)', () => {
  const frames = framesFrom(SEED_ROWS);

  it('ends 22-17 for side A at inning 9 north, reason target', () => {
    expect(currentTotals(frames)).toEqual({ a: 22, b: 17 });
    const status = gameStatus(frames, DEFAULT_RULES);
    expect(status).toMatchObject({ over: true, winner: 'a', reason: 'target', endedAtIndex: 17 });
    const last = frames[status.endedAtIndex ?? -1];
    expect(last).toMatchObject({ inning: 9, end: 'north' });
  });

  it('is not over one frame earlier (20-17)', () => {
    expect(gameStatus(frames.slice(0, 17)).over).toBe(false);
    expect(currentTotals(frames.slice(0, 17))).toEqual({ a: 20, b: 17 });
  });

  it('running totals match the seed comments', () => {
    const totals = runningTotals(frames).map(({ a, b }) => `${a}-${b}`);
    expect(totals).toEqual([
      '3-0', '3-1', '3-1', '5-1', '5-4', '6-4', '6-8', '12-8', '12-8',
      '12-11', '13-11', '13-13', '16-13', '16-13', '16-14', '20-14', '20-17', '22-17',
    ]);
  });

  it('every seed frame is a valid ringer combination', async () => {
    const { validateFrame } = await import('./ringerRules');
    for (const f of frames) expect(validateFrame(f)).toEqual([]);
  });

  it('player stats: points, shoes, ringers, live, dead, ringer %', () => {
    const stats = Object.fromEntries(playerStats(PARTICIPANTS, frames).map((s) => [s.name, s]));
    // South frames, Alice vs Gus (A,B ringers): 1-0, 1-1, 0-1, 0-1, 0-0, 0-0, 1-0, 0-0, 0-1
    expect(stats.Alice).toMatchObject({ points: 3 + 1 + 3, shoes: 18, ringers: 3, live: 2, dead: 1 });
    expect(stats.Gus).toMatchObject({ points: 3 + 4 + 1 + 3, shoes: 18, ringers: 4, live: 3, dead: 1 });
    // North frames, Rick vs Bob: 0-0, 0-0, 1-1, 2-0, 1-2, 0-0, 2-2, 1-0, 0-0
    expect(stats.Rick).toMatchObject({ points: 2 + 1 + 6 + 4 + 2, shoes: 18, ringers: 7, live: 3, dead: 4 });
    expect(stats.Bob).toMatchObject({ points: 1 + 3 + 2, shoes: 18, ringers: 5, live: 1, dead: 4 });
    expect(stats.Rick?.ringerPct).toBeCloseTo((7 / 18) * 100);
  });

  it('team stats sum the side and match the score', () => {
    const a = teamStats(frames, 'a');
    const b = teamStats(frames, 'b');
    expect(a).toMatchObject({ points: 22, shoes: 36, ringers: 10, live: 5, dead: 5 });
    expect(b).toMatchObject({ points: 17, shoes: 36, ringers: 9, live: 4, dead: 5 });
    expect(a.ringerPct).toBeCloseTo((10 / 36) * 100);
  });

  it('review rows: play order, running score, label, live/dead detail', () => {
    const rows = reviewRows({
      teamAName: 'Silver State',
      teamBName: 'Truckee',
      participants: PARTICIPANTS,
      frames: [...frames].reverse(), // order of input doesn't matter
    });
    expect(rows).toHaveLength(18);
    expect(rows[0]).toMatchObject({
      inning: 1, end: 'south', cumA: 3, cumB: 0, resultLabel: 'Silver State +3',
      detail: 'Alice: 1 live / 0 dead · Gus: 0 live / 0 dead',
    });
    expect(rows[2]).toMatchObject({ resultLabel: 'No score', detail: 'Alice: 0 live / 1 dead · Gus: 0 live / 1 dead' });
    expect(rows[9]).toMatchObject({ resultLabel: 'Truckee +3', cumA: 12, cumB: 11 });
    expect(rows[9]?.throwerB).toMatchObject({ name: 'Bob', ringers: 2, live: 1, dead: 1 });
    expect(rows.at(-1)).toMatchObject({ inning: 9, end: 'north', cumA: 22, cumB: 17 });
  });

  it('a player who never threw has zero stats and null ringer %', () => {
    const extra: Participant = { id: 'x', name: 'Sub', side: 'a', end: 'south' };
    const [s] = playerStats([extra], frames);
    expect(s).toMatchObject({ points: 0, shoes: 0, ringers: 0, ringerPct: null });
  });
});

describe('nextSlot and inningPhase', () => {
  it('starts at inning 1 south, alternates south/north', () => {
    expect(nextSlot([])).toEqual({ inning: 1, end: 'south' });
    expect(nextSlot(framesFrom([NONE]))).toEqual({ inning: 1, end: 'north' });
    expect(nextSlot(framesFrom([NONE, NONE]))).toEqual({ inning: 2, end: 'south' });
  });
  it('uses play order even if frames are stored out of order', () => {
    expect(nextSlot(framesFrom([NONE, NONE, NONE]).reverse())).toEqual({ inning: 2, end: 'north' });
  });
  it('inning 15 is final, 16+ is extra', () => {
    expect(inningPhase({ inning: 14, end: 'north' })).toBe('normal');
    expect(inningPhase({ inning: 15, end: 'south' })).toBe('final');
    expect(inningPhase(16)).toBe('extra');
  });
});

describe('gameStatus: win rules', () => {
  it('21 on a SOUTH frame ends the game before north throws', () => {
    // 6+6+6 on souths, nothing on norths, then a 3 on inning 4 south = 21.
    const frames = framesFrom([
      ['a', 6, 2, 0], NONE, ['a', 6, 2, 0], NONE, ['a', 6, 2, 0], NONE, ['a', 3, 1, 0],
    ]);
    const status = gameStatus(frames);
    expect(status).toMatchObject({ over: true, winner: 'a', reason: 'target', endedAtIndex: 6 });
    expect(frames[6]).toMatchObject({ inning: 4, end: 'south' });
  });

  it('limit: higher score wins after 15 complete innings', () => {
    const frames = framesFrom([...repeat(29, NONE), A1]);
    expect(frames.at(-1)).toMatchObject({ inning: 15, end: 'north' });
    expect(gameStatus(frames)).toMatchObject({ over: true, winner: 'a', reason: 'limit', endedAtIndex: 29 });
    // One frame earlier (15 south) the game is still on.
    expect(gameStatus(frames.slice(0, 29)).over).toBe(false);
  });

  it('a lead during inning 15 is not a win until the inning completes', () => {
    const frames = framesFrom([...repeat(28, NONE), B1]); // 15 south: B leads
    expect(gameStatus(frames)).toMatchObject({ over: false, tieBreakInProgress: false });
  });

  it('tie at the limit continues into inning 16 (suddenDeath)', () => {
    const tied = framesFrom([...repeat(28, NONE), A1, B1]); // 1-1 after 15
    expect(gameStatus(tied)).toMatchObject({ over: false, tieBreakInProgress: true });
    expect(nextSlot(tied)).toEqual({ inning: 16, end: 'south' });
    expect(inningPhase(nextSlot(tied))).toBe('extra');
    // No-score frames in extra innings keep it going.
    const stillTied = framesFrom([...repeat(28, NONE), A1, B1, NONE, NONE, NONE]);
    expect(gameStatus(stillTied)).toMatchObject({ over: false, tieBreakInProgress: true });
  });

  it('sudden death: the first scoring frame after the tie wins, even on a south frame', () => {
    const frames = framesFrom([...repeat(28, NONE), A1, B1, NONE, NONE, B1]); // 17 south
    expect(gameStatus(frames)).toMatchObject({ over: true, winner: 'b', reason: 'tieBreak', endedAtIndex: 32 });
  });

  it('reaching 21 in a tie-break frame is reported as target (rule 1 first)', () => {
    const base: Row[] = [['a', 6, 2, 0], ['b', 6, 0, 2], ['a', 6, 2, 0], ['b', 6, 0, 2], ['a', 6, 2, 0], ['b', 6, 0, 2]];
    // 18-18 after inning 3; pad to 15 innings with no-score frames.
    const frames = framesFrom([...base, ...repeat(24, NONE), ['a', 3, 1, 0]]);
    expect(gameStatus(frames)).toMatchObject({ over: true, winner: 'a', reason: 'target' });
  });

  it('respects the rules snapshot (e.g. a shorter game)', () => {
    const rules = { ...DEFAULT_RULES, targetPoints: 11, shoeLimitInnings: 5 };
    const frames = framesFrom([['a', 6, 2, 0], NONE, ['a', 6, 2, 0]]);
    expect(gameStatus(frames, rules)).toMatchObject({ over: true, reason: 'target' });
  });
});

describe('checkEdit', () => {
  const frames = framesFrom(SEED_ROWS); // ends 22-17 at 9 north
  const at = (i: number) => frames[i] as Frame;

  it('rejects an edit that would end the game before the last recorded frame', () => {
    // 8 south was B +1 (16-14). Make it A +6: A reaches 22 there, but 8 north+ exist.
    const result = checkEdit(frames, 14, { ...at(14), scoringSide: 'a', points: 6, ringersA: 2, ringersB: 0 });
    expect(result).toMatchObject({ ok: false, reason: 'ends-early' });
    if (!result.ok) expect(result.message).toContain('Inning 8 · South');
  });

  it('accepts an edit that keeps the game ending on the last frame', () => {
    // 1 north: B +1 -> no score. Final becomes 22-16, still ending at 9 north.
    expect(checkEdit(frames, 1, { ...at(1), scoringSide: null, points: 0 })).toEqual({ ok: true });
  });

  it('accepts an edit that un-ends the game (play would resume)', () => {
    // 9 north A +2 -> no score: 20-17, game continues.
    expect(checkEdit(frames, 17, { ...at(17), scoringSide: null, points: 0 })).toEqual({ ok: true });
  });

  it('accepts edits to a game in progress', () => {
    const partial = frames.slice(0, 6);
    expect(checkEdit(partial, 0, { ...at(0), points: 6, ringersA: 2 })).toEqual({ ok: true });
  });

  it('rejects an invalid verdict, a moved slot, and a missing index', () => {
    expect(checkEdit(frames, 0, { ...at(0), points: 5 })).toMatchObject({ ok: false, reason: 'invalid-frame' });
    expect(checkEdit(frames, 0, { ...at(0), inning: 2 })).toMatchObject({ ok: false, reason: 'slot-changed' });
    expect(checkEdit(frames, 99, at(0))).toMatchObject({ ok: false, reason: 'no-such-frame' });
  });
});

describe('screen helpers', () => {
  it('inningsPlayed is the highest inning recorded', () => {
    expect(inningsPlayed([])).toBe(0);
    expect(inningsPlayed(framesFrom(SEED_ROWS))).toBe(9);
    expect(inningsPlayed(framesFrom([NONE, NONE, NONE]))).toBe(2);
  });

  it('inningProgress while playing: earlier innings done, next slot current', () => {
    const p = inningProgress(framesFrom([NONE, NONE, NONE])); // next: 2 north
    expect(p.inning).toBe(2);
    expect(p.limit).toBe(15);
    expect(p.dots.slice(0, 3)).toEqual(['done', 'current', 'todo']);
    expect(p.dots).toHaveLength(15);
    expect(inningProgress([]).dots[0]).toBe('current');
  });

  it('inningProgress after the game: innings played done, none current', () => {
    const p = inningProgress(framesFrom(SEED_ROWS));
    expect(p.inning).toBe(9);
    expect(p.dots.filter((d) => d === 'done')).toHaveLength(9);
    expect(p.dots).not.toContain('current');
  });

  it('inningProgress caps the label at the limit in extra innings', () => {
    const tied = framesFrom([...repeat(28, NONE), A1, B1, NONE]); // next: 16 north
    const p = inningProgress(tied);
    expect(p.inning).toBe(15);
    expect(p.dots.every((d) => d === 'done')).toBe(true);
  });

  it('throwersAt picks each side\'s player at that end (latest if replaced)', () => {
    expect(throwersAt(PARTICIPANTS, 'south')).toMatchObject({ a: { name: 'Alice' }, b: { name: 'Gus' } });
    expect(throwersAt(PARTICIPANTS, 'north')).toMatchObject({ a: { name: 'Rick' }, b: { name: 'Bob' } });
    const withSub: Participant[] = [...PARTICIPANTS, { id: 'sub', name: 'Sub', side: 'a', end: 'north' }];
    expect(throwersAt(withSub, 'north').a?.name).toBe('Sub');
  });

  it('ringerSplit: dead is the smaller count, live the remainder', () => {
    expect(ringerSplit(2, 1)).toEqual({ liveA: 1, liveB: 0, dead: 1 });
    expect(ringerSplit(0, 2)).toEqual({ liveA: 0, liveB: 2, dead: 0 });
    expect(ringerSplit(2, 2)).toEqual({ liveA: 0, liveB: 0, dead: 2 });
  });
});
