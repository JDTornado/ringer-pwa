// The ringer validation table from docs/data-model.md ("Ringer entry
// validation"), encoded as DATA. Every function below reads RINGER_TABLE;
// none of them branch on particular scores. A rule change is a table edit.
//
// Pairs are written (scorer ringers, opponent ringers), as in the doc. For
// "none" (nobody scored) the pairs are symmetric, so "scorer" is side A.

import type { Frame, RingerCount, Side } from './types';
import { RINGER_COUNTS } from './types';

/** [scorer ringers, opponent ringers] */
export type RingerPair = readonly [RingerCount, RingerCount];

/** 'none' = nobody scored (0 points). 5 is deliberately absent: never valid. */
export type ScoreKey = 'none' | 1 | 2 | 3 | 4 | 6;

export interface ScoreRule {
  /** Every allowed (scorer, opponent) combination. */
  configs: readonly RingerPair[];
  /** Pre-selected when this score is chosen. Must be one of `configs`. */
  default: RingerPair;
}

export const RINGER_TABLE: Readonly<Record<ScoreKey, ScoreRule>> = {
  // Unmatched ringers would be live and score >= 3; matched ones all cancel.
  none: { configs: [[0, 0], [1, 1], [2, 2]], default: [0, 0] },
  // No live ringer: nothing, or one each (both dead) plus a close shoe.
  1: { configs: [[0, 0], [1, 1]], default: [0, 0] },
  // Two close shoes; any ringer would score >= 3.
  2: { configs: [[0, 0]], default: [0, 0] },
  // Exactly one live ringer and no close shoe. (1,1) is excluded: no live ringer.
  3: { configs: [[1, 0], [2, 1]], default: [1, 0] },
  // One live ringer plus one close shoe.
  4: { configs: [[1, 0]], default: [1, 0] },
  // Two live ringers.
  6: { configs: [[2, 0]], default: [2, 0] },
};

/** Point buttons in display order. 5 is listed so the UI can show it disabled. */
export const POINT_BUTTONS = [1, 2, 3, 4, 5, 6] as const;

/** Maps a points value to its table row; undefined for 5 and anything out of range. */
export function scoreKey(points: number | null): ScoreKey | undefined {
  if (points === null || points === 0) return 'none';
  return Object.hasOwn(RINGER_TABLE, points) ? (points as ScoreKey) : undefined;
}

/** True if the score exists in the table (so 5 is never valid). */
export function isValidPoints(points: number): boolean {
  return points !== 0 && scoreKey(points) !== undefined;
}

/** Allowed (scorer, opponent) pairs for a score. null or 0 = nobody scored. */
export function allowedConfigs(points: number | null): RingerPair[] {
  const key = scoreKey(points);
  return key === undefined ? [] : [...RINGER_TABLE[key].configs];
}

/** The pre-selected (scorer, opponent) pair for a score, or null if invalid. */
export function defaultConfig(points: number | null): RingerPair | null {
  const key = scoreKey(points);
  return key === undefined ? null : RINGER_TABLE[key].default;
}

// ---------------------------------------------------------------------------
// Entry draft: the in-progress verdict on the scoring card.
// ---------------------------------------------------------------------------

export interface FrameDraft {
  /** null = "No score" was chosen. */
  scoringSide: Side | null;
  /**
   * Points for the scoring side. null = a side is chosen but points aren't
   * yet. Always 0 when scoringSide is null.
   */
  points: number | null;
  ringersA: number;
  ringersB: number;
}

/** [side A ringers, side B ringers] */
type SidePair = readonly [number, number];

/** Every 0-2 pair: no constraint while a side is chosen but points aren't. */
const UNCONSTRAINED: readonly SidePair[] = RINGER_COUNTS.flatMap((a) =>
  RINGER_COUNTS.map((b) => [a, b] as const),
);

function toSidePair(pair: RingerPair, scoringSide: Side | null): SidePair {
  return scoringSide === 'b' ? [pair[1], pair[0]] : [pair[0], pair[1]];
}

/** Allowed pairs for the draft, in (side A, side B) order. */
function draftConfigs(draft: FrameDraft): readonly SidePair[] {
  if (draft.scoringSide !== null && draft.points === null) return UNCONSTRAINED;
  const points = draft.scoringSide === null ? null : draft.points;
  return allowedConfigs(points).map((p) => toSidePair(p, draft.scoringSide));
}

const sideIndex = (side: Side): 0 | 1 => (side === 'a' ? 0 : 1);

/** Start a draft for "side X scored" (points pending) or "No score" (null). */
export function applySide(scoringSide: Side | null): FrameDraft {
  if (scoringSide !== null) {
    return { scoringSide, points: null, ringersA: 0, ringersB: 0 };
  }
  const [a, b] = toSidePair(RINGER_TABLE.none.default, null);
  return { scoringSide: null, points: 0, ringersA: a, ringersB: b };
}

export interface OptionStates {
  /** enabled[v] for ringer value v = 0, 1, 2 */
  a: [boolean, boolean, boolean];
  b: [boolean, boolean, boolean];
}

/**
 * Which ringer buttons are enabled for each thrower. A value is enabled if
 * some allowed configuration gives that thrower that value; tapping it either
 * sets it directly or jumps to that configuration (see applyRingerTap).
 */
export function optionStates(draft: FrameDraft): OptionStates {
  const configs = draftConfigs(draft);
  const enabledFor = (side: Side) =>
    RINGER_COUNTS.map((v) => configs.some((c) => c[sideIndex(side)] === v)) as [
      boolean,
      boolean,
      boolean,
    ];
  return { a: enabledFor('a'), b: enabledFor('b') };
}

/**
 * Choose the points for the draft's scoring side and reset the ringers to
 * that score's default. Invalid points (5, out of range, or a draft with no
 * scoring side) leave the draft unchanged.
 */
export function applyPoints(draft: FrameDraft, points: number): FrameDraft {
  if (draft.scoringSide === null || !isValidPoints(points)) return draft;
  const def = defaultConfig(points);
  if (def === null) return draft;
  const [a, b] = toSidePair(def, draft.scoringSide);
  return { ...draft, points, ringersA: a, ringersB: b };
}

/**
 * Tap ringer value `value` for `thrower`:
 *   1. if the resulting pair is allowed, set it;
 *   2. otherwise jump to the allowed configuration with that value for that
 *      thrower (the one that changes the other thrower least);
 *   3. if there is none, do nothing.
 * This reproduces the prototype's couplings (1: both move together; 3: scorer
 * 2 pulls opponent to 1; 4/6: locked) from the table alone.
 */
export function applyRingerTap(draft: FrameDraft, thrower: Side, value: number): FrameDraft {
  const configs = draftConfigs(draft);
  const i = sideIndex(thrower);
  const other = i === 0 ? 1 : 0;
  const current: SidePair = [draft.ringersA, draft.ringersB];
  const wanted: [number, number] = [current[0], current[1]];
  wanted[i] = value;

  const same = (p: SidePair, q: SidePair) => p[0] === q[0] && p[1] === q[1];
  let target = configs.find((c) => same(c, wanted));
  if (target === undefined) {
    const candidates = configs.filter((c) => c[i] === value);
    target = candidates.sort(
      (p, q) => Math.abs(p[other] - current[other]) - Math.abs(q[other] - current[other]),
    )[0];
  }
  if (target === undefined) return draft;
  return { ...draft, ringersA: target[0], ringersB: target[1] };
}

/**
 * Turn a complete draft into a frame for `slot`, thrown by the two given
 * participant ids. Returns null if the draft isn't complete (see
 * isDraftComplete), so an invalid verdict can't be recorded.
 */
export function draftToFrame(
  draft: FrameDraft,
  slot: { inning: number; end: Frame['end'] },
  throwers: { throwerA: string; throwerB: string },
  id: string,
): Frame | null {
  if (!isDraftComplete(draft)) return null;
  return {
    id,
    inning: slot.inning,
    end: slot.end,
    throwerA: throwers.throwerA,
    throwerB: throwers.throwerB,
    scoringSide: draft.scoringSide,
    points: draft.scoringSide === null ? 0 : (draft.points ?? 0),
    ringersA: draft.ringersA,
    ringersB: draft.ringersB,
  };
}

/** The draft that reproduces a recorded frame (to edit it). */
export function draftFromFrame(frame: Frame): FrameDraft {
  return {
    scoringSide: frame.scoringSide,
    points: frame.scoringSide === null ? 0 : frame.points,
    ringersA: frame.ringersA,
    ringersB: frame.ringersB,
  };
}

/** True when the draft is a complete, valid verdict that can be confirmed. */
export function isDraftComplete(draft: FrameDraft): boolean {
  if (draft.scoringSide !== null && draft.points === null) return false;
  return draftConfigs(draft).some((c) => c[0] === draft.ringersA && c[1] === draft.ringersB);
}

// ---------------------------------------------------------------------------
// Validation of a stored frame (live entry, and later: flagging paper entries)
// ---------------------------------------------------------------------------

export type FrameProblemCode =
  | 'points-out-of-range'
  | 'points-five'
  | 'no-score-with-points'
  | 'score-without-points'
  | 'ringers-out-of-range'
  | 'ringer-combination'
  | 'same-thrower';

export interface FrameProblem {
  code: FrameProblemCode;
  message: string;
}

const isRingerCount = (n: number) => (RINGER_COUNTS as readonly number[]).includes(n);

/** Everything wrong with a frame. An empty list means valid. */
export function validateFrame(
  frame: Pick<Frame, 'scoringSide' | 'points' | 'ringersA' | 'ringersB'> &
    Partial<Pick<Frame, 'throwerA' | 'throwerB'>>,
): FrameProblem[] {
  const problems: FrameProblem[] = [];
  const { scoringSide, points, ringersA, ringersB } = frame;

  if (frame.throwerA !== undefined && frame.throwerA === frame.throwerB) {
    problems.push({ code: 'same-thrower', message: 'The two throwers must be different players.' });
  }

  const ringersOk = isRingerCount(ringersA) && isRingerCount(ringersB);
  if (!ringersOk) {
    problems.push({
      code: 'ringers-out-of-range',
      message: 'Ringer counts must be 0, 1, or 2 per thrower.',
    });
  }

  let pointsOk = true;
  if (!Number.isInteger(points) || points < 0 || points > 6) {
    pointsOk = false;
    problems.push({ code: 'points-out-of-range', message: 'Points must be 0 to 6.' });
  } else if (scoreKey(points) === undefined) {
    pointsOk = false;
    problems.push({ code: 'points-five', message: '5 points is impossible with two shoes.' });
  } else if (scoringSide === null && points !== 0) {
    pointsOk = false;
    problems.push({
      code: 'no-score-with-points',
      message: 'A frame where nobody scored must have 0 points.',
    });
  } else if (scoringSide !== null && points === 0) {
    pointsOk = false;
    problems.push({
      code: 'score-without-points',
      message: 'A frame with a scoring side needs 1 to 6 points.',
    });
  }

  if (pointsOk && ringersOk) {
    const configs = allowedConfigs(scoringSide === null ? null : points).map((p) =>
      toSidePair(p, scoringSide),
    );
    if (!configs.some((c) => c[0] === ringersA && c[1] === ringersB)) {
      problems.push({
        code: 'ringer-combination',
        message:
          scoringSide === null
            ? `With no score, both throwers must have the same ringer count (got ${ringersA} and ${ringersB}).`
            : `${points} points can't come from ${scoringSide === 'a' ? ringersA : ringersB} scorer ringer(s) against ${scoringSide === 'a' ? ringersB : ringersA}.`,
      });
    }
  }

  return problems;
}
