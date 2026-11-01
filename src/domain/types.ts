// Domain types. Pure TS: no Svelte, DOM, or storage imports.
//
// Shapes mirror the database (supabase/migrations) so syncing later is a
// mapping, not a redesign:
//   Side         <-> enum game_side ('a','b')
//   End          <-> enum court_end ('south','north'), south first
//   Participant  <-> game_participants (player name inlined until players sync)
//   Frame        <-> frames (throwerA/B = thrower_a/b_participant_id)
//   Rules        <-> games.rules (jsonb snapshot)
//   clientGameId <-> games.client_game_id

export type Side = 'a' | 'b';
export type End = 'south' | 'north';

export const SIDES: readonly Side[] = ['a', 'b'];
/** Play order within an inning: south throws first. */
export const ENDS: readonly End[] = ['south', 'north'];

/** Ringer count for one thrower in one frame. */
export type RingerCount = 0 | 1 | 2;
export const RINGER_COUNTS: readonly RingerCount[] = [0, 1, 2];

/** Points a frame can award. 5 is impossible with two shoes and never valid. */
export type FramePoints = 0 | 1 | 2 | 3 | 4 | 6;

/**
 * What happens on a tie at the inning limit. The league hasn't decided
 * (data-model.md, Open questions); 'suddenDeath' is the current default.
 * Add new answers to this list and handle them in derive.ts gameStatus.
 */
export const TIE_AT_LIMIT_RULES = ['suddenDeath'] as const;
export type TieAtLimit = (typeof TIE_AT_LIMIT_RULES)[number];

export interface Rules {
  /** First side to reach this many points or more wins outright. */
  targetPoints: number;
  /** Innings in a full game (30 shoes per player / 2 shoes per inning). */
  shoeLimitInnings: number;
  tieAtLimit: TieAtLimit;
}

export const DEFAULT_RULES: Readonly<Rules> = {
  targetPoints: 21,
  shoeLimitInnings: 15,
  tieAtLimit: 'suddenDeath',
};

export interface Participant {
  id: string;
  name: string;
  side: Side;
  /** The end this player starts at. Who threw each frame is on the frame. */
  end: End;
}

export interface Frame {
  id: string;
  inning: number;
  end: End;
  /** Participant id of side A's thrower at this end. */
  throwerA: string;
  /** Participant id of side B's thrower at this end. */
  throwerB: string;
  /** null = nobody scored (shown as "—" by default). */
  scoringSide: Side | null;
  points: number;
  ringersA: number;
  ringersB: number;
}

export interface Game {
  clientGameId: string;
  teamAName: string;
  teamBName: string;
  participants: Participant[];
  rules: Rules;
  /** The only stored scoring data. Everything else is derived. */
  frames: Frame[];
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface Slot {
  inning: number;
  end: End;
}
