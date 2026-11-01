<script lang="ts">
  import EntryCard, { type CardView } from '../components/EntryCard.svelte';
  import GameHeader from '../components/GameHeader.svelte';
  import NowPitching from '../components/NowPitching.svelte';
  import ProgressDots from '../components/ProgressDots.svelte';
  import ScoreBar from '../components/ScoreBar.svelte';
  import type { Side } from '../domain/types';
  import { gameState as gs } from '../state/game.svelte';

  const game = $derived(gs.game);

  const view: CardView = $derived({
    teamAName: game?.teamAName ?? '',
    teamBName: game?.teamBName ?? '',
    throwerAName: gs.cardThrowers.a?.name ?? '',
    throwerBName: gs.cardThrowers.b?.name ?? '',
    draft: gs.draft,
    options: gs.options,
    split: gs.split,
    canConfirm: gs.canConfirm,
    editing: gs.editingIndex !== null,
  });

  // ---- Confirm animation (presentation only: the frame is saved at once) --
  // 'out': the confirmed card, frozen, slides left and fades. Then the fresh
  // card starts right of center ('in-start') and slides in ('in'), and the
  // scoring side's total pulses. Skipped entirely under reduced motion.
  type Phase = 'idle' | 'out' | 'in-start' | 'in';
  let phase = $state<Phase>('idle');
  let frozen = $state<CardView | null>(null);
  let pulse = $state<Side | null>(null);

  const reducedMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function confirm() {
    const snapshot: CardView = $state.snapshot(view);
    const scored = gs.confirm();
    if (scored === undefined || reducedMotion()) return;
    frozen = snapshot;
    phase = 'out';
    setTimeout(() => {
      frozen = null;
      phase = 'in-start';
      pulse = scored;
      requestAnimationFrame(() => requestAnimationFrame(() => (phase = 'in')));
      setTimeout(() => {
        phase = 'idle';
        pulse = null;
      }, 230);
    }, 140);
  }

  const endLabel = $derived(gs.cardSlot.end === 'south' ? 'South' : 'North');
</script>

{#if game}
  <div class="scoring">
    <GameHeader onReview={() => gs.openReview()} />

    <ScoreBar
      teamAName={game.teamAName}
      teamBName={game.teamBName}
      totalA={gs.totals.a}
      totalB={gs.totals.b}
      players={gs.players}
      {pulse}
    />

    <NowPitching
      slot={gs.cardSlot}
      phase={gs.phase}
      throwerAName={view.throwerAName}
      throwerBName={view.throwerBName}
      turnKey={gs.frames.length}
    />

    {#if gs.editingIndex !== null}
      <div class="editing" role="status" data-testid="editing-banner">
        <span>⚠ Editing Inning {gs.cardSlot.inning} · {endLabel} — not the current turn</span>
        <button class="btn cancel" onclick={() => gs.cancelEdit()}>Cancel</button>
      </div>
    {/if}

    {#if gs.editError}
      <div class="edit-error" role="alert" data-testid="edit-error">⚠ {gs.editError}</div>
    {/if}

    <div class="card-clip">
      <div class="card-motion phase-{phase}" inert={phase !== 'idle'}>
        <EntryCard
          view={frozen ?? view}
          onSide={(s) => gs.chooseSide(s)}
          onPoints={(p) => gs.choosePoints(p)}
          onRinger={(t, v) => gs.tapRinger(t, v)}
          onConfirm={confirm}
        />
      </div>
    </div>

    <ProgressDots progress={gs.progress} />
  </div>
{/if}

<style>
  .scoring {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .editing {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: var(--editing-bg);
    border: 2px solid var(--editing);
    border-radius: var(--radius-md);
    padding: 0 0 0 12px;
    font-size: 13px;
    font-weight: 700;
    color: var(--editing-text);
  }
  .cancel {
    border-color: transparent;
    color: var(--editing-text);
    font-weight: 700;
    font-size: 12px;
    flex: none;
  }
  .edit-error {
    font-size: 12px;
    background: var(--color-accent-100);
    border: 1px solid var(--color-accent-600);
    border-radius: var(--radius-md);
    color: var(--color-accent-700);
    padding: 8px 10px;
  }
  .card-clip {
    overflow: hidden;
    border-radius: var(--radius-lg);
  }
  .card-motion {
    transform: translateX(0);
    opacity: 1;
  }
  .card-motion.phase-out {
    transform: translateX(-24px);
    opacity: 0;
    transition:
      transform 140ms ease,
      opacity 140ms ease;
  }
  .card-motion.phase-in-start {
    transform: translateX(24px);
    opacity: 0;
    transition: none;
  }
  .card-motion.phase-in {
    transition:
      transform 180ms ease,
      opacity 180ms ease;
  }
</style>
