<script lang="ts">
  import type { InningProgress } from '../domain/derive';

  let { progress }: { progress: InningProgress } = $props();
</script>

<div class="progress">
  <div class="head">
    <span>Innings Progress</span>
    <strong data-testid="progress-label">Inning {progress.inning} of {progress.limit}</strong>
  </div>
  <div class="dots" aria-hidden="true">
    {#each progress.dots as d, i (i)}
      <div class="dot {d}"></div>
    {/each}
  </div>
</div>

<style>
  .progress {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--color-text) 65%, transparent);
  }
  .head strong {
    font-weight: 700;
  }
  .dots {
    display: flex;
    gap: 4px;
  }
  .dot {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--color-neutral-300);
  }
  .dot.done {
    background: var(--color-accent-600);
  }
  .dot.current {
    background: var(--color-accent-400);
  }
</style>
