// Everything the app shows is DERIVED from frames + rules: totals, the next
// slot, game over, inning phase, stats, review rows. Nothing here is stored.
// Functions accept frames in any order and work on a play-ordered copy.

import type { End, Frame, Game, Participant, Rules, Side, Slot } from './types';
import { DEFAULT_RULES, ENDS } from './types';
import { validateFrame, type FrameProblem } from './ringerRules';

// ---------------------------------------------------------------------------
// Ordering and slots
// ---------------------------------------------------------------------------

/** Play order: inning, then south before north. */
export function comparePlayOrder(x: Slot, y: Slot): number {
  return x.inning - y.inning || ENDS.indexOf(x.end) - ENDS.indexOf(y.end);
}

export function inPlayOrder<T extends Slot>(frames: readonly T[]): T[] {
  return [...frames].sort(comparePlayOrder);
}

/** The slot after `slot`: south -> north of the same inning; north -> next south. */
export function slotAfter(slot: Slot): Slot {
  const i = ENDS.indexOf(slot.end);
  const next = ENDS[i + 1];
  return next !== undefined
    ? { inning: slot.inning, end: next }
    : { inning: slot.inning + 1, end: ENDS[0] as End };
}

/** The slot to be thrown next. South of inning 1 for a new game. */
export function nextSlot(frames: readonly Frame[]): Slot {
  const last = inPlayOrder(frames).at(-1);
  return last === undefined ? { inning: 1, end: ENDS[0] as End } : slotAfter(last);
}

export type InningPhase = 'normal' | 'final' | 'extra';

/** inning == limit is the final inning; past it is extra innings (sudden death). */
export function inningPhase(slot: Slot | number, rules: Rules = DEFAULT_RULES): InningPhase {
  const inning = typeof slot === 'number' ? slot : slot.inning;
  if (inning < rules.shoeLimitInnings) return 'normal';
  return inning === rules.shoeLimitInnings ? 'final' : 'extra';
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface Score {
  a: number;
  b: number;
}

export interface RunningTotal extends Score {
  frame: Frame;
}

/** Score after each frame, in play order. */
export function runningTotals(frames: readonly Frame[]): RunningTotal[] {
  let a = 0;
  let b = 0;
  return inPlayOrder(frames).map((frame) => {
    if (frame.scoringSide === 'a') a += frame.points;
    if (frame.scoringSide === 'b') b += frame.points;
    return { frame, a, b };
  });
}

export function currentTotals(frames: readonly Frame[]): Score {
  const last = runningTotals(frames).at(-1);
  return last ? { a: last.a, b: last.b } : { a: 0, b: 0 };
}

// ---------------------------------------------------------------------------
// Game status
// ---------------------------------------------------------------------------

export type EndReason = 'target' | 'limit' | 'tieBreak';

export interface GameStatus {
  over: boolean;
  winner?: Side;
  reason?: EndReason;
  /** Index (in play order) of the frame that ended the game. */
  endedAtIndex?: number;
  /** True while tied after the inning limit and playing on under tieAtLimit. */
  tieBreakInProgress: boolean;
}

/**
 * Applies the win rules after every frame, in play order:
 *   1. 'target': a side reaches targetPoints or more. Ends the game at once,
 *      even mid-inning (a south frame can end it before north throws). This
 *      rule is checked first, so it also wins over a tie-break frame.
 *   2. 'limit': after the last frame of inning shoeLimitInnings, the higher
 *      score wins.
 *   3. 'tieBreak': tied at the limit -> rules.tieAtLimit decides.
 *      suddenDeath: the first later frame where anyone scores ends it.
 */
export function gameStatus(frames: readonly Frame[], rules: Rules = DEFAULT_RULES): GameStatus {
  const totals = runningTotals(frames);
  const lastEnd = ENDS[ENDS.length - 1];
  let tied = false;

  for (const [index, { frame, a, b }] of totals.entries()) {
    if (a >= rules.targetPoints || b >= rules.targetPoints) {
      const winner: Side =
        frame.scoringSide ?? (a >= rules.targetPoints ? 'a' : 'b');
      return { over: true, winner, reason: 'target', endedAtIndex: index, tieBreakInProgress: false };
    }

    if (tied) {
      switch (rules.tieAtLimit) {
        case 'suddenDeath':
          if (frame.scoringSide !== null) {
            return {
              over: true,
              winner: frame.scoringSide,
              reason: 'tieBreak',
              endedAtIndex: index,
              tieBreakInProgress: false,
            };
          }
          break;
        default: {
          const unhandled: never = rules.tieAtLimit;
          throw new Error(`Unknown tieAtLimit rule: ${String(unhandled)}`);
        }
      }
      continue;
    }

    if (frame.inning === rules.shoeLimitInnings && frame.end === lastEnd) {
      if (a !== b) {
        return {
          over: true,
          winner: a > b ? 'a' : 'b',
          reason: 'limit',
          endedAtIndex: index,
          tieBreakInProgress: false,
        };
      }
      tied = true;
    }
  }

  return { over: false, tieBreakInProgress: tied };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface RingerStats {
  /** Points scored by this player's side on frames they threw. */
  points: number;
  /** 2 per frame thrown. */
  shoes: number;
  ringers: number;
  live: number;
  dead: number;
  /** ringers / shoes * 100, unrounded. null when no shoes thrown. */
  ringerPct: number | null;
}

export interface PlayerStats extends RingerStats {
  participantId: string;
  name: string;
  side: Side;
}

export interface TeamStats extends RingerStats {
  side: Side;
}

function emptyStats(): Omit<RingerStats, 'ringerPct'> {
  return { points: 0, shoes: 0, ringers: 0, live: 0, dead: 0 };
}

function withPct(s: Omit<RingerStats, 'ringerPct'>): RingerStats {
  return { ...s, ringerPct: s.shoes === 0 ? null : (s.ringers / s.shoes) * 100 };
}

/** One frame's contribution for the thrower on `side`. */
function frameContribution(frame: Frame, side: Side): Omit<RingerStats, 'ringerPct'> {
  const own = side === 'a' ? frame.ringersA : frame.ringersB;
  const dead = Math.min(frame.ringersA, frame.ringersB);
  return {
    points: frame.scoringSide === side ? frame.points : 0,
    shoes: 2,
    ringers: own,
    live: own - dead,
    dead,
  };
}

function add(
  into: Omit<RingerStats, 'ringerPct'>,
  c: Omit<RingerStats, 'ringerPct'>,
): void {
  into.points += c.points;
  into.shoes += c.shoes;
  into.ringers += c.ringers;
  into.live += c.live;
  into.dead += c.dead;
}

/** Per-participant stats, in participant order. Players who never threw get zeros. */
export function playerStats(
  participants: readonly Participant[],
  frames: readonly Frame[],
): PlayerStats[] {
  return participants.map((p) => {
    const s = emptyStats();
    for (const f of frames) {
      if (p.side === 'a' && f.throwerA === p.id) add(s, frameContribution(f, 'a'));
      if (p.side === 'b' && f.throwerB === p.id) add(s, frameContribution(f, 'b'));
    }
    return { participantId: p.id, name: p.name, side: p.side, ...withPct(s) };
  });
}

/** Side totals with the same fields as playerStats. points = the side's score. */
export function teamStats(frames: readonly Frame[], side: Side): TeamStats {
  const s = emptyStats();
  for (const f of frames) add(s, frameContribution(f, side));
  return { side, ...withPct(s) };
}

// ---------------------------------------------------------------------------
// Review rows
// ---------------------------------------------------------------------------

export interface ThrowerDetail {
  participantId: string;
  name: string;
  ringers: number;
  live: number;
  dead: number;
}

export interface ReviewRow {
  frameId: string;
  /** Index in play order. */
  index: number;
  inning: number;
  end: End;
  scoringSide: Side | null;
  points: number;
  /** Running score after this frame. */
  cumA: number;
  cumB: number;
  /** "<Team> +3", or "No score". */
  resultLabel: string;
  throwerA: ThrowerDetail;
  throwerB: ThrowerDetail;
  /** "Alice: 1 live / 0 dead · Gus: 0 live / 0 dead" */
  detail: string;
}

/** One row per frame, in play order, for the review list. */
export function reviewRows(game: Pick<Game, 'teamAName' | 'teamBName' | 'participants' | 'frames'>): ReviewRow[] {
  const names = new Map(game.participants.map((p) => [p.id, p.name]));
  const thrower = (id: string, own: number, other: number): ThrowerDetail => {
    const dead = Math.min(own, other);
    return { participantId: id, name: names.get(id) ?? '?', ringers: own, live: own - dead, dead };
  };
  return runningTotals(game.frames).map(({ frame, a, b }, index) => {
    const tA = thrower(frame.throwerA, frame.ringersA, frame.ringersB);
    const tB = thrower(frame.throwerB, frame.ringersB, frame.ringersA);
    const team = frame.scoringSide === 'a' ? game.teamAName : game.teamBName;
    return {
      frameId: frame.id,
      index,
      inning: frame.inning,
      end: frame.end,
      scoringSide: frame.scoringSide,
      points: frame.points,
      cumA: a,
      cumB: b,
      resultLabel: frame.scoringSide === null ? 'No score' : `${team} +${frame.points}`,
      throwerA: tA,
      throwerB: tB,
      detail: `${tA.name}: ${tA.live} live / ${tA.dead} dead · ${tB.name}: ${tB.live} live / ${tB.dead} dead`,
    };
  });
}

// ---------------------------------------------------------------------------
// Editing a past frame
// ---------------------------------------------------------------------------

export type EditCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'no-such-frame' | 'slot-changed' | 'invalid-frame' | 'ends-early';
      message: string;
      problems?: FrameProblem[];
    };

const endLabel = (end: End) => (end === 'south' ? 'South' : 'North');

/**
 * Can frames[index] be replaced by newFrame? Game state is always derived, so
 * an edit can change the outcome. An edit that would end the game BEFORE the
 * last recorded frame is a contradiction (data-model.md, "editing a past
 * frame"): reject it with an explanation instead of dropping later frames.
 * `index` is the position in `frames` as given.
 */
export function checkEdit(
  frames: readonly Frame[],
  index: number,
  newFrame: Frame,
  rules: Rules = DEFAULT_RULES,
): EditCheck {
  const old = frames[index];
  if (old === undefined) {
    return { ok: false, reason: 'no-such-frame', message: 'That frame does not exist.' };
  }
  if (old.inning !== newFrame.inning || old.end !== newFrame.end) {
    return {
      ok: false,
      reason: 'slot-changed',
      message: 'An edit cannot move a frame to a different inning or end.',
    };
  }
  const problems = validateFrame(newFrame);
  if (problems.length > 0) {
    return {
      ok: false,
      reason: 'invalid-frame',
      message: problems.map((p) => p.message).join(' '),
      problems,
    };
  }

  const edited = frames.map((f, i) => (i === index ? newFrame : f));
  const status = gameStatus(edited, rules);
  if (status.over && status.endedAtIndex !== undefined && status.endedAtIndex < edited.length - 1) {
    const end = inPlayOrder(edited)[status.endedAtIndex];
    const at = end ? `Inning ${end.inning} · ${endLabel(end.end)}` : 'an earlier frame';
    return {
      ok: false,
      reason: 'ends-early',
      message: `This change would end the game at ${at}, but later frames are already recorded. Check the earlier frames first.`,
    };
  }
  return { ok: true };
}
