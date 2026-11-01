<script lang="ts">
  import type { InningPhase } from '../domain/derive';
  import type { Slot } from '../domain/types';

  interface Props {
    slot: Slot;
    phase: InningPhase;
    throwerAName: string;
    throwerBName: string;
    /** Bumped on each confirmed frame to replay the names' fade-in. */
    turnKey: number;
  }
  let { slot, phase, throwerAName, throwerBName, turnKey }: Props = $props();

  const endLabel = $derived(slot.end === 'south' ? 'South' : 'North');
</script>

<div class="card now phase-{phase}" data-testid="now-pitching">
  <div class="row">
    <div>
      <div class="kicker">Now Pitching</div>
      <div class="title" data-testid="slot">Inning {slot.inning} · {endLabel}</div>
    </div>
    {#key turnKey}
      <div class="vs">
        <span class="a">{throwerAName}</span>
        <span class="v">vs</span>
        <span class="b">{throwerBName}</span>
      </div>
    {/key}
  </div>
  {#if phase !== 'normal'}
    <div class="band" data-testid="inning-band">
      <span>{phase === 'final' ? 'Final Inning' : 'Extra Innings'}</span>
    </div>
  {/if}
</div>

<style>
  .now {
    gap: 3px;
    background: var(--color-accent-100);
    border-color: var(--color-accent-300);
  }
  .now.phase-final {
    background: var(--final-inning-bg);
    border-color: var(--final-inning-border);
  }
  .now.phase-extra {
    background: var(--extra-innings-bg);
    border-color: var(--extra-innings-border);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .title {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 17px;
    line-height: 1.2;
  }
  .vs {
    font-size: 14px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    animation: np-in 200ms ease;
  }
  .vs span {
    line-height: 1.2;
    font-weight: 700;
  }
  .a {
    color: var(--team-a);
  }
  .b {
    color: var(--team-b);
  }
  .v {
    font-family: var(--font-heading);
    font-size: 16px;
    letter-spacing: 0.05em;
    color: var(--color-neutral-500);
    font-style: italic;
  }
  .band {
    border-radius: var(--radius-sm);
    padding: 2px 0;
    text-align: center;
    background: var(--final-inning-band);
  }
  .phase-extra .band {
    background: var(--extra-innings-band);
  }
  .band span {
    font-family: var(--font-heading);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--on-team);
  }
  @keyframes np-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
