// The current game. Frames are the only stored scoring data; everything the
// screens show is $derived from src/domain. This module decides nothing about
// scoring itself: it calls ringerRules/derive and stores the results.

import {
  applyPoints,
  applyRingerTap,
  applySide,
  draftFromFrame,
  draftToFrame,
  isDraftComplete,
  optionStates,
  type FrameDraft,
} from '../domain/ringerRules';
import {
  checkEdit,
  currentTotals,
  gameStatus,
  inningPhase,
  inningProgress,
  inningsPlayed,
  nextSlot,
  playerStats,
  reviewRows,
  ringerSplit,
  teamStats,
  throwersAt,
} from '../domain/derive';
import { newId } from '../domain/ids';
import type { Game, Participant, Side, Slot } from '../domain/types';
import { DEFAULT_RULES } from '../domain/types';
import { clearDraft, loadDraft, saveDraft } from './draft';

export type Screen = 'setup' | 'scoring' | 'gameOver';

export interface SetupInput {
  teamAName: string;
  teamBName: string;
  aSouth: string;
  aNorth: string;
  bSouth: string;
  bNorth: string;
}

/** The two players on the entry card: the next slot's, or the edited frame's. */
interface CardThrowers {
  a: Participant | undefined;
  b: Participant | undefined;
}

class GameState {
  /** False until the saved draft (if any) has been checked on launch. */
  loaded = $state(false);
  game = $state<Game | null>(null);
  /** The verdict being entered. null = no side chosen yet. */
  draft = $state<FrameDraft | null>(null);
  /** Index into game.frames of the frame being edited, or null. */
  editingIndex = $state<number | null>(null);
  /** checkEdit's message when a save was refused. */
  editError = $state<string | null>(null);
  reviewOpen = $state(false);
  confirmingAbandon = $state(false);

  // ---- Derived from the frames ------------------------------------------
  frames = $derived(this.game?.frames ?? []);
  rules = $derived(this.game?.rules ?? DEFAULT_RULES);
  status = $derived(gameStatus(this.frames, this.rules));
  totals = $derived(currentTotals(this.frames));
  next = $derived(nextSlot(this.frames));
  progress = $derived(inningProgress(this.frames, this.rules));
  inningsPlayed = $derived(inningsPlayed(this.frames));
  players = $derived(playerStats(this.game?.participants ?? [], this.frames));
  teamA = $derived(teamStats(this.frames, 'a'));
  teamB = $derived(teamStats(this.frames, 'b'));
  review = $derived(this.game ? reviewRows(this.game).reverse() : []);

  screen: Screen = $derived(
    this.game === null
      ? 'setup'
      : this.editingIndex === null && this.status.over
        ? 'gameOver'
        : 'scoring',
  );

  /** The slot on the entry card: the edited frame's, or the next one. */
  cardSlot: Slot = $derived.by(() => {
    const f = this.editingIndex === null ? undefined : this.frames[this.editingIndex];
    return f ? { inning: f.inning, end: f.end } : this.next;
  });
  phase = $derived(inningPhase(this.cardSlot, this.rules));

  cardThrowers: CardThrowers = $derived.by(() => {
    const participants = this.game?.participants ?? [];
    const f = this.editingIndex === null ? undefined : this.frames[this.editingIndex];
    if (f) {
      const byId = (id: string) => participants.find((p) => p.id === id);
      return { a: byId(f.throwerA), b: byId(f.throwerB) };
    }
    return throwersAt(participants, this.cardSlot.end);
  });

  /**
   * True while any setup field has text. Owned by the Setup screen (it syncs
   * this from its form and clears it on unmount); setup text isn't saved
   * anywhere, so a reload would lose it.
   */
  setupHasInput = $state(false);

  /**
   * What a page reload would lose right now, or null if nothing:
   *   'setup': typed-in setup fields;
   *   'frame': a half-entered verdict, or a past frame being edited.
   * Confirmed frames are already saved in the draft.
   */
  reloadBlocker: 'setup' | 'frame' | null = $derived(
    this.game === null
      ? this.setupHasInput
        ? 'setup'
        : null
      : this.draft !== null || this.editingIndex !== null
        ? 'frame'
        : null,
  );

  /** True when reloading the page can't lose input (see reloadBlocker). */
  canReloadSafely = $derived(this.reloadBlocker === null);

  options = $derived(this.draft ? optionStates(this.draft) : null);
  canConfirm = $derived(this.draft !== null && isDraftComplete(this.draft));
  split = $derived(ringerSplit(this.draft?.ringersA ?? 0, this.draft?.ringersB ?? 0));

  // ---- Launch -----------------------------------------------------------
  async init(): Promise<void> {
    const saved = await loadDraft();
    if (saved) this.game = saved;
    this.loaded = true;
  }

  // ---- Setup ------------------------------------------------------------
  start(input: SetupInput): void {
    const p = (name: string, side: Side, end: 'south' | 'north'): Participant => ({
      id: newId(),
      name: name.trim(),
      side,
      end,
    });
    this.game = {
      clientGameId: newId(),
      teamAName: input.teamAName.trim(),
      teamBName: input.teamBName.trim(),
      participants: [
        p(input.aSouth, 'a', 'south'),
        p(input.aNorth, 'a', 'north'),
        p(input.bSouth, 'b', 'south'),
        p(input.bNorth, 'b', 'north'),
      ],
      rules: { ...DEFAULT_RULES },
      frames: [],
      createdAt: new Date().toISOString(),
    };
    this.resetEntry();
    this.persist();
  }

  // ---- Entry card -------------------------------------------------------
  chooseSide(side: Side | null): void {
    this.draft = applySide(side);
    this.editError = null;
  }

  choosePoints(points: number): void {
    if (this.draft) this.draft = applyPoints(this.draft, points);
    this.editError = null;
  }

  tapRinger(thrower: Side, value: number): void {
    if (this.draft) this.draft = applyRingerTap(this.draft, thrower, value);
    this.editError = null;
  }

  /**
   * Record the draft: append a new frame, or save the edit. Returns the side
   * that scored (for the score pulse) or null; returns undefined if nothing
   * was saved (incomplete draft, or the edit was refused).
   */
  confirm(): Side | null | undefined {
    const game = this.game;
    const draft = this.draft;
    const { a, b } = this.cardThrowers;
    if (!game || !draft || !a || !b) return undefined;

    if (this.editingIndex !== null) {
      const old = game.frames[this.editingIndex];
      if (!old) return undefined;
      const edited = draftToFrame(draft, old, { throwerA: old.throwerA, throwerB: old.throwerB }, old.id);
      if (!edited) return undefined;
      const check = checkEdit(game.frames, this.editingIndex, edited, game.rules);
      if (!check.ok) {
        this.editError = check.message;
        return undefined;
      }
      game.frames[this.editingIndex] = edited;
    } else {
      if (this.status.over) return undefined;
      const frame = draftToFrame(draft, this.next, { throwerA: a.id, throwerB: b.id }, newId());
      if (!frame) return undefined;
      game.frames.push(frame);
    }
    const scored = draft.scoringSide;
    this.resetEntry();
    this.persist();
    return scored;
  }

  // ---- Review / edit ----------------------------------------------------
  openReview(): void {
    this.reviewOpen = true;
    this.confirmingAbandon = false;
  }

  closeReview(): void {
    this.reviewOpen = false;
    this.confirmingAbandon = false;
  }

  startEdit(frameId: string): void {
    const index = this.frames.findIndex((f) => f.id === frameId);
    const frame = this.frames[index];
    if (!frame) return;
    this.editingIndex = index;
    this.draft = draftFromFrame(frame);
    this.editError = null;
    this.closeReview();
  }

  cancelEdit(): void {
    this.resetEntry();
  }

  // ---- Leaving a game ---------------------------------------------------
  abandon(): void {
    this.endGame();
  }

  newGame(): void {
    this.endGame();
  }

  private endGame(): void {
    this.game = null;
    this.resetEntry();
    this.closeReview();
    void clearDraft();
  }

  private resetEntry(): void {
    this.draft = null;
    this.editingIndex = null;
    this.editError = null;
  }

  private persist(): void {
    if (!this.game) return;
    // $state.snapshot: IndexedDB's structured clone can't copy Svelte proxies.
    void saveDraft($state.snapshot(this.game));
  }
}

export const gameState = new GameState();
