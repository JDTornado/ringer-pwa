// IndexedDB save/restore of the in-progress game.
//
// This is a WORKING DRAFT, not the record: browsers (Safari especially) can
// evict it. Once a game syncs, the server is the record. A draft that can't be
// read back (corrupt, or saved by an older app version) is treated as no
// draft: loadDraft returns null rather than throwing.

import { del, get, set } from 'idb-keyval';
import type { Frame, Game, Participant, Rules } from '../domain/types';
import { ENDS, SIDES, TIE_AT_LIMIT_RULES } from '../domain/types';

const DRAFT_KEY = 'ringer:draft';
/** Bump when the stored shape changes; older drafts are then ignored. */
export const DRAFT_VERSION = 1;

interface StoredDraft {
  version: typeof DRAFT_VERSION;
  savedAt: string;
  game: Game;
}

let persistRequested = false;

/**
 * Ask the browser not to evict our storage. Best effort, once per page load:
 * unsupported or refused is fine (installed home-screen apps keep their
 * storage anyway).
 */
function requestPersistence(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    const storage = globalThis.navigator?.storage;
    if (storage && typeof storage.persist === 'function') {
      storage.persist().catch(() => {});
    }
  } catch {
    // Ignore: persistence is an optimization, not a requirement.
  }
}

export async function saveDraft(game: Game): Promise<void> {
  requestPersistence();
  const stored: StoredDraft = { version: DRAFT_VERSION, savedAt: new Date().toISOString(), game };
  await set(DRAFT_KEY, stored);
}

export async function loadDraft(): Promise<Game | null> {
  try {
    const stored: unknown = await get(DRAFT_KEY);
    if (!isRecord(stored) || stored.version !== DRAFT_VERSION) return null;
    return isGame(stored.game) ? stored.game : null;
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  await del(DRAFT_KEY);
}

// ---------------------------------------------------------------------------
// Shape guards. Structural only; scoring rules are validated in the domain.
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isOneOf = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

function isRules(v: unknown): v is Rules {
  return (
    isRecord(v) &&
    isInt(v.targetPoints) &&
    isInt(v.shoeLimitInnings) &&
    isOneOf(TIE_AT_LIMIT_RULES, v.tieAtLimit)
  );
}

function isParticipant(v: unknown): v is Participant {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isString(v.name) &&
    isOneOf(SIDES, v.side) &&
    isOneOf(ENDS, v.end)
  );
}

function isFrame(v: unknown): v is Frame {
  return (
    isRecord(v) &&
    isString(v.id) &&
    isInt(v.inning) &&
    isOneOf(ENDS, v.end) &&
    isString(v.throwerA) &&
    isString(v.throwerB) &&
    (v.scoringSide === null || isOneOf(SIDES, v.scoringSide)) &&
    isInt(v.points) &&
    isInt(v.ringersA) &&
    isInt(v.ringersB)
  );
}

function isGame(v: unknown): v is Game {
  return (
    isRecord(v) &&
    isString(v.clientGameId) &&
    isString(v.teamAName) &&
    isString(v.teamBName) &&
    isString(v.createdAt) &&
    isRules(v.rules) &&
    Array.isArray(v.participants) &&
    v.participants.every(isParticipant) &&
    Array.isArray(v.frames) &&
    v.frames.every(isFrame)
  );
}
