<script lang="ts" module>
  import type { FrameDraft, OptionStates } from '../domain/ringerRules';

  /** Everything the card shows. Plain data, so a confirmed card can be frozen
      on screen while it slides out. */
  export interface CardView {
    teamAName: string;
    teamBName: string;
    throwerAName: string;
    throwerBName: string;
    draft: FrameDraft | null;
    options: OptionStates | null;
    split: { liveA: number; liveB: number; dead: number };
    canConfirm: boolean;
    editing: boolean;
  }
</script>

<script lang="ts">
  import { POINT_BUTTONS, isValidPoints } from '../domain/ringerRules';
  import { RINGER_COUNTS, type Side } from '../domain/types';
  import RingerIcon from './RingerIcon.svelte';

  interface Props {
    view: CardView;
    onSide: (side: Side | null) => void;
    onPoints: (points: number) => void;
    onRinger: (thrower: Side, value: number) => void;
    onConfirm: () => void;
  }
  let { view, onSide, onPoints, onRinger, onConfirm }: Props = $props();

  const draft = $derived(view.draft);
  const sideChosen = $derived(draft !== null && draft.scoringSide !== null);

  const ringerRows = $derived([
    { side: 'a' as const, name: view.throwerAName, value: draft?.ringersA, enabled: view.options?.a },
    { side: 'b' as const, name: view.throwerBName, value: draft?.ringersB, enabled: view.options?.b },
  ]);
  const readout = $derived([
    { side: 'a' as const, name: view.throwerAName, live: view.split.liveA, dead: view.split.dead },
    { side: 'b' as const, name: view.throwerBName, live: view.split.liveB, dead: view.split.dead },
  ]);
</script>

<div class="card entry">
  <div class="kicker">Who scored &amp; how many</div>
  <div class="sides" role="group" aria-label="Who scored">
    <button
      class="opt side team-a"
      aria-pressed={draft?.scoringSide === 'a'}
      onclick={() => onSide('a')}>{view.teamAName}</button
    >
    <button class="opt none" aria-pressed={draft !== null && draft.scoringSide === null} onclick={() => onSide(null)}
      >No score</button
    >
    <button
      class="opt side team-b"
      aria-pressed={draft?.scoringSide === 'b'}
      onclick={() => onSide('b')}>{view.teamBName}</button
    >
  </div>

  <div class="points-well" class:dim={!sideChosen}>
    <div class="points" role="group" aria-label="Points">
      {#each POINT_BUTTONS as p (p)}
        <button
          class={["opt point", { never: !isValidPoints(p) }]}
          aria-pressed={sideChosen && draft?.points === p}
          disabled={!sideChosen || !isValidPoints(p)}
          onclick={() => onPoints(p)}>{p}</button
        >
      {/each}
    </div>
  </div>

  <div class="label">Ringers this turn</div>
  {#each ringerRows as r (r.side)}
    <div class="team-panel inset ringer-row team-{r.side}">
      <span class="thrower">{r.name}</span>
      <div class="ringers" role="group" aria-label="{r.name} ringers">
        {#each RINGER_COUNTS as v (v)}
          <button
            class="opt ringer"
            aria-pressed={r.value === v}
            disabled={!r.enabled?.[v]}
            onclick={() => onRinger(r.side, v)}>{v}</button
          >
        {/each}
      </div>
    </div>
  {/each}

  <div class="readout" data-testid="ringer-readout">
    {#each readout as r (r.side)}
      <div class="readout-row">
        <span class="who"><span class="dot dot-{r.side}"></span>{r.name}</span>
        <div class="counts">
          <span class="count live" class:on={r.live > 0}>
            <RingerIcon kind="live" size={15} /><span>{r.live}</span>
          </span>
          <span class="count dead" class:on={r.dead > 0}>
            <RingerIcon kind="dead" size={15} /><span>{r.dead}</span>
          </span>
        </div>
      </div>
    {/each}
  </div>

  <button class="btn btn-primary confirm" disabled={!view.canConfirm} onclick={onConfirm}>
    {view.editing ? 'Save Changes' : 'Confirm & Next →'}
  </button>
</div>

<style>
  .entry {
    background: var(--color-card);
    box-shadow: var(--shadow-sm);
    padding: 10px;
    gap: 6px;
  }
  .sides {
    display: flex;
    gap: 8px;
  }
  .side {
    flex: 1.2;
    padding: 10px 6px;
    font-weight: 700;
    font-size: 14px;
    border: 2px solid var(--team);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .side[aria-pressed='true'] {
    background: var(--team);
    border-color: var(--team);
    color: var(--on-team);
    box-shadow: none;
  }
  .none {
    flex: 1;
    padding: 10px 6px;
    font-size: 13px;
  }
  .none[aria-pressed='true'] {
    background: var(--color-neutral-800);
    border-color: var(--color-neutral-800);
    color: var(--on-team);
    box-shadow: none;
  }
  .points-well {
    background: var(--color-neutral-100);
    border: 1px solid var(--color-divider);
    border-radius: 10px;
    padding: 6px;
    box-shadow: var(--shadow-inset);
  }
  .points-well.dim {
    opacity: 0.45;
  }
  .points {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
  }
  .point:disabled:not(.never) {
    /* Not chosen yet: the well dims these; only 5 reads as unavailable. */
    color: var(--color-text);
  }
  .point {
    aspect-ratio: 1;
    font-size: 17px;
  }
  .ringer-row {
    padding: 7px 8px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .thrower {
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13px;
    flex: none;
    width: 62px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ringers {
    display: flex;
    gap: 6px;
    flex: 1;
  }
  .ringer {
    flex: 1;
    font-size: 15px;
  }
  .readout {
    background: var(--color-neutral-100);
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-md);
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .readout-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-heading);
    font-weight: 600;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }
  .dot-a {
    background: var(--team-a);
  }
  .dot-b {
    background: var(--team-b);
  }
  .counts {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .count {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--color-neutral-400);
    opacity: 0.5;
  }
  .count.on {
    opacity: 1;
    font-weight: 700;
  }
  .live.on {
    color: var(--ringer-live);
  }
  .dead.on {
    color: var(--color-accent-700);
  }
  .confirm {
    margin-top: 4px;
  }
</style>
